import { useRef, useCallback, useState, useEffect } from 'react';
import type { ProcessingParams } from '../types/audio';

export type PlayingSource = 'original' | 'processed' | null;

export function useAudioContext() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  // Stored references for seek
  const currentBufferRef = useRef<AudioBuffer | null>(null);
  const currentParamsRef = useRef<ProcessingParams | null>(null);
  const currentModeRef = useRef<'raw' | 'filtered'>('raw');

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playingSource, setPlayingSource] = useState<PlayingSource>(null);

  const getContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const startTimeTracking = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    const tick = () => {
      if (sourceRef.current && audioContextRef.current) {
        const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
        setCurrentTime(offsetRef.current + elapsed);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopTimeTracking = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  const buildFilterChain = useCallback(
    (ctx: AudioContext, source: AudioBufferSourceNode, params: ProcessingParams): AudioNode => {
      let currentNode: AudioNode = source;

      if (params.enableEQ) {
        const hp1 = ctx.createBiquadFilter();
        hp1.type = 'highpass'; hp1.frequency.value = 200; hp1.Q.value = 0.7;
        currentNode.connect(hp1); currentNode = hp1;

        const hp2 = ctx.createBiquadFilter();
        hp2.type = 'highpass'; hp2.frequency.value = 300; hp2.Q.value = 0.5;
        currentNode.connect(hp2); currentNode = hp2;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 4000; lp.Q.value = 0.7;
        currentNode.connect(lp); currentNode = lp;
      }

      if (params.enableHumRemoval) {
        const notch50 = ctx.createBiquadFilter();
        notch50.type = 'notch'; notch50.frequency.value = 50; notch50.Q.value = 30;
        currentNode.connect(notch50); currentNode = notch50;

        const notch60 = ctx.createBiquadFilter();
        notch60.type = 'notch'; notch60.frequency.value = 60; notch60.Q.value = 30;
        currentNode.connect(notch60); currentNode = notch60;
      }

      if (params.trebleBoost > 0) {
        const peak = ctx.createBiquadFilter();
        peak.type = 'peaking'; peak.frequency.value = 3500; peak.Q.value = 1.2;
        peak.gain.value = params.trebleBoost;
        currentNode.connect(peak); currentNode = peak;
      }

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = params.enableForensicBoost ? -60 : -24;
      compressor.knee.value = params.enableForensicBoost ? 5 : 10;
      compressor.ratio.value = params.enableForensicBoost ? 12 : 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      currentNode.connect(compressor); currentNode = compressor;

      const gainNode = ctx.createGain();
      gainNode.gain.value = Math.pow(10, params.gainDb / 20);
      currentNode.connect(gainNode); currentNode = gainNode;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1; limiter.knee.value = 0;
      limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.01;
      currentNode.connect(limiter); currentNode = limiter;

      return currentNode;
    },
    []
  );

  // Core: stop everything
  const stopPlayback = useCallback(() => {
    stopTimeTracking();
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* */ }
      sourceRef.current = null;
    }
    setIsPlaying(false);
    setPlayingSource(null);
  }, [stopTimeTracking]);

  // Core: start playback from offset
  const _play = useCallback(
    (buffer: AudioBuffer, offset: number, mode: 'raw' | 'filtered', params?: ProcessingParams, source?: PlayingSource) => {
      // Always stop first
      stopTimeTracking();
      if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch { /* */ }
        sourceRef.current = null;
      }

      const ctx = getContext();
      const audioSource = ctx.createBufferSource();
      audioSource.buffer = buffer;
      sourceRef.current = audioSource;

      currentBufferRef.current = buffer;
      currentParamsRef.current = params || null;
      currentModeRef.current = mode;
      offsetRef.current = offset;
      startTimeRef.current = ctx.currentTime;

      if (mode === 'filtered' && params) {
        const lastNode = buildFilterChain(ctx, audioSource, params);
        lastNode.connect(ctx.destination);
      } else {
        audioSource.connect(ctx.destination);
      }

      audioSource.onended = () => {
        sourceRef.current = null;
        setIsPlaying(false);
        setPlayingSource(null);
        stopTimeTracking();
      };

      audioSource.start(0, offset);
      setIsPlaying(true);
      setPlayingSource(source || null);
      startTimeTracking();
    },
    [getContext, buildFilterChain, startTimeTracking, stopTimeTracking]
  );

  // Public: play raw buffer
  const playRawBuffer = useCallback(
    (buffer: AudioBuffer) => {
      _play(buffer, 0, 'raw', undefined, 'original');
    },
    [_play]
  );

  // Public: play with filter chain
  const playBuffer = useCallback(
    (buffer: AudioBuffer, params: ProcessingParams) => {
      _play(buffer, 0, 'filtered', params, 'processed');
    },
    [_play]
  );

  // Public: play raw from offset (for waveform seek)
  const playRawFrom = useCallback(
    (buffer: AudioBuffer, offset: number) => {
      _play(buffer, offset, 'raw', undefined, 'original');
    },
    [_play]
  );

  // Public: play filtered from offset (for waveform seek)
  const playFilteredFrom = useCallback(
    (buffer: AudioBuffer, params: ProcessingParams, offset: number) => {
      _play(buffer, offset, 'filtered', params, 'processed');
    },
    [_play]
  );

  // Public: seek within currently playing buffer
  const seekTo = useCallback(
    (time: number) => {
      const buffer = currentBufferRef.current;
      if (!buffer) return;
      const clampedTime = Math.max(0, Math.min(time, buffer.duration));

      if (isPlaying) {
        _play(buffer, clampedTime, currentModeRef.current, currentParamsRef.current || undefined, playingSource);
      } else {
        setCurrentTime(clampedTime);
        offsetRef.current = clampedTime;
      }
    },
    [isPlaying, playingSource, _play]
  );

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

  const resetTime = useCallback(() => {
    setCurrentTime(0);
    offsetRef.current = 0;
  }, []);

  useEffect(() => {
    return () => { cancelAnimationFrame(animFrameRef.current); };
  }, []);

  return {
    playBuffer,
    playRawBuffer,
    playRawFrom,
    playFilteredFrom,
    stopPlayback,
    seekTo,
    decodeAudioData,
    createBufferFromFloat32,
    isPlaying,
    playingSource,
    currentTime,
    resetTime,
  };
}
