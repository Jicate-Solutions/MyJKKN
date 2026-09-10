'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { shortDate } from '../../_components/format';
import type { AttendanceDay } from '@/types/campus-living/attendance-analytics';

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  color: 'hsl(var(--popover-foreground))',
  fontSize: '12px',
} as const;

/**
 * Cumulative series. A module-scope helper with its own locals: the running
 * counters are genuine loop state, and mutating render-scope variables from
 * inside a .map callback trips react-hooks/immutability.
 */
function buildRunningSeries(days: AttendanceDay[]) {
  const out: Array<{ date: string; 'Running %': number | null }> = [];
  let present = 0;
  let denom = 0;
  for (const d of days) {
    if (d.status === 'present' || d.status === 'late_entry') present += 1;
    if (d.status !== 'on_leave' && d.status !== 'medical') denom += 1;
    out.push({
      date: shortDate(d.date),
      'Running %': denom > 0 ? Math.round((present / denom) * 1000) / 10 : null,
    });
  }
  return out;
}

/**
 * Running attendance percentage over the range — does this learner's record
 * improve or decay?
 *
 * Computed cumulatively over marked days using the same rule as everywhere
 * else: present + late_entry over days that are not leave or medical.
 */
export function LearnerTrend({ days, isLoading }: { days: AttendanceDay[]; isLoading: boolean }) {
  const data = useMemo(() => buildRunningSeries(days), [days]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Running attendance</CardTitle>
        <CardDescription>
          Cumulative percentage across the range — shows whether the record is
          recovering or decaying.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : data.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">
            No attendance marked in this range.
          </p>
        ) : (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} unit="%" />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="Running %"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
