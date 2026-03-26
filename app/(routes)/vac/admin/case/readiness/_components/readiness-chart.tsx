'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts';
import type { CaseGraduationReadiness } from '@/types/case';

interface ReadinessChartProps {
  data: CaseGraduationReadiness[];
}

function getBarColor(percentage: number): string {
  if (percentage >= 80) return '#0b6d41'; // JKKN Green
  if (percentage >= 50) return '#f59e0b'; // Amber
  return '#ef4444'; // Red
}

// Deduplicate by institution_name — take the max readiness per institution
function aggregateByInstitution(data: CaseGraduationReadiness[]) {
  const map = new Map<string, number>();
  for (const row of data) {
    const existing = map.get(row.institution_name) ?? 0;
    if (row.readiness_percentage > existing) {
      map.set(row.institution_name, row.readiness_percentage);
    }
  }
  return Array.from(map.entries()).map(([name, pct]) => ({
    institution: name.length > 18 ? name.slice(0, 16) + '…' : name,
    fullName: name,
    readiness: Math.round(pct)
  }));
}

interface TooltipPayload {
  value: number;
  payload: { fullName: string };
}

function CustomTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
      <p className="font-medium">{item.payload.fullName}</p>
      <p className="text-muted-foreground">Readiness: <span className="font-bold text-foreground">{item.value}%</span></p>
    </div>
  );
}

export function ReadinessChart({ data }: ReadinessChartProps) {
  const chartData = aggregateByInstitution(data);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        No readiness data available yet.
      </div>
    );
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 16, left: 0, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="institution"
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
          <Bar dataKey="readiness" radius={[4, 4, 0, 0]} maxBarSize={64}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.readiness)} />
            ))}
            <LabelList
              dataKey="readiness"
              position="top"
              formatter={(v: number) => `${v}%`}
              style={{ fontSize: 11, fill: 'hsl(var(--foreground))', fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex items-center gap-4 justify-center mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#0b6d41' }} /> Ready (&ge;80%)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#f59e0b' }} /> In Progress (50–79%)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#ef4444' }} /> Behind (&lt;50%)</span>
      </div>
    </div>
  );
}
