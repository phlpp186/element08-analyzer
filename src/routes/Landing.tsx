/**
 * Landing — drop a backup file to enter the analyzer.
 *
 * On success, store the parsed backup and navigate to the session list.
 * If a backup is already loaded (the user navigated back), the route
 * still shows the drop zone so they can swap in a different file —
 * "Continue with current file" link gets them back into the analyzer
 * without re-picking.
 */
import { useNavigate } from 'react-router-dom';
import { DropZone } from '../components/DropZone';
import { useBackupStore } from '../stores/useBackupStore';
import type { ParsedBackup } from '../schema/backup';

export function Landing() {
  const navigate = useNavigate();
  const setBackup = useBackupStore((s) => s.setBackup);
  const currentFilename = useBackupStore((s) => s.filename);

  function onLoaded(backup: ParsedBackup, filename: string) {
    setBackup(backup, filename);
    navigate('/sessions');
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
