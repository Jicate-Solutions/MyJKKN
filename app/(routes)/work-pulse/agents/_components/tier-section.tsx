'use client';

import { WpPattern, WpPatternTier } from '@/types/work-pulse';
import { PatternCard } from './pattern-card';

const TIER_CONFIG: Record<WpPatternTier, { label: string; color: string; bg: string }> = {
  S: { label: 'S-Tier — Critical (100+ impact)', color: 'text-red-700 dark:text-red-400', bg: 'border-red-200 dark:border-red-800' },
  A: { label: 'A-Tier — Important (50-99)', color: 'text-orange-700 dark:text-orange-400', bg: 'border-orange-200 dark:border-orange-800' },
  B: { label: 'B-Tier — Moderate (20-49)', color: 'text-yellow-700 dark:text-yellow-400', bg: 'border-yellow-200 dark:border-yellow-800' },
  C: { label: 'C-Tier — Monitor (<20)', color: 'text-gray-600 dark:text-gray-400', bg: 'border-gray-200 dark:border-gray-700' },
};

interface TierSectionProps {
  tier: WpPatternTier;
  patterns: WpPattern[];
}

export function TierSection({ tier, patterns }: TierSectionProps) {
  const config = TIER_CONFIG[tier];
  if (patterns.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className={`text-sm font-semibold ${config.color}`}>
        {config.label} ({patterns.length})
      </h3>
      <div className={`space-y-2 pl-3 border-l-2 ${config.bg}`}>
        {patterns.map((pattern) => (
          <PatternCard key={pattern.id} pattern={pattern} />
        ))}
      </div>
    </div>
  );
}
