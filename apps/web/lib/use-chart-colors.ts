'use client';

import { useTheme } from 'next-themes';

export interface ChartColors {
  series1: string;
  series2: string;
  series3: string;
  track: string;
  grid: string;
  axis: string;
  muted: string;
  surface: string;
}

// The dataviz reference palette (validated: categorical slots 1–3, all pairs, both modes).
// Keep in step with the --series-*/--chart-* tokens in app/globals.css, which style the
// HTML parts (meters, share bars, legends) with the same values.
const LIGHT: ChartColors = {
  series1: '#2a78d6',
  series2: '#eb6834',
  series3: '#1baf7a',
  track: '#cde2fb',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  surface: '#ffffff',
};

const DARK: ChartColors = {
  series1: '#3987e5',
  series2: '#d95926',
  series3: '#199e70',
  track: '#0d366b',
  grid: '#2c2c2a',
  axis: '#383835',
  muted: '#898781',
  surface: '#252525',
};

/**
 * Concrete colours for Recharts, which writes them as SVG attributes (where CSS
 * variables aren't reliable). Dark mode gets its own validated steps, not a flip.
 */
export function useChartColors(): ChartColors {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'dark' ? DARK : LIGHT;
}
