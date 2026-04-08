export interface ProcessingParams {
  sensitivity: number;       // QSJ threshold 0-100 (legacy)
  qsjThresholdDb: number;    // QSJ cut threshold in dB (e.g. -32)
  gainDb: number;            // output gain in dB
  trebleBoost: number;       // treble/consonant boost in dB
  enableEQ: boolean;         // voice isolation filters
  enableQSJ: boolean;        // quiet segment joiner
  enableForensicBoost: boolean; // extreme compression
  enableNoiseReduction: boolean; // dynamic noise reduction
  enableHumRemoval: boolean; // 50/60Hz notch filters
  pureQSJ: boolean;          // QSJ only mode (no other filters)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AudioFloat32 = Float32Array<any>;

export interface ProcessingResult {
  processedBuffer: AudioFloat32;
  sampleRate: number;
  qsjSegments: Array<{ start: number; end: number; kept: boolean }>;
  metadata: string;
  filenameSuffix: string;
}

export interface WorkerMessage {
  type: 'process' | 'convertAmr' | 'generateWav';
  audioData?: AudioFloat32;
  sampleRate?: number;
  params?: ProcessingParams;
  amrData?: ArrayBuffer;
  metadata?: string;
}

export interface WorkerResponse {
  type: 'progress' | 'result' | 'error' | 'amrConverted' | 'wavGenerated';
  progress?: number;
  progressMessage?: string;
  result?: ProcessingResult;
  audioData?: AudioFloat32;
  sampleRate?: number;
  wavBlob?: ArrayBuffer;
  error?: string;
}

export interface FileHistoryEntry {
  id: string;
  fileName: string;
  date: string;
  params: ProcessingParams;
  notes: string;
  outputFileName: string;
}

export type Language = 'it' | 'en';

export interface TranscriptionResult {
  text: string;
  mode: 'direct' | 'predictive';
  timestamp: string;
}
