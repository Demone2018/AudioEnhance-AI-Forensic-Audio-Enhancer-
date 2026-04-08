import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AudioWaveform,
  Download,
  Play,
  Square,
  RotateCcw,
  Settings,
  Globe,
  Zap,
  Loader2,
} from 'lucide-react';
import { AudioDropzone } from './components/AudioDropzone';
import { WaveformCanvas } from './components/WaveformCanvas';
import { ParameterControls } from './components/ParameterControls';
import { TranscriptionPanel } from './components/TranscriptionPanel';
import { FileHistory } from './components/FileHistory';
import { useAudioProcessor } from './hooks/useAudioProcessor';
import { useAudioContext } from './hooks/useAudioContext';
import { useFileHistory } from './hooks/useFileHistory';
import { t } from './i18n/translations';
import type { Language } from './types/audio';

function App() {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('audioenhance_lang');
    return (saved as Language) || 'it';
  });

  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);
  const [originalData, setOriginalData] = useState<Float32Array | null>(null);
  const [fileName, setFileName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null);

  const processor = useAudioProcessor();
  const audioCtx = useAudioContext();
  const fileHistory = useFileHistory();

  // playingSource comes from the audio context hook now
  const { playingSource } = audioCtx;

  // Navigation protection
  const isBusy = processor.isProcessing || isTranscribing;
  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isBusyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('audioenhance_lang', lang);
  }, [lang]);

  const handleFileLoaded = useCallback(
    (audioBuffer: AudioBuffer, name: string, _rawBuffer: ArrayBuffer) => {
      setOriginalBuffer(audioBuffer);
      const channelData = audioBuffer.getChannelData(0);
      setOriginalData(new Float32Array(channelData));
      setFileName(name);
      processor.resetResult();
      audioCtx.resetTime();
    },
    [processor, audioCtx]
  );

  const handleProcess = useCallback(async () => {
    if (!originalData || !originalBuffer) return;

    try {
      const result = await processor.processAudio(originalData, originalBuffer.sampleRate);

      const baseName = fileName.replace(/\.[^.]+$/, '');
      fileHistory.addEntry({
        fileName,
        params: { ...processor.params },
        notes: '',
        outputFileName: `${baseName}${result.filenameSuffix}.wav`,
      });
    } catch (err) {
      console.error('Processing failed:', err);
    }
  }, [originalData, originalBuffer, processor, fileName, fileHistory]);

  // Build processedBuffer when result changes
  useEffect(() => {
    if (processor.result) {
      const buf = audioCtx.createBufferFromFloat32(
        processor.result.processedBuffer,
        processor.result.sampleRate
      );
      setProcessedBuffer(buf);
    } else {
      setProcessedBuffer(null);
    }
  }, [processor.result, audioCtx]);

  // Use simple functions instead of useCallback to avoid stale closures
  const handlePlayOriginal = () => {
    if (!originalBuffer) return;
    if (audioCtx.isPlaying) {
      audioCtx.stopPlayback();
      if (audioCtx.playingSource === 'original') return;
    }
    audioCtx.playRawBuffer(originalBuffer);
  };

  const handlePlayProcessed = () => {
    if (!processedBuffer) return;
    if (audioCtx.isPlaying) {
      audioCtx.stopPlayback();
      if (audioCtx.playingSource === 'processed') return;
    }
    audioCtx.playBuffer(processedBuffer, processor.params);
  };

  // Stop anything that's playing
  const handleStop = () => {
    audioCtx.stopPlayback();
  };

  // Seek on waveform click: start playing from that position
  const handleSeekOriginal = (time: number) => {
    if (!originalBuffer) return;
    audioCtx.playRawFrom(originalBuffer, time);
  };

  const handleSeekProcessed = (time: number) => {
    if (!processedBuffer) return;
    audioCtx.playFilteredFrom(processedBuffer, processor.params, time);
  };

  const handleDownload = useCallback(async () => {
    if (!processor.result) return;

    const wavBuffer = await processor.generateWav(
      processor.result.processedBuffer,
      processor.result.sampleRate,
      processor.result.metadata
    );

    const baseName = fileName.replace(/\.[^.]+$/, '');
    const outputName = `${baseName}${processor.result.filenameSuffix}.wav`;

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outputName;
    a.click();
    URL.revokeObjectURL(url);
  }, [processor, fileName]);

  const handleReset = useCallback(() => {
    audioCtx.stopPlayback();
    audioCtx.resetTime();
    setOriginalBuffer(null);
    setOriginalData(null);
    setProcessedBuffer(null);
    setFileName('');
    processor.resetResult();
  }, [audioCtx, processor]);

  const originalDuration = originalBuffer?.duration || 0;
  const processedDuration = processor.result
    ? processor.result.processedBuffer.length / processor.result.sampleRate
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-2 rounded-lg">
              <AudioWaveform size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                {t('appTitle', lang)}
              </h1>
              <p className="text-xs text-slate-500">{t('appSubtitle', lang)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang((l) => (l === 'it' ? 'en' : 'it'))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm transition-colors"
            >
              <Globe size={14} />
              {lang.toUpperCase()}
            </button>

            <button
              onClick={() => setShowSettings((s) => !s)}
              className={`p-2 rounded-lg transition-colors ${
                showSettings ? 'bg-cyan-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
              }`}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel */}
          <div className="lg:col-span-4 space-y-6">
            <AudioDropzone
              onFileLoaded={handleFileLoaded}
              decodeAudioData={audioCtx.decodeAudioData}
              lang={lang}
              disabled={processor.isProcessing}
            />

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <ParameterControls
                params={processor.params}
                onUpdate={processor.updateParam}
                disabled={processor.isProcessing}
                lang={lang}
              />
            </div>

            <div className="space-y-2">
              <button
                onClick={handleProcess}
                disabled={!originalData || processor.isProcessing}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/20"
              >
                {processor.isProcessing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {t('processing', lang)}
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    {t('processBtn', lang)}
                  </>
                )}
              </button>

              <AnimatePresence>
                {processor.isProcessing && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-1"
                  >
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ width: `${processor.progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 text-center">
                      {processor.progressMessage} ({processor.progress}%)
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {originalData && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      onClick={handlePlayOriginal}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors ${
                        playingSource === 'original'
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {playingSource === 'original' ? <Square size={14} /> : <Play size={14} />}
                      {t('playOriginal', lang)}
                    </button>

                    {processor.result && (
                      <button
                        onClick={handlePlayProcessed}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors ${
                          playingSource === 'processed'
                            ? 'bg-green-600 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {playingSource === 'processed' ? <Square size={14} /> : <Play size={14} />}
                        {t('playProcessed', lang)}
                      </button>
                    )}
                  </div>

                  {/* Always-visible Stop button when playing */}
                  {audioCtx.isPlaying && (
                    <button
                      onClick={handleStop}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Square size={14} />
                      {t('stopBtn', lang)}
                    </button>
                  )}
                </div>
              )}

              {processor.result && (
                <div className="flex gap-2">
                  <button
                    onClick={handleDownload}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg text-sm transition-colors border border-green-600/30"
                  >
                    <Download size={14} />
                    {t('downloadBtn', lang)}
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-sm transition-colors"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel */}
          <div className="lg:col-span-8 space-y-6">
            {originalData && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-4"
              >
                <WaveformCanvas
                  audioData={originalData}
                  sampleRate={originalBuffer?.sampleRate || 44100}
                  qsjSegments={processor.result?.qsjSegments}
                  label={t('originalWaveform', lang)}
                  color="#22d3ee"
                  currentTime={playingSource === 'original' ? audioCtx.currentTime : 0}
                  duration={originalDuration}
                  onSeek={handleSeekOriginal}
                />

                {processor.result && (
                  <>
                    <WaveformCanvas
                      audioData={processor.result.processedBuffer}
                      sampleRate={processor.result.sampleRate}
                      qsjSegments={processor.result.qsjSegments}
                      label={t('processedWaveform', lang)}
                      color="#4ade80"
                      currentTime={playingSource === 'processed' ? audioCtx.currentTime : 0}
                      duration={processedDuration}
                      onSeek={handleSeekProcessed}
                    />
                    {processor.result.qsjSegments.length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-3 bg-red-500/25 border border-red-500/60 rounded-sm" />
                        <p className="text-xs text-red-400/80">
                          {t('qsjCutSegments', lang)}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {processor.error && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4">
                <p className="text-sm text-red-400">
                  {t('error', lang)}: {processor.error}
                </p>
              </div>
            )}

            {processor.result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-900/50 border border-slate-800 rounded-xl p-4"
              >
                <TranscriptionPanel
                  processedAudioData={processor.result.processedBuffer}
                  sampleRate={processor.result.sampleRate}
                  filenameSuffix={processor.result.filenameSuffix}
                  originalFileName={fileName}
                  lang={lang}
                  onTranscribing={setIsTranscribing}
                />
              </motion.div>
            )}

            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 overflow-hidden"
                >
                  <FileHistory
                    history={fileHistory.history}
                    favorites={fileHistory.favorites}
                    onUpdateNote={fileHistory.updateNote}
                    onDeleteEntry={fileHistory.deleteEntry}
                    onClearHistory={fileHistory.clearHistory}
                    onAddFavorite={fileHistory.addFavorite}
                    onRemoveFavorite={fileHistory.removeFavorite}
                    lang={lang}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {!originalData && (
              <div className="flex items-center justify-center h-64 text-slate-600">
                <div className="text-center space-y-3">
                  <AudioWaveform size={48} className="mx-auto opacity-30" />
                  <p className="text-sm">{t('dropzone', lang)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800 mt-12 py-4">
        <p className="text-center text-xs text-slate-600">
          AudioEnhance AI — Forensic Audio Enhancer — Claude AI — {t('language', lang)}: {lang.toUpperCase()}
        </p>
      </footer>
    </div>
  );
}

export default App;
