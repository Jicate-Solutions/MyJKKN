'use client';

import { Users, Eye, ThumbsUp, Image as ImageIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';

export interface FbInsightsTotals {
  fans: number;
  impressions_unique: number;
  post_engagements: number;
  posts: number;
}

interface FbTotalsTilesProps {
  totals: FbInsightsTotals | null;
  isLoading: boolean;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString();
}

/**
 * Group-wide Facebook totals (F4 `totals`): Fans, Impressions
 * (impressions_unique), Post Engagements, Posts across all visible Pages for
 * the selected window. Renders zeros gracefully — metrics accumulate from the
 * poller's first run, so all-zero tiles are an expected early state, not an
 * error. Mirrors the Instagram TotalsTiles component exactly.
 */
export function FbTotalsTiles({ totals, isLoading }: FbTotalsTilesProps) {
  const tiles = [
    { label: 'Fans', value: totals?.fans, icon: Users },
    { label: 'Impressions', value: totals?.impressions_unique, icon: Eye },
    { label: 'Post Engagements', value: totals?.post_engagements, icon: ThumbsUp },
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
