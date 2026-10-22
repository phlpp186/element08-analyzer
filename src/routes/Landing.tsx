/**
 * Landing — three equal doors into the analyzer (Philipp's option B,
 * 2026-10-22): my account (sign in and load the cloud backup), a backup
 * file (drop or choose one) and the demo. The first two open their panel
 * under the doors; the demo loads at once. A signed-in visitor finds the
 * account door open.
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
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/supabase/AuthProvider';
import { TONE_VAR, type Tone } from '../lib/tones';
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
  const { session } = useAuth();
  // Which door's panel is open. Until the visitor picks one, a signed-in
  // visitor sees the account (the session can arrive after the first render).
  const [open, setOpen] = useState<'account' | 'file' | 'none' | null>(null);
  const shown = open === null ? (session ? 'account' : null) : open === 'none' ? null : open;

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

      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
        <Door
          glyph="☁"
          title={t('My account')}
          sub={
            session
              ? `${t('Signed in as')} ${session.user.email ?? ''}`
              : t('Load the logbook you back up from the app')
          }
          cta={session ? t('Load my logbook') : t('Sign in')}
          tone="accent"
          active={shown === 'account'}
          onClick={() => setOpen(shown === 'account' ? 'none' : 'account')}
        />
        <Door
          glyph="⇣"
          title={t('A backup file')}
          sub={t('Drop an .e08backup.json from the app')}
          cta={t('Choose file')}
          tone="highlight"
          active={shown === 'file'}
          onClick={() => setOpen(shown === 'file' ? 'none' : 'file')}
        />
        <Door
          glyph="▶"
          title={t('The demo')}
          sub={t('A year of a made-up freediver, no file needed')}
          cta={demoBusy ? t('Loading demo…') : t('Try it')}
          tone="amber"
          active={false}
          disabled={demoBusy}
          onClick={loadDemo}
        />
      </div>

      {shown === 'account' && (
        <div className="mt-6 flex w-full max-w-2xl justify-center">
          <CloudLogin onLoaded={onLoaded} />
        </div>
      )}
      {shown === 'file' && (
        <div className="mt-6 w-full max-w-2xl">
          <DropZone onLoaded={onLoaded} />
        </div>
      )}

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

/** One door: a coloured block with its glyph, what it is, and its action. */
function Door({
  glyph,
  title,
  sub,
  cta,
  tone,
  active,
  disabled = false,
  onClick,
}: {
  glyph: ReactNode;
  title: string;
  sub: string;
  cta: string;
  tone: Tone;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const c = TONE_VAR[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-expanded={tone === 'amber' ? undefined : active}
      // A compact row on phones, a tall block from sm up.
      className={`tile flex min-w-0 items-center gap-3 px-4 py-4 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-70 sm:flex-col sm:gap-1 sm:px-5 sm:py-6 sm:text-center ${
        active ? 'outline outline-2 outline-offset-2 outline-text' : ''
      }`}
      style={{ '--tone': c } as CSSProperties}
    >
      <span className="tile-value w-8 shrink-0 text-center font-num text-2xl font-bold leading-none sm:w-auto sm:text-3xl">
        {glyph}
      </span>
      <span className="flex min-w-0 flex-1 flex-col sm:items-center">
        <span className="tile-value font-num text-base font-bold sm:mt-2 sm:text-lg">{title}</span>
        <span className="tile-label text-xs font-bold sm:min-h-[2.5rem]">{sub}</span>
      </span>
      <span
        className="shrink-0 rounded-full px-3 py-1.5 font-num text-xs font-bold sm:mt-2 sm:px-4 sm:text-sm"
        style={{ background: `color-mix(in srgb, ${c}, #000 78%)`, color: c }}
      >
        {cta}
      </span>
    </button>
  );
}
