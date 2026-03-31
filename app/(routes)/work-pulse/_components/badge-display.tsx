'use client';

import { Award, Bot, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BadgeInfo, PulseStats } from '@/types/work-pulse';

interface BadgeDisplayProps {
  stats: PulseStats;
}

export function BadgeDisplay({ stats }: BadgeDisplayProps) {
  const badges: BadgeInfo[] = [
    {
      type: 'pattern_spotter',
      label: 'Pattern Spotter',
      description: '10+ pattern matches from your reports',
      earned: stats.patterns_spotted >= 10,
    },
    {
      type: 'agent_originator',
      label: 'Agent Originator',
      description: '1+ deployed agent from your feedback',
      earned: stats.agents_originated >= 1,
    },
    {
      type: 'impact_pioneer',
      label: 'Impact Pioneer',
      description: '50+ hours saved across the institution',
      earned: false, // Requires impact data — simplified for now
    },
  ];

  const earnedBadges = badges.filter((b) => b.earned);
  if (earnedBadges.length === 0) return null;

  const icons = {
    pattern_spotter: Award,
    agent_originator: Bot,
    impact_pioneer: TrendingUp,
  };

  return (
    <div className="flex flex-wrap gap-2">
      {earnedBadges.map((badge) => {
        const Icon = icons[badge.type];
        return (
          <Badge
            key={badge.type}
            variant="outline"
            className="flex items-center gap-1.5 py-1 px-3 border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-700"
          >
            <Icon className="h-3.5 w-3.5" />
            {badge.label}
          </Badge>
        );
      })}
    </div>
  );
}
