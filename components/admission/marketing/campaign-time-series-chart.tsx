'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimeSeriesPoint } from '@/types/admission/campaign';

interface Props {
  data: TimeSeriesPoint[] | undefined;
  loading?: boolean;
  metrics?: Array<'clicks' | 'captures' | 'qualified' | 'applied' | 'enrolled'>;
}

const COLORS: Record<string, string> = {
  clicks: 'hsl(var(--chart-1))',
  captures: 'hsl(var(--chart-2))',
  qualified: 'hsl(var(--chart-3))',
  applied: 'hsl(var(--chart-4))',
  enrolled: 'hsl(var(--chart-5))',
};

export function CampaignTimeSeriesChart({
  data,
  loading,
  metrics = ['clicks', 'captures', 'enrolled'],
}: Props) {
  if (loading) {
    return <div className="h-72 animate-pulse rounded bg-muted" />;
  }
  if (!data || data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded border border-dashed">
        <p className="text-sm text-muted-foreground">No data in this range</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={288}>
      <LineChart data={data} margin={{ top: 20, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="bucket_at"
          tickFormatter={(d) => new Date(d).toLocaleDateString()}
        />
        <YAxis />
        <Tooltip labelFormatter={(d) => new Date(d).toLocaleDateString()} />
        <Legend />
        {metrics.map((m) => (
          <Line
            key={m}
            type="monotone"
            dataKey={m}
            stroke={COLORS[m]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
