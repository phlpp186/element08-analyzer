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
  /** Primary accent — same as the Tailwind `accent`. */
  accent: string;
}

// Hex values mirror the CSS palette tokens in index.css so charts and chrome
// agree. Keep in sync if those tokens change.
const dark: ChartTheme = {
  surface: '#1c232f', // panel
  tooltipBg: '#141a24', // abyss
  tooltipBorder: '#384252', // border
  axisLine: '#384252',
  splitLine: '#232b38',
  text: '#f0f3f8',
  textDim: '#96a0b0',
  accent: '#5bcdfa',
};

const light: ChartTheme = {
  surface: '#fffefc',
  tooltipBg: '#ffffff',
  tooltipBorder: '#cec8be',
  axisLine: '#cec8be',
  splitLine: '#e8e3da',
  text: '#34322d',
  textDim: '#78726a',
  accent: '#16a5d6',
};

const neon: ChartTheme = {
  surface: '#19221c', // panel
  tooltipBg: '#121914', // abyss
  tooltipBorder: '#36463a', // border
  axisLine: '#36463a',
  splitLine: '#1f2a22',
  text: '#eef5f0',
  textDim: '#96aa9c',
  accent: '#84f068', // electric green
};

export function useChartTheme(): ChartTheme {
  const theme = useThemeStore((s) => s.theme);
  if (theme === 'light') return light;
  if (theme === 'neon') return neon;
  return dark;
}
