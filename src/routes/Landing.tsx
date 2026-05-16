/**
 * Landing — drop a backup file to enter the analyzer.
 *
 * On success, store the parsed backup and navigate to the session list.
 * If a backup is already loaded (the user navigated back), the route
 * still shows the drop zone so they can swap in a different file —
 * "Continue with current file" link gets them back into the analyzer
 * without re-picking.
 *
 * "Try with demo data" loads a bundled synthetic backup so visitors can
 * explore every view without owning the app yet.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DropZone } from '../components/DropZone';
import { useBackupStore } from '../stores/useBackupStore';
import { parseBackupText } from '../lib/parseBackup';
import type { ParsedBackup } from '../schema/backup';

export function Landing() {
  const navigate = useNavigate();
  const setBackup = useBackupStore((s) => s.setBackup);
  const currentFilename = useBackupStore((s) => s.filename);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  function onLoaded(backup: ParsedBackup, filename: string) {
    setBackup(backup, filename);
    navigate('/sessions');
  }

  async function loadDemo() {
    setDemoError(null);
    setDemoBusy(true);
    try {
      // Relative path so the demo works under any base href (GH Pages,
      // local preview, custom domain).
      const res = await fetch(`${import.meta.env.BASE_URL}demo-backup.json`);
      if (!res.ok) throw new Error(`Could not load demo data (${res.status}).`);
      const text = await res.text();
      const backup = parseBackupText(text);
      onLoaded(backup, 'demo-backup.json');
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : 'Could not load demo data.');
      setDemoBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-12">
      <header className="mb-12 text-center">
        <h1 className="mb-3 text-5xl font-light tracking-widest text-text">
          ELEMENT <span className="text-accent">|</span> 08
        </h1>
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-textDim">
          Analyzer
        </p>
      </header>

      <DropZone onLoaded={onLoaded} />

      <div className="mt-6 flex w-full max-w-2xl items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          or
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <button
        onClick={loadDemo}
        disabled={demoBusy}
        className="mt-6 rounded-md border border-border bg-panel px-6 py-3 font-mono text-xs uppercase tracking-widest text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {demoBusy ? 'Loading demo…' : 'Try with demo data'}
      </button>
      <p className="mt-2 text-center text-xs text-textDim">
        Synthetic 12-month season for one freediver. No download needed.
      </p>
      {demoError && (
        <p
          role="alert"
          className="mt-3 rounded border border-red/40 bg-red/10 px-4 py-2 text-sm text-red"
        >
          {demoError}
        </p>
      )}

      <p className="mt-8 max-w-md text-center text-sm text-textDim">
        Your data never leaves this browser. The file you drop is parsed
        locally; nothing is uploaded.
      </p>

      {currentFilename && (
        <button
          onClick={() => navigate('/sessions')}
          className="mt-6 font-mono text-xs uppercase tracking-widest text-accent hover:underline"
        >
          ← continue with {currentFilename}
        </button>
      )}

      <footer className="mt-auto pt-12 text-xs text-textDim">
        <a
          href="https://element08.io"
          className="underline-offset-4 hover:underline"
        >
          element08.io
        </a>
      </footer>
    </div>
  );
}
