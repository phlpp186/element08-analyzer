/**
 * CompareDives — overlay up to 3 individual depth dives on one chart.
 *
 * Layout mirrors CompareSeasons: a wide left column (alignment toggle +
 * overlay chart + stat-comparison table) and a 320px right panel holding
 * the cross-session dive picker. Selection lives in useDiveCompareStore
 * so it survives tab switches within the Compare area.
 */
import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import {
  MAX_COMPARE_DIVES,
  useDiveCompareStore,
} from '../stores/useDiveCompareStore';
import { CompareModeHeader } from '../components/CompareModeHeader';
import {
  DiveOverlayChart,
  type OverlayAlign,
  type OverlayDive,
} from '../components/charts/DiveOverlayChart';
import {
  buildDiveCatalog,
  diveSearchText,
  type CatalogDive,
} from '../lib/analytics/diveCatalog';
import { extractDiveData } from '../lib/analytics/diveProfile';
import { formatDate } from '../lib/format';

interface ResolvedDive {
  color: string;
  label: string;
  dive: any;
}

export function CompareDives() {
  const backup = useBackupStore((s) => s.backup);
  const slots = useDiveCompareStore((s) => s.slots);
  const toggleDive = useDiveCompareStore((s) => s.toggleDive);
  const clear = useDiveCompareStore((s) => s.clear);

  const [align, setAlign] = useState<OverlayAlign>('start');
  const [query, setQuery] = useState('');

  const sessions = backup?.data.sessions ?? [];
  const catalog = useMemo(() => buildDiveCatalog(sessions), [sessions]);

  // Resolve each slot to its dive object + a unique legend label.
  const resolved = useMemo<ResolvedDive[]>(() => {
    const seen = new Map<string, number>();
    const out: ResolvedDive[] = [];
    for (const slot of slots) {
      const session = sessions.find((s) => s.id === slot.sessionId);
      if (!session || session.mode !== 'depth') continue;
      const dive = (session as any).dives?.[slot.diveIdx];
      if (!dive) continue;
      let label = `${formatDate(session.date)} · ${dive.discipline || 'Depth'} · ${dive.depth}m`;
      const n = seen.get(label) ?? 0;
      seen.set(label, n + 1);
      if (n > 0) label = `${label} (${n + 1})`;
      out.push({ color: slot.color, label, dive });
    }
    return out;
  }, [slots, sessions]);

  const overlayDives = useMemo<OverlayDive[]>(
    () =>
      resolved
        .map((r) => ({ color: r.color, label: r.label, data: extractDiveData(r.dive) }))
        .filter((d) => d.data.points.length >= 2),
    [resolved],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((d) => diveSearchText(d).includes(q));
  }, [catalog, query]);

  if (!backup) return <Navigate to="/" replace />;

  const isSelected = (d: CatalogDive) =>
    slots.some((s) => s.sessionId === d.sessionId && s.diveIdx === d.diveIdx);
  const colorOf = (d: CatalogDive) =>
    slots.find((s) => s.sessionId === d.sessionId && s.diveIdx === d.diveIdx)?.color;
  const full = slots.length >= MAX_COMPARE_DIVES;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <CompareModeHeader
        mode="dives"
        description="Overlay up to three individual dives on one depth profile. Pick dives from any session to compare descent rate, hang, and ascent shape side by side."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {overlayDives.length > 0 ? (
            <>
              <AlignToggle value={align} onChange={setAlign} />
              <DiveOverlayChart dives={overlayDives} align={align} />
              <StatTable dives={resolved} />
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-20 text-center text-textDim">
              {slots.length > 0
                ? 'The selected dives have no recorded depth profile to overlay.'
                : 'Pick up to three dives from the panel to overlay them.'}
            </div>
          )}
        </div>

        <DivePicker
          catalog={filtered}
          totalCount={catalog.length}
          query={query}
          onQuery={setQuery}
          isSelected={isSelected}
          colorOf={colorOf}
          full={full}
          selectedCount={slots.length}
          onToggle={toggleDive}
          onClear={clear}
        />
      </div>
    </div>
  );
}

// ─── Alignment toggle ───────────────────────────────────────────────────────

function AlignToggle({
  value,
  onChange,
}: {
  value: OverlayAlign;
  onChange: (a: OverlayAlign) => void;
}) {
  const opts: { id: OverlayAlign; label: string; hint: string }[] = [
    { id: 'start', label: 'Start', hint: 'Aligned at t=0 — compare descent rate and total time' },
    { id: 'maxdepth', label: 'Max depth', hint: 'Aligned at the deepest point — compare ascent shape and hang' },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-widest text-textDim">
        Align
      </span>
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          title={o.hint}
          className={[
            'rounded-full border px-3 py-0.5 font-mono text-[11px] transition-colors',
            value === o.id
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-textDim hover:border-accent hover:text-accent',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Stat-comparison table ──────────────────────────────────────────────────

function StatTable({ dives }: { dives: ResolvedDive[] }) {
  const rows: { label: string; value: (d: any) => string }[] = [
    { label: 'Max depth', value: (d) => (d.depth != null ? `${d.depth}m` : '—') },
    { label: 'Dive time', value: (d) => fmtSec(d.diveTime) },
    { label: 'Descent', value: (d) => fmtSec(d.descentTime) },
    { label: 'Hang', value: (d) => fmtSec(d.hangTime) },
    { label: 'Ascent', value: (d) => fmtSec(d.ascentTime) },
    { label: 'Descent speed', value: (d) => fmtSpeed(d.descentSpeed) },
    { label: 'Ascent speed', value: (d) => fmtSpeed(d.ascentSpeed) },
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-panel">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-textDim">
              Metric
            </th>
            {dives.map((d, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-right font-mono text-[11px]"
                style={{ color: d.color }}
              >
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border/50 last:border-0">
              <td className="px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-textDim">
                {row.label}
              </td>
              {dives.map((d, i) => (
                <td key={i} className="px-4 py-2 text-right font-heading text-text">
                  {row.value(d.dive)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Cross-session dive picker ──────────────────────────────────────────────

function DivePicker({
  catalog,
  totalCount,
  query,
  onQuery,
  isSelected,
  colorOf,
  full,
  selectedCount,
  onToggle,
  onClear,
}: {
  catalog: CatalogDive[];
  totalCount: number;
  query: string;
  onQuery: (q: string) => void;
  isSelected: (d: CatalogDive) => boolean;
  colorOf: (d: CatalogDive) => string | undefined;
  full: boolean;
  selectedCount: number;
  onToggle: (sessionId: number, diveIdx: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          Dives · {selectedCount}/{MAX_COMPARE_DIVES}
        </h2>
        {selectedCount > 0 && (
          <button
            onClick={onClear}
            className="font-mono text-[10px] uppercase tracking-widest text-textDim hover:text-accent"
          >
            Clear
          </button>
        )}
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Filter by date, discipline, depth…"
        className="mb-3 w-full rounded-md border border-border bg-abyss px-3 py-1.5 text-sm text-text placeholder:text-textDim/60 focus:border-accent focus:outline-none"
      />

      {totalCount === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-textDim">
          No depth dives in this backup.
        </p>
      ) : catalog.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-textDim">
          No dives match that filter.
        </p>
      ) : (
        <ul className="max-h-[480px] space-y-1 overflow-y-auto pr-1">
          {catalog.map((d) => {
            const selected = isSelected(d);
            const disabled = (!selected && full) || !d.hasProfile;
            return (
              <li key={`${d.sessionId}-${d.diveIdx}`}>
                <button
                  disabled={disabled}
                  onClick={() => onToggle(d.sessionId, d.diveIdx)}
                  className={[
                    'flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                    selected
                      ? 'border-accent/60 bg-accent/5'
                      : disabled
                        ? 'border-transparent opacity-40'
                        : 'border-transparent hover:border-border hover:bg-abyss',
                  ].join(' ')}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border"
                    style={{
                      backgroundColor: selected ? colorOf(d) : 'transparent',
                      borderColor: selected ? colorOf(d) : '#3a3a3a',
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text">
                      {d.discipline} · {d.depth}m
                    </span>
                    <span className="block truncate font-mono text-[10px] uppercase tracking-widest text-textDim">
                      {formatDate(d.date)}
                      {!d.hasProfile && ' · no profile'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtSec(s: unknown): string {
  if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtSpeed(v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return `${v.toFixed(2)} m/s`;
}
