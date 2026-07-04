/**
 * persistBackup — OPTIONAL "keep in this browser" storage for the loaded
 * backup, so a refresh (or coming back tomorrow) doesn't force a re-drop.
 *
 * Off by default and fully opt-in: nothing is written unless the user ticks
 * "keep in this browser" on the drop zone. Storage is IndexedDB (localStorage
 * chokes on multi-MB logbooks), still entirely on-device — the privacy promise
 * ("your file never leaves this tab") is unchanged; this only adds "…and can
 * stay in this browser if you want it to."
 */
import type { ParsedBackup } from '../schema/backup';

const DB_NAME = 'element08-analyzer';
const STORE = 'backup';
const KEY = 'current';

interface Persisted {
  backup: ParsedBackup;
  filename: string;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save (or overwrite) the persisted backup. Best-effort — a storage failure
 *  (quota, private mode) is swallowed so analysis keeps working in-memory. */
export async function savePersistedBackup(backup: ParsedBackup, filename: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ backup, filename, savedAt: Date.now() } as Persisted, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* opt-in convenience only — never block the app on it */
  }
}

export async function loadPersistedBackup(): Promise<Persisted | null> {
  try {
    const db = await openDb();
    const result = await new Promise<Persisted | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Persisted) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result && result.backup ? result : null;
  } catch {
    return null;
  }
}

export async function clearPersistedBackup(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
