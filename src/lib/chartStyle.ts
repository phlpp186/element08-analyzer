/**
 * chartStyle — the theme's finish on any ECharts option: the label font,
 * gradient area fills, a soft glow under lines, rounded bars with a lighter
 * top, and rounded tooltips. Applied once in components/charts/EChart, so
 * every chart gets the look without each builder repeating it (the web
 * counterpart of the app's Skia charts).
 *
 * Only fills in what a chart left unset: an explicit shadow, radius, gradient
 * or tooltip colour in a builder always wins.
 */
import type { ChartTheme } from './chartTheme';
import { withAlpha } from './chartTheme';

type Obj = Record<string, unknown>;

const HEX = /^#[0-9a-f]{6}$/i;

/** More series than this and the glow would cost frame time and turn an
 *  overlay of many dives into a blur. */
const GLOW_MAX_SERIES = 4;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function lighten(hex: string, f: number): string {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * f)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}

function vertical(top: string, bottom: string): Obj {
  return {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: top },
      { offset: 1, color: bottom },
    ],
  };
}

function seriesColor(s: Obj): string | null {
  const ls = isObj(s.lineStyle) ? s.lineStyle : {};
  const is = isObj(s.itemStyle) ? s.itemStyle : {};
  for (const c of [ls.color, s.color, is.color]) {
    if (typeof c === 'string' && HEX.test(c)) return c;
  }
  return null;
}

function horizontalBars(option: Obj): boolean {
  const y = option.yAxis;
  const first = Array.isArray(y) ? y[0] : y;
  return isObj(first) && first.type === 'category';
}

function styleLine(s: Obj, ct: ChartTheme, glow: boolean): Obj {
  const color = seriesColor(s);
  if (!color) return s;
  const out: Obj = { ...s };
  const ls = isObj(s.lineStyle) ? s.lineStyle : null;
  const width = typeof ls?.width === 'number' ? ls.width : 2;
  if (glow && ct.glow && ls && width >= 1.5 && ls.shadowBlur == null && ls.type !== 'dashed') {
    out.lineStyle = { ...ls, shadowBlur: 10, shadowColor: withAlpha(color, 0.55) };
  }
  // A flat area fill becomes a fade from the line down.
  const area = isObj(s.areaStyle) ? s.areaStyle : null;
  if (area && area.color == null) {
    const op = typeof area.opacity === 'number' ? area.opacity : 0.3;
    out.areaStyle = { ...area, opacity: 1, color: vertical(withAlpha(color, Math.min(0.5, op * 1.6)), withAlpha(color, 0.02)) };
  } else if (area && typeof area.color === 'string' && HEX.test(area.color)) {
    out.areaStyle = { ...area, color: vertical(withAlpha(area.color, 0.45), withAlpha(area.color, 0.02)) };
  }
  return out;
}

function styleBar(s: Obj, horizontal: boolean): Obj {
  const is = isObj(s.itemStyle) ? s.itemStyle : {};
  const out: Obj = { ...s };
  const item: Obj = { ...is };
  // Stacked segments keep square ends: rounding every one reads as beads.
  if (item.borderRadius == null && s.stack == null) {
    item.borderRadius = horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0];
  }
  // A candy bar: the colour, a little lighter at its far end.
  const c = item.color;
  if (typeof c === 'string' && HEX.test(c)) {
    item.color = horizontal
      ? { ...vertical(c, c), x2: 1, y2: 0, colorStops: [{ offset: 0, color: c }, { offset: 1, color: lighten(c, 0.28) }] }
      : vertical(lighten(c, 0.28), c);
  }
  out.itemStyle = item;
  return out;
}

export function stylizeOption<T>(option: T, ct: ChartTheme): T {
  if (!isObj(option)) return option;
  const o: Obj = { ...option };
  o.textStyle = { fontFamily: ct.fontFamily, ...(isObj(o.textStyle) ? o.textStyle : {}) };

  const tip = o.tooltip;
  if (isObj(tip)) {
    o.tooltip = {
      backgroundColor: ct.tooltipBg,
      borderColor: ct.tooltipBorder,
      ...tip,
      textStyle: { color: ct.text, fontFamily: ct.fontFamily, ...(isObj(tip.textStyle) ? tip.textStyle : {}) },
      extraCssText: `border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,0.3);${typeof tip.extraCssText === 'string' ? tip.extraCssText : ''}`,
    };
  }

  const series = Array.isArray(o.series) ? o.series : isObj(o.series) ? [o.series] : null;
  if (series) {
    const glow = series.length <= GLOW_MAX_SERIES;
    const horizontal = horizontalBars(o);
    const styled = series.map((s) => {
      if (!isObj(s)) return s;
      if (s.type === 'line') return styleLine(s, ct, glow);
      if (s.type === 'bar') return styleBar(s, horizontal);
      return s;
    });
    o.series = Array.isArray(o.series) ? styled : styled[0];
  }
  return o as T;
}
