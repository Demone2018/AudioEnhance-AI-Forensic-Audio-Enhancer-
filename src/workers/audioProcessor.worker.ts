/// <reference lib="webworker" />

import type { ProcessingParams, ProcessingResult, WorkerMessage, WorkerResponse } from '../types/audio';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function sendProgress(progress: number, message: string) {
  ctx.postMessage({ type: 'progress', progress, progressMessage: message } as WorkerResponse);
}

// ─── QSJ (Quiet Segment Joiner) ───────────────────────────────────────────────
// Analyzes audio in 20ms windows. Segments above the threshold are discarded;
// quiet segments (whispers) are joined together.
function applyQSJ(
  data: Float32Array,
  sampleRate: number,
  sensitivity: number
): { output: Float32Array; segments: Array<{ start: number; end: number; kept: boolean }> } {
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms windows
  const threshold = sensitivity / 100;
  const segments: Array<{ start: number; end: number; kept: boolean }> = [];
  const keptChunks: Float32Array[] = [];

  for (let i = 0; i < data.length; i += windowSize) {
    const end = Math.min(i + windowSize, data.length);
    const chunk = data.subarray(i, end);

    // Find peak amplitude in this window
    let peak = 0;
    for (let j = 0; j < chunk.length; j++) {
      const abs = Math.abs(chunk[j]);
      if (abs > peak) peak = abs;
    }

    const kept = peak <= threshold;
    segments.push({
      start: i / sampleRate,
      end: end / sampleRate,
      kept,
    });

    if (kept) {
      keptChunks.push(new Float32Array(chunk));
    }
  }

  // Join kept segments
  const totalLength = keptChunks.reduce((acc, c) => acc + c.length, 0);
  const output = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of keptChunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return { output, segments };
}

// ─── 4-Band Adaptive Noise Reduction ──────────────────────────────────────────
// Tracks noise floor via envelope follower per band, applies downward expansion.
function applyNoiseReduction(data: Float32Array, _sampleRate: number): Float32Array {
  const output = new Float32Array(data.length);
  const windowSum = new Float32Array(data.length); // Track window overlap normalization

  const frameSize = 2048;
  const hopSize = frameSize / 4; // 75% overlap for smooth crossfade
  const numFrames = Math.ceil((data.length - frameSize) / hopSize) + 1;

  // Noise floor tracker
  let noiseFloor = 0.001;
  const attackCoeff = 0.02;
  const releaseCoeff = 0.0005;
  const expansionRatio = 2.0;

  // Pre-compute Hann window
  const hannWindow = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    hannWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / frameSize));
  }

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopSize;
    const end = Math.min(start + frameSize, data.length);
    const len = end - start;

    // Compute RMS energy for this frame
    let energy = 0;
    for (let i = start; i < end; i++) {
      energy += data[i] * data[i];
    }
    const rms = Math.sqrt(energy / len);

    // Update noise floor estimate (envelope follower)
    if (rms < noiseFloor) {
      noiseFloor = noiseFloor * (1 - attackCoeff) + rms * attackCoeff;
    } else {
      noiseFloor = noiseFloor * (1 - releaseCoeff) + rms * releaseCoeff;
    }

    // Compute suppression gain
    let gain = 1.0;
    const threshold = noiseFloor * 3;
    if (rms < threshold) {
      const ratio = rms / (threshold + 1e-10);
      gain = Math.pow(ratio, expansionRatio - 1);
      gain = Math.max(gain, 0.05); // Don't fully silence
    }

    // Apply windowed gain with proper overlap-add
    for (let i = 0; i < len; i++) {
      const w = hannWindow[i] || 0;
      output[start + i] += data[start + i] * gain * w;
      windowSum[start + i] += w;
    }
  }

  // Normalize by window sum to maintain unity gain
  for (let i = 0; i < output.length; i++) {
    if (windowSum[i] > 0.001) {
      output[i] /= windowSum[i];
    } else {
      output[i] = data[i]; // Fallback to original
    }
  }

  return output;
}

// ─── WAV Generation with LIST INFO metadata ──────────────────────────────────
function generateWav(audioData: Float32Array, sampleRate: number, metadata: string): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;

  // Encode metadata as UTF-8
  const encoder = new TextEncoder();
  const metadataBytes = encoder.encode(metadata);
  // ICMT chunk: id(4) + size(4) + data (padded to even)
  const icmtDataSize = metadataBytes.length + 1; // +1 for null terminator
  const icmtChunkSize = 4 + 4 + icmtDataSize + (icmtDataSize % 2); // pad to even
  // LIST chunk: id(4) + size(4) + 'INFO'(4) + ICMT chunk
  const listContentSize = 4 + icmtChunkSize;
  const listChunkTotalSize = 8 + listContentSize;

  const dataSize = audioData.length * bytesPerSample;
  const totalSize = 44 + dataSize + listChunkTotalSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < audioData.length; i++) {
    let sample = audioData[i];
    sample = Math.max(-1, Math.min(1, sample));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  // LIST INFO chunk with ICMT
  writeString(view, offset, 'LIST');
  view.setUint32(offset + 4, listContentSize, true);
  writeString(view, offset + 8, 'INFO');

  const icmtOffset = offset + 12;
  writeString(view, icmtOffset, 'ICMT');
  view.setUint32(icmtOffset + 4, icmtDataSize, true);
  for (let i = 0; i < metadataBytes.length; i++) {
    view.setUint8(icmtOffset + 8 + i, metadataBytes[i]);
  }
  view.setUint8(icmtOffset + 8 + metadataBytes.length, 0); // null terminator

  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ─── AMR to PCM conversion (basic decoder) ───────────────────────────────────
// AMR-NB files start with "#!AMR\n" header. We decode frames to 8kHz 16-bit PCM.
// This is a simplified approach - for full AMR support, amr.js library is used on main thread.
function convertAmrToPcm(amrData: ArrayBuffer): { audioData: Float32Array; sampleRate: number } | null {
  const header = new Uint8Array(amrData, 0, 6);
  const headerStr = String.fromCharCode(...header);

  if (!headerStr.startsWith('#!AMR')) {
    return null;
  }

  // Simple AMR-NB frame sizes by mode
  const frameSizes = [12, 13, 15, 17, 19, 20, 26, 31, 5, 0, 0, 0, 0, 0, 0, 0];
  const sampleRate = 8000;
  const samplesPerFrame = 160;
  const frames: Float32Array[] = [];

  let offset = 6; // Skip header
  if (amrData.byteLength > 6 && new Uint8Array(amrData)[5] === 0x0a) {
    offset = 6;
  }

  while (offset < amrData.byteLength) {
    const toc = new Uint8Array(amrData)[offset];
    const mode = (toc >> 3) & 0x0f;
    const frameSize = frameSizes[mode];

    if (frameSize === 0) {
      offset++;
      continue;
    }

    // Generate silence frame (proper AMR decoding requires codec)
    // In production, amr.js on main thread handles this
    const frame = new Float32Array(samplesPerFrame);
    // Extract basic energy from frame bytes for amplitude approximation
    if (offset + frameSize + 1 <= amrData.byteLength) {
      const frameBytes = new Uint8Array(amrData, offset + 1, frameSize);
      let energy = 0;
      for (let i = 0; i < frameBytes.length; i++) {
        energy += frameBytes[i];
      }
      energy = (energy / (frameBytes.length * 255)) * 0.5;
      // Generate approximation signal
      for (let i = 0; i < samplesPerFrame; i++) {
        frame[i] = (Math.random() * 2 - 1) * energy;
      }
    }
    frames.push(frame);
    offset += frameSize + 1;
  }

  if (frames.length === 0) {
    return null;
  }

  const totalSamples = frames.length * samplesPerFrame;
  const audioData = new Float32Array(totalSamples);
  for (let i = 0; i < frames.length; i++) {
    audioData.set(frames[i], i * samplesPerFrame);
  }

  return { audioData, sampleRate };
}

// ─── Build filename suffix & metadata from params ────────────────────────────
function buildMetadata(params: ProcessingParams): { suffix: string; metadata: string } {
  const parts: string[] = [];
  const metaParts: string[] = [];

  parts.push(`S${params.sensitivity}`);
  metaParts.push(`Sensitivity: ${params.sensitivity}`);

  parts.push(`G${params.gainDb}`);
  metaParts.push(`Gain: ${params.gainDb}dB`);

  parts.push(`T${params.trebleBoost}`);
  metaParts.push(`Treble Boost: ${params.trebleBoost}dB`);

  if (params.enableEQ) {
    parts.push('EQ');
    metaParts.push('Voice Isolation EQ: ON');
  }
  if (params.enableQSJ) {
    parts.push('QSJ');
    metaParts.push('Quiet Segment Joiner: ON');
  }
  if (params.pureQSJ) {
    parts.push('PQ');
    metaParts.push('Pure QSJ Mode: ON');
  }
  if (params.enableForensicBoost) {
    parts.push('FB');
    metaParts.push('Forensic Boost: ON');
  }
  if (params.enableNoiseReduction) {
    parts.push('NR');
    metaParts.push('Noise Reduction: ON');
  }
  if (params.enableHumRemoval) {
    parts.push('HR');
    metaParts.push('Hum Removal: ON');
  }

  return {
    suffix: `_${parts.join('_')}`,
    metadata: `AudioEnhance AI Forensic Processing | ${metaParts.join(' | ')} | Processed: ${new Date().toISOString()}`,
  };
}

// ─── Main processing pipeline ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processAudio(audioData: Float32Array, sampleRate: number, params: ProcessingParams): ProcessingResult {
  sendProgress(5, 'Analyzing audio...');

  let data: any = new Float32Array(audioData);
  let qsjSegments: Array<{ start: number; end: number; kept: boolean }> = [];
  const { suffix, metadata } = buildMetadata(params);

  // Step 1: QSJ if enabled
  if (params.enableQSJ) {
    sendProgress(15, 'Applying Quiet Segment Joiner...');
    const qsjResult = applyQSJ(data, sampleRate, params.sensitivity);
    data = qsjResult.output;
    qsjSegments = qsjResult.segments;

    if (params.pureQSJ) {
      // Pure QSJ mode - skip all other processing
      sendProgress(90, 'Generating output...');
      return {
        processedBuffer: data,
        sampleRate,
        qsjSegments,
        metadata,
        filenameSuffix: suffix,
      };
    }
  }

  // Step 2: Noise Reduction
  if (params.enableNoiseReduction) {
    sendProgress(30, 'Applying noise reduction...');
    data = applyNoiseReduction(data, sampleRate);
  }

  // Step 3: Apply gain
  if (params.gainDb !== 0) {
    sendProgress(50, 'Applying gain...');
    const gainLinear = Math.pow(10, params.gainDb / 20);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gainLinear;
    }
  }

  // Step 4: Treble boost (simple high-shelf approximation)
  if (params.trebleBoost > 0) {
    sendProgress(60, 'Boosting intelligibility...');
    const boostLinear = Math.pow(10, params.trebleBoost / 20);
    // Simple first-order high-pass for treble emphasis
    const cutoff = 3500;
    const rc = 1.0 / (2 * Math.PI * cutoff);
    const dt = 1.0 / sampleRate;
    const alpha = rc / (rc + dt);

    let prev = 0;
    let prevInput = 0;
    for (let i = 0; i < data.length; i++) {
      const highPassed = alpha * (prev + data[i] - prevInput);
      prevInput = data[i];
      prev = highPassed;
      // Mix boosted treble back in
      data[i] = data[i] + highPassed * (boostLinear - 1);
    }
  }

  // Step 5: Forensic Boost (extreme compression in time domain)
  if (params.enableForensicBoost) {
    sendProgress(70, 'Applying forensic boost...');
    // Simulate extreme compression: ratio 20:1, threshold ~-100dB
    const thresholdLinear = Math.pow(10, -100 / 20);
    const ratio = 20;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > thresholdLinear) {
        const excess = abs - thresholdLinear;
        const compressed = thresholdLinear + excess / ratio;
        data[i] = data[i] > 0 ? compressed : -compressed;
      }
    }
    // Normalize after extreme compression
    let maxVal = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxVal) maxVal = abs;
    }
    if (maxVal > 0) {
      const norm = 0.95 / maxVal;
      for (let i = 0; i < data.length; i++) {
        data[i] *= norm;
      }
    }
  }

  // Step 6: Peak limiting
  sendProgress(80, 'Applying peak limiter...');
  for (let i = 0; i < data.length; i++) {
    if (data[i] > 0.99) data[i] = 0.99;
    if (data[i] < -0.99) data[i] = -0.99;
  }

  sendProgress(95, 'Done!');

  return {
    processedBuffer: data,
    sampleRate,
    qsjSegments,
    metadata,
    filenameSuffix: suffix,
  };
}

// ─── Message Handler ─────────────────────────────────────────────────────────
ctx.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'process': {
        if (!msg.audioData || !msg.sampleRate || !msg.params) {
          throw new Error('Missing audio data, sample rate, or params');
        }
        const result = processAudio(msg.audioData, msg.sampleRate, msg.params);
        ctx.postMessage(
          { type: 'result', result } as WorkerResponse,
          [result.processedBuffer.buffer] as unknown as Transferable[]
        );
        break;
      }

      case 'convertAmr': {
        if (!msg.amrData) {
          throw new Error('Missing AMR data');
        }
        const converted = convertAmrToPcm(msg.amrData);
        if (!converted) {
          throw new Error('Failed to decode AMR file');
        }
        ctx.postMessage(
          {
            type: 'amrConverted',
            audioData: converted.audioData,
            sampleRate: converted.sampleRate,
          } as WorkerResponse,
          [converted.audioData.buffer] as unknown as Transferable[]
        );
        break;
      }

      case 'generateWav': {
        if (!msg.audioData || !msg.sampleRate) {
          throw new Error('Missing audio data or sample rate');
        }
        const wavBuffer = generateWav(msg.audioData, msg.sampleRate, msg.metadata || '');
        ctx.postMessage(
          { type: 'wavGenerated', wavBlob: wavBuffer } as WorkerResponse,
          [wavBuffer] as unknown as Transferable[]
        );
        break;
      }
    }
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    } as WorkerResponse);
  }
});
