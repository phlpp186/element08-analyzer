/**
 * DivePageLayout: the one-screen frame shared by the depth and pool dive
 * pages: a header row, a chart card that shows ONE chart at a time (tabs), and
 * a side column of stacked cards (stats for the open tab, remarks, the
 * session's dives).
 *
 * From 960 px wide the page is exactly one viewport tall and the chart takes
 * whatever height is left, so a dive reads without scrolling. Below that the
 * side column wraps under the chart and the page scrolls like any other.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Link, type To } from 'react-router-dom';
import { useElementHeight } from '../lib/divePage';

export function DivePage({
  header,
  chart,
  side,
}: {
  header: ReactNode;
  chart: ReactNode;
  side: ReactNode;
}) {
  // 36 px below the page belong to the compact AppFooter.
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col px-4 py-4 sm:px-6 min-[960px]:h-[calc(100dvh-36px)] min-[960px]:min-h-[600px]">
      {header}
      <div className="mt-4 flex min-h-0 flex-1 flex-wrap gap-5 min-[960px]:flex-nowrap">
        <section className="flex min-w-0 flex-col" style={{ flex: '999 1 560px' }}>
          {chart}
        </section>
        {/* Bottom padding on wide screens keeps the last card clear of the
            floating Ask button. */}
        <aside
          className="flex min-w-0 flex-col gap-4 min-[960px]:min-h-0 min-[960px]:pb-8"
          style={{ flex: '1 1 300px' }}
        >
          {side}
        </aside>
      </div>
    </div>
  );
}

export function DiveHeader({
  backTo,
  backLabel,
  title,
  hero,
  meta,
  nav,
}: {
  backTo: To;
  backLabel: string;
  title: string;
  /** The dive's headline figure (depth, distance), shown as the hero number. */
  hero?: string;
  meta: ReactNode;
  nav?: ReactNode;
}) {
  return (
    // Right padding clears the fixed theme + language controls.
    <header className="flex flex-wrap items-end gap-x-6 gap-y-1 pr-40">
      <div className="min-w-0">
        <Link
          to={backTo}
          className="font-mono text-xs uppercase tracking-widest text-textDim hover:text-accent"
        >
          ← {backLabel}
        </Link>
        <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3 font-heading text-2xl tracking-wide text-text">
          <span>{title}</span>
          {hero && <span className="hero-num whitespace-nowrap text-[2rem] leading-none">{hero}</span>}
        </h1>
      </div>
      <div className="pb-1 font-mono text-[11px] uppercase tracking-widest text-textDim">
        {meta}
      </div>
      {nav && <div className="ml-auto pb-1">{nav}</div>}
    </header>
  );
}

export function PrevNext({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  label,
  prevLabel,
  nextLabel,
}: {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  label: string;
  prevLabel: string;
  nextLabel: string;
}) {
  return (
    <nav className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest">
      <button disabled={!hasPrev} onClick={onPrev} className="pill whitespace-nowrap px-3 py-1">
        ← {prevLabel}
      </button>
      <span className="whitespace-nowrap text-textDim">{label}</span>
      <button disabled={!hasNext} onClick={onNext} className="pill whitespace-nowrap px-3 py-1">
        {nextLabel} →
      </button>
    </nav>
  );
}

export interface ChartTab<T extends string> {
  id: T;
  label: string;
}

/** The chart card: tab row (with caption + actions on the right), the
 *  controls of the open tab, and a body that fills the remaining height. */
export function ChartCard<T extends string>({
  tabs,
  active,
  onTab,
  caption,
  actions,
  controls,
  children,
}: {
  tabs: ChartTab<T>[];
  active: T | null;
  onTab: (id: T) => void;
  caption?: string;
  actions?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="board flex flex-1 flex-col p-3 sm:p-4 min-[960px]:min-h-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active === tab.id}
              onClick={() => onTab(tab.id)}
              className={`pill px-3.5 py-1 font-mono text-[11px] uppercase tracking-widest ${active === tab.id ? 'pill-on' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {caption && (
            <span className="font-mono text-[10px] text-textDim opacity-80">{caption}</span>
          )}
          {actions}
        </div>
      </div>
      {controls && (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 pt-2">
          {controls}
        </div>
      )}
      <div className="mt-3 flex min-h-0 flex-col max-[959px]:h-[440px] min-[960px]:flex-1">
        {children}
      </div>
    </div>
  );
}

/** A measured, scroll-safe chart body: hands the available pixel height to a
 *  render prop. Content taller than the area (an A→B readout under the
 *  chart) scrolls inside the card instead of pushing the page. */
export function ChartBody({ children }: { children: (height: number) => ReactNode }) {
  const [ref, height] = useElementHeight<HTMLDivElement>();
  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-auto">
      {height > 0 && children(height)}
    </div>
  );
}

export function SideCard({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`board p-4 ${className}`}>
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-textDim">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** A stat tile's colour, by what it measures: the profile colour for
 *  descent, amber for ascent, the hero colour for the headline figure. */
export type Tone = 'hero' | 'profile' | 'amber' | 'accent' | 'highlight' | 'recover' | 'red';

export interface StatTile {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}

const TONE_VAR: Record<Tone, string> = {
  hero: 'rgb(var(--c-hero))',
  profile: 'rgb(var(--c-profile))',
  amber: 'rgb(var(--c-amber))',
  accent: 'rgb(var(--c-accent))',
  highlight: 'rgb(var(--c-highlight))',
  recover: 'rgb(var(--c-recover))',
  red: 'rgb(var(--c-red))',
};

export function StatsCard({ title, tiles, empty }: { title: string; tiles: StatTile[]; empty: string }) {
  return (
    <SideCard title={title} className="shrink-0">
      {tiles.length === 0 ? (
        <p className="font-mono text-[11px] text-textDim">{empty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              // break-words: German compounds outgrow a 140 px tile.
              className="tile min-w-0 break-words px-3 py-2"
              style={{ '--tone': TONE_VAR[tile.tone ?? 'accent'] } as React.CSSProperties}
            >
              <div className="tile-value font-num text-xl font-bold tabular-nums">{tile.value}</div>
              <div className="tile-label mt-0.5 font-mono text-[10px] font-extrabold uppercase tracking-widest">
                {tile.label}
              </div>
              {tile.sub && (
                <div className="tile-label font-mono text-[10px] opacity-80">{tile.sub}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </SideCard>
  );
}

/** Remarks + effort. Renders nothing when the dive has neither. */
export function RemarksCard({
  title,
  remarks,
  facts,
}: {
  title: string;
  remarks?: string | null;
  facts: { label: string; value: string }[];
}) {
  const text = remarks?.trim();
  if (!text && facts.length === 0) return null;
  return (
    <SideCard title={title} className="shrink-0">
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {facts.map((f) => (
            <span key={f.label} className="font-mono text-[11px] uppercase tracking-widest text-textDim">
              {f.label} <span className="text-text">{f.value}</span>
            </span>
          ))}
        </div>
      )}
      {text && (
        <p
          className={`max-h-28 overflow-auto whitespace-pre-wrap text-sm text-text ${facts.length > 0 ? 'mt-2' : ''}`}
        >
          {text}
        </p>
      )}
    </SideCard>
  );
}

export interface DiveListItem {
  key: string;
  to: To;
  label: string;
  detail: string;
  current: boolean;
  dim?: boolean;
}

export function DiveListCard({ title, items }: { title: string; items: DiveListItem[] }) {
  // Keep the current dive in view inside the list's own scroll area. Not
  // scrollIntoView: on a phone that would scroll the whole page down to it.
  const listRef = useRef<HTMLUListElement>(null);
  const currentKey = items.find((it) => it.current)?.key;
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !el) return;
    const top = el.offsetTop; // the list is `relative`, so this is list-relative
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + el.offsetHeight - list.clientHeight;
    }
  }, [currentKey]);
  return (
    <SideCard title={title} className="flex min-h-0 flex-col min-[960px]:flex-1">
      <ul ref={listRef} className="relative -mx-1 min-h-0 space-y-0.5 overflow-auto">
        {items.map((it) => (
          <li key={it.key}>
            <Link
              to={it.to}
              aria-current={it.current ? 'page' : undefined}
              className={[
                'flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 font-mono text-xs transition-colors',
                it.current
                  ? 'bg-accent/15 font-bold text-accent'
                  : `text-text hover:bg-abyss hover:text-accent ${it.dim ? 'opacity-60' : ''}`,
              ].join(' ')}
            >
              <span className="uppercase tracking-widest">{it.label}</span>
              <span className={`tabular-nums ${it.current ? '' : 'text-textDim'}`}>{it.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </SideCard>
  );
}
