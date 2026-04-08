import { useState, useRef, useCallback } from 'react';
import type { ProcessingParams, ProcessingResult, WorkerResponse } from '../types/audio';

const DEFAULT_PARAMS: ProcessingParams = {
  sensitivity: 50,
  qsjThresholdDb: -32,
  gainDb: 3,
  trebleBoost: 3,
  enableEQ: false,
  enableQSJ: false,
  enableForensicBoost: false,
  enableNoiseReduction: false,
  enableHumRemoval: false,
  pureQSJ: false,
};

export function useAudioProcessor() {
  const [params, setParams] = useState<ProcessingParams>(DEFAULT_PARAMS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../workers/audioProcessor.worker.ts', import.meta.url),
        { type: 'module' }
      );
    }
    return workerRef.current;
  }, []);

  const processAudio = useCallback(
    (audioData: Float32Array, sampleRate: number): Promise<ProcessingResult> => {
      return new Promise((resolve, reject) => {
        setIsProcessing(true);
        setProgress(0);
        setError(null);

        const worker = getWorker();

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const msg = event.data;
          switch (msg.type) {
            case 'progress':
              setProgress(msg.progress || 0);
              setProgressMessage(msg.progressMessage || '');
              break;
            case 'result':
              if (msg.result) {
                setResult(msg.result);
                setIsProcessing(false);
                setProgress(100);
                resolve(msg.result);
              }
              break;
            case 'error':
              setIsProcessing(false);
              setError(msg.error || 'Unknown error');
              reject(new Error(msg.error));
              break;
          }
        };

        worker.onerror = (err) => {
          setIsProcessing(false);
          setError(err.message);
          reject(err);
        };

        // Transfer buffer for performance
        const dataCopy = new Float32Array(audioData);
        worker.postMessage(
          { type: 'process', audioData: dataCopy, sampleRate, params },
          [dataCopy.buffer]
        );
      });
    },
    [params, getWorker]
  );

  const generateWav = useCallback(
    (audioData: Float32Array, sampleRate: number, metadata: string): Promise<ArrayBuffer> => {
      return new Promise((resolve, reject) => {
        const worker = getWorker();

        const handler = (event: MessageEvent<WorkerResponse>) => {
          const msg = event.data;
          if (msg.type === 'wavGenerated' && msg.wavBlob) {
            worker.removeEventListener('message', handler);
            resolve(msg.wavBlob);
          } else if (msg.type === 'error') {
            worker.removeEventListener('message', handler);
            reject(new Error(msg.error));
          }
        };

        worker.addEventListener('message', handler);

        const dataCopy = new Float32Array(audioData);
        worker.postMessage(
          { type: 'generateWav', audioData: dataCopy, sampleRate, metadata },
          [dataCopy.buffer]
        );
      });
    },
    [getWorker]
  );

  const convertAmr = useCallback(
    (amrData: ArrayBuffer): Promise<{ audioData: Float32Array; sampleRate: number }> => {
      return new Promise((resolve, reject) => {
        const worker = getWorker();

        const handler = (event: MessageEvent<WorkerResponse>) => {
          const msg = event.data;
          if (msg.type === 'amrConverted' && msg.audioData && msg.sampleRate) {
            worker.removeEventListener('message', handler);
            resolve({ audioData: msg.audioData, sampleRate: msg.sampleRate });
          } else if (msg.type === 'error') {
            worker.removeEventListener('message', handler);
            reject(new Error(msg.error));
          }
        };

        worker.addEventListener('message', handler);
        worker.postMessage({ type: 'convertAmr', amrData }, [amrData]);
      });
    },
    [getWorker]
  );

  const resetResult = useCallback(() => {
    setResult(null);
    setProgress(0);
    setProgressMessage('');
    setError(null);
  }, []);

  const updateParam = useCallback(<K extends keyof ProcessingParams>(key: K, value: ProcessingParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  return {
    params,
    setParams,
    updateParam,
    isProcessing,
    progress,
    progressMessage,
    result,
    error,
    processAudio,
    generateWav,
    convertAmr,
    resetResult,
    DEFAULT_PARAMS,
  };
}
