'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  CartesianGrid,
} from 'recharts';
import type { FacilitatorAttendanceStat } from '@/types/attendance';

interface Props {
  facilitators: FacilitatorAttendanceStat[];
}

const chartConfig = {
  periodsMarked: { label: 'Periods Marked', color: 'hsl(var(--chart-1))' },
};

export function FacilitatorBarChart({ facilitators }: Props) {
  // Show top 10 for readability — fewer bars = more space per label
  const data = facilitators.slice(0, 10).map((f) => ({
    name: `${f.firstName} ${f.lastName}`,
    shortName: f.lastName
      ? `${f.firstName} ${f.lastName.charAt(0)}.`
      : f.firstName,
    periodsMarked: f.periodsMarked,
  }));

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base">Periods Marked per Facilitator</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data for selected filters
        </CardContent>
      </Card>
    );
  }

  // Dynamic height: 36px per bar ensures labels don't overlap
  const chartHeight = Math.max(200, data.length * 36);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm sm:text-base">Periods Marked per Facilitator</CardTitle>
        <p className="text-[10px] sm:text-xs text-muted-foreground">Top {data.length} by periods marked</p>
      </CardHeader>
      <CardContent className="px-1 sm:px-4">
        <ChartContainer config={chartConfig} className="w-full" style={{ height: chartHeight }}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-muted/50" />
            <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} />
            <YAxis
              dataKey="shortName"
              type="category"
              width={100}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip
              content={<ChartTooltipContent />}
              cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
            />
            <Bar dataKey="periodsMarked" radius={[0, 6, 6, 0]} maxBarSize={24} barSize={20}>
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={`hsl(${142 + i * 8}, 60%, ${45 + (i % 3) * 5}%)`}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
