'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, Users, TrendingUp, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeaderboardStatsProps {
  entries: Array<{ total_score: number; verified_tier?: number; tier_level?: number }>;
}

const TIER_COLORS: Record<number, string> = {
  0: 'bg-gray-300 dark:bg-gray-600',
  1: 'bg-blue-500',
  2: 'bg-purple-500',
  3: 'bg-orange-500',
  4: 'bg-green-600',
};

const TIER_SHORT: Record<number, string> = {
  0: 'T0',
  1: 'T1',
  2: 'T2',
  3: 'T3',
  4: 'T4',
};

export function LeaderboardStats({ entries }: LeaderboardStatsProps) {
  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const scores = entries.map((e) => e.total_score);
    const topScore = Math.max(...scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const scoredTeams = entries.filter((e) => e.total_score > 0).length;

    const tierCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    entries.forEach((e) => {
      const tier = e.verified_tier ?? e.tier_level ?? 0;
      const t = Math.min(tier, 4);
      tierCounts[t] = (tierCounts[t] || 0) + 1;
    });
    const maxTierCount = Math.max(...Object.values(tierCounts), 1);

    return { topScore, avgScore, scoredTeams, tierCounts, maxTierCount };
  }, [entries]);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Teams</span>
          </div>
          <p className="text-2xl font-bold">{entries.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stats.scoredTeams} scored
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Trophy className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Top Score</span>
          </div>
          <p className="text-2xl font-bold">{stats.topScore}</p>
          <p className="text-xs text-muted-foreground mt-0.5">out of 60</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Avg Score</span>
          </div>
          <p className="text-2xl font-bold">{stats.avgScore.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">per team</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Tier Spread</span>
          </div>
          <div className="flex items-end gap-1 h-8 mt-1">
            {[0, 1, 2, 3, 4].map((tier) => (
              <div key={tier} className="flex flex-col items-center flex-1 gap-0.5">
                <div
                  className={cn('w-full rounded-sm min-h-[2px]', TIER_COLORS[tier])}
                  style={{ height: `${Math.max((stats.tierCounts[tier] / stats.maxTierCount) * 28, 2)}px` }}
                />
                <span className="text-[9px] text-muted-foreground leading-none">{TIER_SHORT[tier]}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {[4, 3, 2, 1, 0].map((t) => `T${t}: ${stats.tierCounts[t]}`).join(' · ')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
