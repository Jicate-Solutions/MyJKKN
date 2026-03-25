'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { FacilitatorAttendanceStat } from '@/types/attendance';

interface Props {
  facilitators: FacilitatorAttendanceStat[];
}

const LINE_COLORS = [
  'hsl(142, 60%, 45%)',
  'hsl(210, 70%, 55%)',
  'hsl(260, 60%, 55%)',
  'hsl(35, 80%, 55%)',
  'hsl(0, 65%, 55%)',
  'hsl(180, 55%, 45%)',
];

export function FacilitatorTrendChart({ facilitators }: Props) {
  const topFacilitators = facilitators.slice(0, 6);

  const { chartData, chartConfig } = useMemo(() => {
    const allWeeks = new Set<string>();
    topFacilitators.forEach((f) =>
      f.trendData.forEach((t) => allWeeks.add(t.week))
    );
    const sortedWeeks = Array.from(allWeeks).sort();

    const rows = sortedWeeks.map((week) => {
      const row: Record<string, string | number> = {
        week: format(new Date(week), 'MMM d'),
      };
      topFacilitators.forEach((f) => {
        const key = `${f.firstName} ${f.lastName}`;
        const point = f.trendData.find((t) => t.week === week);
        row[key] = point?.count ?? 0;
      });
      return row;
    });

    const config = Object.fromEntries(
      topFacilitators.map((f, i) => [
        `${f.firstName} ${f.lastName}`,
        { label: `${f.firstName} ${f.lastName}`, color: LINE_COLORS[i] },
      ])
    );

    return { chartData: rows, chartConfig: config };
  }, [topFacilitators]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base">Weekly Marking Trend</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-40 sm:h-48 text-muted-foreground text-xs sm:text-sm">
          No trend data for selected filters
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm sm:text-base">Weekly Marking Trend</CardTitle>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          Top {topFacilitators.length} facilitators by period count
        </p>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={chartConfig} className="h-[220px] sm:h-[280px] w-full">
          <LineChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={30} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {topFacilitators.map((f, i) => (
              <Line
                key={f.staffId}
                type="monotone"
                dataKey={`${f.firstName} ${f.lastName}`}
                stroke={LINE_COLORS[i]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
