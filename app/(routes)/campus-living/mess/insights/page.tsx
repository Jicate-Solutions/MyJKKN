'use client';

// ============================================================================
// /campus-living/mess/insights — Chairperson insights dashboard (relocated from /admin/mess 2026-06-01)
// ============================================================================
// Aggregates from mess_meal_ratings via fn_get_popular_items + raw
// rated_at rows for activity-by-day. Per Director lock 2026-05-26: not
// binding voting — chairperson uses ratings as INPUT to menu decisions.
//
// Shows:
//   - Top 20 most-loved items (avg_rating DESC, min 5 ratings)
//   - Top 20 least-loved items (avg_rating ASC, min 5 ratings)
//   - Activity by day (last N days, configurable)
//   - Activity by week (rolled up from daily)
//   - Time-range filter: 7d / 30d / 90d
//
// Super-admin only (parity with rest of /admin/mess).
// ============================================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  ChevronLeft,
  Loader2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import {
  usePopularItems,
  useRatingActivity,
} from '@/hooks/campus-living/use-mess-ratings';
import type { PopularItem } from '@/types/campus-living';
import { DishDemandCard } from './_components/dish-demand-card';
import { SpecialDayCard } from './_components/special-day-card';

export const navMeta = { label: 'Mess Rating Insights', icon: 'BarChart3' } as const;

const MIN_RATINGS_FOR_RANKING = 5;
const TOP_N = 20;

type RangeKey = '7d' | '30d' | '90d';
const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };

function sortMostLoved(items: PopularItem[]): PopularItem[] {
  return items
    .filter((i) => Number(i.total_ratings) >= MIN_RATINGS_FOR_RANKING)
    .sort((a, b) => {
      if (b.avg_rating !== a.avg_rating) return Number(b.avg_rating) - Number(a.avg_rating);
      return Number(b.total_ratings) - Number(a.total_ratings);
    })
    .slice(0, TOP_N);
}

function sortLeastLoved(items: PopularItem[]): PopularItem[] {
  return items
    .filter((i) => Number(i.total_ratings) >= MIN_RATINGS_FOR_RANKING)
    .sort((a, b) => {
      if (a.avg_rating !== b.avg_rating) return Number(a.avg_rating) - Number(b.avg_rating);
      return Number(b.total_ratings) - Number(a.total_ratings);
    })
    .slice(0, TOP_N);
}

function rollupByWeek(
  daily: { day: string; total: number }[],
): { week: string; total: number }[] {
  const buckets = new Map<string, number>();
  for (const row of daily) {
    // ISO week-start (Monday) for the row's date.
    const d = new Date(row.day + 'T00:00:00Z');
    const dow = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    d.setUTCDate(d.getUTCDate() - dow);
    const wk = d.toISOString().slice(0, 10);
    buckets.set(wk, (buckets.get(wk) ?? 0) + row.total);
  }
  return Array.from(buckets.entries())
    .map(([week, total]) => ({ week, total }))
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));
}

export default function MessInsightsPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const [range, setRange] = useState<RangeKey>('30d');
  const daysBack = RANGE_DAYS[range];

  const { data: items, isLoading: itemsLoading } = usePopularItems(institutionId, daysBack);
  const { data: activity, isLoading: activityLoading } = useRatingActivity(
    institutionId,
    daysBack,
  );

  const mostLoved = useMemo(() => sortMostLoved(items ?? []), [items]);
  const leastLoved = useMemo(() => sortLeastLoved(items ?? []), [items]);
  const weekly = useMemo(() => rollupByWeek(activity ?? []), [activity]);

  const totalRatings = useMemo(
    () => (items ?? []).reduce((sum, i) => sum + Number(i.total_ratings), 0),
    [items],
  );

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout>
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout>
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/campus-living/mess"
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Mess Rating Insights
              </h1>
              <p className="text-sm text-muted-foreground">
                Premium-Plus per-item ratings — input for chairperson menu
                decisions. Not binding.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Time range</label>
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </header>

        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total ratings</CardDescription>
              <CardTitle className="text-3xl">
                {itemsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : totalRatings}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Across {(items ?? []).length} distinct items.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Items ranked</CardDescription>
              <CardTitle className="text-3xl">
                {itemsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : mostLoved.length + leastLoved.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Min {MIN_RATINGS_FOR_RANKING} ratings each. Items below that are
              hidden until they hit threshold.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active weeks</CardDescription>
              <CardTitle className="text-3xl">
                {activityLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : weekly.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Weeks within range that had at least one rating.
            </CardContent>
          </Card>
        </div>

        {/* Choose Your Menu — dish demand + return-arc (Mode B) */}
        <DishDemandCard />

        {/* Choose Your Menu — special days propose + review (Mode C) */}
        <SpecialDayCard />

        {/* Most loved */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ThumbsUp className="h-5 w-5 text-emerald-600" />
              Most loved items
            </CardTitle>
            <CardDescription>
              Top {TOP_N} by average rating (5★ best). Minimum{' '}
              {MIN_RATINGS_FOR_RANKING} ratings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {itemsLoading ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : mostLoved.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No items yet meet the {MIN_RATINGS_FOR_RANKING}-rating minimum
                in this window. Premium-Plus residents need to rate more.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Avg ★</TableHead>
                    <TableHead className="text-right">Ratings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mostLoved.map((i, idx) => (
                    <TableRow key={i.item_text}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{i.item_text}</TableCell>
                      <TableCell>
                        {i.category ? (
                          <Badge variant="secondary">{i.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(i.avg_rating).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(i.total_ratings)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Least loved */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ThumbsDown className="h-5 w-5 text-red-600" />
              Least loved items
            </CardTitle>
            <CardDescription>
              Bottom {TOP_N} by average rating. Useful for menu-review and
              caterer feedback. Minimum {MIN_RATINGS_FOR_RANKING} ratings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {itemsLoading ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : leastLoved.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No items yet meet the {MIN_RATINGS_FOR_RANKING}-rating minimum
                in this window.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Avg ★</TableHead>
                    <TableHead className="text-right">Ratings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leastLoved.map((i, idx) => (
                    <TableRow key={i.item_text}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{i.item_text}</TableCell>
                      <TableCell>
                        {i.category ? (
                          <Badge variant="secondary">{i.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(i.avg_rating).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(i.total_ratings)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-blue-600" />
              Rating activity
            </CardTitle>
            <CardDescription>
              How many ratings residents submitted each day / week within the
              selected range.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-2">By day</h3>
              {activityLoading ? (
                <div className="flex justify-center p-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (activity ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No rating activity in this window yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Ratings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(activity ?? []).map((row) => (
                      <TableRow key={row.day}>
                        <TableCell>{row.day}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">By week</h3>
              {activityLoading ? null : weekly.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No rating activity in this window yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Week starting</TableHead>
                      <TableHead className="text-right">Ratings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weekly.map((row) => (
                      <TableRow key={row.week}>
                        <TableCell>{row.week}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
