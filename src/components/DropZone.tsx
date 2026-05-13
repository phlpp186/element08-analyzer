/**
 * DropZone — drag-and-drop or click-to-pick for a single backup file.
 *
 * On a successful parse, calls `onLoaded` with the validated backup and
 * the filename. On a failure, surfaces a user-readable error inline (no
 * thrown exceptions or console-only failures).
 *
 * No upload anywhere — the file is read via `file.text()` in the browser
 * and validated locally. This is the privacy promise enforced in code.
 */
import { useCallback, useRef, useState } from 'react';
import { parseBackupFile } from '../lib/parseBackup';
import type { ParsedBackup } from '../schema/backup';

interface Props {
  onLoaded: (backup: ParsedBackup, filename: string) => void;
}

export function DropZone({ onLoaded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const backup = await parseBackupFile(file);
        onLoaded(backup, file.name);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read the file.');
      } finally {
        setBusy(false);
      }
    },
    [onLoaded],
  );

  function onClick() {
    if (!busy) fileInputRef.current?.click();
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be dropped twice in a row.
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  return (
    <div className="w-full max-w-2xl">
      <div
        onClick={onClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="button"
        tabIndex={0}
        aria-busy={busy}
        className={[
          'flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed bg-panel text-center transition-colors',
          'cursor-pointer select-none',
          dragOver ? 'border-accent bg-abyss' : 'border-border hover:border-accent',
          busy ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <p className="mb-2 font-heading text-xl tracking-wide text-text">
          {busy ? 'Reading…' : 'Drop your backup file here'}
        </p>
        <p className="font-mono text-xs uppercase tracking-widest text-textDim">
          or click to choose · .e08backup.json
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={onChange}
        className="hidden"
      />

      {error && (
        <p
          role="alert"
          className="mt-4 rounded border border-red/40 bg-red/10 px-4 py-3 text-sm text-red"
        >
          {error}
        </p>
      )}
    </div>
  );
}
