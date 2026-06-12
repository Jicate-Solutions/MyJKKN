'use client';

/**
 * Stories performance section (contract C5).
 *
 * GET /api/social/instagram/insights/stories?account_id&days
 *   data: { stories: [<one obj per story, latest insight per story>], rollup: {<sums>} }
 *
 * The exact story shape mirrors the ig_stories + ig_story_insights columns
 * (story_id, media_type, permalink, posted_at, expires_at + metrics like
 * impressions, reach, exits, replies, taps_forward, taps_back). This
 * component renders DEFENSIVELY from whatever shape the route returns:
 * known descriptive keys (posted_at / media_type / permalink) get dedicated
 * columns; every other numeric key becomes a generic metric column; the
 * rollup tiles are derived from the rollup object's numeric entries.
 */

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { GalleryVerticalEnd, ExternalLink } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ─── Contract types (defensive — shape mirrors real DB columns) ─────────────

type StoryRow = Record<string, unknown>;

interface StoriesData {
  stories: StoryRow[];
  rollup: Record<string, unknown>;
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
  return n.toLocaleString();
}

function relativeTime(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return '—';
  }
}

function titleCase(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Keys that are identifiers / urls / timestamps — never metric columns. */
const NON_METRIC_KEYS = new Set([
  'id',
  'story_id',
  'ig_account_id',
  'account_id',
  'media_url',
  'thumbnail_url',
  'permalink',
  'media_type',
  'posted_at',
  'expires_at',
  'captured_at',
  'last_polled_at',
  'created_at',
  'updated_at',
  'raw',
]);

// ─── Component ──────────────────────────────────────────────────────────────

interface StoriesSectionProps {
  accountId: string;
  days: number;
}

export function StoriesSection({ accountId, days }: StoriesSectionProps) {
  const { data, isLoading, isError, error } = useQuery<StoriesData, Error>({
    queryKey: ['ig-insights-stories', accountId, days],
    queryFn: () =>
      getInsights<StoriesData>(
        `/api/social/instagram/insights/stories?account_id=${encodeURIComponent(accountId)}&days=${days}`
      ),
    staleTime: 60_000,
    retry: 1,
  });

  const stories = data?.stories ?? [];

  // Union of numeric keys across all stories → generic metric columns.
  const metricKeys: string[] = [];
  for (const story of stories) {
    for (const [key, value] of Object.entries(story)) {
      if (NON_METRIC_KEYS.has(key)) continue;
      if (typeof value === 'number' && !metricKeys.includes(key)) {
        metricKeys.push(key);
      }
    }
  }

  // Rollup tiles from numeric entries of the rollup object.
  const rollupTiles = Object.entries(data?.rollup ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number'
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-1.5">
          <GalleryVerticalEnd className="h-4 w-4" /> Stories (last {days} days)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
        ) : isError ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertDescription>Failed to load stories: {error.message}</AlertDescription>
            </Alert>
          </div>
        ) : stories.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No stories in window.
          </p>
        ) : (
          <>
            {rollupTiles.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 p-4 pt-0">
                {rollupTiles.map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-border p-3">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {titleCase(key)}
                    </p>
                    <p className="text-lg font-bold tabular-nums">{fmt(value)}</p>
                  </div>
                ))}
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Posted</TableHead>
                  <TableHead className="w-[90px]">Type</TableHead>
                  {metricKeys.map((key) => (
                    <TableHead key={key} className="text-right">
                      {titleCase(key)}
                    </TableHead>
                  ))}
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {stories.map((story, idx) => {
                  const rowKey =
                    (typeof story.id === 'string' && story.id) ||
                    (typeof story.story_id === 'string' && story.story_id) ||
                    String(idx);
                  const mediaType =
                    typeof story.media_type === 'string' ? story.media_type : null;
                  const permalink =
                    typeof story.permalink === 'string' && story.permalink
                      ? story.permalink
                      : null;
                  return (
                    <TableRow key={rowKey}>
                      <TableCell className="text-sm text-muted-foreground">
                        {relativeTime(story.posted_at)}
                      </TableCell>
                      <TableCell>
                        {mediaType ? (
                          <Badge variant="outline" className="text-xs capitalize">
                            {mediaType.toLowerCase()}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      {metricKeys.map((key) => {
                        const value = story[key];
                        return (
                          <TableCell key={key} className="text-right tabular-nums text-sm">
                            {typeof value === 'number' ? fmt(value) : '—'}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        {permalink ? (
                          <a href={permalink} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
