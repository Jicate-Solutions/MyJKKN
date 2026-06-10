'use client';

/**
 * Fans + unique-impressions growth line chart (contract F1).
 *
 * GET /api/social/facebook/insights/growth?page_id&days
 *   data: { series: [{ date, fans, followers, impressions_unique,
 *                      post_engagements }], fans_now, fans_gained }
 *
 * RECHARTS RULES (production memory — a phantom-data bug shipped once):
 *  - connectNulls={false} ALWAYS
 *  - never forward-fill missing values
 *  - data only spans dates that actually have snapshots (rows where every
 *    plotted series is null are dropped; partial nulls stay null → gaps)
 */

import { useQuery } from '@tanstack/react-query';
import { parseISO, format } from 'date-fns';
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
import { Alert, AlertDescription } from '@/components/ui/alert';

// ─── Contract types (F1) ────────────────────────────────────────────────────

interface GrowthPoint {
  date: string;
  fans: number | null;
  followers: number | null;
  impressions_unique: number | null;
  post_engagements: number | null;
}

interface GrowthData {
  series: GrowthPoint[];
  fans_now: number;
  fans_gained: number;
}

async function getInsights<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: string }
    | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Component ──────────────────────────────────────────────────────────────

interface FbGrowthChartProps {
  pageId: string;
  days: number;
}

export function FbGrowthChart({ pageId, days }: FbGrowthChartProps) {
  const { data, isLoading, isError, error } = useQuery<GrowthData, Error>({
    // Same key as FbInsightTiles → React Query dedupes into one network call.
    queryKey: ['fb-insights-growth', pageId, days],
    queryFn: () =>
      getInsights<GrowthData>(
        `/api/social/facebook/insights/growth?page_id=${encodeURIComponent(pageId)}&days=${days}`
      ),
    staleTime: 60_000,
    retry: 1,
  });

  // Only keep dates that actually have at least one plotted snapshot value —
  // never synthesize or forward-fill points.
  const chartData = (data?.series ?? [])
    .filter((p) => p.fans != null || p.impressions_unique != null)
    .map((p) => ({
      date: format(parseISO(p.date), 'MMM d'),
      fans: p.fans,
      impressions_unique: p.impressions_unique,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Growth — Fans &amp; Unique Impressions (last {days} days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[260px] w-full rounded-lg" />
        ) : isError ? (
          <Alert variant="destructive">
            <AlertDescription>Failed to load growth series: {error.message}</AlertDescription>
          </Alert>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No snapshots in this window yet. Data will populate after the next poll cycle.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => fmt(v as number)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => fmt(v as number)}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  value != null ? value.toLocaleString() : '—',
                  name,
                ]}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="fans"
                name="Fans"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="impressions_unique"
                name="Unique Impressions"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
