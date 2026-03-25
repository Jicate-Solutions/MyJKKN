/**
 * Attendance Trend Chart Component
 * Created: 2025-12-29
 * Description: Line chart showing attendance percentage over time
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { TrendData } from '@/types/student-attendance';
import { TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface AttendanceTrendChartProps {
  data: TrendData[];
}

export function AttendanceTrendChart({ data }: AttendanceTrendChartProps) {
  // Format data for chart
  const chartData = data.map(item => ({
    date: format(parseISO(item.date), 'MMM dd'),
    percentage: item.percentage
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Attendance Trend (Last 30 Days)
        </CardTitle>
        <CardDescription>
          Daily attendance percentage over the last 30 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              tickLine={false}
              label={{ value: 'Attendance %', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.5rem',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            {/* Reference line for 75% threshold */}
            <ReferenceLine
              y={75}
              stroke="hsl(var(--destructive))"
              strokeDasharray="3 3"
              label={{ value: 'Required 75%', position: 'right', fill: 'hsl(var(--destructive))' }}
            />
            <Line
              type="monotone"
              dataKey="percentage"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))' }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
