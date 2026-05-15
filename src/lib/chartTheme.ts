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

const dark: ChartTheme = {
  surface: '#161616',
  tooltipBg: '#101010',
  tooltipBorder: '#262626',
  axisLine: '#262626',
  splitLine: '#1a1a1a',
  text: '#f4f4f5',
  textDim: '#9a9a9e',
  accent: '#4fc3f7',
};

const light: ChartTheme = {
  surface: '#F0EDE7',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#D5D0C8',
  axisLine: '#D5D0C8',
  splitLine: '#E4DFD6',
  text: '#3A3832',
  textDim: '#7B7670',
  accent: '#1BAFE0',
};

export function useChartTheme(): ChartTheme {
  const theme = useThemeStore((s) => s.theme);
  return theme === 'light' ? light : dark;
}
