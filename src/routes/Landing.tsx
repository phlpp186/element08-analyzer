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
import { CloudLogin } from '../components/CloudLogin';
import { useBackupStore } from '../stores/useBackupStore';
import { parseBackupText } from '../lib/parseBackup';
import type { ParsedBackup } from '../schema/backup';
import { useT } from '../i18n';

export function Landing() {
  const t = useT();
  const navigate = useNavigate();
  const setBackup = useBackupStore((s) => s.setBackup);
  const clear = useBackupStore((s) => s.clear);
  const currentFilename = useBackupStore((s) => s.filename);
  const persisted = useBackupStore((s) => s.persisted);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  function onLoaded(backup: ParsedBackup, filename: string, persist = false) {
    setBackup(backup, filename, persist);
    navigate('/progress');
  }

  async function loadDemo() {
    setDemoError(null);
    setDemoBusy(true);
    try {
      // Relative path so the demo works under any base href (GH Pages,
      // local preview, custom domain).
      const res = await fetch(`${import.meta.env.BASE_URL}demo-backup.json`);
      if (!res.ok) throw new Error(`${t('Could not load demo data')} (${res.status}).`);
      const text = await res.text();
      const backup = parseBackupText(text);
      onLoaded(backup, 'demo-backup.json');
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : t('Could not load demo data.'));
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
          {t('Analyzer')}
        </p>
      </header>

      <CloudLogin onLoaded={onLoaded} />

      <div className="mt-6 flex w-full max-w-2xl items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          {t('or drop a file')}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-6 w-full max-w-2xl">
        <DropZone onLoaded={onLoaded} />
      </div>

      <div className="mt-6 flex w-full max-w-2xl items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          {t('or')}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <button
        onClick={loadDemo}
        disabled={demoBusy}
        className="mt-6 rounded-md border border-border bg-panel px-6 py-3 font-mono text-xs uppercase tracking-widest text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {demoBusy ? t('Loading demo…') : t('Try with demo data')}
      </button>
      <p className="mt-2 text-center text-xs text-textDim">
        {t('Synthetic 12-month season for one freediver. No download needed.')}
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
        {t(
          'Your data stays in this browser. A dropped file is parsed locally, and signing in only downloads your own cloud backup. Nothing you load here is ever uploaded or shared.',
        )}
      </p>

      {currentFilename && (
        <div className="mt-6 flex flex-col items-center gap-1">
          <button
            onClick={() => navigate('/progress')}
            className="font-mono text-xs uppercase tracking-widest text-accent hover:underline"
          >
            ← {t('continue with')} {currentFilename}
          </button>
          {persisted && (
            <button
              onClick={() => clear()}
              className="font-mono text-[10px] uppercase tracking-widest text-textDim hover:text-red"
            >
              {t('forget saved data')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
