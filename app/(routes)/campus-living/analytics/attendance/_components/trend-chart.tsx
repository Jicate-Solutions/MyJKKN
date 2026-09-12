'use client';

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { shortDate } from './format';
import type { AttendanceTrendPoint } from '@/types/campus-living/attendance-analytics';

/** Recharts tooltip styling used across the campus-living analytics pages. */
const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  color: 'hsl(var(--popover-foreground))',
  fontSize: '12px',
} as const;

export function AttendanceTrendChart({
  trend,
  isLoading,
}: {
  trend: AttendanceTrendPoint[];
  isLoading: boolean;
}) {
  const data = trend.map((p) => ({
    date: shortDate(p.date),
    'Attendance %': p.attendance_pct,
    Present: p.present,
    Absent: p.absent,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Daily attendance</CardTitle>
        <CardDescription>
          Percentage present of learners marked that day. Days nobody marked are
          simply missing from the line rather than plotted as zero.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : data.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No attendance marked in this range.
          </p>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis yAxisId="pct" domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} unit="%" />
                <YAxis yAxisId="count" orientation="right" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="Attendance %"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  // Keep real gaps as gaps instead of bridging a straight line
                  // across days that were never marked.
                  connectNulls={false}
                />
                <Line yAxisId="count" type="monotone" dataKey="Present" stroke="#10b981" strokeWidth={1} dot={false} />
                <Line yAxisId="count" type="monotone" dataKey="Absent" stroke="#f43f5e" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
