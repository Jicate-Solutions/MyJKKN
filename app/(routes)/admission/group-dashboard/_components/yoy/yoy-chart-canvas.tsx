'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  YoYTrajectoryRow,
  YoYInstitutionRow,
  YoYCategoryRow,
} from '@/lib/services/admission/yoy-trajectory-service';
import { formatDayNTick, formatCompact, formatIndianNumber, formatDeltaPct } from './_helpers/chart-formatters';
import { cycleLabel } from './_helpers/verdict-math';
import { CATEGORY_COLOURS, type Category } from './_helpers/category-map';

export type ViewMode = 'institution' | 'category';
export type HorizonMode = 'fair-race' | 'full-horizon';

type Props = {
  trajectory: YoYTrajectoryRow[];
  perInstitution: YoYInstitutionRow[] | null;
  perCategory: YoYCategoryRow[] | null;
  expandedYear: number | null;
  viewMode: ViewMode;
  horizonMode: HorizonMode;
  onPointClick: (year: number, dayN: number) => void;
};

// Year palette (editorial earth tones, NOT default Tailwind blues)
const YEAR_PALETTE = ['#c4baaa', '#7c8a93', '#c8553d']; // [oldest, middle, current]
const CURRENT_YEAR_GRADIENT_ID = 'yoy-current-fill';

const X_DOMAIN: [number, number] = [-150, 400];

/**
 * Zone 2: the chart. Three view modes:
 *   - institution (default): one bold line per year (3 lines)
 *   - expandedYear: replace the expanded year with 8 institutional sub-lines
 *   - category: 8 lines per year × 3 years, color-coded by category
 *
 * Polish details:
 *   - Gradient fill under current year line
 *   - Reference area marking "today" on the current-year line
 *   - Custom tick formatter (Apr/May/Jun instead of bare day numbers)
 *   - Custom tooltip with delta + Y/Y % vs prior years
 *   - strokeDasharray on oldest year (visual hierarchy)
 *   - No forward-fill phantom extension (lines stop at their actual data range)
 */
export function YoYChartCanvas({
  trajectory,
  perInstitution,
  perCategory,
  expandedYear,
  viewMode,
  horizonMode,
  onPointClick,
}: Props) {
  const { chartData, lineConfigs, currentMaxDayN } = useMemo(() => {
    if (viewMode === 'category' && perCategory) {
      return buildCategoryChartData(perCategory);
    }
    if (expandedYear !== null && perInstitution) {
      return buildExpandedYearChartData(trajectory, perInstitution, expandedYear);
    }
    return buildDefaultChartData(trajectory);
  }, [trajectory, perInstitution, perCategory, expandedYear, viewMode]);

  // Fair-race clipping: only show data up to current cycle's current day-N.
  const displayData = useMemo(() => {
    if (horizonMode === 'full-horizon') return chartData;
    return chartData.filter((p) => (p.dayN as number) <= currentMaxDayN);
  }, [chartData, horizonMode, currentMaxDayN]);

  return (
    <div className="relative" style={{ fontFamily: 'var(--font-ibm-plex-sans)' }}>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={displayData}
          margin={{ top: 16, right: 28, left: 8, bottom: 24 }}
          onClick={(state) => {
            if (!state || state.activeLabel === undefined) return;
            const dayN = Number(state.activeLabel);
            // Click resolves to the current year by default; user can refine via tooltip
            const currentYear = Math.max(...lineConfigs.map((c) => c.year ?? -Infinity).filter(Number.isFinite));
            if (Number.isFinite(currentYear) && Number.isFinite(dayN)) {
              onPointClick(currentYear, dayN);
            }
          }}
        >
          <defs>
            <linearGradient id={CURRENT_YEAR_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c8553d" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#c8553d" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#e7e2d8" strokeDasharray="0" vertical={false} />

          <XAxis
            dataKey="dayN"
            type="number"
            domain={X_DOMAIN}
            ticks={[-120, -60, 0, 60, 120, 180, 240, 300, 360]}
            tickFormatter={formatDayNTick}
            tick={{ fontSize: 11, fill: '#6e6760', fontFamily: 'var(--font-ibm-plex-mono)' }}
            axisLine={{ stroke: '#d8d3c8' }}
            tickLine={{ stroke: '#d8d3c8' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6e6760', fontFamily: 'var(--font-ibm-plex-mono)' }}
            tickFormatter={formatCompact}
            allowDecimals={false}
            axisLine={{ stroke: '#d8d3c8' }}
            tickLine={{ stroke: '#d8d3c8' }}
            width={50}
          />

          <Tooltip content={<EditorialTooltip lineConfigs={lineConfigs} />} cursor={{ stroke: '#c8553d', strokeOpacity: 0.25, strokeDasharray: '4 4' }} />

          {/* April 1 reference */}
          <ReferenceLine
            x={0}
            stroke="#9a948a"
            strokeDasharray="3 3"
            label={{ value: 'Apr 1', position: 'top', fontSize: 10, fill: '#6e6760', dy: -6 }}
          />

          {/* "Today" band on the current cycle */}
          {Number.isFinite(currentMaxDayN) && (
            <ReferenceArea
              x1={currentMaxDayN - 0.5}
              x2={currentMaxDayN + 0.5}
              fill="#c8553d"
              fillOpacity={0.08}
              label={{ value: 'TODAY', position: 'insideTopRight', fontSize: 9, fill: '#a8453c', fontWeight: 600 }}
            />
          )}

          {lineConfigs.map((cfg) => (
            <Line
              key={cfg.key}
              type="monotone"
              dataKey={cfg.key}
              name={cfg.label}
              stroke={cfg.color}
              strokeWidth={cfg.isFocus ? 2.5 : 1.5}
              strokeDasharray={cfg.dashed ? '5 5' : undefined}
              dot={false}
              connectNulls={false}
              isAnimationActive
              animationDuration={cfg.isFocus ? 700 : 500}
              animationBegin={cfg.animationDelay}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Chart-data builders — one per view mode
// ============================================================================

type LineConfig = {
  key: string;
  label: string;
  color: string;
  isFocus: boolean;
  dashed: boolean;
  animationDelay: number;
  year?: number;
};

type ChartPoint = Record<string, number | undefined>;

function buildDefaultChartData(
  trajectory: YoYTrajectoryRow[],
): { chartData: ChartPoint[]; lineConfigs: LineConfig[]; currentMaxDayN: number } {
  const yearsSet = new Set<number>();
  const byDayN = new Map<number, ChartPoint>();
  for (const r of trajectory) {
    if (r.dayN < X_DOMAIN[0] || r.dayN > X_DOMAIN[1]) continue;
    yearsSet.add(r.year);
    if (!byDayN.has(r.dayN)) byDayN.set(r.dayN, { dayN: r.dayN });
    byDayN.get(r.dayN)![`y${r.year}`] = r.cumulativeAdmitted;
  }
  const years = Array.from(yearsSet).sort((a, b) => a - b);
  const yearRanges: Record<string, { min: number; max: number }> = {};
  for (const r of trajectory) {
    if (r.dayN < X_DOMAIN[0] || r.dayN > X_DOMAIN[1]) continue;
    const k = `y${r.year}`;
    yearRanges[k] = yearRanges[k]
      ? { min: Math.min(yearRanges[k].min, r.dayN), max: Math.max(yearRanges[k].max, r.dayN) }
      : { min: r.dayN, max: r.dayN };
  }
  const sortedDays = Array.from(byDayN.keys()).sort((a, b) => a - b);
  const lastSeen: Record<string, number | undefined> = {};
  for (const day of sortedDays) {
    const point = byDayN.get(day)!;
    for (const y of years) {
      const k = `y${y}`;
      const range = yearRanges[k];
      if (!range || day < range.min || day > range.max) continue;
      if (point[k] !== undefined) lastSeen[k] = point[k] as number;
      else if (lastSeen[k] !== undefined) point[k] = lastSeen[k];
    }
  }
  const points = sortedDays.map((d) => byDayN.get(d)!);
  const currentYear = years[years.length - 1] ?? 0;
  const currentMaxDayN = trajectory
    .filter((r) => r.year === currentYear)
    .reduce((m, r) => Math.max(m, r.dayN), -Infinity);

  const lineConfigs: LineConfig[] = years.map((y, idx) => ({
    key: `y${y}`,
    label: cycleLabel(y),
    color: YEAR_PALETTE[Math.min(idx, YEAR_PALETTE.length - 1)],
    isFocus: idx === years.length - 1,
    dashed: idx === 0,
    animationDelay: idx * 250,
    year: y,
  }));

  return {
    chartData: points,
    lineConfigs,
    currentMaxDayN: Number.isFinite(currentMaxDayN) ? currentMaxDayN : 0,
  };
}

function buildExpandedYearChartData(
  trajectory: YoYTrajectoryRow[],
  perInstitution: YoYInstitutionRow[],
  expandedYear: number,
): { chartData: ChartPoint[]; lineConfigs: LineConfig[]; currentMaxDayN: number } {
  const base = buildDefaultChartData(trajectory.filter((r) => r.year !== expandedYear));
  const institutionKeys = new Set<string>();
  for (const r of perInstitution) {
    if (r.dayN < X_DOMAIN[0] || r.dayN > X_DOMAIN[1]) continue;
    institutionKeys.add(`inst:${r.institutionId}`);
    const existing = base.chartData.find((p) => p.dayN === r.dayN);
    if (existing) {
      existing[`inst:${r.institutionId}`] = r.cumulativeAdmitted;
    } else {
      base.chartData.push({ dayN: r.dayN, [`inst:${r.institutionId}`]: r.cumulativeAdmitted });
    }
  }
  base.chartData.sort((a, b) => (a.dayN as number) - (b.dayN as number));

  // Forward-fill institutional sub-lines within each institution's range
  const instRanges: Record<string, { min: number; max: number }> = {};
  for (const r of perInstitution) {
    if (r.dayN < X_DOMAIN[0] || r.dayN > X_DOMAIN[1]) continue;
    const k = `inst:${r.institutionId}`;
    instRanges[k] = instRanges[k]
      ? { min: Math.min(instRanges[k].min, r.dayN), max: Math.max(instRanges[k].max, r.dayN) }
      : { min: r.dayN, max: r.dayN };
  }
  const lastSeen: Record<string, number | undefined> = {};
  for (const p of base.chartData) {
    const day = p.dayN as number;
    for (const k of institutionKeys) {
      const range = instRanges[k];
      if (!range || day < range.min || day > range.max) continue;
      if (p[k] !== undefined) lastSeen[k] = p[k] as number;
      else if (lastSeen[k] !== undefined) p[k] = lastSeen[k];
    }
  }

  // Color-cycle for institutions — earth-tone palette
  const instPalette = ['#c8553d', '#7a8c5a', '#8b6c42', '#5a7548', '#a07b56', '#a8453c', '#7c8a93', '#c4baaa'];
  const sortedInsts = Array.from(institutionKeys);
  const instConfigs: LineConfig[] = sortedInsts.map((k, idx) => {
    const name =
      perInstitution.find((r) => `inst:${r.institutionId}` === k)?.institutionName ?? k;
    return {
      key: k,
      label: name.replace('JKKN College of ', '').replace('JKKN ', ''),
      color: instPalette[idx % instPalette.length],
      isFocus: false,
      dashed: false,
      animationDelay: idx * 100,
    };
  });

  return {
    chartData: base.chartData,
    lineConfigs: [...base.lineConfigs, ...instConfigs],
    currentMaxDayN: base.currentMaxDayN,
  };
}

function buildCategoryChartData(
  perCategory: YoYCategoryRow[],
): { chartData: ChartPoint[]; lineConfigs: LineConfig[]; currentMaxDayN: number } {
  const yearsSet = new Set<number>();
  const catKeysSet = new Set<string>();
  const byDayN = new Map<number, ChartPoint>();
  for (const r of perCategory) {
    if (r.dayN < X_DOMAIN[0] || r.dayN > X_DOMAIN[1]) continue;
    yearsSet.add(r.year);
    const k = `cat:${r.category}:y${r.year}`;
    catKeysSet.add(k);
    if (!byDayN.has(r.dayN)) byDayN.set(r.dayN, { dayN: r.dayN });
    byDayN.get(r.dayN)![k] = r.cumulativeAdmitted;
  }
  const sortedDays = Array.from(byDayN.keys()).sort((a, b) => a - b);
  const points = sortedDays.map((d) => byDayN.get(d)!);

  const years = Array.from(yearsSet).sort((a, b) => a - b);
  const currentYear = years[years.length - 1] ?? 0;
  const currentMaxDayN = perCategory
    .filter((r) => r.year === currentYear)
    .reduce((m, r) => Math.max(m, r.dayN), -Infinity);

  // Range forward-fill per (category, year) tuple
  const ranges: Record<string, { min: number; max: number }> = {};
  for (const r of perCategory) {
    if (r.dayN < X_DOMAIN[0] || r.dayN > X_DOMAIN[1]) continue;
    const k = `cat:${r.category}:y${r.year}`;
    ranges[k] = ranges[k]
      ? { min: Math.min(ranges[k].min, r.dayN), max: Math.max(ranges[k].max, r.dayN) }
      : { min: r.dayN, max: r.dayN };
  }
  const lastSeen: Record<string, number | undefined> = {};
  for (const p of points) {
    const day = p.dayN as number;
    for (const k of catKeysSet) {
      const range = ranges[k];
      if (!range || day < range.min || day > range.max) continue;
      if (p[k] !== undefined) lastSeen[k] = p[k] as number;
      else if (lastSeen[k] !== undefined) p[k] = lastSeen[k];
    }
  }

  const lineConfigs: LineConfig[] = Array.from(catKeysSet).map((k) => {
    const [, category, yearLabel] = k.split(':');
    const year = parseInt(yearLabel.replace('y', ''), 10);
    const isFocus = year === currentYear;
    return {
      key: k,
      label: `${category} ${cycleLabel(year)}`,
      color: CATEGORY_COLOURS[category as Category] ?? '#6e6760',
      isFocus,
      dashed: year === currentYear - 2,
      animationDelay: 0,
      year,
    };
  });

  return {
    chartData: points,
    lineConfigs,
    currentMaxDayN: Number.isFinite(currentMaxDayN) ? currentMaxDayN : 0,
  };
}

// ============================================================================
// Editorial tooltip
// ============================================================================

type TooltipPayloadEntry = {
  dataKey: string;
  name: string;
  value: number | undefined;
  color: string;
};

function EditorialTooltip({
  active,
  payload,
  label,
  lineConfigs,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: number | string;
  lineConfigs: LineConfig[];
}) {
  if (!active || !payload?.length) return null;
  const dayN = Number(label);
  const valid = payload.filter((p) => p.value !== undefined);
  if (!valid.length) return null;

  // Sort current-cycle first (focus), then by raw value desc
  const sorted = valid.slice().sort((a, b) => {
    const aFocus = lineConfigs.find((c) => c.key === a.dataKey)?.isFocus ? 1 : 0;
    const bFocus = lineConfigs.find((c) => c.key === b.dataKey)?.isFocus ? 1 : 0;
    if (aFocus !== bFocus) return bFocus - aFocus;
    return (b.value ?? 0) - (a.value ?? 0);
  });

  // Compute deltas vs the lowest-value line as baseline (for institutional view)
  const focusValue = sorted.find((p) => lineConfigs.find((c) => c.key === p.dataKey)?.isFocus)?.value;

  return (
    <div
      className="rounded-md border shadow-lg"
      style={{
        backgroundColor: '#fafaf8',
        borderColor: '#e7e2d8',
        fontFamily: 'var(--font-ibm-plex-sans)',
        minWidth: 220,
        padding: '10px 12px',
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.16em] pb-1.5 border-b"
        style={{ color: '#9a948a', borderColor: '#e7e2d8' }}
      >
        Day {dayN >= 0 ? '+' : ''}{dayN} since Apr 1 · {formatDayNTick(dayN)}
      </div>
      <div className="pt-2 space-y-1.5">
        {sorted.map((p) => {
          const cfg = lineConfigs.find((c) => c.key === p.dataKey);
          const isFocus = cfg?.isFocus ?? false;
          const showDelta = !isFocus && focusValue !== undefined && p.value !== undefined;
          const delta = showDelta ? (focusValue! - p.value!) : 0;
          const deltaPct = showDelta && p.value! > 0 ? (delta / p.value!) * 100 : 0;
          return (
            <div
              key={p.dataKey}
              className="flex items-baseline justify-between gap-3"
              style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}
            >
              <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#2a2624' }}>
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.color, opacity: isFocus ? 1 : 0.7 }}
                />
                {cfg?.label ?? p.name}
              </div>
              <div className="flex items-baseline gap-2 tabular-nums text-[11px]" style={{ color: '#2a2624' }}>
                <span style={{ fontWeight: isFocus ? 600 : 400 }}>{formatIndianNumber(p.value)}</span>
                {showDelta && (
                  <span
                    className="text-[10px]"
                    style={{ color: delta >= 0 ? '#5a7548' : '#a8453c' }}
                  >
                    {delta >= 0 ? '+' : ''}{formatIndianNumber(delta)} ({formatDeltaPct(deltaPct)})
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
