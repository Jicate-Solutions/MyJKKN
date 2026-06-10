'use client';

/**
 * Top hashtags table (contract C2).
 *
 * GET /api/social/instagram/insights/hashtags?account_id&days&limit
 *   data: { hashtags: [{ tag, occurrences, likes, comments, saves, engagement }] }
 */

import { useQuery } from '@tanstack/react-query';
import { Hash } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ─── Contract types ─────────────────────────────────────────────────────────

interface HashtagRow {
  tag: string;
  occurrences: number;
  likes: number;
  comments: number;
  saves: number;
  engagement: number;
}

interface HashtagsData {
  hashtags: HashtagRow[];
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

interface HashtagsTableProps {
  accountId: string;
  days: number;
  limit?: number;
}

export function HashtagsTable({ accountId, days, limit = 20 }: HashtagsTableProps) {
  const { data, isLoading, isError, error } = useQuery<HashtagsData, Error>({
    queryKey: ['ig-insights-hashtags', accountId, days, limit],
    queryFn: () =>
      getInsights<HashtagsData>(
        `/api/social/instagram/insights/hashtags?account_id=${encodeURIComponent(accountId)}&days=${days}&limit=${limit}`
      ),
    staleTime: 60_000,
    retry: 1,
  });

  const rows = data?.hashtags ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-1.5">
          <Hash className="h-4 w-4" /> Top Hashtags (last {days} days)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full rounded" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertDescription>Failed to load hashtags: {error.message}</AlertDescription>
            </Alert>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hashtags found in captions for this window.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hashtag</TableHead>
                <TableHead className="text-right w-[90px]">Posts</TableHead>
                <TableHead className="text-right w-[90px]">Likes</TableHead>
                <TableHead className="text-right w-[100px]">Comments</TableHead>
                <TableHead className="text-right w-[90px]">Saves</TableHead>
                <TableHead className="text-right w-[110px]">Engagement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.tag}>
                  <TableCell className="text-sm font-medium">{row.tag}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {row.occurrences.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {row.likes.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {row.comments.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {row.saves.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-medium">
                    {row.engagement.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
