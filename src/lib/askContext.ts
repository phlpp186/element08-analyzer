/**
 * What the Ask copilot knows about the page it was opened on (Philipp's
 * option A, 2026-10-22): a dive or session page becomes a chip ("This dive ·
 * CWT 32.4 m") whose note rides along with the question, and every page
 * offers its own starter questions. PURE.
 *
 * The note names the dive the way the agent's tools do (session_id +
 * dive_index), so "this dive" resolves without the model having to guess.
 */
import type { ParsedSession } from '../schema/backup';
import { sessionDay } from './sessionDay';

export interface AskContext {
  /** Chip text, e.g. "This dive · CWT 32.4 m". Null on pages with no object. */
  label: string | null;
  /** English note for the model, prepended to the question. */
  note: string | null;
  /** Starter questions (English source strings, translated by the caller). */
  starters: string[];
}

type T = (s: string) => string;

interface DiveLite {
  discipline?: string | null;
  depth?: number | null;
  distance?: number | null;
  diveTime?: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function diveSummary(dive: DiveLite, unitKey: 'depth' | 'distance'): string {
  const v = num(dive[unitKey]);
  return [dive.discipline || null, v != null ? `${Math.round(v * 10) / 10} m` : null].filter(Boolean).join(' ');
}

const STARTERS = {
  depthDive: [
    'Why was this dive faster or slower than usual?',
    'Compare this dive with my last 5 of the same discipline',
    'How was my ascent on this dive?',
  ],
  poolDive: [
    'How did my pace change lap by lap?',
    'How does this dive compare with my usual at this distance?',
  ],
  dry: ['When did contractions start in each hold?', 'How low did my SpO₂ go compared to usual?'],
  session: ['Summarize this session', 'How does this session compare with my last one?'],
  progress: [
    'What were my biggest gains this year?',
    'Am I training more or less than last month?',
    'Which discipline improved the most?',
  ],
  insights: [
    'How did my CWT depths develop this year?',
    'Where do my contractions usually start?',
    'What changed most in the last 3 months?',
  ],
  compare: ['Compare my April and May training volume.', 'Show my three deepest dives side by side'],
  sessions: ['When was my last deep session?', 'How many sessions did I log this month?'],
  other: [
    'How did my CWT depths develop this year?',
    'Compare my April and May training volume.',
    'Where do my contractions usually start?',
  ],
};

export function askContext(pathname: string, sessions: ParsedSession[], t: T): AskContext {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'session' && parts[1]) {
    const sid = Number(parts[1]);
    const session = sessions.find((s) => s.id === sid);
    if (!session) return { label: null, note: null, starters: STARTERS.other };
    const day = sessionDay(session.date);
    const dives = (session as { dives?: DiveLite[] }).dives ?? [];

    if ((parts[2] === 'dive' || parts[2] === 'pool') && parts[3] != null) {
      const idx = Number(parts[3]);
      const dive = dives[idx];
      if (dive) {
        const pool = parts[2] === 'pool';
        const what = diveSummary(dive, pool ? 'distance' : 'depth');
        return {
          label: `${t('This dive')} · ${what}`,
          note:
            `The user is looking at one ${pool ? 'pool' : 'depth'} dive: session_id=${sid}, ` +
            `dive_index=${idx} (${what}, ${day}). "This dive" means that one.`,
          starters: pool ? STARTERS.poolDive : STARTERS.depthDive,
        };
      }
    }
    const name = session.name || t('Untitled session');
    const mode = session.mode === 'depth' ? 'depth' : session.mode === 'pool' ? 'pool' : 'dry';
    return {
      label: `${t('This session')} · ${name}`,
      note:
        `The user is looking at one ${mode} session: session_id=${sid} ("${name}", ${day}, ` +
        `${dives.length || 'no'} dives). "This session" means that one.`,
      starters: parts[2] === 'dry' || mode === 'dry' ? STARTERS.dry : STARTERS.session,
    };
  }
  const page = parts[0];
  const starters =
    page === 'progress'
      ? STARTERS.progress
      : page === 'insights'
        ? STARTERS.insights
        : page === 'compare'
          ? STARTERS.compare
          : page === 'sessions'
            ? STARTERS.sessions
            : STARTERS.other;
  return { label: null, note: null, starters };
}

/** The question as sent: the page note first, when the chip is on. */
export function withContext(question: string, ctx: AskContext, on: boolean): string {
  return on && ctx.note ? `[Context: ${ctx.note}]\n\n${question}` : question;
}
