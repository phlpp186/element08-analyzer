/**
 * PoolDivePlayer — full-resolution view of one pool dive.
 *
 * URL: /session/:sessionId/pool/:diveIdx
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useBackupStore } from '../stores/useBackupStore';
import { extractPoolDiveData } from '../lib/analytics/poolDiveProfile';
import { PoolDiveTracks } from '../components/charts/PoolDiveTracks';
import { FullscreenDive, type FullscreenTab } from '../components/FullscreenDive';
import { formatDate } from '../lib/format';
import { useT } from '../i18n';

export function PoolDivePlayer() {
  const t = useT();
  const { sessionId, diveIdx } = useParams<{ sessionId: string; diveIdx: string }>();
  const navigate = useNavigate();
  const backup = useBackupStore((s) => s.backup);
  const getSession = useBackupStore((s) => s.getSession);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsTab, setFsTab] = useState<'hr' | 'depth' | 'speed'>('hr');

  if (!backup) return <Navigate to="/" replace />;

  const session = getSession(Number(sessionId));
  if (!session || session.mode !== 'pool') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/sessions"
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← {t('back to sessions')}
        </Link>
        <p className="mt-8 text-textDim">{t('Pool dive not found.')}</p>
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
          ← {t('back to session')}
        </Link>
        <p className="mt-8 text-textDim">{t('Dive index out of range.')}</p>
      </div>
    );
  }

  const data = useMemo(() => extractPoolDiveData(dive), [dive]);
  const hasPrev = idx > 0;
  const hasNext = idx < dives.length - 1;
  const isSta = dive.discipline === 'STA';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (fullscreen) return;
      const el = document.activeElement;
      if (el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
      if (e.key === 'ArrowLeft' && hasPrev) navigate(`/session/${session.id}/pool/${idx - 1}`);
      else if (e.key === 'ArrowRight' && hasNext) navigate(`/session/${session.id}/pool/${idx + 1}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, hasPrev, hasNext, idx, session.id, navigate]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Link
          to={`/session/${session.id}`}
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← {session.name || t('session')}
        </Link>
        <nav className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest">
          <button
            disabled={!hasPrev}
            onClick={() => navigate(`/session/${session.id}/pool/${idx - 1}`)}
            className={hasPrev ? 'text-textDim hover:text-accent' : 'text-textDim opacity-30'}
          >
            ← {t('prev')}
          </button>
          <span className="text-textDim">
            {t('Dive')} {idx + 1} {t('of')} {dives.length}
          </span>
          <button
            disabled={!hasNext}
            onClick={() => navigate(`/session/${session.id}/pool/${idx + 1}`)}
            className={hasNext ? 'text-textDim hover:text-accent' : 'text-textDim opacity-30'}
          >
            {t('next')} →
          </button>
          {(data.hasHR || data.hasDepth || data.hasSpeed) && (
            <button
              onClick={() => {
                setFsTab(data.hasHR ? 'hr' : data.hasDepth ? 'depth' : 'speed');
                setFullscreen(true);
              }}
              title={t('Fullscreen analysis')}
              className="rounded-full border border-border px-3 py-1 text-textDim transition-colors hover:border-accent hover:text-accent"
            >
              ⛶ {t('Fullscreen')}
            </button>
          )}
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
          <Stat label={t('Dive time')} value={fmtSec(dive.diveTime)} />
          {dive.distance != null && <Stat label={t('Distance')} value={`${dive.distance}m`} />}
          {dive.turns != null && dive.turns > 0 && <Stat label={t('Turns')} value={String(dive.turns)} />}
          {dive.si > 0 && <Stat label={t('SI before')} value={fmtSec(dive.si)} />}
          {dive.hrHighest != null && <Stat label={t('HR high')} value={`${dive.hrHighest}`} />}
          {dive.hrLowest != null && <Stat label={t('HR low')} value={`${dive.hrLowest}`} />}
        </div>
      </header>

      <PoolDiveTracks data={data} groupId={`pool-${session.id}-${idx}`} />

      {fullscreen && (
        <FullscreenDive
          title={`${dive.discipline} · ${isSta ? fmtSec(dive.diveTime) : `${dive.distance ?? 0}m`}`}
          subtitle={`${formatDate(session.date)} · ${t('Dive')} ${idx + 1} ${t('of')} ${dives.length}`}
          tabs={
            [
              ...(data.hasHR ? [{ id: 'hr', label: t('Heart Rate') }] : []),
              ...(data.hasDepth ? [{ id: 'depth', label: t('Depth') }] : []),
              ...(data.hasSpeed ? [{ id: 'speed', label: t('Speed') }] : []),
            ] as FullscreenTab[]
          }
          active={fsTab}
          onTab={(id) => setFsTab(id as typeof fsTab)}
          onClose={() => setFullscreen(false)}
        >
          {(h) => (
            <PoolDiveTracks
              data={data}
              groupId={`pool-fs-${session.id}-${idx}`}
              solo={fsTab}
              chartHeight={Math.max(220, h - 32)}
            />
          )}
        </FullscreenDive>
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
