'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DOW_LABELS } from './format';
import type { AttendanceWeekdayRow } from '@/types/campus-living/attendance-analytics';

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  color: 'hsl(var(--popover-foreground))',
  fontSize: '12px',
} as const;

/**
 * Attendance by day of week — replaces the old dashed "weekday vs weekend"
 * placeholder. This is the only one of the three placeholders the data can
 * support: the check-in-time histogram needed check_in_time and the curfew
 * panel needed is_curfew_violation, and both columns are empty on every row.
 */
export function WeekdayChart({
  rows,
  isLoading,
}: {
  rows: AttendanceWeekdayRow[];
  isLoading: boolean;
}) {
  const data = rows.map((r) => ({
    day: DOW_LABELS[r.dow] ?? String(r.dow),
    isWeekend: r.dow === 0 || r.dow === 6,
    'Attendance %': r.attendance_pct ?? 0,
    marks: r.marks,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">By day of week</CardTitle>
        <CardDescription>Weekends highlighted. Averaged across the selected range.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : data.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No data in this range.</p>
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} unit="%" />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="Attendance %" radius={[4, 4, 0, 0]}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.isWeekend ? '#f59e0b' : 'hsl(var(--primary))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
