/**
 * Pool training-type mix — counts pool sessions by `sessionType`
 * (PoolSessionType in the app schema): CO2 / O2 / VOL / SP / TE / MAX /
 * FUN / RC.
 *
 * Sessions without `sessionType` set are bucketed as "Untagged" so the
 * user still sees them (and can decide whether to start tagging). The
 * chart caller decides whether to render that bucket or omit it.
 */
import type { ParsedSession } from '../../schema/backup';

type PoolSessionType = 'VOL' | 'CO2' | 'O2' | 'SP' | 'TE' | 'MAX' | 'FUN' | 'RC';

const TYPE_LABELS: Record<PoolSessionType, string> = {
  CO2: 'CO₂ table',
  O2:  'O₂ table',
  VOL: 'Volume',
  SP:  'Speed',
  TE:  'Technique',
  MAX: 'Max effort',
  FUN: 'Fun / play',
  RC:  'Recovery',
};

const TYPE_COLORS: Record<PoolSessionType, string> = {
  CO2: '#e84393',
  O2:  '#1fb894',
  VOL: '#8a5fd6',
  SP:  '#f0a500',
  TE:  '#3dc96b',
  MAX: '#e24b3c',
  FUN: '#e8c04a',
  RC:  '#5e828a',
};

const ORDER: PoolSessionType[] = ['CO2', 'O2', 'VOL', 'SP', 'TE', 'MAX', 'FUN', 'RC'];

export interface PoolTypeBucket {
  type: PoolSessionType | 'untagged';
  label: string;
  count: number;
  color: string;
}

export function poolSessionTypeMix(sessions: ParsedSession[]): PoolTypeBucket[] {
  const counts = new Map<PoolSessionType | 'untagged', number>();

  for (const s of sessions) {
    if (s.mode !== 'pool') continue;
    const t = (s as unknown as { sessionType?: PoolSessionType }).sessionType;
    const key = t && ORDER.includes(t) ? t : 'untagged';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const out: PoolTypeBucket[] = [];
  for (const t of ORDER) {
    const c = counts.get(t);
    if (c) out.push({ type: t, label: TYPE_LABELS[t], count: c, color: TYPE_COLORS[t] });
  }
  const untagged = counts.get('untagged');
  if (untagged) {
    out.push({ type: 'untagged', label: 'Untagged', count: untagged, color: '#8a857c' });
  }
  return out;
}
