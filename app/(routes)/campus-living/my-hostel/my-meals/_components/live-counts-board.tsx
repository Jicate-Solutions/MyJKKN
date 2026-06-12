'use client';

// ============================================================================
// My Meals — live vote-counts board (P0c)
// ----------------------------------------------------------------------------
// The public half of the return-arc: the aggregate top-voted-dishes tally
// from fn_mess_choose_live_counts (SECURITY DEFINER, aggregate-only — never
// per-resident rows). Renders only when mess.choose.feedback.live_counts is
// on; the page handles that gate.
// ============================================================================

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ThumbsUp, TrendingUp } from 'lucide-react';
import type { LiveVoteCount } from '@/lib/services/campus-living/choose-your-menu-service';

export function LiveCountsBoard({
  counts,
  isLoading,
}: {
  counts: LiveVoteCount[] | undefined;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          What everyone&apos;s backing
        </CardTitle>
        <CardDescription>
          Live tally of dish votes across all hostels — totals only, votes stay
          anonymous.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !counts || counts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No votes yet — when dish voting opens, the live tally shows up
            here.
          </p>
        ) : (
          <ol className="space-y-2">
            {counts.map((c, i) => (
              <li
                key={c.item_id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      'shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center',
                      i === 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium truncate">{c.dish}</span>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  {c.net_score > 0 ? `+${c.net_score}` : c.net_score}
                  <span className="text-xs">({c.voters})</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
