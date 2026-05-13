/**
 * PeriodEditor — table of comparison periods with inline edit + add.
 *
 * Each row controls one Period:
 *   - color swatch (cycle through palette by clicking)
 *   - editable label
 *   - anchor date picker
 *   - weeks-before number
 *   - delete button
 *
 * The "+ Add period" footer drops a fresh blank row with sensible
 * defaults, then the user fills in the dates.
 */
import { useId } from 'react';
import type { Period } from '../lib/analytics/periodCompare';
import { useCompareStore } from '../stores/useCompareStore';

const PALETTE = [
  '#4fc3f7', // accent blue
  '#ff5f9e', // highlight pink
  '#66bb6a', // recover green
  '#ffa726', // amber
  '#ef5350', // red
  '#a89fff', // violet
  '#00e5cc', // teal
];

function nextColor(existing: Period[]): string {
  const used = new Set(existing.map((p) => p.color));
  for (const c of PALETTE) if (!used.has(c)) return c;
  return PALETTE[existing.length % PALETTE.length];
}

function makeId(): string {
  return `p_${Math.random().toString(36).slice(2, 9)}`;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function PeriodEditor() {
  const periods = useCompareStore((s) => s.periods);
  const addPeriod = useCompareStore((s) => s.addPeriod);
  const updatePeriod = useCompareStore((s) => s.updatePeriod);
  const removePeriod = useCompareStore((s) => s.removePeriod);

  function add() {
    addPeriod({
      id: makeId(),
      label: `Period ${periods.length + 1}`,
      color: nextColor(periods),
      anchorDate: todayIso(),
      weeksBefore: 12,
    });
  }

  return (
    <section className="rounded-lg border border-border bg-panel p-5">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-textDim">
          Comparison periods
        </h2>
        <button
          onClick={add}
          className="rounded-md border border-border px-3 py-1 font-mono text-xs text-textDim hover:border-accent hover:text-accent"
        >
          + Add period
        </button>
      </header>

      {periods.length === 0 ? (
        <p className="py-4 text-sm text-textDim">
          Add a period to start comparing — typically one per competition cycle
          or training block.
        </p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="font-mono text-[10px] uppercase tracking-widest text-textDim">
              <th className="w-10 py-2 text-left"></th>
              <th className="py-2 text-left">Label</th>
              <th className="py-2 text-left">Anchor date</th>
              <th className="py-2 text-left">Weeks</th>
              <th className="w-10 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <PeriodRow
                key={p.id}
                period={p}
                onChange={(patch) => updatePeriod(p.id, patch)}
                onRemove={() => removePeriod(p.id)}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function PeriodRow({
  period,
  onChange,
  onRemove,
}: {
  period: Period;
  onChange: (patch: Partial<Period>) => void;
  onRemove: () => void;
}) {
  const labelId = useId();
  const dateId = useId();
  const weeksId = useId();

  function cycleColor() {
    const idx = PALETTE.indexOf(period.color);
    const next = PALETTE[(idx + 1) % PALETTE.length];
    onChange({ color: next });
  }

  return (
    <tr className="border-t border-border">
      <td className="py-2">
        <button
          onClick={cycleColor}
          aria-label="Cycle color"
          className="inline-block h-4 w-4 rounded-full border border-border hover:scale-110"
          style={{ backgroundColor: period.color }}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          id={labelId}
          type="text"
          value={period.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full rounded-md border border-border bg-deep px-2 py-1 font-mono text-sm text-text focus:border-accent focus:outline-none"
        />
      </td>
      <td className="py-2 pr-3">
        <input
          id={dateId}
          type="date"
          value={period.anchorDate}
          onChange={(e) => onChange({ anchorDate: e.target.value })}
          className="rounded-md border border-border bg-deep px-2 py-1 font-mono text-sm text-text focus:border-accent focus:outline-none"
        />
      </td>
      <td className="py-2 pr-3">
        <input
          id={weeksId}
          type="number"
          min={1}
          max={104}
          value={period.weeksBefore}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v) && v >= 1 && v <= 104) onChange({ weeksBefore: v });
          }}
          className="w-20 rounded-md border border-border bg-deep px-2 py-1 font-mono text-sm text-text focus:border-accent focus:outline-none"
        />
      </td>
      <td className="py-2">
        <button
          onClick={onRemove}
          aria-label="Remove period"
          className="px-2 font-mono text-sm text-textDim hover:text-red"
        >
          ×
        </button>
      </td>
    </tr>
  );
}
