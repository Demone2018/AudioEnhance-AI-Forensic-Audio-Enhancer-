import { useRef, useCallback } from 'react';
import type { ProcessingParams } from '../types/audio';

// Web Audio API filter chain for real-time playback with forensic filters
export function useAudioContext() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isPlayingRef = useRef(false);

  const getContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  // Build the forensic filter chain using Web Audio API nodes
  const buildFilterChain = useCallback(
    (ctx: AudioContext, source: AudioBufferSourceNode, params: ProcessingParams): AudioNode => {
      let currentNode: AudioNode = source;

      // Voice Isolation EQ
      if (params.enableEQ) {
        // Highpass at 200Hz - cut low rumble
        const hp1 = ctx.createBiquadFilter();
        hp1.type = 'highpass';
        hp1.frequency.value = 200;
        hp1.Q.value = 0.7;
        currentNode.connect(hp1);
        currentNode = hp1;

        // Highpass at 300Hz - further isolation
        const hp2 = ctx.createBiquadFilter();
        hp2.type = 'highpass';
        hp2.frequency.value = 300;
        hp2.Q.value = 0.5;
        currentNode.connect(hp2);
        currentNode = hp2;

        // Lowpass at 4000Hz - cut high-frequency noise
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4000;
        lp.Q.value = 0.7;
        currentNode.connect(lp);
        currentNode = lp;
      }

      // Hum removal - notch filters at 50Hz and 60Hz
      if (params.enableHumRemoval) {
        const notch50 = ctx.createBiquadFilter();
        notch50.type = 'notch';
        notch50.frequency.value = 50;
        notch50.Q.value = 30;
        currentNode.connect(notch50);
        currentNode = notch50;

        const notch60 = ctx.createBiquadFilter();
        notch60.type = 'notch';
        notch60.frequency.value = 60;
        notch60.Q.value = 30;
        currentNode.connect(notch60);
        currentNode = notch60;
      }

      // Intelligibility boost - Peaking at 3500Hz
      if (params.trebleBoost > 0) {
        const peak = ctx.createBiquadFilter();
        peak.type = 'peaking';
        peak.frequency.value = 3500;
        peak.Q.value = 1.2;
        peak.gain.value = params.trebleBoost;
        currentNode.connect(peak);
        currentNode = peak;
      }

      // Voice Leveler (DynamicsCompressor + Gain)
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = params.enableForensicBoost ? -100 : -50;
      compressor.knee.value = params.enableForensicBoost ? 0 : 10;
      compressor.ratio.value = params.enableForensicBoost ? 20 : 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      currentNode.connect(compressor);
      currentNode = compressor;

      // Output gain
      const gainNode = ctx.createGain();
      gainNode.gain.value = Math.pow(10, params.gainDb / 20);
      currentNode.connect(gainNode);
      currentNode = gainNode;

      // Peak limiter (second compressor)
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.01;
      currentNode.connect(limiter);
      currentNode = limiter;

      return currentNode;
    },
    []
  );

  const playBuffer = useCallback(
    (audioBuffer: AudioBuffer, params: ProcessingParams, onEnded?: () => void) => {
      stopPlayback();

      const ctx = getContext();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      sourceRef.current = source;
      isPlayingRef.current = true;

      const lastNode = buildFilterChain(ctx, source, params);
      lastNode.connect(ctx.destination);

      source.onended = () => {
        isPlayingRef.current = false;
        onEnded?.();
      };

      source.start(0);
    },
    [getContext, buildFilterChain]
  );

  const playRawBuffer = useCallback(
    (audioBuffer: AudioBuffer, onEnded?: () => void) => {
      stopPlayback();

      const ctx = getContext();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      sourceRef.current = source;
      isPlayingRef.current = true;

      source.connect(ctx.destination);

      source.onended = () => {
        isPlayingRef.current = false;
        onEnded?.();
      };

      source.start(0);
    },
    [getContext]
  );

  const stopPlayback = useCallback(() => {
    if (sourceRef.current && isPlayingRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // Already stopped
      }
      isPlayingRef.current = false;
    }
  }, []);

  const decodeAudioData = useCallback(
    async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => {
      const ctx = getContext();
      return ctx.decodeAudioData(arrayBuffer);
    },
    [getContext]
  );

  const createBufferFromFloat32 = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any, sampleRate: number): AudioBuffer => {
      const ctx = getContext();
      const buffer = ctx.createBuffer(1, data.length, sampleRate);
      buffer.copyToChannel(data, 0);
      return buffer;
    },
    [getContext]
  );

  return {
    playBuffer,
    playRawBuffer,
    stopPlayback,
    decodeAudioData,
    createBufferFromFloat32,
    isPlaying: isPlayingRef,
  };
}
