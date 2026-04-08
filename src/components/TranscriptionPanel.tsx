import { useState } from 'react';
import { Sparkles, Download, Key, MessageSquare, Brain } from 'lucide-react';
import type { Language, TranscriptionResult } from '../types/audio';
import { t } from '../i18n/translations';

const API_KEY_STORAGE = 'chiave_api_openai';

interface TranscriptionPanelProps {
  processedAudioData: Float32Array | null;
  sampleRate: number;
  filenameSuffix: string;
  originalFileName: string;
  lang: Language;
  onTranscribing: (v: boolean) => void;
}

function float32ToWavBlob(data: Float32Array, sr: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = data.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const w = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  w(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  w(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function TranscriptionPanel({
  processedAudioData,
  sampleRate,
  filenameSuffix,
  originalFileName,
  lang,
  onTranscribing,
}: TranscriptionPanelProps) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '');
  const [showApiKey, setShowApiKey] = useState(!apiKey);
  const [mode, setMode] = useState<'direct' | 'predictive'>('direct');
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem(API_KEY_STORAGE, key);
    if (key) setShowApiKey(false);
  };

  const transcribe = async () => {
    if (!apiKey || !processedAudioData) return;

    setIsTranscribing(true);
    setError(null);
    onTranscribing(true);

    try {
      // Step 1: Transcribe with Whisper
      const wavBlob = float32ToWavBlob(processedAudioData, sampleRate);

      // Check size (Whisper limit: 25MB)
      if (wavBlob.size > 25 * 1024 * 1024) {
        throw new Error(lang === 'it'
          ? 'Audio troppo lungo (max 25MB). Prova con un file più corto.'
          : 'Audio too long (max 25MB). Try a shorter file.');
      }

      const formData = new FormData();
      formData.append('file', wavBlob, 'audio.wav');
      formData.append('model', 'whisper-1');
      formData.append('language', lang === 'it' ? 'it' : 'en');
      formData.append('response_format', 'verbose_json');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!whisperResponse.ok) {
        let errMsg = `Whisper API error: ${whisperResponse.status}`;
        try {
          const errData = await whisperResponse.json();
          errMsg = errData.error?.message || errMsg;
        } catch { /* */ }
        throw new Error(errMsg);
      }

      const whisperData = await whisperResponse.json();
      let transcriptText = whisperData.text || '';

      // Step 2: If predictive mode, enhance with GPT-4o
      if (mode === 'predictive' && transcriptText) {
        const systemPrompt = lang === 'it'
          ? `Sei un perito fonico forense esperto. Ti viene data una trascrizione automatica di un audio di bassa qualità, probabilmente un'intercettazione o registrazione ambientale.

Il tuo compito è:
1. Analizzare la trascrizione e usare il contesto semantico per migliorarla
2. Dove la trascrizione ha parole che sembrano errate o senza senso, deduci la parola più probabile e segnalala con [probabile: parola]
3. Dove mancano chiaramente parole, inseriscile con [dedotto: parola]
4. Segna le parti davvero incomprensibili con [incomprensibile]
5. Indica i cambi di parlante con [Parlante 1], [Parlante 2], etc.

Restituisci SOLO la trascrizione migliorata, senza commenti.`
          : `You are an expert forensic audio examiner. You are given an automatic transcription of a low-quality audio, likely a surveillance or environmental recording.

Your task is:
1. Analyze the transcription and use semantic context to improve it
2. Where the transcription has words that seem wrong or nonsensical, infer the most likely word and mark it with [probable: word]
3. Where words are clearly missing, insert them with [inferred: word]
4. Mark truly incomprehensible parts with [incomprehensible]
5. Indicate speaker changes with [Speaker 1], [Speaker 2], etc.

Return ONLY the improved transcription, without comments.`;

        const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Trascrizione automatica da migliorare:\n\n${transcriptText}` },
            ],
            max_tokens: 4096,
          }),
        });

        if (gptResponse.ok) {
          const gptData = await gptResponse.json();
          transcriptText = gptData.choices?.[0]?.message?.content || transcriptText;
        }
      }

      setTranscription({
        text: transcriptText,
        mode,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setIsTranscribing(false);
      onTranscribing(false);
    }
  };

  const downloadTranscript = () => {
    if (!transcription) return;
    const baseName = originalFileName.replace(/\.[^.]+$/, '');
    const fileName = `${baseName}${filenameSuffix}_${mode === 'predictive' ? 'PRED' : 'DIR'}_transcript.txt`;
    const content = `AudioEnhance AI - ${mode === 'predictive' ? 'Predictive Analysis (Whisper + GPT-4o)' : 'Direct Transcription (Whisper)'}
File: ${originalFileName}
Processing: ${filenameSuffix}
Date: ${transcription.timestamp}
Mode: ${transcription.mode}
${'─'.repeat(60)}

${transcription.text}
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
        <Sparkles size={14} />
        {t('transcription', lang)}
      </h3>

      {/* API Key */}
      {showApiKey ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Key size={14} className="text-yellow-500" />
            <span className="text-xs text-slate-400">{t('apiKey', lang)}</span>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t('apiKeyPlaceholder', lang)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => saveApiKey(apiKey)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded text-sm transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowApiKey(true)}
          className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
        >
          <Key size={10} />
          {t('apiKeySaved', lang)} — click to change
        </button>
      )}

      {/* Mode Selection */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('direct')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            mode === 'direct'
              ? 'bg-cyan-600/20 border border-cyan-500/50 text-cyan-400'
              : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600'
          }`}
        >
          <MessageSquare size={14} />
          {t('directMode', lang)}
        </button>
        <button
          onClick={() => setMode('predictive')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            mode === 'predictive'
              ? 'bg-purple-600/20 border border-purple-500/50 text-purple-400'
              : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600'
          }`}
        >
          <Brain size={14} />
          {t('predictiveMode', lang)}
        </button>
      </div>

      {mode === 'predictive' && (
        <p className="text-xs text-purple-400/70 italic">{t('predictiveDesc', lang)}</p>
      )}

      {/* Transcribe Button */}
      <button
        onClick={transcribe}
        disabled={!processedAudioData || !apiKey || isTranscribing}
        className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
      >
        <Sparkles size={16} className={isTranscribing ? 'animate-spin' : ''} />
        {isTranscribing ? t('transcribing', lang) : t('transcribeBtn', lang)}
      </button>

      {!apiKey && (
        <p className="text-xs text-yellow-500/70">{t('apiKeyRequired', lang)}</p>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Transcription Result */}
      {transcription ? (
        <div className="space-y-2">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 max-h-64 overflow-y-auto">
            <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
              {transcription.text}
            </p>
          </div>
          <button
            onClick={downloadTranscript}
            className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <Download size={14} />
            {t('downloadTranscript', lang)}
          </button>
        </div>
      ) : (
        !isTranscribing && (
          <p className="text-sm text-slate-500 italic">{t('noTranscription', lang)}</p>
        )
      )}
    </div>
  );
}
