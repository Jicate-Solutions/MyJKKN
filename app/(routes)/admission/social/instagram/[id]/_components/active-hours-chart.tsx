'use client';

/**
 * Followers-online-by-hour bar chart (contract C3).
 *
 * GET /api/social/instagram/insights/active-hours?account_id (REQUIRED)
 *   data: { hours: [{ hour: 0-23, value }], updated_at: string | null }
 *
 * Meta reports online_followers in UTC hours. Bars are labelled in UTC;
 * the tooltip shows the IST equivalent (UTC + 5:30) and a caption note
 * spells out the conversion so nobody misreads peak hours.
 */

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Clock } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ─── Contract types ─────────────────────────────────────────────────────────

interface HourPoint {
  hour: number;
  value: number;
}

interface ActiveHoursData {
  hours: HourPoint[];
  updated_at: string | null;
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

/** Convert a UTC hour (0-23) to its IST clock label (UTC + 5:30). */
function istLabel(utcHour: number): string {
  const minutes = (utcHour * 60 + 330) % 1440;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ActiveHoursChartProps {
  accountId: string;
}

export function ActiveHoursChart({ accountId }: ActiveHoursChartProps) {
  const { data, isLoading, isError, error } = useQuery<ActiveHoursData, Error>({
    queryKey: ['ig-insights-active-hours', accountId],
    queryFn: () =>
      getInsights<ActiveHoursData>(
        `/api/social/instagram/insights/active-hours?account_id=${encodeURIComponent(accountId)}`
      ),
    staleTime: 60_000,
    retry: 1,
  });

  const chartData = (data?.hours ?? [])
    .filter((h) => h.hour >= 0 && h.hour <= 23)
    .sort((a, b) => a.hour - b.hour)
    .map((h) => ({
      hour: h.hour,
      label: `${String(h.hour).padStart(2, '0')}`,
      value: h.value,
    }));

  // Meta returns nothing (null or {}) for many accounts; the API then emits 24
  // zero-value hours. An all-zero series is "no data", not a real distribution —
  // rendering it draws empty axes that look broken.
  const hasOnlineData = chartData.some((h) => h.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-1.5">
          <Clock className="h-4 w-4" /> Followers Online by Hour
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[220px] w-full rounded-lg" />
        ) : isError ? (
          <Alert variant="destructive">
            <AlertDescription>Failed to load active hours: {error.message}</AlertDescription>
          </Alert>
        ) : chartData.length === 0 || !hasOnlineData ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Meta has not provided audience-online data for this account.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString(), 'Followers online']}
                  labelFormatter={(label: string) =>
                    `${label}:00 UTC · ${istLabel(Number(label))} IST`
                  }
                  labelStyle={{ fontSize: 12 }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="value" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">
              Hours are UTC as reported by Meta. IST = UTC + 5:30 (e.g., 12:00 UTC = 17:30 IST).
              {data?.updated_at && (
                <>
                  {' '}
                  Updated{' '}
                  {formatDistanceToNow(new Date(data.updated_at), { addSuffix: true })}.
                </>
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
