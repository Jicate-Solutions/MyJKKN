'use client';

// ============================================================================
// My Meals — "Rate dishes" board (Mode B menu voting / wishlist, ships dark)
// ----------------------------------------------------------------------------
// The resident INPUT for Mode B: thumbs ±1 on library dishes. Reads the live
// tally + my own vote per dish via fn_mess_choose_votable_dishes; writes via
// fn_mess_choose_cast_vote / fn_mess_choose_clear_vote — every guard (master
// switch, voting-tier) re-checks SERVER-side, this board is just the hands.
// The return-arc the spec mandates: votes feed the LiveCountsBoard leaderboard
// on this page (b — see the count move), and when an admin schedules a backed
// dish onto a real menu cell, a 'vote_landed' recognition lands in the
// RecognitionFeed (c — recognised). Pattern source: meal-choice-dialog.tsx.
// ============================================================================

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ThumbsDown, ThumbsUp, Trophy } from 'lucide-react';
import {
  useVotableDishes,
  useCastVote,
  useClearVote,
} from '@/hooks/campus-living/use-choose-your-menu';
import type { VotableDish } from '@/lib/services/campus-living/choose-your-menu-service';

const ERROR_COPY: Record<string, string> = {
  feature_disabled: 'Dish voting is not switched on right now.',
  no_learner_profile: 'We could not find your resident profile.',
  plan_not_enabled: 'Your mess plan does not include dish voting.',
  invalid_dish: 'That dish is no longer available to vote on.',
};

export function RateDishesBoard() {
  const [search, setSearch] = useState('');
  const { data: dishes, isLoading } = useVotableDishes(search);
  const castVote = useCastVote();
  const clearVote = useClearVote();
  const busy = castVote.isPending || clearVote.isPending;

  async function handleVote(d: VotableDish, dir: 1 | -1) {
    try {
      // Clicking my current vote again withdraws it (toggle).
      if (d.my_vote === dir) {
        const res = await clearVote.mutateAsync({ itemId: d.item_id });
        if (res.ok) toast.success(`Removed your vote on ${d.dish}.`);
        else toast.error(ERROR_COPY[res.error ?? ''] ?? `Could not update (${res.error}).`);
        return;
      }
      const res = await castVote.mutateAsync({ itemId: d.item_id, vote: dir });
      if (res.ok) {
        toast.success(
          dir === 1
            ? `Noted — more ${res.dish ?? d.dish}, please!`
            : `Noted — less ${res.dish ?? d.dish}.`
        );
      } else {
        toast.error(ERROR_COPY[res.error ?? ''] ?? `Could not vote (${res.error}).`);
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-primary" />
          Rate dishes
        </CardTitle>
        <CardDescription>
          Thumbs-up the dishes you want more of. Your votes shape the demand
          board — and when a top-voted dish makes the menu, you&apos;ll see it
          in your wins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search dishes (e.g. biriyani, dosai)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !dishes || dishes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {search ? `No dishes match “${search}”.` : 'No dishes to rate yet.'}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {dishes.map((d) => (
              <li
                key={d.item_id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{d.dish}</p>
                  {(d.name_tamil || d.category) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {[d.name_tamil, d.category].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.voters > 0 && (
                    <Badge variant="outline" className="tabular-nums" title={`${d.voters} voters`}>
                      {d.net_score > 0 ? `+${d.net_score}` : d.net_score} · {d.voters}
                    </Badge>
                  )}
                  <Button
                    size="icon"
                    variant={d.my_vote === 1 ? 'default' : 'outline'}
                    disabled={busy}
                    onClick={() => handleVote(d, 1)}
                    aria-label={`Vote up ${d.dish}`}
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant={d.my_vote === -1 ? 'destructive' : 'outline'}
                    disabled={busy}
                    onClick={() => handleVote(d, -1)}
                    aria-label={`Vote down ${d.dish}`}
                  >
                    <ThumbsDown className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
