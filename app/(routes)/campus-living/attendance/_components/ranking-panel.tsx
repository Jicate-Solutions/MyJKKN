'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { groupBy, rank, type CubeFilter, type Dimension, type GroupRow } from '@/lib/campus-living/attendance-cube';
import type { AttendanceBreakdown } from '@/types/campus-living/attendance-analytics';
import { AXIS, formatInt, formatPct, GRID, TOOLTIP_STYLE, useVizPalette } from './palette';

type D = Exclude<Dimension, 'date'>;

/** A group needs this many counted marks before it is ranked; fewer is noise. */
const MIN_EVIDENCE = 10;

/**
 * Best / worst by rate, and where the at-risk learners are. At-risk = learners
 * under the risk threshold (75%) with at least 3 counted marks in the period.
 */
export function RankingPanel({
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
  const [dim, setDim] = useState<D>('department');
  const rows = useMemo(() => (data ? groupBy(data, dim, filter) : []), [data, dim, filter]);
  const { best, worst } = useMemo(() => rank(rows, 5, MIN_EVIDENCE), [rows]);
  const atRisk = useMemo(
    () => [...rows].filter((r) => r.atRisk > 0).sort((a, b) => b.atRisk - a.atRisk || a.label.localeCompare(b.label)).slice(0, 8),
    [rows],
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Ranking and at-risk learners</CardTitle>
          <CardDescription>
            Groups with fewer than {MIN_EVIDENCE} counted marks are not ranked. Click a bar to filter.
          </CardDescription>
        </div>
        <ToggleGroup type="single" size="sm" variant="outline" value={dim} onValueChange={(v) => v && setDim(v as D)}>
          <ToggleGroupItem value="institution">Institution</ToggleGroupItem>
          <ToggleGroupItem value="department">Department</ToggleGroupItem>
          <ToggleGroupItem value="block">Block</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nothing marked for this selection.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <MiniBars title="Best attendance" rows={best} metric="pct" onSelect={(k) => onSelect(dim, k)} />
            <MiniBars title="Lowest attendance" rows={worst} metric="pct" onSelect={(k) => onSelect(dim, k)} />
            <MiniBars title="At-risk learners" rows={atRisk} metric="atRisk" onSelect={(k) => onSelect(dim, k)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniBars({
  title,
  rows,
  metric,
  onSelect,
}: {
  title: string;
  rows: GroupRow[];
  metric: 'pct' | 'atRisk';
  onSelect: (key: string) => void;
}) {
  const viz = useVizPalette();
  const data = rows.map((r) => ({
    key: r.key,
    label: r.label,
    value: metric === 'pct' ? r.pct ?? 0 : r.atRisk,
    pct: r.pct,
    denom: r.denom,
    atRisk: r.atRisk,
    learners: r.learners,
  }));
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">{title}</h4>
      {data.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          {metric === 'atRisk' ? 'No at-risk learners.' : 'Not enough marks to rank.'}
        </p>
      ) : (
        <div style={{ height: Math.max(120, data.length * 34 + 24) }} role="img" aria-label={title}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} {...GRID} />
              <XAxis
                type="number"
                domain={metric === 'pct' ? [0, 100] : [0, 'dataMax']}
                allowDecimals={false}
                {...AXIS}
                unit={metric === 'pct' ? '%' : undefined}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={110}
                {...AXIS}
                tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof data)[number];
                  return (
                    <div style={TOOLTIP_STYLE} className="space-y-0.5 px-3 py-2">
                      <p className="font-medium">{d.label}</p>
                      <p>Rate {formatPct(d.pct)} ({formatInt(d.denom)} counted)</p>
                      <p>
                        At risk {formatInt(d.atRisk)} of {formatInt(d.learners)} learners
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="value"
                cursor="pointer"
                radius={[0, 3, 3, 0]}
                onClick={(e: { payload?: { key?: string } }) => e?.payload?.key && onSelect(e.payload.key)}
              >
                {data.map((d) => (
                  <Cell key={d.key} fill={metric === 'pct' ? viz.rateFill(d.pct) : viz.seriesColor(1)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
