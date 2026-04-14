'use client';

import { Badge } from '@/components/ui/badge';
import type { ReadinessTier } from '@/lib/services/solutions/paradigm-shift-service';

/** Display label for the 5-level journey system */
type JourneyLevel = 'Not Started' | 'Exploring' | 'First Project' | 'Scaling' | 'Transformed';

const TIER_CONFIG: Record<ReadinessTier, { label: string; className: string }> = {
  traditional: {
    label: 'Exploring',
    className: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  emerging: {
    label: 'First Project',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  solution_ready: {
    label: 'Scaling',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  pioneer: {
    label: 'Transformed',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
};

const NOT_STARTED_CONFIG = {
  label: 'Not Started' as JourneyLevel,
  className: 'bg-gray-100 text-gray-600 border-gray-200',
};

/**
 * TierBadge displays the 5-level journey label.
 * Pass `activeMetricsCount` to distinguish "Not Started" (0 metrics)
 * from "Exploring" (1-3 metrics) when the backend tier is `traditional`.
 */
export function TierBadge({
  tier,
  activeMetricsCount,
  size = 'default',
}: {
  tier: ReadinessTier;
  activeMetricsCount?: number;
  size?: 'default' | 'lg';
}) {
  // Level 1: Not Started — traditional tier with 0 active metrics
  const isNotStarted = tier === 'traditional' && activeMetricsCount !== undefined && activeMetricsCount === 0;
  const config = isNotStarted ? NOT_STARTED_CONFIG : TIER_CONFIG[tier];

  return (
    <Badge
      variant="outline"
      className={`${config.className} ${size === 'lg' ? 'text-sm px-3 py-1' : ''}`}
    >
      {config.label}
    </Badge>
  );
}

export function getTierColor(tier: ReadinessTier, activeMetricsCount?: number): string {
  // Not Started gets its own color
  if (tier === 'traditional' && activeMetricsCount !== undefined && activeMetricsCount === 0) {
    return '#9ca3af'; // gray-400
  }
  const colors: Record<ReadinessTier, string> = {
    traditional: '#f43f5e',
    emerging: '#f59e0b',
    solution_ready: '#3b82f6',
    pioneer: '#22c55e',
  };
  return colors[tier];
}
