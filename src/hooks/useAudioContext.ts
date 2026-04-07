import { useRef, useCallback, useState, useEffect } from 'react';
import type { ProcessingParams } from '../types/audio';

export function useAudioContext() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isPlayingRef = useRef(false);
  const startTimeRef = useRef(0);     // AudioContext time when playback started
  const offsetRef = useRef(0);         // offset into the buffer (for seek)
  const currentBufferRef = useRef<AudioBuffer | null>(null);
  const currentParamsRef = useRef<ProcessingParams | null>(null);
  const currentModeRef = useRef<'raw' | 'filtered'>('raw');
  const onEndedRef = useRef<(() => void) | undefined>(undefined);
  const animFrameRef = useRef<number>(0);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const getContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  // Animation frame loop to update currentTime
  const startTimeTracking = useCallback(() => {
    const tick = () => {
      if (isPlayingRef.current && audioContextRef.current) {
        const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
        setCurrentTime(offsetRef.current + elapsed);
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopTimeTracking = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
  }, []);

  // Build the forensic filter chain
  const buildFilterChain = useCallback(
    (ctx: AudioContext, source: AudioBufferSourceNode, params: ProcessingParams): AudioNode => {
      let currentNode: AudioNode = source;

      if (params.enableEQ) {
        const hp1 = ctx.createBiquadFilter();
        hp1.type = 'highpass';
        hp1.frequency.value = 200;
        hp1.Q.value = 0.7;
        currentNode.connect(hp1);
        currentNode = hp1;

        const hp2 = ctx.createBiquadFilter();
        hp2.type = 'highpass';
        hp2.frequency.value = 300;
        hp2.Q.value = 0.5;
        currentNode.connect(hp2);
        currentNode = hp2;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4000;
        lp.Q.value = 0.7;
        currentNode.connect(lp);
        currentNode = lp;
      }

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

      if (params.trebleBoost > 0) {
        const peak = ctx.createBiquadFilter();
        peak.type = 'peaking';
        peak.frequency.value = 3500;
        peak.Q.value = 1.2;
        peak.gain.value = params.trebleBoost;
        currentNode.connect(peak);
        currentNode = peak;
      }

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = params.enableForensicBoost ? -100 : -50;
      compressor.knee.value = params.enableForensicBoost ? 0 : 10;
      compressor.ratio.value = params.enableForensicBoost ? 20 : 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      currentNode.connect(compressor);
      currentNode = compressor;

      const gainNode = ctx.createGain();
      gainNode.gain.value = Math.pow(10, params.gainDb / 20);
      currentNode.connect(gainNode);
      currentNode = gainNode;

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

  const stopPlayback = useCallback(() => {
    if (sourceRef.current && isPlayingRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // Already stopped
      }
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
    stopTimeTracking();
  }, [stopTimeTracking]);

  const _startSource = useCallback(
    (audioBuffer: AudioBuffer, offset: number, mode: 'raw' | 'filtered', params?: ProcessingParams, onEnded?: () => void) => {
      // Stop any existing playback
      if (sourceRef.current && isPlayingRef.current) {
        try { sourceRef.current.stop(); } catch { /* */ }
      }
      stopTimeTracking();

      const ctx = getContext();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      sourceRef.current = source;
      isPlayingRef.current = true;
      setIsPlaying(true);
      currentBufferRef.current = audioBuffer;
      currentParamsRef.current = params || null;
      currentModeRef.current = mode;
      onEndedRef.current = onEnded;
      offsetRef.current = offset;
      startTimeRef.current = ctx.currentTime;

      if (mode === 'filtered' && params) {
        const lastNode = buildFilterChain(ctx, source, params);
        lastNode.connect(ctx.destination);
      } else {
        source.connect(ctx.destination);
      }

      source.onended = () => {
        isPlayingRef.current = false;
        setIsPlaying(false);
        stopTimeTracking();
        onEnded?.();
      };

      source.start(0, offset);
      startTimeTracking();
    },
    [getContext, buildFilterChain, startTimeTracking, stopTimeTracking]
  );

  const playBuffer = useCallback(
    (audioBuffer: AudioBuffer, params: ProcessingParams, onEnded?: () => void) => {
      stopPlayback();
      _startSource(audioBuffer, 0, 'filtered', params, onEnded);
    },
    [stopPlayback, _startSource]
  );

  const playRawBuffer = useCallback(
    (audioBuffer: AudioBuffer, onEnded?: () => void) => {
      stopPlayback();
      _startSource(audioBuffer, 0, 'raw', undefined, onEnded);
    },
    [stopPlayback, _startSource]
  );

  // Seek to a specific time in the currently playing buffer
  const seekTo = useCallback(
    (time: number) => {
      const buffer = currentBufferRef.current;
      if (!buffer) return;

      const clampedTime = Math.max(0, Math.min(time, buffer.duration));
      setCurrentTime(clampedTime);

      if (isPlayingRef.current) {
        // Restart playback from the new position
        _startSource(buffer, clampedTime, currentModeRef.current, currentParamsRef.current || undefined, onEndedRef.current);
      } else {
        // Just update the cursor position without playing
        offsetRef.current = clampedTime;
      }
    },
    [_startSource]
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimeTracking();
    };
  }, [stopTimeTracking]);

  return {
    playBuffer,
    playRawBuffer,
    stopPlayback,
    seekTo,
    decodeAudioData,
    createBufferFromFloat32,
    isPlaying,
    currentTime,
    resetTime,
  };
}
