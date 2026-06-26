/**
 * CloudLogin — sign in with an ELEMENT | 08 account and load the logbook you
 * backed up from the app, instead of dropping a file.
 *
 * Reading your own backup only needs a sign-in (not Pro) — it mirrors "restore"
 * in the app. The pulled logbook is held in memory only (useBackupStore), so the
 * privacy promise still holds: nothing you load here is uploaded or shared.
 */
import { useState } from 'react';
import { useAuth } from '../lib/supabase/AuthProvider';
import { signIn, signUp, signOut } from '../lib/supabase/auth';
import { pullCloudBackup } from '../lib/supabase/cloudBackup';
import { parseBackupObject } from '../lib/parseBackup';
import type { ParsedBackup } from '../schema/backup';

interface Props {
  onLoaded: (backup: ParsedBackup, filename: string) => void;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export function CloudLogin({ onLoaded }: Props) {
  const { session } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadMyData() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const cloud = await pullCloudBackup();
      if (!cloud) {
        setNotice(
          'No cloud backup found yet. In the app, go to Settings → Backup → Back up to cloud, then come back here.',
        );
        return;
      }
      const backup = parseBackupObject(cloud.payload);
      onLoaded(backup, `your cloud backup · ${fmtDate(cloud.updatedAt)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your cloud backup.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'in') await signIn(email, password);
      else await signUp(email, password);
      // Signed in — go straight to pulling their logbook.
      await loadMyData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  // Signed in: offer to load (or reload) the cloud logbook.
  if (session) {
    return (
      <div className="glass-card w-full max-w-2xl rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-textDim">
            Signed in as <span className="text-text">{session.user.email}</span>
          </p>
          <button
            onClick={() => signOut()}
            className="font-mono text-[11px] uppercase tracking-widest text-textDim hover:text-accent"
          >
            Sign out
          </button>
        </div>
        <button
          onClick={loadMyData}
          disabled={busy}
          className="glow-accent mt-4 w-full rounded-md bg-accent px-6 py-3 font-mono text-xs uppercase tracking-widest text-ink hover:opacity-95 disabled:opacity-60"
        >
          {busy ? 'Loading your logbook…' : 'Load my logbook'}
        </button>
        {notice && (
          <p className="mt-3 rounded border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-text">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded border border-red/40 bg-red/10 px-4 py-2 text-sm text-red">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Signed out: email / password form.
  return (
    <form onSubmit={submit} className="glass-card w-full max-w-2xl rounded-lg p-5">
      <p className="mb-4 text-center font-heading text-lg tracking-wide text-text">
        Sign in to load your logbook
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md border border-border bg-abyss px-3 py-2 text-sm text-text outline-none placeholder:text-textDim focus:border-accent"
        />
        <input
          type="password"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="flex-1 rounded-md border border-border bg-abyss px-3 py-2 text-sm text-text outline-none placeholder:text-textDim focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !email || !password}
          className="glow-accent rounded-md bg-accent px-6 py-2 font-mono text-xs uppercase tracking-widest text-ink hover:opacity-95 disabled:opacity-60"
        >
          {busy ? '…' : mode === 'in' ? 'Sign in' : 'Create'}
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'in' ? 'up' : 'in'));
            setError(null);
            setNotice(null);
          }}
          className="font-mono text-[11px] uppercase tracking-widest text-textDim hover:text-accent"
        >
          {mode === 'in' ? 'Create an account' : 'Have an account? Sign in'}
        </button>
        <span className="text-[11px] text-textDim">Same account as the app</span>
      </div>

      {notice && (
        <p className="mt-3 rounded border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-text">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded border border-red/40 bg-red/10 px-4 py-2 text-sm text-red">
          {error}
        </p>
      )}
    </form>
  );
}
