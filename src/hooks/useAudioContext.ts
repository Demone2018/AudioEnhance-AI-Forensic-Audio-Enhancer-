import { useRef, useCallback, useState, useEffect } from 'react';
import type { ProcessingParams } from '../types/audio';

export type PlayingSource = 'original' | 'processed' | null;

export function useAudioContext() {
  // Single shared AudioContext
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playingSource, setPlayingSource] = useState<PlayingSource>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }, []);

  // ── STOP: always works, no conditions ──
  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const src = sourceRef.current;
    if (src) {
      try { src.onended = null; src.stop(); src.disconnect(); } catch { /* */ }
      sourceRef.current = null;
    }
    setIsPlaying(false);
    setPlayingSource(null);
  }, []);

  // ── PLAY: simple, always stops previous first ──
  const _play = useCallback((
    buffer: AudioBuffer,
    offset: number,
    sourceLabel: PlayingSource,
    params?: ProcessingParams,
  ) => {
    // 1. Kill any existing playback
    cancelAnimationFrame(rafRef.current);
    const oldSrc = sourceRef.current;
    if (oldSrc) {
      try { oldSrc.onended = null; oldSrc.stop(); oldSrc.disconnect(); } catch { /* */ }
      sourceRef.current = null;
    }

    // 2. Create new source
    const ctx = getCtx();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    sourceRef.current = src;

    // 3. Build audio chain
    let node: AudioNode = src;

    if (params) {
      // Voice Isolation EQ
      if (params.enableEQ) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 300; hp.Q.value = 0.7;
        node.connect(hp); node = hp;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 4000; lp.Q.value = 0.7;
        node.connect(lp); node = lp;
      }

      // Hum removal
      if (params.enableHumRemoval) {
        for (const freq of [50, 60]) {
          const notch = ctx.createBiquadFilter();
          notch.type = 'notch'; notch.frequency.value = freq; notch.Q.value = 30;
          node.connect(notch); node = notch;
        }
      }

      // Intelligibility boost
      if (params.trebleBoost > 0) {
        const peak = ctx.createBiquadFilter();
        peak.type = 'peaking'; peak.frequency.value = 3500;
        peak.Q.value = 1.2; peak.gain.value = params.trebleBoost;
        node.connect(peak); node = peak;
      }

      // Gain
      if (params.gainDb !== 0) {
        const gain = ctx.createGain();
        gain.gain.value = Math.pow(10, params.gainDb / 20);
        node.connect(gain); node = gain;
      }
    }

    node.connect(ctx.destination);

    // 4. Handle end
    src.onended = () => {
      if (sourceRef.current === src) {
        sourceRef.current = null;
        setIsPlaying(false);
        setPlayingSource(null);
        cancelAnimationFrame(rafRef.current);
      }
    };

    // 5. Start
    const clampedOffset = Math.max(0, Math.min(offset, buffer.duration - 0.01));
    src.start(0, clampedOffset);
    offsetRef.current = clampedOffset;
    startedAtRef.current = ctx.currentTime;
    setIsPlaying(true);
    setPlayingSource(sourceLabel);

    // 6. Time tracking
    const tick = () => {
      if (sourceRef.current === src && ctxRef.current) {
        setCurrentTime(offsetRef.current + (ctxRef.current.currentTime - startedAtRef.current));
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [getCtx]);

  // ── Public methods ──
  const playRawBuffer = useCallback((buffer: AudioBuffer) => {
    _play(buffer, 0, 'original');
  }, [_play]);

  const playBuffer = useCallback((buffer: AudioBuffer, params: ProcessingParams) => {
    _play(buffer, 0, 'processed', params);
  }, [_play]);

  const playRawFrom = useCallback((buffer: AudioBuffer, offset: number) => {
    _play(buffer, offset, 'original');
  }, [_play]);

  const playFilteredFrom = useCallback((buffer: AudioBuffer, params: ProcessingParams, offset: number) => {
    _play(buffer, offset, 'processed', params);
  }, [_play]);

  const decodeAudioData = useCallback(async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => {
    const ctx = getCtx();
    return ctx.decodeAudioData(arrayBuffer);
  }, [getCtx]);

  const createBufferFromFloat32 = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any, sampleRate: number): AudioBuffer => {
      const ctx = getCtx();
      const buffer = ctx.createBuffer(1, data.length, sampleRate);
      buffer.copyToChannel(data, 0);
      return buffer;
    }, [getCtx]);

  const resetTime = useCallback(() => {
    setCurrentTime(0);
    offsetRef.current = 0;
  }, []);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  return {
    playBuffer, playRawBuffer, playRawFrom, playFilteredFrom,
    stopPlayback, decodeAudioData, createBufferFromFloat32,
    isPlaying, playingSource, currentTime, resetTime,
  };
}
