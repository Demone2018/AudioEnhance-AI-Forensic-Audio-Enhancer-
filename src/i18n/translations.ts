import type { Language } from '../types/audio';

const translations = {
  // App title & header
  appTitle: { it: 'AudioEnhance AI', en: 'AudioEnhance AI' },
  appSubtitle: { it: 'Forensic Audio Enhancer', en: 'Forensic Audio Enhancer' },

  // File upload
  dropzone: { it: 'Trascina qui un file audio o clicca per selezionare', en: 'Drag an audio file here or click to select' },
  supportedFormats: { it: 'Formati supportati: WAV, MP3, OGG, FLAC, AMR, WebM, M4A', en: 'Supported formats: WAV, MP3, OGG, FLAC, AMR, WebM, M4A' },
  fileLoaded: { it: 'File caricato', en: 'File loaded' },
  loadingFile: { it: 'Caricamento file...', en: 'Loading file...' },
  convertingAmr: { it: 'Conversione AMR in corso...', en: 'Converting AMR file...' },

  // Processing controls
  processBtn: { it: 'Elabora Audio', en: 'Process Audio' },
  processing: { it: 'Elaborazione in corso...', en: 'Processing...' },
  downloadBtn: { it: 'Scarica Audio Elaborato', en: 'Download Processed Audio' },
  stopBtn: { it: 'Ferma', en: 'Stop' },
  resetBtn: { it: 'Reset', en: 'Reset' },

  // Parameters
  sensitivity: { it: 'Sensibilità QSJ', en: 'QSJ Sensitivity' },
  sensitivityDesc: { it: 'Soglia per il taglio dei segmenti rumorosi (0-100)', en: 'Threshold for cutting noisy segments (0-100)' },
  gain: { it: 'Guadagno (dB)', en: 'Gain (dB)' },
  trebleBoost: { it: 'Boost Intelligibilità (dB)', en: 'Intelligibility Boost (dB)' },
  trebleBoostDesc: { it: 'Enfatizza consonanti e chiarezza vocale a 3500Hz', en: 'Emphasize consonants and vocal clarity at 3500Hz' },

  // Toggles
  enableEQ: { it: 'Isolamento Vocale (EQ)', en: 'Voice Isolation (EQ)' },
  enableEQDesc: { it: 'Filtri Highpass/Lowpass per isolare lo spettro vocale', en: 'Highpass/Lowpass filters to isolate voice spectrum' },
  enableQSJ: { it: 'Quiet Segment Joiner (QSJ)', en: 'Quiet Segment Joiner (QSJ)' },
  enableQSJDesc: { it: 'Rimuove segmenti ad alto volume, mantiene sussurri', en: 'Removes loud segments, keeps whispers' },
  pureQSJ: { it: 'Modalità QSJ Puro', en: 'Pure QSJ Mode' },
  pureQSJDesc: { it: 'Solo taglio segmenti, nessun filtro aggiuntivo', en: 'Segment cutting only, no additional filters' },
  enableForensicBoost: { it: 'Forensic Boost', en: 'Forensic Boost' },
  enableForensicBoostDesc: { it: 'Compressione estrema (20:1) per segnali quasi inesistenti', en: 'Extreme compression (20:1) for near-silent signals' },
  enableNoiseReduction: { it: 'Riduzione Rumore', en: 'Noise Reduction' },
  enableNoiseReductionDesc: { it: 'Riduzione adattiva del rumore a 4 bande', en: '4-band adaptive noise reduction' },
  enableHumRemoval: { it: 'Rimozione Ronzio', en: 'Hum Removal' },
  enableHumRemovalDesc: { it: 'Filtri Notch a 50Hz e 60Hz per ronzio di rete', en: '50Hz and 60Hz notch filters for power line hum' },

  // Waveform
  originalWaveform: { it: 'Forma d\'onda originale', en: 'Original waveform' },
  processedWaveform: { it: 'Forma d\'onda elaborata', en: 'Processed waveform' },
  qsjCutSegments: { it: 'Segmenti tagliati (rosso)', en: 'Cut segments (red)' },

  // Transcription
  transcription: { it: 'Trascrizione IA', en: 'AI Transcription' },
  transcribeBtn: { it: 'Trascrivi con Claude AI', en: 'Transcribe with Claude AI' },
  transcribing: { it: 'Trascrizione in corso...', en: 'Transcribing...' },
  directMode: { it: 'Trascrizione Diretta', en: 'Direct Transcription' },
  predictiveMode: { it: 'Analisi Predittiva', en: 'Predictive Analysis' },
  predictiveDesc: { it: 'L\'IA agisce come perito fonico, deducendo parole incomprensibili', en: 'AI acts as forensic expert, inferring incomprehensible words' },
  downloadTranscript: { it: 'Scarica Trascrizione', en: 'Download Transcript' },
  noTranscription: { it: 'Nessuna trascrizione disponibile', en: 'No transcription available' },

  // API Key
  apiKey: { it: 'Chiave API Claude (Anthropic)', en: 'Claude API Key (Anthropic)' },
  apiKeyPlaceholder: { it: 'Inserisci la tua chiave API Anthropic...', en: 'Enter your Anthropic API key...' },
  apiKeySaved: { it: 'Chiave salvata', en: 'Key saved' },
  apiKeyRequired: { it: 'Chiave API Anthropic richiesta per la trascrizione', en: 'Anthropic API key required for transcription' },

  // History
  fileHistory: { it: 'Storico File', en: 'File History' },
  noHistory: { it: 'Nessun file nello storico', en: 'No files in history' },
  clearHistory: { it: 'Cancella Storico', en: 'Clear History' },
  addNote: { it: 'Aggiungi nota...', en: 'Add note...' },
  deleteEntry: { it: 'Elimina', en: 'Delete' },

  // Favorites
  favorites: { it: 'Cartelle Preferite', en: 'Favorite Folders' },
  addFavorite: { it: 'Aggiungi cartella preferita', en: 'Add favorite folder' },
  noFavorites: { it: 'Nessuna cartella preferita', en: 'No favorite folders' },

  // Player
  play: { it: 'Riproduci', en: 'Play' },
  pause: { it: 'Pausa', en: 'Pause' },
  playOriginal: { it: 'Riproduci Originale', en: 'Play Original' },
  playProcessed: { it: 'Riproduci Elaborato', en: 'Play Processed' },

  // Status messages
  ready: { it: 'Pronto', en: 'Ready' },
  processingComplete: { it: 'Elaborazione completata', en: 'Processing complete' },
  error: { it: 'Errore', en: 'Error' },
  unsavedWork: { it: 'Hai un\'elaborazione in corso. Sei sicuro di voler uscire?', en: 'You have processing in progress. Are you sure you want to leave?' },

  // Sections
  parameters: { it: 'Parametri', en: 'Parameters' },
  filters: { it: 'Filtri', en: 'Filters' },
  settings: { it: 'Impostazioni', en: 'Settings' },
  language: { it: 'Lingua', en: 'Language' },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, lang: Language): string {
  const entry = translations[key];
  return entry?.[lang] ?? key;
}

export default translations;
