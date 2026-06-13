'use client';

/**
 * Top posts table (contract F2).
 *
 * GET /api/social/facebook/insights/top-posts?page_id&days&limit
 *   data: { posts: [{ post_id, fb_post_id, message, permalink_url, post_type,
 *                     posted_at, reactions, comments, shares, impressions,
 *                     engaged_users, clicks, video_views, engagement }],
 *           rollup: { posts, reactions, comments, shares, impressions } }
 *
 * Sorted by engagement (reactions+comments+shares) server-side.
 */

import { useQuery } from '@tanstack/react-query';
import { parseISO, format } from 'date-fns';
import { ExternalLink, Trophy } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

// ─── Contract types (F2) ────────────────────────────────────────────────────

interface TopPost {
  post_id: string;
  fb_post_id: string;
  message: string | null;
  permalink_url: string | null;
  post_type: string | null;
  posted_at: string;
  reactions: number;
  comments: number;
  shares: number;
  impressions: number | null;
  engaged_users: number | null;
  clicks: number | null;
  video_views: number | null;
  engagement: number;
}

interface TopPostsData {
  posts: TopPost[];
  rollup: {
    posts: number;
    reactions: number;
    comments: number;
    shares: number;
    impressions: number;
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

function postDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    return '—';
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

interface FbTopPostsTableProps {
  pageId: string;
  days: number;
  limit?: number;
}

export function FbTopPostsTable({ pageId, days, limit = 20 }: FbTopPostsTableProps) {
  const { data, isLoading, isError, error } = useQuery<TopPostsData, Error>({
    queryKey: ['fb-insights-top-posts', pageId, days, limit],
    queryFn: () =>
      getInsights<TopPostsData>(
        `/api/social/facebook/insights/top-posts?page_id=${encodeURIComponent(pageId)}&days=${days}&limit=${limit}`
      ),
    staleTime: 60_000,
    retry: 1,
  });

  const rows = data?.posts ?? [];
  const rollup = data?.rollup;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-1.5">
          <Trophy className="h-4 w-4" /> Top Posts (last {days} days)
        </CardTitle>
        {rollup && (
          <CardDescription className="text-xs">
            {rollup.posts.toLocaleString()} posts · {rollup.reactions.toLocaleString()} reactions
            · {rollup.comments.toLocaleString()} comments · {rollup.shares.toLocaleString()}{' '}
            shares · {rollup.impressions.toLocaleString()} impressions
          </CardDescription>
        )}
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
              <AlertDescription>Failed to load top posts: {error.message}</AlertDescription>
            </Alert>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">
            No posts in this window. Posts data accumulates from 2026-06-10 onward — FB post
            collection was repaired in Wave 1.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Message</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[120px]">Posted</TableHead>
                <TableHead className="text-right w-[90px]">Reactions</TableHead>
                <TableHead className="text-right w-[100px]">Comments</TableHead>
                <TableHead className="text-right w-[80px]">Shares</TableHead>
                <TableHead className="text-right w-[110px]">Engagement</TableHead>
                <TableHead className="text-right w-[110px]">Impressions</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((post) => (
                <TableRow key={post.post_id}>
                  <TableCell className="text-sm max-w-[260px]">
                    <span className="line-clamp-1 text-muted-foreground">
                      {post.message ?? '(no message)'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">
                      {post.post_type ? post.post_type.replace(/_/g, ' ') : 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {postDate(post.posted_at)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {post.reactions.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {post.comments.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {post.shares.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-medium">
                    {post.engagement.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {post.impressions != null ? post.impressions.toLocaleString() : '—'}
                  </TableCell>
                  <TableCell>
                    {post.permalink_url ? (
                      <a href={post.permalink_url} target="_blank" rel="noopener noreferrer">
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
        )}
      </CardContent>
    </Card>
  );
}
