import { useState } from 'react';
import { Sparkles, Download, Key, MessageSquare, Brain } from 'lucide-react';
import type { Language, TranscriptionResult } from '../types/audio';
import { t } from '../i18n/translations';

const API_KEY_STORAGE = 'chiave_api_claude';

interface TranscriptionPanelProps {
  processedAudioData: Float32Array | null;
  sampleRate: number;
  filenameSuffix: string;
  originalFileName: string;
  lang: Language;
  onTranscribing: (v: boolean) => void;
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

  const float32ToBase64Wav = (data: Float32Array, sr: number): string => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const dataSize = data.length * bytesPerSample;
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < data.length; i++) {
      let sample = Math.max(-1, Math.min(1, data[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const transcribe = async () => {
    if (!apiKey || !processedAudioData) return;

    setIsTranscribing(true);
    setError(null);
    onTranscribing(true);

    try {
      const audioBase64 = float32ToBase64Wav(processedAudioData, sampleRate);

      const systemPrompt =
        mode === 'predictive'
          ? lang === 'it'
            ? `Sei un perito fonico forense esperto. Trascrivi questo audio migliorato con la massima precisione possibile.
Quando incontri parole incomprensibili o mascherate dal rumore, usa il contesto semantico per dedurre la parola più probabile e segnalala con il tag [probabile: parola].
Se una parola è completamente incomprensibile, usa [incomprensibile].
Indica anche i cambi di parlante con [Parlante 1], [Parlante 2], etc.
Fornisci solo la trascrizione, senza commenti aggiuntivi.`
            : `You are an expert forensic audio examiner. Transcribe this enhanced audio with maximum accuracy.
When you encounter words that are incomprehensible or masked by noise, use semantic context to infer the most likely word and mark it with the tag [probable: word].
If a word is completely incomprehensible, use [incomprehensible].
Also indicate speaker changes with [Speaker 1], [Speaker 2], etc.
Provide only the transcription, without additional comments.`
          : lang === 'it'
            ? 'Trascrivi questo audio in modo accurato. Indica i cambi di parlante se presenti. Fornisci solo la trascrizione.'
            : 'Accurately transcribe this audio. Indicate speaker changes if present. Provide only the transcription.';

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: lang === 'it'
                    ? 'Trascrivi il contenuto di questo file audio.'
                    : 'Transcribe the content of this audio file.',
                },
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'audio/wav',
                    data: audioBase64,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = data.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');

      setTranscription({
        text,
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
    const content = `AudioEnhance AI - ${mode === 'predictive' ? 'Predictive Analysis' : 'Direct Transcription'}
File: ${originalFileName}
Processing: ${filenameSuffix}
Date: ${transcription.timestamp}
Mode: ${transcription.mode}
AI: Claude (Anthropic)
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
