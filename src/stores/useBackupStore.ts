/**
 * useBackupStore — in-memory hold for the currently-loaded backup file.
 *
 * By default nothing persists: the privacy promise is "your file never leaves
 * this browser tab", and a reload starts clean. The user can OPT IN to keeping
 * it in this browser (IndexedDB, still on-device) so a refresh doesn't force a
 * re-drop — see persistBackup.ts. When opted in, setBackup write-throughs and
 * `hydrate()` restores it on boot.
 *
 * Fields:
 *   - `backup`: the parsed file, or null
 *   - `filename`: the original file name (display only)
 *   - `persisted`: whether the current backup is being kept in this browser
 *   - `hydrated`: whether the boot-time hydrate has finished (gates first paint)
 */
import { create } from 'zustand';
import type { ParsedBackup, ParsedSession } from '../schema/backup';
import {
  clearPersistedBackup,
  loadPersistedBackup,
  savePersistedBackup,
} from '../lib/persistBackup';

interface BackupState {
  backup: ParsedBackup | null;
  filename: string | null;
  persisted: boolean;
  hydrated: boolean;
  /** Load a backup. `persist` opts into keeping it in this browser. */
  setBackup: (backup: ParsedBackup, filename: string, persist?: boolean) => void;
  clear: () => void;
  /** Restore an opted-in backup from IndexedDB on boot. */
  hydrate: () => Promise<void>;
  /** Lookup a session by its numeric id. Returns undefined if not found. */
  getSession: (id: number) => ParsedSession | undefined;
}

export const useBackupStore = create<BackupState>((set, get) => ({
  backup: null,
  filename: null,
  persisted: false,
  hydrated: false,
  setBackup: (backup, filename, persist = false) => {
    set({ backup, filename, persisted: persist });
    if (persist) void savePersistedBackup(backup, filename);
    else void clearPersistedBackup();
  },
  clear: () => {
    set({ backup: null, filename: null, persisted: false });
    void clearPersistedBackup();
  },
  hydrate: async () => {
    const saved = await loadPersistedBackup();
    if (saved && !get().backup) {
      set({ backup: saved.backup, filename: saved.filename, persisted: true });
    }
    set({ hydrated: true });
  },
  getSession: (id) => get().backup?.data.sessions.find((s) => s.id === id),
}));
