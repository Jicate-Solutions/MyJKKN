'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { trendBy, type CubeFilter } from '@/lib/campus-living/attendance-cube';
import type { AttendanceBreakdown } from '@/types/campus-living/attendance-analytics';
import { AXIS, formatPct, GRID, shortDate, TOOLTIP_STYLE, useVizPalette } from './palette';

type D = 'institution' | 'department';

/**
 * Attendance rate over time, one line per institution (or department). Click a
 * legend entry to hide/show that line. A bucket where nothing was counted is a gap
 * in the line, never a plotted zero. Ranges over 31 days are bucketed by week.
 */
export function TrendPanel({
  data,
  filter,
  isLoading,
}: {
  data: AttendanceBreakdown | undefined;
  filter: CubeFilter;
  isLoading: boolean;
}) {
  const viz = useVizPalette();
  const [dim, setDim] = useState<D>('institution');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const trend = useMemo(() => (data ? trendBy(data, dim, filter) : null), [data, dim, filter]);
  const weekly = !!data && trend !== null && trend.buckets.length > 0 && data.range.from !== data.range.to &&
    (Date.parse(data.range.to) - Date.parse(data.range.from)) / 86_400_000 + 1 > 31;

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Attendance trend</CardTitle>
          <CardDescription>
            Rate by {dim}{weekly ? ', per week (week starting Monday)' : ', per day'}. Click a legend entry to hide a line.
          </CardDescription>
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={dim}
          onValueChange={(v) => {
            if (v) {
              setDim(v as D);
              setHidden(new Set());
            }
          }}
        >
          <ToggleGroupItem value="institution">Institution</ToggleGroupItem>
          <ToggleGroupItem value="department">Department</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {isLoading || !trend ? (
          <Skeleton className="h-[260px] w-full sm:h-[320px]" />
        ) : trend.points.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Nothing marked for this selection.</p>
        ) : (
          <div className="h-[260px] w-full sm:h-[320px]" role="img" aria-label="Attendance rate trend">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend.points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis
                  dataKey="bucket"
                  {...AXIS}
                  minTickGap={16}
                  tickFormatter={(v: string) => shortDate(v)}
                />
                <YAxis domain={[0, 100]} {...AXIS} unit="%" />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(v: string) => (weekly ? `Week of ${v}` : v)}
                  formatter={(value: number | null, name: string) => [formatPct(value), name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', cursor: 'pointer' }}
                  onClick={(e) => {
                    const key = (e as { dataKey?: string }).dataKey;
                    if (key) toggle(key);
                  }}
                />
                {trend.series.map((s, i) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={viz.seriesColor(i)}
                    strokeWidth={2}
                    dot={trend.points.length <= 14}
                    connectNulls={false}
                    hide={hidden.has(s.key)}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
