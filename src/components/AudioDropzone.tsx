import { useCallback, useRef, useState } from 'react';
import { Upload, FileAudio, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Language } from '../types/audio';
import { t } from '../i18n/translations';

interface AudioDropzoneProps {
  onFileLoaded: (audioBuffer: AudioBuffer, fileName: string, rawArrayBuffer: ArrayBuffer) => void;
  onAmrDetected: (arrayBuffer: ArrayBuffer, fileName: string) => void;
  decodeAudioData: (buffer: ArrayBuffer) => Promise<AudioBuffer>;
  lang: Language;
  disabled: boolean;
}

export function AudioDropzone({
  onFileLoaded,
  onAmrDetected,
  decodeAudioData,
  lang,
  disabled,
}: AudioDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const arrayBuffer = await file.arrayBuffer();

        // Always try browser's native decoding first (supports WAV, MP3, OGG, FLAC, AAC, etc.)
        // Some browsers can also decode AMR natively
        try {
          const audioBuffer = await decodeAudioData(arrayBuffer.slice(0));
          onFileLoaded(audioBuffer, file.name, arrayBuffer);
          setLoadedFile(file.name);
          setIsLoading(false);
          return;
        } catch {
          // Browser can't decode this format - check if it's AMR
        }

        // Fallback for AMR files: use worker-based conversion
        const header = new Uint8Array(arrayBuffer.slice(0, 6));
        const headerStr = String.fromCharCode(...header);
        if (headerStr.startsWith('#!AMR') || file.name.toLowerCase().endsWith('.amr')) {
          onAmrDetected(arrayBuffer, file.name);
          setLoadedFile(file.name);
          setIsLoading(false);
          return;
        }

        setLoadError(lang === 'it'
          ? 'Formato audio non supportato dal browser.'
          : 'Audio format not supported by this browser.');
      } catch (err) {
        console.error('Failed to load audio file:', err);
        setLoadError(lang === 'it' ? 'Errore nel caricamento del file.' : 'Error loading file.');
      }
      setIsLoading(false);
    },
    [onFileLoaded, onAmrDetected, decodeAudioData, lang]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
        isDragging
          ? 'border-cyan-400 bg-cyan-400/5'
          : loadedFile
            ? 'border-green-500/50 bg-green-500/5'
            : 'border-slate-700 hover:border-slate-500 bg-slate-800/30'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.amr"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
        className="hidden"
      />

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex flex-col items-center gap-3"
          >
            <Loader2 size={32} className="text-cyan-400 animate-spin" />
            <p className="text-sm text-slate-400">{t('loadingFile', lang)}</p>
          </motion.div>
        ) : loadedFile ? (
          <motion.div
            key="loaded"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex flex-col items-center gap-3"
          >
            <FileAudio size={32} className="text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-400">{t('fileLoaded', lang)}</p>
              <p className="text-xs text-slate-400 mt-1">{loadedFile}</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3"
          >
            <Upload size={32} className="text-slate-500" />
            <div>
              <p className="text-sm text-slate-400">{t('dropzone', lang)}</p>
              <p className="text-xs text-slate-600 mt-1">{t('supportedFormats', lang)}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loadError && (
        <p className="text-xs text-red-400 mt-2 text-center">{loadError}</p>
      )}
    </div>
  );
}
