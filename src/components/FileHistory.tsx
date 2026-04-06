import { useState } from 'react';
import { Trash2, Clock, StickyNote, FolderHeart, Plus, X } from 'lucide-react';
import type { FileHistoryEntry, Language } from '../types/audio';
import { t } from '../i18n/translations';

interface FileHistoryProps {
  history: FileHistoryEntry[];
  favorites: string[];
  onUpdateNote: (id: string, notes: string) => void;
  onDeleteEntry: (id: string) => void;
  onClearHistory: () => void;
  onAddFavorite: (path: string) => void;
  onRemoveFavorite: (path: string) => void;
  lang: Language;
}

export function FileHistory({
  history,
  favorites,
  onUpdateNote,
  onDeleteEntry,
  onClearHistory,
  onAddFavorite,
  onRemoveFavorite,
  lang,
}: FileHistoryProps) {
  const [newFavorite, setNewFavorite] = useState('');
  const [editingNote, setEditingNote] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* File History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Clock size={14} />
            {t('fileHistory', lang)}
          </h3>
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              {t('clearHistory', lang)}
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-slate-500 italic">{t('noHistory', lang)}</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {entry.fileName}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(entry.date).toLocaleString(lang === 'it' ? 'it-IT' : 'en-US')}
                    </p>
                    <p className="text-xs text-cyan-400/70 font-mono mt-0.5 truncate">
                      {entry.outputFileName}
                    </p>
                  </div>
                  <button
                    onClick={() => onDeleteEntry(entry.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Notes */}
                {editingNote === entry.id ? (
                  <textarea
                    className="mt-2 w-full bg-slate-900 border border-slate-600 rounded text-xs text-slate-300 p-2 resize-none focus:outline-none focus:border-cyan-500"
                    rows={2}
                    defaultValue={entry.notes}
                    placeholder={t('addNote', lang)}
                    autoFocus
                    onBlur={(e) => {
                      onUpdateNote(entry.id, e.target.value);
                      setEditingNote(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onUpdateNote(entry.id, e.currentTarget.value);
                        setEditingNote(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setEditingNote(entry.id)}
                    className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <StickyNote size={10} />
                    {entry.notes || t('addNote', lang)}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Favorites */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-3">
          <FolderHeart size={14} />
          {t('favorites', lang)}
        </h3>

        {favorites.length === 0 ? (
          <p className="text-sm text-slate-500 italic">{t('noFavorites', lang)}</p>
        ) : (
          <div className="space-y-1">
            {favorites.map((fav) => (
              <div
                key={fav}
                className="flex items-center justify-between bg-slate-800/30 rounded px-3 py-1.5"
              >
                <span className="text-xs text-slate-400 font-mono truncate">{fav}</span>
                <button
                  onClick={() => onRemoveFavorite(fav)}
                  className="text-slate-500 hover:text-red-400 ml-2 shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={newFavorite}
            onChange={(e) => setNewFavorite(e.target.value)}
            placeholder={t('addFavorite', lang)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFavorite.trim()) {
                onAddFavorite(newFavorite.trim());
                setNewFavorite('');
              }
            }}
          />
          <button
            onClick={() => {
              if (newFavorite.trim()) {
                onAddFavorite(newFavorite.trim());
                setNewFavorite('');
              }
            }}
            className="bg-slate-700 hover:bg-slate-600 text-slate-300 rounded px-2 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
