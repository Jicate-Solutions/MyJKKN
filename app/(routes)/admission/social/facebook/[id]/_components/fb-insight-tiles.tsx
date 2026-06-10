'use client';

/**
 * Insight KPI tiles for the Facebook page drilldown.
 *
 * Source (read-only, locked API contract):
 *  - F1 GET /api/social/facebook/insights/growth?page_id&days
 *      data: { series: [{ date, fans, followers, impressions_unique,
 *                         post_engagements }], fans_now, fans_gained }
 *
 * Tiles: Fans (+ fans_gained sub-line), Followers, Impressions (unique),
 * Post Engagements — each from the latest non-null point in the F1 series
 * (fans falls back to the contract's fans_now).
 *
 * NOTE: a "Page Views" tile was considered but the locked F1 contract does
 * not expose page_views, so it is intentionally omitted rather than rendered
 * as a permanently-empty tile.
 */

import { useQuery } from '@tanstack/react-query';
import { Users, UserPlus, Eye, ThumbsUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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

// ─── Envelope-aware fetch (locked: { success, data } / { success, error }) ──

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/** Latest non-null value of a field, scanning the series newest-first. */
function latestNonNull(
  series: GrowthPoint[] | undefined,
  field: keyof Omit<GrowthPoint, 'date'>
): number | null {
  if (!series || series.length === 0) return null;
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i][field];
    if (v != null) return v;
  }
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface FbInsightTilesProps {
  pageId: string;
  days: number;
}

export function FbInsightTiles({ pageId, days }: FbInsightTilesProps) {
  const { data, isLoading, isError, error } = useQuery<GrowthData, Error>({
    // Same key as FbGrowthChart → React Query dedupes into one network call.
    queryKey: ['fb-insights-growth', pageId, days],
    queryFn: () =>
      getInsights<GrowthData>(
        `/api/social/facebook/insights/growth?page_id=${encodeURIComponent(pageId)}&days=${days}`
      ),
    staleTime: 60_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load insight KPIs: {error.message}</AlertDescription>
      </Alert>
    );
  }

  const series = data?.series;
  const fans = data?.fans_now ?? latestNonNull(series, 'fans');
  const followers = latestNonNull(series, 'followers');
  const impressionsUnique = latestNonNull(series, 'impressions_unique');
  const postEngagements = latestNonNull(series, 'post_engagements');

  const tiles: { label: string; icon: LucideIcon; value: string; sub?: string }[] = [
    {
      label: 'Fans',
      icon: Users,
      value: fmt(fans),
      sub:
        data != null
          ? `${data.fans_gained >= 0 ? '+' : ''}${data.fans_gained.toLocaleString()} in ${days}d`
          : undefined,
    },
    { label: 'Followers', icon: UserPlus, value: fmt(followers) },
    { label: 'Impressions (unique)', icon: Eye, value: fmt(impressionsUnique) },
    { label: 'Post Engagements', icon: ThumbsUp, value: fmt(postEngagements) },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <tile.icon className="h-3.5 w-3.5" /> {tile.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 px-4">
            <p className="text-2xl font-bold tabular-nums">{tile.value}</p>
            {tile.sub && <p className="text-xs text-muted-foreground mt-0.5">{tile.sub}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
