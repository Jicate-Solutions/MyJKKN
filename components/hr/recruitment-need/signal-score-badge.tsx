'use client';

/**
 * Composite score badge (0-100) with traffic-light color background.
 * Shows "BLOCKED" when overall_status === 'blocked'.
 */

import { cn } from '@/lib/utils';
import { OVERALL_STATUS_COLORS, formatScore } from './signal-helpers';
import type { OverallSignalStatus } from '@/types/hr-recruitment-need';

interface SignalScoreBadgeProps {
  score: number | null;
  status: OverallSignalStatus;
  size?: 'sm' | 'lg';
  className?: string;
}

export function SignalScoreBadge({ score, status, size = 'sm', className }: SignalScoreBadgeProps) {
  const colors = OVERALL_STATUS_COLORS[status];
  const isBlocked = status === 'blocked' || status === 'insufficient_data';

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-bold',
        colors.bg,
        colors.text,
        colors.border,
        'border',
        size === 'lg' ? 'text-2xl px-4 py-2 min-w-[80px]' : 'text-sm px-2.5 py-1 min-w-[48px]',
        className
      )}
    >
      {isBlocked ? (
        <span className="text-xs font-semibold uppercase tracking-wider">
          {status === 'blocked' ? 'Blocked' : 'N/A'}
        </span>
      ) : (
        formatScore(score)
      )}
    </div>
  );
}
