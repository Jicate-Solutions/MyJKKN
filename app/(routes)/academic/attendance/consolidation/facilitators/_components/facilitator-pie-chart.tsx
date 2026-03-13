'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { PieChart, Pie, Cell } from 'recharts';
import type { FacilitatorDepartmentBreakdown } from '@/types/attendance';

interface Props {
  departmentBreakdown: FacilitatorDepartmentBreakdown[];
}

const COLORS = [
  'hsl(142, 60%, 45%)',
  'hsl(210, 70%, 55%)',
  'hsl(260, 60%, 55%)',
  'hsl(35, 80%, 55%)',
  'hsl(0, 65%, 55%)',
  'hsl(180, 55%, 45%)',
];

export function FacilitatorPieChart({ departmentBreakdown }: Props) {
  const data = departmentBreakdown.map((d) => ({
    name: d.departmentName,
    value: d.totalMarked,
  }));

  const chartConfig = Object.fromEntries(
    data.map((d, i) => [
      d.name,
      { label: d.name, color: COLORS[i % COLORS.length] },
    ])
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base">Periods by Department</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-40 sm:h-48 text-muted-foreground text-xs sm:text-sm">
          No data for selected filters
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm sm:text-base">Periods by Department</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={chartConfig} className="h-[250px] sm:h-[300px] w-full">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="45%"
              innerRadius="40%"
              outerRadius="65%"
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
            <ChartLegend content={<ChartLegendContent nameKey="name" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
