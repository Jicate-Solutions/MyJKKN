'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { RiskSummary } from '@/services/learner-risk-service';

const TIER_CONFIG = {
  critical: { label: 'Critical', bg: 'bg-red-500', text: 'text-white' },
  high: { label: 'High', bg: 'bg-orange-500', text: 'text-white' },
  moderate: { label: 'Moderate', bg: 'bg-yellow-400', text: 'text-yellow-900' },
  low: { label: 'Low', bg: 'bg-blue-400', text: 'text-white' },
  healthy: { label: 'Healthy', bg: 'bg-green-500', text: 'text-white' },
} as const;

const TIER_ORDER: (keyof typeof TIER_CONFIG)[] = [
  'critical',
  'high',
  'moderate',
  'low',
  'healthy',
];

interface RiskSummaryBarProps {
  summary: RiskSummary | undefined;
  isLoading: boolean;
}

export function RiskSummaryBar({ summary, isLoading }: RiskSummaryBarProps) {
  if (isLoading) {
    return (
      <div className="flex gap-3">
        {TIER_ORDER.map((tier) => (
          <Skeleton key={tier} className="h-20 flex-1 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="flex gap-3 flex-wrap">
      {TIER_ORDER.map((tier) => {
        const config = TIER_CONFIG[tier];
        const count = summary[tier];
        return (
          <div
            key={tier}
            className={`flex-1 min-w-[120px] rounded-lg p-4 ${config.bg} ${config.text}`}
          >
            <div className="text-2xl font-bold">{count}</div>
            <div className="text-sm opacity-90">{config.label}</div>
          </div>
        );
      })}
      <div className="flex-1 min-w-[120px] rounded-lg p-4 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
        <div className="text-2xl font-bold">{summary.total}</div>
        <div className="text-sm opacity-70">Total</div>
      </div>
    </div>
  );
}
