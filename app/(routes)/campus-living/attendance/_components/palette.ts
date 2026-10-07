'use client';

/**
 * Chart vocabulary for the attendance dashboard.
 *
 * Every colour here was run through the dataviz validator (validate_palette.js)
 * in BOTH modes, and the dark values are their own selected steps, not a flip:
 *
 *   status stack  leave · present · late · absent   — in THIS order, which keeps
 *                 yellow away from red (adjacent yellow↔red failed the dark
 *                 normal-vision floor, ΔE 13.0). Dark CVD is the 6–8 warn band, so
 *                 the secondary encoding is mandatory: a 2px surface gap between
 *                 segments, a legend, a rate label at each bar end and a table.
 *   series        the 8-slot reference categorical, adjacent pairs pass in both.
 *   rate scale    diverging blue ↔ red around the 75% at-risk line, neutral gray
 *                 midpoint (a rate is "good" or "poor" relative to a threshold).
 */
import { useTheme } from 'next-themes';

export {
  formatDate,
  formatInt,
  formatPct,
  pctTone,
  shortDate,
  toneClass,
} from '@/app/(routes)/campus-living/analytics/attendance/_components/format';

export type VizMode = 'light' | 'dark';

export interface StatusColors {
  leave: string;
  present: string;
  late: string;
  absent: string;
  medical: string;
}

const STATUS: Record<VizMode, StatusColors> = {
  light: { leave: '#eda100', present: '#008300', late: '#2a78d6', absent: '#e34948', medical: '#4a3aa7' },
  dark: { leave: '#c98500', present: '#008300', late: '#3987e5', absent: '#e66767', medical: '#9085e9' },
};

const SERIES: Record<VizMode, readonly string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

/** Diverging arms for a rate: poor ← neutral → good, pivoting on the at-risk line. */
const DIVERGING: Record<VizMode, { poor: string; mid: string; good: string; muted: string }> = {
  light: { poor: '#e34948', mid: '#f0efec', good: '#2a78d6', muted: '#e7e6e2' },
  dark: { poor: '#e66767', mid: '#383835', good: '#3987e5', muted: '#2a2a28' },
};

export const RATE_PIVOT = 75;
const RATE_LOW = 40;
const RATE_HIGH = 100;

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const k = Math.max(0, Math.min(1, t));
  const ch = (x: number, y: number) => Math.round(x + (y - x) * k);
  return `rgb(${ch(ar, br)} ${ch(ag, bg)} ${ch(ab, bb)})`;
}

/** Fill for a rate: red below the 75% line, gray at it, blue above; muted when nothing counted. */
export function rateFillFor(mode: VizMode, pct: number | null): string {
  const d = DIVERGING[mode];
  if (pct === null) return d.muted;
  if (pct >= RATE_PIVOT) return mix(d.mid, d.good, (pct - RATE_PIVOT) / (RATE_HIGH - RATE_PIVOT));
  return mix(d.mid, d.poor, (RATE_PIVOT - pct) / (RATE_PIVOT - RATE_LOW));
}

/** Readable ink on top of a rate fill. */
export function inkOn(mode: VizMode, pct: number | null): string {
  if (pct === null) return mode === 'dark' ? '#c3c2b7' : '#52514e';
  const strength =
    pct >= RATE_PIVOT ? (pct - RATE_PIVOT) / (RATE_HIGH - RATE_PIVOT) : (RATE_PIVOT - pct) / (RATE_PIVOT - RATE_LOW);
  if (strength < 0.45) return mode === 'dark' ? '#ffffff' : '#0b0b0b';
  return '#ffffff';
}

export interface VizPalette {
  mode: VizMode;
  status: StatusColors;
  series: readonly string[];
  seriesColor: (i: number) => string;
  rateFill: (pct: number | null) => string;
  inkOn: (pct: number | null) => string;
  /** Stops for the legend ramp, low → high. */
  rateRamp: string[];
  noData: string;
}

export function useVizPalette(): VizPalette {
  const { resolvedTheme } = useTheme();
  const mode: VizMode = resolvedTheme === 'dark' ? 'dark' : 'light';
  const series = SERIES[mode];
  return {
    mode,
    status: STATUS[mode],
    series,
    seriesColor: (i) => series[i % series.length],
    rateFill: (pct) => rateFillFor(mode, pct),
    inkOn: (pct) => inkOn(mode, pct),
    rateRamp: [RATE_LOW, 57, RATE_PIVOT, 87, RATE_HIGH].map((p) => rateFillFor(mode, p)),
    noData: DIVERGING[mode].muted,
  };
}

/** Recharts tooltip styling used across the campus-living analytics pages. */
export const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  color: 'hsl(var(--popover-foreground))',
  fontSize: '12px',
} as const;

/** The 2px surface gap between stacked / adjacent fills. */
export const SURFACE = 'hsl(var(--card))';

/** Recessive axis + grid so the marks carry the weight. */
export const AXIS = { fontSize: 11, tickLine: false, axisLine: false } as const;
export const GRID = { stroke: 'hsl(var(--border))', strokeDasharray: '3 3', strokeOpacity: 0.7 } as const;
