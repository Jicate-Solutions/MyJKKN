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
} from 'recharts';
import type { FacilitatorAttendanceStat } from '@/types/attendance';

interface Props {
  facilitators: FacilitatorAttendanceStat[];
}

const chartConfig = {
  periodsMarked: { label: 'Periods Marked', color: 'hsl(var(--chart-1))' },
};

export function FacilitatorBarChart({ facilitators }: Props) {
  const data = facilitators.slice(0, 20).map((f) => ({
    name: `${f.firstName} ${f.lastName}`,
    periodsMarked: f.periodsMarked,
  }));

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Periods Marked per Facilitator</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data for selected filters
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Periods Marked per Facilitator</CardTitle>
        <p className="text-xs text-muted-foreground">Top {data.length} facilitators</p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis
              dataKey="name"
              type="category"
              width={120}
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="periodsMarked" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={`hsl(${142 + i * 3}, 60%, ${45 + (i % 3) * 5}%)`}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
