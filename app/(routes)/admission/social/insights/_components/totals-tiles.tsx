'use client';

import { Users, Eye, BarChart3, Image as ImageIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';

export interface InsightsTotals {
  followers: number;
  reach: number;
  impressions: number;
  posts: number;
}

interface TotalsTilesProps {
  totals: InsightsTotals | null;
  isLoading: boolean;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
}

/**
 * Group-wide Instagram totals (C7 `totals`): Followers, Reach,
 * Impressions, Posts across all visible accounts for the selected window.
 * Renders zeros gracefully — metrics accumulate from the enriched poller's
 * first run, so all-zero tiles are an expected early state, not an error.
 */
export function TotalsTiles({ totals, isLoading }: TotalsTilesProps) {
  const tiles = [
    { label: 'Followers', value: totals?.followers, icon: Users },
    { label: 'Reach', value: totals?.reach, icon: Eye },
    { label: 'Impressions', value: totals?.impressions, icon: BarChart3 },
    { label: 'Posts', value: totals?.posts, icon: ImageIcon },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {isLoading
        ? Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-16" />
              </CardContent>
            </Card>
          ))
        : tiles.map((t) => (
            <Card key={t.label}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold tabular-nums">
                  {formatNumber(t.value)}
                </div>
              </CardContent>
            </Card>
          ))}
    </div>
  );
}
