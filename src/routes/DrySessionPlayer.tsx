/**
 * DrySessionPlayer — full-resolution view of one dry breath-hold session.
 *
 * URL: /session/:sessionId/dry
 *
 * Dry sessions are a single continuous timeline (no per-dive concept),
 * so this route renders one player covering the whole session.
 */
import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { extractDrySessionData } from '../lib/analytics/drySessionProfile';
import { DrySessionTracks } from '../components/charts/DrySessionTracks';
import { formatDate } from '../lib/format';

export function DrySessionPlayer() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const backup = useBackupStore((s) => s.backup);
  const getSession = useBackupStore((s) => s.getSession);

  if (!backup) return <Navigate to="/" replace />;

  const session = getSession(Number(sessionId));
  if (!session || session.mode !== 'dry') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← back to sessions
        </Link>
        <p className="mt-8 text-textDim">Dry session not found.</p>
      </div>
    );
  }

  const data = useMemo(() => extractDrySessionData(session as any), [session]);

  const cycles = (session as any).cyclesCount ?? 0;
  const lungVol = (session as any).lungVol ?? null;
  const breathingStyle = (session as any).breathingStyle ?? null;

  // Stats derived from the cleaned series rather than top-of-session fields,
  // matching what the in-app per-session detail shows.
  const minSpo2 = data.spo2Series.length > 0
    ? Math.min(...data.spo2Series.map((p) => p[1]))
    : null;
  const minHr = data.hrSeries.length > 0
    ? Math.min(...data.hrSeries.map((p) => p[1]))
    : null;
  const maxHr = data.hrSeries.length > 0
    ? Math.max(...data.hrSeries.map((p) => p[1]))
    : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link
        to="/sessions"
        className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
      >
        ← back to sessions
      </Link>

      <header className="mt-6 mb-8">
        <span className="font-mono text-[10px] uppercase tracking-widest text-recover">
          Dry · {formatDate(session.date)}
        </span>
        <h1 className="mt-1 font-heading text-4xl tracking-wide text-text">
          {session.name || 'Untitled session'}
        </h1>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {cycles > 0 && <Stat label="Holds" value={String(cycles)} />}
          <Stat label="Duration" value={(session as any).duration ?? '-'} />
          {lungVol && <Stat label="Lung volume" value={lungVol} />}
          {breathingStyle && <Stat label="Breathing" value={breathingStyle} />}
          {minSpo2 != null && <Stat label="Min SpO₂" value={`${minSpo2}%`} />}
          {minHr != null && maxHr != null && (
            <Stat label="HR range" value={`${minHr}–${maxHr}`} />
          )}
        </div>
      </header>

      <DrySessionTracks data={data} groupId={`dry-${session.id}`} />
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
