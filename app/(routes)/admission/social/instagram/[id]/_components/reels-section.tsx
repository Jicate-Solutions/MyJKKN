'use client';

/**
 * Reels performance section (contract C4).
 *
 * GET /api/social/instagram/insights/reels?account_id&days&limit
 *   data: {
 *     reels: [{ post_id, ig_media_id, caption, permalink, posted_at,
 *               plays, avg_watch_time_ms, likes, comments, saves, shares,
 *               engagement }],
 *     rollup: { reels, plays, likes, comments, saves, shares }
 *   }
 */

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Clapperboard, ExternalLink } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ─── Contract types ─────────────────────────────────────────────────────────

interface ReelRow {
  post_id: string;
  ig_media_id: string;
  caption: string | null;
  permalink: string | null;
  posted_at: string;
  plays: number | null;
  avg_watch_time_ms: number | null;
  likes: number | null;
  comments: number;
  saves: number;
  shares: number;
  engagement: number;
}

interface ReelsData {
  reels: ReelRow[];
  rollup: {
    reels: number;
    plays: number;
    likes: number;
    comments: number;
    saves: number;
    shares: number;
  };
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

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function watchTimeSec(ms: number | null): string {
  if (ms == null) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '—';
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ReelsSectionProps {
  accountId: string;
  days: number;
  limit?: number;
}

export function ReelsSection({ accountId, days, limit = 20 }: ReelsSectionProps) {
  const { data, isLoading, isError, error } = useQuery<ReelsData, Error>({
    queryKey: ['ig-insights-reels', accountId, days, limit],
    queryFn: () =>
      getInsights<ReelsData>(
        `/api/social/instagram/insights/reels?account_id=${encodeURIComponent(accountId)}&days=${days}&limit=${limit}`
      ),
    staleTime: 60_000,
    retry: 1,
  });

  const reels = data?.reels ?? [];
  const rollup = data?.rollup;

  const rollupTiles = rollup
    ? [
        { label: 'Reels', value: rollup.reels },
        { label: 'Plays', value: rollup.plays },
        { label: 'Likes', value: rollup.likes },
        { label: 'Comments', value: rollup.comments },
        { label: 'Saves', value: rollup.saves },
        { label: 'Shares', value: rollup.shares },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-1.5">
          <Clapperboard className="h-4 w-4" /> Reels (last {days} days)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ) : isError ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertDescription>Failed to load reels: {error.message}</AlertDescription>
            </Alert>
          </div>
        ) : reels.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No reels in window.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 p-4 pt-0">
              {rollupTiles.map((tile) => (
                <div key={tile.label} className="rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    {tile.label}
                  </p>
                  <p className="text-lg font-bold tabular-nums">{fmt(tile.value)}</p>
                </div>
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caption</TableHead>
                  <TableHead className="text-right w-[80px]">Plays</TableHead>
                  <TableHead className="text-right w-[110px]">Avg Watch</TableHead>
                  <TableHead className="text-right w-[80px]">Likes</TableHead>
                  <TableHead className="text-right w-[95px]">Comments</TableHead>
                  <TableHead className="text-right w-[80px]">Saves</TableHead>
                  <TableHead className="text-right w-[80px]">Shares</TableHead>
                  <TableHead className="w-[120px]">Posted</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reels.map((reel) => (
                  <TableRow key={reel.post_id}>
                    <TableCell className="text-sm max-w-[240px]">
                      <span className="line-clamp-1 text-muted-foreground">
                        {reel.caption ?? '(no caption)'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {fmt(reel.plays)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {watchTimeSec(reel.avg_watch_time_ms)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {fmt(reel.likes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {fmt(reel.comments)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {fmt(reel.saves)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {fmt(reel.shares)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {relativeTime(reel.posted_at)}
                    </TableCell>
                    <TableCell>
                      {reel.permalink ? (
                        <a href={reel.permalink} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
