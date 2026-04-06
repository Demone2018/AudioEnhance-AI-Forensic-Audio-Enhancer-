import { useState, useCallback, useEffect } from 'react';
import type { FileHistoryEntry } from '../types/audio';

const HISTORY_KEY = 'cronologia_file_forensi';
const FAVORITES_KEY = 'cartelle_preferite_forensi';

export function useFileHistory() {
  const [history, setHistory] = useState<FileHistoryEntry[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch { /* ignore */ }

    try {
      const savedFav = localStorage.getItem(FAVORITES_KEY);
      if (savedFav) setFavorites(JSON.parse(savedFav));
    } catch { /* ignore */ }
  }, []);

  // Persist history
  const saveHistory = useCallback((entries: FileHistoryEntry[]) => {
    setHistory(entries);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  }, []);

  // Persist favorites
  const saveFavorites = useCallback((favs: string[]) => {
    setFavorites(favs);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  }, []);

  const addEntry = useCallback(
    (entry: Omit<FileHistoryEntry, 'id' | 'date'>) => {
      const newEntry: FileHistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
      };
      saveHistory([newEntry, ...history]);
    },
    [history, saveHistory]
  );

  const updateNote = useCallback(
    (id: string, notes: string) => {
      saveHistory(history.map((e) => (e.id === id ? { ...e, notes } : e)));
    },
    [history, saveHistory]
  );

  const deleteEntry = useCallback(
    (id: string) => {
      saveHistory(history.filter((e) => e.id !== id));
    },
    [history, saveHistory]
  );

  const clearHistory = useCallback(() => {
    saveHistory([]);
  }, [saveHistory]);

  const addFavorite = useCallback(
    (path: string) => {
      if (!favorites.includes(path)) {
        saveFavorites([...favorites, path]);
      }
    },
    [favorites, saveFavorites]
  );

  const removeFavorite = useCallback(
    (path: string) => {
      saveFavorites(favorites.filter((f) => f !== path));
    },
    [favorites, saveFavorites]
  );

  return {
    history,
    favorites,
    addEntry,
    updateNote,
    deleteEntry,
    clearHistory,
    addFavorite,
    removeFavorite,
  };
}
