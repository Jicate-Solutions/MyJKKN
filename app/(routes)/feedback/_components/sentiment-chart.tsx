'use client';

/**
 * SentimentChart — daily sentiment-over-time line chart.
 *
 * Intentionally does NOT use connectNulls (avoids the recharts forward-fill
 * phantom-extension bug documented in project memory). Only buckets with data
 * are rendered; sparse dates produce gaps, not phantom lines.
 */

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { SentimentBucket } from '@/lib/services/feedback/feedback-dashboard-service';

interface SentimentChartProps {
  data: SentimentBucket[];
  isLoading: boolean;
}

const LINES: Array<{ key: keyof SentimentBucket; color: string; label: string }> = [
  { key: 'positive', color: '#16a34a', label: 'Positive' },
  { key: 'neutral', color: '#9ca3af', label: 'Neutral' },
  { key: 'negative', color: '#dc2626', label: 'Negative' },
  { key: 'mixed', color: '#d97706', label: 'Mixed' },
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-sm text-sm">
      <p className="font-medium text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-foreground">
            {p.name}: <span className="font-semibold">{p.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function SentimentChart({ data, isLoading }: SentimentChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Sentiment Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No data in the selected period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                // show only every Nth tick to avoid crowding
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                iconSize={8}
              />
              {LINES.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  name={line.label}
                  stroke={line.color}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                  // connectNulls intentionally omitted — avoids phantom extension bug
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
