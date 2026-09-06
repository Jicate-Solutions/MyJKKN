'use client';

/**
 * Insight KPI tiles for the Instagram account drilldown.
 *
 * Sources (read-only, locked API contracts):
 *  - C1 GET /api/social/instagram/insights/growth?account_id&days
 *      → followers_now, latest reach / impressions / profile_views
 *  - C7 GET /api/social/instagram/insights/summary?days
 *      → engagement_rate for this account (total_interactions/followers*100,
 *        computed server-side from the latest snapshot)
 *  - Detail route payload (passed in via props) → Following, Posts, and the
 *    optional accounts_engaged / total_interactions fields if/when the
 *    detail route starts exposing them.
 *
 * Each query fails independently — a failing endpoint degrades its tiles
 * to '—' instead of blanking the section.
 */

import { useQuery } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Image as ImageIcon,
  Eye,
  BarChart3,
  MousePointerClick,
  HeartHandshake,
  Percent,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ─── Contract types ─────────────────────────────────────────────────────────

interface GrowthPoint {
  date: string;
  followers: number | null;
  reach: number | null;
  impressions: number | null;
  profile_views: number | null;
}

interface GrowthData {
  series: GrowthPoint[];
  followers_now: number;
  followers_gained: number;
}

interface SummaryAccount {
  id: string;
  username: string;
  institution_name: string;
  followers: number;
  followers_gained: number;
  reach: number;
  impressions: number;
  engagement_rate: number | null;
}

interface SummaryData {
  accounts: SummaryAccount[];
  totals: { followers: number; reach: number; impressions: number; posts: number };
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

interface InsightTilesProps {
  accountId: string;
  days: number;
  /** From the existing detail route payload (may be null while loading). */
  followingCount?: number | null;
  postsCount?: number | null;
  /** Optional — only present if the detail route exposes the new snapshot columns. */
  accountsEngaged?: number | null;
  totalInteractions?: number | null;
}

export function InsightTiles({
  accountId,
  days,
  followingCount,
  postsCount,
  accountsEngaged,
  totalInteractions,
}: InsightTilesProps) {
  const growth = useQuery<GrowthData, Error>({
    queryKey: ['ig-insights-growth', accountId, days],
    queryFn: () =>
      getInsights<GrowthData>(
        `/api/social/instagram/insights/growth?account_id=${encodeURIComponent(accountId)}&days=${days}`
      ),
    staleTime: 60_000,
    retry: 1,
  });

  const summary = useQuery<SummaryData, Error>({
    queryKey: ['ig-insights-summary', days],
    queryFn: () => getInsights<SummaryData>(`/api/social/instagram/insights/summary?days=${days}`),
    staleTime: 60_000,
    retry: 1,
  });

  if (growth.isLoading && summary.isLoading) {
    return (
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (growth.isError && summary.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load insight KPIs: {growth.error?.message ?? summary.error?.message}
        </AlertDescription>
      </Alert>
    );
  }

  const series = growth.data?.series;
  const summaryRow = summary.data?.accounts.find((a) => a.id === accountId) ?? null;

  const followers = growth.data?.followers_now ?? summaryRow?.followers ?? null;
  const reach = latestNonNull(series, 'reach') ?? summaryRow?.reach ?? null;
  const impressions = latestNonNull(series, 'impressions') ?? summaryRow?.impressions ?? null;
  const profileViews = latestNonNull(series, 'profile_views');

  // Engagement rate: prefer computing total_interactions/followers*100 from the
  // detail payload when available; fall back to the server-computed C7 value.
  let engagementRate: number | null = null;
  if (totalInteractions != null && followers != null && followers > 0) {
    engagementRate = Math.round((totalInteractions / followers) * 100 * 100) / 100;
  } else if (summaryRow?.engagement_rate != null) {
    engagementRate = summaryRow.engagement_rate;
  }

  const tiles: { label: string; icon: LucideIcon; value: string; sub?: string }[] = [
    {
      label: 'Followers',
      icon: Users,
      value: fmt(followers),
      sub:
        growth.data != null
          ? `${growth.data.followers_gained >= 0 ? '+' : ''}${growth.data.followers_gained.toLocaleString()} in ${days}d`
          : undefined,
    },
    { label: 'Following', icon: UserPlus, value: fmt(followingCount) },
    { label: 'Posts', icon: ImageIcon, value: fmt(postsCount) },
    { label: 'Reach', icon: Eye, value: fmt(reach) },
    { label: 'Impressions', icon: BarChart3, value: fmt(impressions) },
    { label: 'Profile Views', icon: MousePointerClick, value: fmt(profileViews) },
    { label: 'Accounts Engaged', icon: HeartHandshake, value: fmt(accountsEngaged) },
    {
      label: 'Engagement Rate',
      icon: Percent,
      value: engagementRate != null ? `${engagementRate.toFixed(2)}%` : '—',
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
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
