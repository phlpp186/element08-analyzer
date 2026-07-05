/**
 * FullscreenDive — a viewport-filling overlay for analysing one dive with a
 * single maximised chart at a time. The header carries the dive title and a
 * metric switch (e.g. Dive profile / Speed / Heart rate for a depth dive);
 * the body measures itself and hands the available height to the caller so
 * the chart can use every pixel. Esc, ✕, or the backdrop-free close button
 * exit. Purely an overlay: reliable on iOS Safari where the Fullscreen API
 * is not.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';

export interface FullscreenTab {
  id: string;
  label: string;
}

export function FullscreenDive({
  title,
  subtitle,
  tabs,
  active,
  onTab,
  onClose,
  controls,
  children,
}: {
  title: string;
  subtitle?: string;
  tabs: FullscreenTab[];
  active: string;
  onTab: (id: string) => void;
  onClose: () => void;
  /** Optional controls row shown under the header (e.g. the speed-axis
   *  toggle + smoothing slider while the Speed tab is active). */
  controls?: ReactNode;
  /** Render prop: receives the pixel height available for the chart area. */
  children: (height: number) => ReactNode;
}) {
  const t = useT();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setBodyHeight(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // clientHeight includes the body's padding (p-4 = 16px each side).
  const chartHeight = Math.max(200, bodyHeight - 32);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-deep">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="truncate font-heading text-lg tracking-wide text-text">{title}</div>
          {subtitle && (
            <div className="font-mono text-[10px] uppercase tracking-widest text-textDim">
              {subtitle}
            </div>
          )}
        </div>
        <div className="order-last w-full sm:order-none sm:mx-auto sm:w-auto">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTab(tab.id)}
                className={[
                  'rounded-full border px-4 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors',
                  active === tab.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-textDim hover:border-accent hover:text-accent',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          title={`${t('Close')} (Esc)`}
          className="ml-auto rounded-full border border-border px-3 py-1 font-mono text-xs text-textDim transition-colors hover:border-accent hover:text-accent sm:ml-0"
        >
          ✕
        </button>
      </div>
      {controls && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/60 px-4 py-2 sm:px-6">
          {controls}
        </div>
      )}
      {/* The chart sits in a recessed "well" a touch darker than the page, so
          the plot area reads as the focus rather than blending into the bg.
          Capped + centred so the graphs don't stretch across a wide monitor
          (dive profiles, and especially speed-by-depth, read better narrow). */}
      <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
        <div
          ref={bodyRef}
          className="mx-auto h-full w-full max-w-[840px] overflow-auto rounded-2xl border border-border p-4 sm:px-6"
          style={{ backgroundColor: 'rgb(var(--c-sunken))' }}
        >
          {bodyHeight > 0 && children(chartHeight)}
        </div>
      </div>
    </div>
  );
}
