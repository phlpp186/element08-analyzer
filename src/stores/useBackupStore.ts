/**
 * useBackupStore — in-memory hold for the currently-loaded backup file.
 *
 * No persistence by design. The whole privacy promise is "your file never
 * leaves this browser tab" — that includes localStorage. A reload starts
 * with a clean slate; the user re-drops the file.
 *
 * Two fields:
 *   - `backup`: the parsed file, or null
 *   - `filename`: the original file name (display only — "viewing
 *     element08-backup-2026-05-13.json")
 */
import { create } from 'zustand';
import type { ParsedBackup, ParsedSession } from '../schema/backup';

interface BackupState {
  backup: ParsedBackup | null;
  filename: string | null;
  setBackup: (backup: ParsedBackup, filename: string) => void;
  clear: () => void;
  /** Lookup a session by its numeric id. Returns undefined if not found. */
  getSession: (id: number) => ParsedSession | undefined;
}

export const useBackupStore = create<BackupState>((set, get) => ({
  backup: null,
  filename: null,
  setBackup: (backup, filename) => set({ backup, filename }),
  clear: () => set({ backup: null, filename: null }),
  getSession: (id) =>
    get().backup?.data.sessions.find((s) => s.id === id),
}));
