/**
 * Cross-session dive comparison query engine.
 *
 * Pure filter function: takes all sessions + a filter spec, returns matching
 * dives from depth sessions flattened into a single list, sorted newest first.
 */
import type {
  Session,
  DepthSession,
  Dive,
  Discipline,
  LungVolume,
  DiveType,
} from '../appTypes';

export interface DiveFilter {
  /** Min depth in metres */
  depthMin?: number;
  /** Max depth in metres */
  depthMax?: number;
  /** Min dive time in seconds */
  timeMin?: number;
  /** Max dive time in seconds */
  timeMax?: number;
  /** ISO date string — include dives on or after this date */
  dateFrom?: string;
  /** ISO date string — include dives on or before this date */
  dateTo?: string;
  /** If set, only dives with matching discipline */
  disciplines?: Discipline[];
  /** If set, only dives tagged with one of the selected lung volumes */
  lungVols?: LungVolume[];
  /** If set, only dives tagged with one of the selected dive types. */
  diveTypes?: DiveType[];
}

export interface DiveMatch {
  dive: Dive;
  /** Parent session id (Date.now() at creation) */
  sessionId: number;
  /** ISO date string from parent session */
  sessionDate: string;
  /** Index of this dive within its session's dives array */
  diveIdx: number;
  /** Parent session location, when set (imported GPS name or manual). */
  location?: string | null;
}

function isDepthSession(s: Session): s is DepthSession {
  return s.mode === 'depth';
}

/** Normalise a discipline value so imports with stray whitespace / case
 *  variants still match the chip filter. Returns null when the field is
 *  missing entirely so callers can decide how to handle that case. */
function normDiscipline(d: unknown): string | null {
  if (typeof d !== 'string') return null;
  const trimmed = d.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function queryDives(sessions: Session[], filter: DiveFilter): DiveMatch[] {
  const matches: DiveMatch[] = [];
  const normFilterDisciplines = filter.disciplines
    ? filter.disciplines.map((d) => normDiscipline(d)).filter((d): d is string => d != null)
    : null;

  for (const session of sessions) {
    if (!isDepthSession(session)) continue;

    // Session-level date filter (applies to all dives in the session)
    if (filter.dateFrom && session.date < filter.dateFrom) continue;
    if (filter.dateTo && session.date > filter.dateTo) continue;

    session.dives.forEach((dive, diveIdx) => {
      if (filter.depthMin != null && dive.depth < filter.depthMin) return;
      if (filter.depthMax != null && dive.depth > filter.depthMax) return;
      if (filter.timeMin != null && dive.diveTime < filter.timeMin) return;
      if (filter.timeMax != null && dive.diveTime > filter.timeMax) return;
      if (normFilterDisciplines && normFilterDisciplines.length > 0) {
        // Compare normalised on both sides so 'cwt ', 'CWT' and ' CWT'
        // all match a filter entry of 'CWT'. Dives with a missing
        // discipline field are excluded when any filter is active —
        // they were also excluded by the old strict equality, so this
        // is behaviour-preserving for the typical case.
        const diveDisc = normDiscipline(dive.discipline);
        if (!diveDisc || !normFilterDisciplines.includes(diveDisc)) return;
      }
      if (filter.lungVols && filter.lungVols.length > 0) {
        if (dive.lungVol == null || !filter.lungVols.includes(dive.lungVol)) return;
      }
      if (filter.diveTypes && filter.diveTypes.length > 0) {
        if (dive.diveType == null || !filter.diveTypes.includes(dive.diveType)) return;
      }

      matches.push({
        dive,
        sessionId: session.id,
        sessionDate: session.date,
        diveIdx,
        location: (session as DepthSession).location || null,
      });
    });
  }

  // Newest first
  matches.sort((a, b) => {
    if (a.sessionDate !== b.sessionDate) {
      return a.sessionDate > b.sessionDate ? -1 : 1;
    }
    return b.diveIdx - a.diveIdx;
  });

  return matches;
}

/**
 * Compute peak descent and ascent speeds from a dive's profile.
 * Returns null values if the profile is missing or has fewer than 3 points.
 */
export function peakSpeedsFromProfile(dive: Dive): {
  peakDescent: number | null;
  peakAscent: number | null;
} {
  const p = dive.profile;
  if (!p || p.length < 3) {
    return { peakDescent: null, peakAscent: null };
  }

  let peakDescent = 0;
  let peakAscent = 0;
  for (let i = 1; i < p.length; i++) {
    const dt = p[i].t - p[i - 1].t;
    if (dt <= 0) continue;
    const v = (p[i].d - p[i - 1].d) / dt;
    if (v > peakDescent) peakDescent = v;
    if (-v > peakAscent) peakAscent = -v;
  }

  return {
    peakDescent: peakDescent > 0 ? peakDescent : null,
    peakAscent: peakAscent > 0 ? peakAscent : null,
  };
}
