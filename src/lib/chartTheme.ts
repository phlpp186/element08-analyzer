/**
 * chartTheme — palette for ECharts options, swapped with the UI theme.
 *
 * ECharts options are plain values built at JS time, not CSS — so chart
 * components can't read Tailwind variables directly. They subscribe to
 * `useThemeStore` via this hook and rebuild their option with the right
 * hex strings whenever the theme flips.
 */
import { useThemeStore } from '../stores/useThemeStore';

export interface ChartTheme {
  /** Card / panel background. The chart sits on this. */
  surface: string;
  /** Page background — used for calendar-cell gaps and similar. */
  page: string;
  /** Tooltip background. */
  tooltipBg: string;
  /** Tooltip border. */
  tooltipBorder: string;
  /** Axis line / outer rule colour. */
  axisLine: string;
  /** Grid split line — horizontal rules behind the data. */
  splitLine: string;
  /** Body text / chart labels. */
  text: string;
  /** Secondary / axis-label text. */
  textDim: string;
  /** Primary accent — same as the Tailwind `accent`. The dive-profile
   *  line colour (coral in Caribbean, sky cyan in Chalk Dark). */
  accent: string;
  /** Secondary series — Tailwind `highlight` (golden sand / pink). */
  highlight: string;
  /** Recover / ok green — Tailwind `recover`. */
  green: string;
  /** Warn amber — Tailwind `amber`. */
  amber: string;
  /** Alarm red. In Chalk Dark the UI "red" is the pink highlight, so
   *  charts use #ff5078 instead — it must stay distinguishable from the
   *  pink highlight when both appear in one plot. */
  red: string;
  /** 5-stop low→high intensity ramp for calendar heatmaps. */
  heatRamp: string[];
}

// Hex values mirror the CSS palette tokens in index.css so charts and chrome
// agree. Keep in sync if those tokens change.
const dark: ChartTheme = {
  surface: '#2a2724', // panel
  page: '#1f1d1a', // deep
  tooltipBg: '#161412', // abyss
  tooltipBorder: '#4a463f', // border
  axisLine: '#4a463f',
  splitLine: '#38342f',
  text: '#ede9e2',
  textDim: '#8a857c',
  accent: '#1bafe0', // sky cyan
  highlight: '#e84393', // pink
  green: '#3dc96b',
  amber: '#f0a500',
  red: '#ff5078', // NOT the pink UI red — must read apart from `highlight`
  heatRamp: ['#38342f', '#14495c', '#166f8f', '#188fb8', '#1bafe0'],
};

const light: ChartTheme = {
  surface: '#ffffff',
  page: '#d9f1f6', // deep
  tooltipBg: '#ffffff',
  tooltipBorder: '#b9dce3', // border
  axisLine: '#b9dce3',
  splitLine: '#e3f0f4',
  text: '#0c3b45',
  textDim: '#5e828a',
  accent: '#f2764f', // coral
  highlight: '#e8a93a', // golden sand
  green: '#1fb894',
  amber: '#e8942a',
  red: '#e24b3c',
  heatRamp: ['#e3f0f4', '#f8cdbc', '#f7ab8d', '#f58f66', '#f2764f'],
};

// Titanium — a light theme (carbon-ink text, near-white cards), so it mirrors
// the `light` chart chrome but with ELEMENT 08's Audi Progressive Red accent
// + steel blue (the app's "Carbon" light twin, Audi Revolut direction).
const mid: ChartTheme = {
  surface: '#f8fafb', // panel
  page: '#c2cbd1', // deep
  tooltipBg: '#f8fafb',
  tooltipBorder: '#9da8af', // border
  axisLine: '#9da8af',
  splitLine: '#d9dee1',
  text: '#14181b',
  textDim: '#5c666d',
  accent: '#e0002a', // Audi red
  highlight: '#2e6e8f', // steel blue
  green: '#0e7a54',
  amber: '#b5730a',
  red: '#d3002a',
  heatRamp: ['#dbe0e3', '#f2c2c8', '#e88a95', '#e24a60', '#e0002a'],
};

export function useChartTheme(): ChartTheme {
  const theme = useThemeStore((s) => s.theme);
  if (theme === 'light') return light;
  if (theme === 'mid') return mid;
  return dark;
}

/** '#rrggbb' → 'rgba(r, g, b, a)' — for translucent bands/areas in ECharts. */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Linear RGB mix of two '#rrggbb' colours; f=0 → a, f=1 → b. */
export function mixHex(a: string, b: string, f: number): string {
  const clamped = Math.max(0, Math.min(1, f));
  const ch = (i: number) => {
    const av = parseInt(a.slice(i, i + 2), 16);
    const bv = parseInt(b.slice(i, i + 2), 16);
    return Math.round(av + (bv - av) * clamped);
  };
  return `rgb(${ch(1)}, ${ch(3)}, ${ch(5)})`;
}
