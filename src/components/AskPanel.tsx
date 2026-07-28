/**
 * AskPanel — the AI copilot, docked as a right-side drawer on every data route
 * (Phase 2 of the progress-companion direction, 2026-07-27).
 *
 * Same architecture as the app's Ask screen: the agent loop runs HERE in the
 * browser and executes its tools over the in-memory sessions; only the question
 * plus aggregated tool results go to the Supabase /ask proxy (never raw dives).
 * Requires sign-in (the proxy meters the monthly question quota by the Supabase
 * identity — free tier included); the loaded file itself is never uploaded.
 *
 * Chart directives: series charts render inline (ECharts); dive/insights
 * directives become deep links into the analyzer's own routes.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { useBackupStore } from '../stores/useBackupStore';
import { useAuth } from '../lib/supabase/AuthProvider';
import {
  runAgent,
  asAiSessions,
  createProxyCallModel,
  AskError,
  type ChartDirective,
  type SeriesChartDirective,
  type ModelMessage,
} from '../lib/ai';
import { supabase } from '../lib/supabase/client';
import { useChartTheme } from '../lib/chartTheme';
import { useT } from '../i18n';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  chart?: ChartDirective | null;
}

const callModel = createProxyCallModel(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

// ─── directive rendering ─────────────────────────────────────────────────────

function isSeries(c: ChartDirective): c is SeriesChartDirective {
  return (
    c.type === 'bar' || c.type === 'line' || c.type === 'scatter' || c.type === 'histogram'
  );
}

function fmtVal(v: number, format?: 'mmss'): string {
  if (format === 'mmss') {
    const m = Math.floor(v / 60);
    const s = Math.round(v % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return v.toFixed(1);
}

function SeriesMiniChart({ chart }: { chart: SeriesChartDirective }) {
  const ct = useChartTheme();
  const option = {
    grid: { left: 8, right: 8, top: 24, bottom: 20, containLabel: true },
    title: {
      text: chart.title,
      textStyle: { color: ct.textDim, fontSize: 10, fontFamily: 'Nunito, system-ui' },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: ct.tooltipBg,
      borderColor: ct.axisLine,
      textStyle: { color: ct.text, fontFamily: 'Nunito, system-ui', fontSize: 11 },
      formatter: (p: { name: string; value: number }) =>
        `${p.name}: ${fmtVal(p.value, chart.format)}`,
    },
    xAxis: {
      type: 'category',
      data: chart.series.map((s) => s.label),
      axisLabel: { color: ct.textDim, fontSize: 9, fontFamily: 'Nunito, system-ui' },
      axisLine: { lineStyle: { color: ct.axisLine } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: ct.textDim,
        fontSize: 9,
        fontFamily: 'Nunito, system-ui',
        formatter: (v: number) => fmtVal(v, chart.format),
      },
      splitLine: { lineStyle: { color: ct.splitLine } },
    },
    series: [
      {
        type: chart.type === 'histogram' ? 'bar' : chart.type,
        data: chart.series.map((s) => s.value),
        itemStyle: { color: ct.accent },
        lineStyle: { color: ct.accent },
        symbolSize: 6,
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: 180 }} notMerge />;
}

/** Non-series directives become a deep link into the analyzer's own routes. */
function directiveLink(c: ChartDirective): { to: string; label: string } | null {
  if (isSeries(c)) return null;
  if ('dives' in c && Array.isArray(c.dives) && c.dives.length > 0) {
    return { to: `/session/${c.dives[0].session_id}`, label: c.title };
  }
  // Timeline / scatter / averages / insights pointers → the Insights dashboard.
  return { to: '/insights', label: c.title };
}

function ChartBlock({ chart }: { chart: ChartDirective }) {
  const t = useT();
  if (isSeries(chart)) {
    return (
      <div className="mt-2 rounded-lg border border-border bg-panel/60 p-2">
        <SeriesMiniChart chart={chart} />
      </div>
    );
  }
  const link = directiveLink(chart);
  if (!link) return null;
  return (
    <Link
      to={link.to}
      className="mt-2 inline-block font-mono text-[11px] uppercase tracking-widest text-highlight hover:underline"
    >
      ▸ {t('Open')}: {link.label}
    </Link>
  );
}

// ─── the panel ───────────────────────────────────────────────────────────────

export function AskPanel() {
  const t = useT();
  const backup = useBackupStore((s) => s.backup);
  const { session } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [history, setHistory] = useState<ModelMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  // Only offer the copilot where data is loaded (not on the landing page).
  if (!backup || location.pathname === '/') return null;

  async function send() {
    const q = input.trim();
    if (!q || busy || !backup) return;
    setInput('');
    setError(null);
    setTurns((prev) => [...prev, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const res = await runAgent({
        sessions: asAiSessions(backup.data.sessions),
        question: q,
        callModel,
        history,
        toolContext: {
          todayIso: new Date().toISOString().slice(0, 10),
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

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 rounded-full border border-border bg-panel px-5 py-3 font-mono text-xs uppercase tracking-widest text-accent shadow-lg hover:border-accent"
          aria-label={t('Open the AI copilot')}
        >
          {t('Ask')} ✦
        </button>
      )}

      {/* Drawer */}
      {open && (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-deep shadow-2xl">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-widest text-textDim">
              {t('Ask')} · <span className="text-accent">{t('AI copilot')}</span>
            </span>
            <button
              onClick={() => setOpen(false)}
              className="font-mono text-xs text-textDim hover:text-accent"
              aria-label={t('Close')}
            >
              ✕
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {!session && (
              <div className="rounded-lg border border-border bg-panel p-3 text-sm text-textDim">
                {t('The copilot needs your account for the monthly question quota.')}{' '}
                <Link to="/" className="text-accent hover:underline">
                  {t('Sign in on the start page')}
                </Link>
                . {t('Your loaded file itself never leaves this browser.')}
              </div>
            )}
            {session && turns.length === 0 && (
              <div className="rounded-lg border border-border bg-panel p-3 text-sm text-textDim">
                {t('Ask anything about the loaded logbook, for example:')}
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                  <li>{t('How did my CWT depths develop this year?')}</li>
                  <li>{t('Compare my April and May training volume.')}</li>
                  <li>{t('Where do my contractions usually start?')}</li>
                </ul>
              </div>
            )}
            {turns.map((turn, i) =>
              turn.role === 'user' ? (
                <div
                  key={i}
                  className="ml-8 rounded-xl rounded-br-sm bg-accent/15 px-3 py-2 text-sm text-text"
                >
                  {turn.text}
                </div>
              ) : (
                <div
                  key={i}
                  className="mr-4 rounded-xl rounded-bl-sm border border-border bg-panel px-3 py-2 text-sm text-text"
                >
                  <div className="whitespace-pre-wrap">{turn.text}</div>
                  {turn.chart ? <ChartBlock chart={turn.chart} /> : null}
                </div>
              ),
            )}
            {busy && (
              <div className="mr-4 animate-pulse rounded-xl border border-border bg-panel px-3 py-2 text-sm text-textDim">
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
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('Ask about your training…')}
                disabled={!session || busy}
                className="flex-1 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text placeholder:text-textDim focus:border-accent focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!session || busy || !input.trim()}
                className="rounded-lg bg-accent px-4 py-2 font-mono text-xs uppercase tracking-widest text-deep disabled:opacity-40"
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
