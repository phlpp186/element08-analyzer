/**
 * HangEditorPopover — anchored editor for one hang segment.
 *
 * The parent (DepthDivePlayer) listens for clicks on hang bands in the
 * chart and opens this popover at the click position. The user can nudge
 * start / end in 1-second steps, delete the hang, or hit Done. All edits
 * route through callbacks; persistence is the caller's responsibility.
 */
import type { HangSegment } from '../lib/analytics/diveProfile';

interface Props {
  hang: HangSegment;
  /** Earliest the hang start can shift to (dive start). */
  minT: number;
  /** Latest the hang end can shift to (dive end). */
  maxT: number;
  /** Pixel position inside the chart container — top-left of the popover. */
  position: { x: number; y: number };
  onChange: (h: HangSegment) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function HangEditorPopover({
  hang,
  minT,
  maxT,
  position,
  onChange,
  onDelete,
  onClose,
}: Props) {
  function nudgeStart(delta: number) {
    const next = Math.max(minT, Math.min(hang.endT - 1, hang.startT + delta));
    onChange({ ...hang, startT: next });
  }
  function nudgeEnd(delta: number) {
    const next = Math.min(maxT, Math.max(hang.startT + 1, hang.endT + delta));
    onChange({ ...hang, endT: next });
  }
  const duration = Math.max(0, hang.endT - hang.startT);

  return (
    <div
      style={{
        // Fixed-position from the click coords (viewport space). Offset
        // the popover up-and-to-the-left of the cursor so it doesn't sit
        // on top of the band the user just clicked.
        left: clamp(position.x - 120, 8, window.innerWidth - 256 - 8),
        top: clamp(position.y - 160, 8, window.innerHeight - 200),
      }}
      className="fixed z-30 w-64 rounded-lg border border-border bg-panel p-3 shadow-lg shadow-black/40"
    >
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-mono text-[10px] uppercase tracking-widest text-textDim">
          Edit hang · {hang.type === 'bottom' ? 'bottom' : 'off-bottom'}
        </h4>
        <button
          onClick={onClose}
          aria-label="Close"
          className="font-mono text-sm text-textDim hover:text-text"
        >
          ×
        </button>
      </div>

      <div className="space-y-2">
        <Row
          label="Start"
          value={fmtSec(hang.startT)}
          onMinus={() => nudgeStart(-1)}
          onPlus={() => nudgeStart(+1)}
        />
        <Row
          label="End"
          value={fmtSec(hang.endT)}
          onMinus={() => nudgeEnd(-1)}
          onPlus={() => nudgeEnd(+1)}
        />
        <div className="flex items-center justify-between border-t border-border/60 pt-2 font-mono text-[11px] text-textDim">
          <span>Duration</span>
          <span className="text-text">{duration}s</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={onDelete}
          className="font-mono text-[11px] uppercase tracking-widest text-red hover:opacity-80"
        >
          Delete
        </button>
        <button
          onClick={onClose}
          className="rounded-full border border-accent bg-accent/10 px-3 py-0.5 font-mono text-[11px] text-accent hover:bg-accent/20"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
      <span className="text-textDim">{label}</span>
      <div className="flex items-center gap-2">
        <NudgeBtn label="−" onClick={onMinus} />
        <span className="w-14 text-center text-sm text-text">{value}</span>
        <NudgeBtn label="+" onClick={onPlus} />
      </div>
    </div>
  );
}

function NudgeBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-text hover:border-accent hover:text-accent"
    >
      {label}
    </button>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function fmtSec(s: number): string {
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(Math.round(s));
  if (abs < 60) return `${sign}${abs}s`;
  const m = Math.floor(abs / 60);
  const sec = abs % 60;
  return `${sign}${m}:${String(sec).padStart(2, '0')}`;
}
