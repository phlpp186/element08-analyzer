/**
 * PoolDivePlayer — full-resolution view of one pool dive.
 *
 * URL: /session/:sessionId/pool/:diveIdx
 */
import { useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { extractPoolDiveData } from '../lib/analytics/poolDiveProfile';
import { PoolDiveTracks } from '../components/charts/PoolDiveTracks';
import { formatDate } from '../lib/format';

export function PoolDivePlayer() {
  const { sessionId, diveIdx } = useParams<{ sessionId: string; diveIdx: string }>();
  const navigate = useNavigate();
  const backup = useBackupStore((s) => s.backup);
  const getSession = useBackupStore((s) => s.getSession);

  if (!backup) return <Navigate to="/" replace />;

  const session = getSession(Number(sessionId));
  if (!session || session.mode !== 'pool') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← back to sessions
        </Link>
        <p className="mt-8 text-textDim">Pool dive not found.</p>
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

  const data = useMemo(() => extractPoolDiveData(dive), [dive]);
  const hasPrev = idx > 0;
  const hasNext = idx < dives.length - 1;
  const isSta = dive.discipline === 'STA';

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
            onClick={() => navigate(`/session/${session.id}/pool/${idx - 1}`)}
            className={hasPrev ? 'text-textDim hover:text-accent' : 'text-textDim opacity-30'}
          >
            ← prev
          </button>
          <span className="text-textDim">
            Dive {idx + 1} of {dives.length}
          </span>
          <button
            disabled={!hasNext}
            onClick={() => navigate(`/session/${session.id}/pool/${idx + 1}`)}
            className={hasNext ? 'text-textDim hover:text-accent' : 'text-textDim opacity-30'}
          >
            next →
          </button>
        </nav>
      </div>

      <header className="mt-6 mb-8">
        <span className="font-mono text-[10px] uppercase tracking-widest text-highlight">
          {dive.discipline} · {formatDate(session.date)}
        </span>
        <h1 className="mt-1 font-heading text-4xl tracking-wide text-text">
          {isSta ? fmtSec(dive.diveTime) : `${dive.distance ?? 0}m`}
        </h1>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="Dive time" value={fmtSec(dive.diveTime)} />
          {dive.distance != null && <Stat label="Distance" value={`${dive.distance}m`} />}
          {dive.turns != null && dive.turns > 0 && <Stat label="Turns" value={String(dive.turns)} />}
          {dive.si > 0 && <Stat label="SI before" value={fmtSec(dive.si)} />}
          {dive.hrHighest != null && <Stat label="HR high" value={`${dive.hrHighest}`} />}
          {dive.hrLowest != null && <Stat label="HR low" value={`${dive.hrLowest}`} />}
        </div>
      </header>

      <PoolDiveTracks data={data} groupId={`pool-${session.id}-${idx}`} />
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
  if (!s || s <= 0) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
