/**
 * Formatting + layout helpers shared by the depth and pool dive pages (see
 * components/DivePageLayout).
 */
import { useLayoutEffect, useRef, useState } from 'react';

export function fmtSec(s: number | null | undefined): string {
  if (s == null || !(s > 0)) return '-';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Local time of day ("13:20") of a session timestamp, or null when the
 *  stored date carries no time. Dives have no start time of their own. */
export function formatClock(iso: string): string | null {
  if (!iso.includes('T')) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Shared pill-button styling for the small control rows. */
export function pillCls(active: boolean): string {
  return `pill px-3 py-0.5 font-mono text-[11px] ${active ? 'pill-on' : ''}`;
}

export function ctrlLabelCls(): string {
  return 'font-mono text-[11px] uppercase tracking-widest text-textDim';
}

/** Pixel height of an element, kept current with a ResizeObserver. The
 *  charts take a number, not a CSS height, so the flex-sized chart area has
 *  to be measured. */
export function useElementHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, height] as const;
}

/** Pixel width of an element, kept current with a ResizeObserver (charts
 *  that size their marks to the space they get). */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** The dive pages that fit one screen; the footer goes compact on these. */
export function isOneScreenRoute(pathname: string): boolean {
  return /^\/session\/[^/]+\/(dive|pool)\/[^/]+\/?$/.test(pathname);
}
