'use client';

// components/dashboard/dept-momentum-card.tsx — the within-college momentum leaderboard.
// Ranks the learner's OWN college's graph-tier department handles on REAL signal
// (saves+shares+comments) and MOMENTUM (recent vs prior window) — NEVER followers, likes,
// or absolute totals (those would amplify the vanity + coercion the CARRE audit flagged).
// Recognition-framed: tiers (rising/steady/quiet), a "most improved" star, and the
// learner's own department highlighted — not a top-to-bottom shame list. Self-hides when
// the caller's college has no graph-tier handle.

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Minus, Moon, Star } from 'lucide-react';
import { getLeaderboard } from '@/lib/services/social/engagement-service';
import type { LeaderboardRow } from '@/lib/types/social-engagement';

function tierChip(tier: LeaderboardRow['tier']) {
  if (tier === 'rising')
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
        <TrendingUp className="h-3 w-3 mr-1" /> Rising
      </Badge>
    );
  if (tier === 'steady')
    return (
      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300">
        <Minus className="h-3 w-3 mr-1" /> Steady
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/40">
      <Moon className="h-3 w-3 mr-1" /> Quiet
    </Badge>
  );
}

export function DeptMomentumCard() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [mineId, setMineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await getLeaderboard(30);
    if (res.success && (res.rows?.length ?? 0) > 0) {
      setRows(res.rows ?? []);
      setMineId(res.mine?.dept_account_id ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Self-hide until we know the caller's college has a graph-tier board.
  if (loading || rows.length === 0) return null;

  return (
    <Card className="border-amber-200/70 dark:border-amber-900/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          Momentum in your college
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Ranked on real engagement — saves, shares &amp; comments — and how fast it&apos;s growing. Never likes or followers.
        </p>
      </CardHeader>

      <CardContent className="space-y-1.5">
        {rows.map((r) => {
          const isMine = r.dept_account_id === mineId;
          return (
            <div
              key={r.dept_account_id}
              className={[
                'flex items-center gap-3 rounded-lg border px-3 py-2',
                isMine
                  ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800/60 dark:bg-amber-950/30'
                  : 'border-neutral-200 dark:border-neutral-800',
              ].join(' ')}
            >
              <span className="w-6 shrink-0 text-center text-sm font-semibold text-neutral-500">
                {r.rank}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">
                    {r.department_name ?? r.username}
                  </span>
                  {r.is_most_improved && (
                    <span title="Most improved this month" className="shrink-0">
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
                    </span>
                  )}
                  {isMine && (
                    <Badge variant="outline" className="shrink-0 border-amber-300 text-amber-700 dark:text-amber-300">
                      You
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {r.recent_signal} signal · {r.posts_recent} post{r.posts_recent === 1 ? '' : 's'}
                  {r.avg_real_signal != null && r.posts_recent > 0 ? <> · {r.avg_real_signal}/post</> : null}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.momentum_delta > 0 && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    +{r.momentum_delta}
                  </span>
                )}
                {tierChip(r.tier)}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
