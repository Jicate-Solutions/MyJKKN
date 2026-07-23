'use client';

/**
 * Post-type mix bar chart (contract F3).
 *
 * GET /api/social/facebook/insights/post-types?page_id&days
 *   data: { types: [{ type, posts, reactions, comments, shares,
 *                     avg_engagement }] }
 *
 * Bars: post count (left axis) + average engagement per post (right axis),
 * grouped by post_type ('(unknown)' for null types, grouped server-side).
 */

import { useQuery } from '@tanstack/react-query';
import { PieChart as PieChartIcon } from 'lucide-react';
import {
  BarChart,
  Bar,
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

// ─── Contract types (F3) ────────────────────────────────────────────────────

interface PostTypeRow {
  type: string;
  posts: number;
  reactions: number;
  comments: number;
  shares: number;
  avg_engagement: number;
}

interface PostTypesData {
  types: PostTypeRow[];
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

// ─── Component ──────────────────────────────────────────────────────────────

interface FbPostTypesChartProps {
  pageId: string;
  days: number;
}

export function FbPostTypesChart({ pageId, days }: FbPostTypesChartProps) {
  const { data, isLoading, isError, error } = useQuery<PostTypesData, Error>({
    queryKey: ['fb-insights-post-types', pageId, days],
    queryFn: () =>
      getInsights<PostTypesData>(
        `/api/social/facebook/insights/post-types?page_id=${encodeURIComponent(pageId)}&days=${days}`
      ),
    staleTime: 60_000,
    retry: 1,
  });

  const chartData = (data?.types ?? []).map((t) => ({
    type: t.type,
    posts: t.posts,
    avg_engagement: t.avg_engagement,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-1.5">
          <PieChartIcon className="h-4 w-4" /> Post Types (last {days} days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full rounded-lg" />
        ) : isError ? (
          <Alert variant="destructive">
            <AlertDescription>Failed to load post types: {error.message}</AlertDescription>
          </Alert>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No posts in this window. Posts data accumulates from 2026-06-10 onward — FB post
            collection was repaired in Wave 1.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="type" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="left"
                dataKey="posts"
                name="Posts"
                fill="#2563eb"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                yAxisId="right"
                dataKey="avg_engagement"
                name="Avg Engagement"
                fill="#8b5cf6"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
