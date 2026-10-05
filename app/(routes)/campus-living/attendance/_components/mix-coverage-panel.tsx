'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { groupBy, statusMix, totals, type CubeFilter } from '@/lib/campus-living/attendance-cube';
import type { AttendanceBreakdown } from '@/types/campus-living/attendance-analytics';
import { AXIS, formatInt, formatPct, GRID, SURFACE, TOOLTIP_STYLE, useVizPalette } from './palette';

type D = 'institution' | 'department';

/**
 * Status mix (donut) and coverage — how many residents were ever marked in the
 * period. Every rate on this page is over MARKED learners, so coverage is the
 * denominator's honesty check: a high rate over a thin sample is not good news.
 */
export function MixCoveragePanel({
  data,
  filter,
  isLoading,
  onSelect,
}: {
  data: AttendanceBreakdown | undefined;
  filter: CubeFilter;
  isLoading: boolean;
  onSelect: (dim: D, key: string) => void;
}) {
  const viz = useVizPalette();
  const mixColors: Record<string, string> = {
    present: viz.status.present,
    late: viz.status.late,
    absent: viz.status.absent,
    onLeave: viz.status.leave,
    medical: viz.status.medical,
  };
  const overall = useMemo(() => (data ? totals(data, filter) : null), [data, filter]);
  const [dim, setDim] = useState<D>('institution');
  const mix = useMemo(() => (data ? statusMix(totals(data, filter)) : []), [data, filter]);
  const total = mix.reduce((s, m) => s + m.value, 0);
  const coverage = useMemo(
    () =>
      data && data.residents_visible
        ? groupBy(data, dim, filter)
            .filter((r) => (r.residents ?? 0) > 0)
            .map((r) => ({
              key: r.key,
              label: r.label,
              marked: r.marked ?? 0,
              notMarked: r.notMarked ?? 0,
              residents: r.residents ?? 0,
            }))
        : [],
    [data, dim, filter],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Status mix</CardTitle>
          <CardDescription>Every mark in the period, by status.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : mix.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Nothing marked for this selection.</p>
          ) : (
            <div className="relative h-[280px] w-full" role="img" aria-label="Status mix">
              {/* Centre label: the donut hole carries the headline rate. */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
                <span className="text-2xl font-bold tabular-nums">{formatPct(overall?.pct ?? null)}</span>
                <span className="text-[11px] text-muted-foreground">attendance rate</span>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mix}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={0}
                    cy="46%"
                    isAnimationActive={false}
                  >
                    {mix.map((m) => (
                      <Cell key={m.key} fill={mixColors[m.key]} stroke={SURFACE} strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => [`${formatInt(v)} (${formatPct((100 * v) / total)})`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} iconType="square" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Coverage</CardTitle>
            <CardDescription>Residents marked at least once in the period vs never marked.</CardDescription>
          </div>
          <ToggleGroup type="single" size="sm" variant="outline" value={dim} onValueChange={(v) => v && setDim(v as D)}>
            <ToggleGroupItem value="institution">Institution</ToggleGroupItem>
            <ToggleGroupItem value="department">Department</ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : data && !data.residents_visible ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Coverage needs allocation access (campus_living.allocations.view), which this account does not
                have, so no ratio is shown rather than a misleading one.
              </AlertDescription>
            </Alert>
          ) : coverage.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No residents for this selection.</p>
          ) : (
            <div style={{ height: Math.max(200, coverage.length * 32 + 48) }} role="img" aria-label="Coverage chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={coverage} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid horizontal={false} {...GRID} />
                  <XAxis type="number" allowDecimals={false} {...AXIS} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={140}
                    {...AXIS}
                    tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '12px' }} iconType="square" />
                  <Bar
                    dataKey="marked"
                    name="Marked"
                    stackId="c"
                    fill={viz.seriesColor(0)}
                    stroke={SURFACE}
                    strokeWidth={2}
                    cursor="pointer"
                    onClick={(e: { payload?: { key?: string } }) => e?.payload?.key && onSelect(dim, e.payload.key)}
                  />
                  <Bar
                    dataKey="notMarked"
                    name="Never marked"
                    stackId="c"
                    fill="hsl(var(--muted-foreground) / 0.45)"
                    stroke={SURFACE}
                    strokeWidth={2}
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(e: { payload?: { key?: string } }) => e?.payload?.key && onSelect(dim, e.payload.key)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
