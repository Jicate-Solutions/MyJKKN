'use client';

import { Badge } from '@/components/ui/badge';
import type { ReadinessTier } from '@/lib/services/solutions/paradigm-shift-service';

const TIER_CONFIG: Record<ReadinessTier, { label: string; className: string }> = {
  traditional: {
    label: 'Traditional',
    className: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  emerging: {
    label: 'Emerging',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  solution_ready: {
    label: 'Solution-Ready',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  pioneer: {
    label: 'Pioneer',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
};

export function TierBadge({ tier, size = 'default' }: { tier: ReadinessTier; size?: 'default' | 'lg' }) {
  const config = TIER_CONFIG[tier];
  return (
    <Badge
      variant="outline"
      className={`${config.className} ${size === 'lg' ? 'text-sm px-3 py-1' : ''}`}
    >
      {config.label}
    </Badge>
  );
}

export function getTierColor(tier: ReadinessTier): string {
  const colors: Record<ReadinessTier, string> = {
    traditional: '#f43f5e',
    emerging: '#f59e0b',
    solution_ready: '#3b82f6',
    pioneer: '#22c55e',
  };
  return colors[tier];
}
