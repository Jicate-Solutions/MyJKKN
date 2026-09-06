'use client';

import { useMemo } from 'react';
import { AlertTriangle, Camera } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useBedEconTrend } from '@/hooks/campus-living/use-bed-economics';
import { formatDate } from './format';

/**
 * Occupancy trend chart (spec §8 item 6, U4). One line per block, plotting bed
 * occupancy % over the snapshot history.
 *
 * connectNulls={false} + per-series presence (a block contributes a point ONLY
 * on dates it actually has a snapshot) avoids the Recharts forward-fill phantom
 * extension flagged in the 2026-06-03 admission-trajectory incident: a series
 * must never draw a flat line across dates it has no data for.
 *
 * Until the daily snapshot cron has run at least once there are no rows — the
 * card then renders an explainer rather than an empty axis.
 */

type Props = {
  hostelYearId: string | undefined;
  institutionId: string | undefined;
};

// Stable palette for up to ~8 blocks.
const SERIES_COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#9333ea', // purple
  '#dc2626', // red
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
];

export function TrendChart({ hostelYearId, institutionId }: Props) {
  const { data, isLoading, error } = useBedEconTrend(hostelYearId, institutionId);

  const { chartData, blocks, recordingSince } = useMemo(() => {
    const rows = data ?? [];
    if (rows.length === 0) {
      return { chartData: [], blocks: [] as { id: string; name: string }[], recordingSince: null as string | null };
    }

    // Unique blocks (series).
    const blockMap = new Map<string, string>();
    for (const r of rows) blockMap.set(r.block_id, r.block_name);
    const blockList = Array.from(blockMap, ([id, name]) => ({ id, name }));

    // Pivot: one object per snapshot_date, occupancy % keyed by block_id.
    // A block contributes a key only on dates it has a row — leaving the key
    // undefined on other dates so connectNulls={false} can break the line.
    const byDate = new Map<string, Record<string, number | string>>();
    let earliest: string | null = null;
    for (const r of rows) {
      if (!earliest || r.snapshot_date < earliest) earliest = r.snapshot_date;
      const entry = byDate.get(r.snapshot_date) ?? { date: r.snapshot_date };
      // When a block has no sellable beds on a date, occupancy % is undefined
      // (not 0%). Omit the key so connectNulls={false} breaks the line into a
      // gap rather than dropping it to a misleading real-looking 0%.
      if (r.beds_sellable > 0) {
        entry[r.block_id] = Math.round((r.beds_occupied / r.beds_sellable) * 1000) / 10;
      }
      byDate.set(r.snapshot_date, entry);
    }

    const sorted = Array.from(byDate.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );

    return { chartData: sorted, blocks: blockList, recordingSince: earliest };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Occupancy trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load occupancy trend</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  // No snapshots yet — explainer card.
  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Occupancy trend</CardTitle>
          <CardDescription>Bed occupancy % over time, per block.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-muted/40 px-6 text-center">
            <Camera className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Trend not recording yet</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                A daily snapshot of occupancy is taken at 01:30 each night. The
                chart fills in from the first snapshot — deploy date forward.
                Nothing has been recorded for this scope yet.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Occupancy trend</CardTitle>
        <CardDescription>
          Bed occupancy % per block · recording since {formatDate(recordingSince)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              className="text-xs"
              tickFormatter={(d: string) => formatDate(d).replace(/ \d{4}$/, '')}
              minTickGap={24}
            />
            <YAxis
              className="text-xs"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              width={44}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                color: 'hsl(var(--popover-foreground))',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => [`${value}%`, name]}
              labelFormatter={(d: string) => formatDate(d)}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            {blocks.map((b, i) => (
              <Line
                key={b.id}
                type="monotone"
                dataKey={b.id}
                name={b.name}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
