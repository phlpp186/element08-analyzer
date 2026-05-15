/**
 * DepthDivePlayer — full-resolution multi-track view of one depth dive.
 *
 * URL: /session/:sessionId/dive/:diveIdx
 *
 * Renders the synchronized track stack (depth + HR + speed + temp) plus
 * a header stat bar and prev/next dive navigation. Sources come from the
 * loaded backup in useBackupStore — no fetches, all local.
 */
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { useHangOverridesStore } from '../stores/useHangOverridesStore';
import { extractDiveData, type HangSegment } from '../lib/analytics/diveProfile';
import { effectiveHangs, diveTimes } from '../lib/analytics/effectiveHangs';
import { DepthDiveTracks } from '../components/charts/DepthDiveTracks';
import { HangEditorPopover } from '../components/HangEditorPopover';
import { formatDate } from '../lib/format';

export function DepthDivePlayer() {
  const { sessionId, diveIdx } = useParams<{ sessionId: string; diveIdx: string }>();
  const navigate = useNavigate();
  const backup = useBackupStore((s) => s.backup);
  const getSession = useBackupStore((s) => s.getSession);

  // Depth-track overlay toggles. Alarms default ON (they're dive-computer
  // safety config — worth seeing); speed markers default OFF (opt-in
  // detail). speedStep: 0 = off, else 5 or 10 metres.
  const [showAlarms, setShowAlarms] = useState(true);
  const [speedStep, setSpeedStep] = useState<0 | 5 | 10>(0);
  // Vertical-speed smoothing window in samples. 0 = raw only; 5/15 overlay
  // a moving average on the raw curve (FIM dives oscillate hard).
  const [speedSmooth, setSpeedSmooth] = useState<0 | 5 | 15>(0);
  // Which hang band is currently being edited + the click position to
  // anchor the editor popover. Null = no popover.
  const [selectedHang, setSelectedHang] = useState<{
    idx: number;
    x: number;
    y: number;
  } | null>(null);

  // Manual hang overrides — persisted to localStorage so user corrections
  // survive a page reload as long as the same backup is re-imported.
  const overrideRaw = useHangOverridesStore(
    (s) => s.overrides[`${Number(sessionId)}-${Number(diveIdx)}`],
  );
  const setOverride = useHangOverridesStore((s) => s.set);
  const clearOverride = useHangOverridesStore((s) => s.clear);

  if (!backup) return <Navigate to="/" replace />;

  const session = getSession(Number(sessionId));
  if (!session || session.mode !== 'depth') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← back to sessions
        </Link>
        <p className="mt-8 text-textDim">Depth dive not found.</p>
      </div>
    );
  }

  const dives = (session as any).dives ?? [];
  const idx = Number(diveIdx);
  const dive = dives[idx];
  if (!dive) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to={`/session/${session.id}`}
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← back to session
        </Link>
        <p className="mt-8 text-textDim">Dive index out of range.</p>
      </div>
    );
  }

  const data = useMemo(() => extractDiveData(dive), [dive]);

  // Apply the manual hang override (if any) on top of the auto-detected
  // hangs, and recompute descent / hang / ascent times + speeds so the
  // header stat row reflects the user's edit.
  const effective = useMemo(
    () => effectiveHangs(overrideRaw, data.hangs),
    [overrideRaw, data.hangs],
  );
  const dataWithHangs = useMemo(
    () => ({ ...data, hangs: effective }),
    [data, effective],
  );
  const times = useMemo(
    () => diveTimes(data.points, effective, data.maxDepth),
    [data.points, effective, data.maxDepth],
  );
  const hasOverride = overrideRaw !== undefined;

  function handleHangClick(hangIdx: number, clientX: number, clientY: number) {
    setSelectedHang({ idx: hangIdx, x: clientX, y: clientY });
  }
  function handleEditHang(updated: HangSegment) {
    if (!selectedHang) return;
    const next = effective.map((h, i) => (i === selectedHang.idx ? updated : h));
    setOverride(Number(sessionId), Number(diveIdx), next);
  }
  function handleDeleteHang() {
    if (!selectedHang) return;
    const next = effective.filter((_, i) => i !== selectedHang.idx);
    setOverride(Number(sessionId), Number(diveIdx), next);
    setSelectedHang(null);
  }
  function handleAddHang() {
    // Drop a default 5-second bottom hang centred on the deepest sample,
    // clamped to the dive's time bounds. User clicks the new band to edit.
    let maxT = data.points[0]?.t ?? 0;
    let bestD = data.points[0]?.d ?? 0;
    for (const p of data.points) {
      if (p.d > bestD) { bestD = p.d; maxT = p.t; }
    }
    const startT = Math.max(data.startT, Math.round(maxT - 2));
    const endT = Math.min(data.endT, Math.round(maxT + 3));
    const newHang: HangSegment = {
      startT,
      endT,
      avgD: data.maxDepth,
      type: 'bottom',
    };
    const next = [...effective, newHang];
    setOverride(Number(sessionId), Number(diveIdx), next);
  }
  function handleResetHangs() {
    clearOverride(Number(sessionId), Number(diveIdx));
    setSelectedHang(null);
  }

  // Whether the session carries any usable depth alarms — drives whether
  // the "Depth alarms" toggle is shown at all.
  const hasDepthAlarms = useMemo(() => {
    const alarms = (session as any).alarms as
      | { type?: string; depth?: number | null; enabled?: boolean }[]
      | undefined;
    return !!alarms?.some(
      (a) => a.enabled !== false && a.type === 'depth' && a.depth != null && a.depth > 0,
    );
  }, [session]);

  const hasPrev = idx > 0;
  const hasNext = idx < dives.length - 1;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Link
          to={`/session/${session.id}`}
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← {session.name || 'session'}
        </Link>
        <nav className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest">
          <button
            disabled={!hasPrev}
            onClick={() => navigate(`/session/${session.id}/dive/${idx - 1}`)}
            className={hasPrev ? 'text-textDim hover:text-accent' : 'text-textDim opacity-30'}
          >
            ← prev
          </button>
          <span className="text-textDim">
            Dive {idx + 1} of {dives.length}
          </span>
          <button
            disabled={!hasNext}
            onClick={() => navigate(`/session/${session.id}/dive/${idx + 1}`)}
            className={hasNext ? 'text-textDim hover:text-accent' : 'text-textDim opacity-30'}
          >
            next →
          </button>
        </nav>
      </div>

      <header className="mt-6 mb-8">
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
          {dive.discipline ?? 'Depth dive'} · {formatDate(session.date)}
        </span>
        <h1 className="mt-1 font-heading text-4xl tracking-wide text-text">
          {dive.depth}m
        </h1>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="Dive time" value={fmtSec(dive.diveTime)} />
          <Stat label="Descent" value={fmtSec(times.descentTime)} />
          {times.descentSpeed != null && (
            <Stat label="Descent speed" value={`${times.descentSpeed.toFixed(2)} m/s`} />
          )}
          <Stat label="Hang" value={fmtSec(times.hangTime)} />
          <Stat label="Ascent" value={fmtSec(times.ascentTime)} />
          {times.ascentSpeed != null && (
            <Stat label="Ascent speed" value={`${times.ascentSpeed.toFixed(2)} m/s`} />
          )}
          {dive.hr != null && <Stat label="Avg HR" value={`${dive.hr} bpm`} />}
          {dive.tempDepth != null && <Stat label="Temp @ depth" value={`${dive.tempDepth}°C`} />}
        </div>
      </header>

      {data.points.length < 2 ? (
        <div className="rounded-lg border border-dashed border-border bg-panel px-6 py-12 text-center">
          <p className="text-textDim">
            No profile recorded for this dive, nothing to render.
          </p>
        </div>
      ) : (
        <>
          {/* Depth-track overlay controls. The alarm toggle only shows
              when the session actually carries depth alarms. */}
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            {hasDepthAlarms && (
              <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-textDim">
                <input
                  type="checkbox"
                  checked={showAlarms}
                  onChange={(e) => setShowAlarms(e.target.checked)}
                  className="accent-accent"
                />
                Depth alarms
              </label>
            )}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-textDim">
                Speed markers
              </span>
              {([0, 5, 10] as const).map((step) => (
                <button
                  key={step}
                  onClick={() => setSpeedStep(step)}
                  className={[
                    'rounded-full border px-3 py-0.5 font-mono text-[11px] transition-colors',
                    speedStep === step
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-textDim hover:border-accent hover:text-accent',
                  ].join(' ')}
                >
                  {step === 0 ? 'Off' : `${step}m`}
                </button>
              ))}
            </div>
            {data.hasSpeed && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-widest text-textDim">
                  Speed smoothing
                </span>
                {([0, 5, 15] as const).map((win) => (
                  <button
                    key={win}
                    onClick={() => setSpeedSmooth(win)}
                    className={[
                      'rounded-full border px-3 py-0.5 font-mono text-[11px] transition-colors',
                      speedSmooth === win
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-textDim hover:border-accent hover:text-accent',
                    ].join(' ')}
                  >
                    {win === 0 ? 'Raw' : win === 5 ? 'Light' : 'Strong'}
                  </button>
                ))}
              </div>
            )}
            {/* Hangs — click a band on the chart to edit, + Add to create a
                new one, Reset to drop any manual corrections. */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-textDim">
                Hangs
              </span>
              <button
                onClick={handleAddHang}
                className="rounded-full border border-border px-3 py-0.5 font-mono text-[11px] text-textDim transition-colors hover:border-accent hover:text-accent"
              >
                + Add
              </button>
              {hasOverride && (
                <>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                    manual
                  </span>
                  <button
                    onClick={handleResetHangs}
                    className="rounded-full border border-border px-3 py-0.5 font-mono text-[11px] text-textDim transition-colors hover:border-red hover:text-red"
                  >
                    Reset
                  </button>
                </>
              )}
              {effective.length > 0 && !hasOverride && (
                <span className="font-mono text-[10px] text-textDim">
                  · click a band to edit
                </span>
              )}
            </div>
          </div>

          <DepthDiveTracks
            data={dataWithHangs}
            contractionOnset={dive.contractionOnset ?? null}
            alarms={(session as any).alarms ?? []}
            showAlarms={showAlarms}
            speedStep={speedStep}
            speedSmooth={speedSmooth}
            groupId={`dive-${session.id}-${idx}`}
            onHangClick={handleHangClick}
          />

          {selectedHang && effective[selectedHang.idx] && (
            <HangEditorPopover
              hang={effective[selectedHang.idx]}
              minT={data.startT}
              maxT={data.endT}
              position={{ x: selectedHang.x, y: selectedHang.y }}
              onChange={handleEditHang}
              onDelete={handleDeleteHang}
              onClose={() => setSelectedHang(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-heading text-xl tracking-wide text-text">{value}</div>
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-textDim">
        {label}
      </div>
    </div>
  );
}

function fmtSec(s: number): string {
  if (!s || s <= 0) return '-';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
