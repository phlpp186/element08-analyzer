/**
 * AskPanel — the AI copilot, docked as a right-side drawer on every data route
 * (Phase 2 of the progress-companion direction, 2026-07-27; made page-aware in
 * Philipp's option A, 2026-10-22).
 *
 * Same architecture as the app's Ask screen: the agent loop runs HERE in the
 * browser and executes its tools over the in-memory sessions; only the question
 * plus aggregated tool results go to the Supabase /ask proxy (never raw dives).
 * Requires sign-in (the proxy meters the monthly question quota by the Supabase
 * identity — free tier included); the loaded file itself is never uploaded.
 *
 * The drawer knows its page: on a dive or session it carries a chip whose note
 * rides with the question (lib/askContext), and each page offers its own
 * starter questions. Answers draw their chart from the local logbook
 * (AskChart), and the header shows the questions left this month as the proxy
 * reports them.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { useAuth } from '../lib/supabase/AuthProvider';
import {
  runAgent,
  asAiSessions,
  createProxyCallModel,
  AskError,
  type AskUsage,
  type ChartDirective,
  type ModelMessage,
} from '../lib/ai';
import { supabase } from '../lib/supabase/client';
import { askContext, withContext } from '../lib/askContext';
import { TONE_VAR } from '../lib/tones';
import { AskChart } from './AskChart';
import { useT } from '../i18n';
import { todayLocalIso } from '../lib/sessionDay';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  /** The page chip the question was asked with. */
  context?: string | null;
  chart?: ChartDirective | null;
}

const USAGE_KEY = 'element08.askUsage';
const NO_SESSIONS: never[] = [];

/** Last known usage, if it is this month's. */
function readUsage(): AskUsage | null {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) ?? 'null') as (AskUsage & { month: string }) | null;
    return raw && raw.month === new Date().toISOString().slice(0, 7) ? { used: raw.used, limit: raw.limit } : null;
  } catch {
    return null;
  }
}

function saveUsage(u: AskUsage) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify({ ...u, month: new Date().toISOString().slice(0, 7) }));
  } catch {
    /* storage blocked: the count lasts this visit */
  }
}

// ─── the panel ───────────────────────────────────────────────────────────────

export function AskPanel() {
  const t = useT();
  const backup = useBackupStore((s) => s.backup);
  const sessions = backup?.data.sessions ?? NO_SESSIONS;
  const { session } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<ModelMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AskUsage | null>(readUsage);
  // The page chip is on unless it was dismissed on this very page.
  const [ctxOffAt, setCtxOffAt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const callModel = useMemo(
    () =>
      createProxyCallModel(
        async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
        (u) => {
          setUsage(u);
          saveUsage(u);
        },
      ),
    [],
  );
  const ctx = useMemo(() => askContext(location.pathname, sessions, t), [location.pathname, sessions, t]);
  const ctxOn = ctx.label != null && ctxOffAt !== location.pathname;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  // Only offer the copilot where data is loaded (not on the landing page).
  if (!backup || location.pathname === '/') return null;

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy || !backup || !session) return;
    setInput('');
    setError(null);
    setTurns((prev) => [...prev, { role: 'user', text: q, context: ctxOn ? ctx.label : null }]);
    setBusy(true);
    try {
      const res = await runAgent({
        sessions: asAiSessions(backup.data.sessions),
        question: withContext(q, ctx, ctxOn),
        callModel,
        history,
        toolContext: {
          // The user's own calendar day, not the UTC one — the tz on the next
          // line was already local, so a question asked before 08:00 in Asia
          // (or after 16:00 in California) reached the model with the two
          // disagreeing, and "how did I dive today" answered for the wrong day.
          todayIso: todayLocalIso(),
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      setHistory(res.messages);
      setTurns((prev) => [...prev, { role: 'assistant', text: res.answer, chart: res.chart }]);
    } catch (e) {
      if (e instanceof AskError) {
        if (e.kind === 'signin') setError(t('Sign in on the start page to use the AI copilot.'));
        else if (e.kind === 'quota')
          setError(t('Monthly question limit reached. It resets at the start of next month.'));
        else if (e.kind === 'network') setError(t('Network error. Check your connection and retry.'));
        else setError(t('The assistant is unavailable right now. Try again in a minute.'));
      } else {
        setError(t('Something went wrong. Try again.'));
      }
    } finally {
      setBusy(false);
    }
  }

  const left = usage ? Math.max(0, usage.limit - usage.used) : null;
  const userTone = TONE_VAR.highlight;

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="pill pill-on btn-raised fixed bottom-6 right-6 z-50 px-5 py-3 font-mono text-xs uppercase tracking-widest shadow-lg"
          aria-label={t('Open the AI copilot')}
        >
          {t('Ask')} ✦
        </button>
      )}

      {/* Drawer */}
      {open && (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-deep shadow-2xl">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="font-heading text-base font-bold text-text">{t('Ask')} ✦</span>
            {left != null && usage && (
              <span
                className="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest"
                style={chipStyle(left <= 2 ? TONE_VAR.amber : TONE_VAR.accent)}
                title={t('Questions left this month')}
              >
                {t('{n} of {limit} left').replace('{n}', String(left)).replace('{limit}', String(usage.limit))}
              </span>
            )}
            <span className="flex-1" />
            {turns.length > 0 && (
              <button
                onClick={() => {
                  setTurns([]);
                  setHistory([]);
                  setError(null);
                }}
                className="font-mono text-[10px] uppercase tracking-widest text-textDim hover:text-accent"
              >
                {t('New chat')}
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="ml-2 font-mono text-xs text-textDim hover:text-accent"
              aria-label={t('Close')}
            >
              ✕
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {!session && (
              <div className="board p-3 text-sm text-textDim">
                {t('The copilot needs your account for the monthly question quota.')}{' '}
                <Link to="/" className="text-accent hover:underline">
                  {t('Sign in on the start page')}
                </Link>
                . {t('Your loaded file itself never leaves this browser.')}
              </div>
            )}
            {session && turns.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-textDim">{t('Ask anything about the loaded logbook, for example:')}</p>
                <div className="flex flex-col items-start gap-1.5">
                  {ctx.starters.map((q) => (
                    <button
                      key={q}
                      onClick={() => void send(t(q))}
                      disabled={busy}
                      className="pill px-3 py-1.5 text-left text-xs"
                    >
                      {t(q)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn, i) =>
              turn.role === 'user' ? (
                <div key={i} className="ml-10 flex flex-col items-end gap-1">
                  {turn.context && (
                    <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">{turn.context}</span>
                  )}
                  <div
                    className="rounded-xl rounded-br-sm px-3 py-2 text-sm font-bold"
                    style={chipStyle(userTone, true)}
                  >
                    {turn.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="board mr-4 rounded-bl-sm px-3 py-2 text-sm text-text">
                  <div className="whitespace-pre-wrap leading-relaxed">{turn.text}</div>
                  {turn.chart ? <AskChart chart={turn.chart} /> : null}
                </div>
              ),
            )}
            {busy && (
              <div className="board mr-4 animate-pulse px-3 py-2 text-sm text-textDim">
                {t('Analyzing your logbook…')}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-amber/40 bg-panel p-3 text-sm text-amber">
                {error}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="border-t border-border p-3"
          >
            {ctx.label && (
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-textDim">{t('About')}</span>
                {ctxOn ? (
                  <span
                    className="flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold"
                    style={chipStyle(TONE_VAR.accent, true)}
                  >
                    <span className="truncate">{ctx.label}</span>
                    <button
                      type="button"
                      onClick={() => setCtxOffAt(location.pathname)}
                      aria-label={t('Ask without this page')}
                      className="shrink-0 opacity-70 hover:opacity-100"
                    >
                      ✕
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCtxOffAt(null)}
                    className="pill px-2.5 py-0.5 text-xs"
                  >
                    + {ctx.label}
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('Ask about your training…')}
                disabled={!session || busy}
                className="min-w-0 flex-1 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text placeholder:text-textDim focus:border-accent focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!session || busy || !input.trim()}
                className="pill pill-on btn-raised px-4 py-2 font-mono text-xs uppercase tracking-widest disabled:opacity-40"
              >
                {t('Send')}
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-textDim">
              {t('Only your question and aggregated numbers reach the model, never raw dives.')}
            </p>
          </form>
        </aside>
      )}
    </>
  );
}

/** A chip in a tone: the tone as its fill with dark ink, or (soft) a tint. */
function chipStyle(tone: string, solid = false): CSSProperties {
  return solid
    ? { background: tone, color: `color-mix(in srgb, ${tone}, #000 78%)` }
    : { background: `color-mix(in srgb, ${tone} 18%, transparent)`, color: tone };
}
