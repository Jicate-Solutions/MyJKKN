'use client';

/**
 * ReadTable — the READ step of the loop.
 *
 * Ranks this cycle's posts by REAL signal (saves + shares + comments), which is
 * the loop's score. Likes are shown but visually subordinate ("vanity") on
 * purpose — the whole point of the loop is to stop optimising for likes.
 *
 * Above the table sits a one-line "format lever": e.g. "Reels earn ~12× the
 * real signal of images", computed by the data layer from formatLever.
 *
 * The current "bar to beat" post (isBarToBeat) is highlighted with a badge —
 * that post's real signal is the number next week has to clear.
 */

import { Trophy, Layers } from 'lucide-react';
import type { LoopResponse } from '@/lib/types/social-loop';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ReadBlock = NonNullable<LoopResponse['read']>;

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Media-type → calm badge variant. Reels are the high-signal format. */
function typeVariant(
  type: string
): 'default' | 'secondary' | 'outline' {
  const t = (type ?? '').toLowerCase();
  if (t.includes('reel') || t.includes('video')) return 'default';
  if (t.includes('carousel') || t.includes('album')) return 'secondary';
  return 'outline';
}

function FormatLever({ lever }: { lever: ReadBlock['formatLever'] }) {
  if (!lever || !lever.best || !lever.worst) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Layers className="h-4 w-4" />
        Not enough posts yet to read a format lever.
      </p>
    );
  }

  const multiple = lever.multiple;
  const multipleText =
    multiple != null && Number.isFinite(multiple) && multiple >= 1
      ? `~${multiple % 1 === 0 ? multiple : multiple.toFixed(1)}×`
      : null;

  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm">
      <Layers className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium text-foreground">
        {cap(lever.best.type)}s
      </span>
      <span className="text-muted-foreground">
        earn {multipleText ? <strong className="text-foreground">{multipleText}</strong> : 'more of'}{' '}
        the real signal of {lever.worst.type.toLowerCase()}s
      </span>
      <span className="text-xs text-muted-foreground">
        ({fmt(Math.round(lever.best.avg))} vs{' '}
        {fmt(Math.round(lever.worst.avg))} avg)
      </span>
    </p>
  );
}

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ReadTable({ read }: { read: ReadBlock }) {
  const posts = read.posts ?? [];

  return (
    <div className="space-y-4">
      <FormatLever lever={read.formatLever} />

      {posts.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          No posts in this window yet. Publish, then come back to read the
          signal.
        </div>
      ) : (
        <div className="-mx-2 overflow-x-auto px-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="min-w-[160px]">
                  REAL signal
                  <span className="ml-1 font-normal text-muted-foreground">
                    (the score)
                  </span>
                </TableHead>
                <TableHead className="text-right">Reach</TableHead>
                <TableHead className="text-right text-muted-foreground">
                  Likes
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => (
                <TableRow
                  key={post.id}
                  className={
                    post.isBarToBeat ? 'bg-green-50/60 dark:bg-green-950/20' : undefined
                  }
                >
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(post.postedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={typeVariant(post.mediaType)} className="text-xs">
                      {cap(post.mediaType)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold tabular-nums">
                        {fmt(post.realSignal)}
                      </span>
                      {post.isBarToBeat && (
                        <Badge className="gap-1 bg-green-600 text-xs hover:bg-green-600">
                          <Trophy className="h-3 w-3" /> Bar to beat
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      s{fmt(post.saves)} / sh{fmt(post.shares)} / c{fmt(post.comments)}
                    </p>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {fmt(post.reach)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {fmt(post.likes)}
                    </span>
                    <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      vanity
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
