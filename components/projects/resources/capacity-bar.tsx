'use client';

/**
 * CapacityBar — visual progress bar comparing allocated vs assigned hours (F5).
 *
 * Colours:
 *  - green  : assignedHours ≤ 75% of capacityHours
 *  - amber  : 75% < assignedHours ≤ 100% of capacityHours
 *  - red    : assignedHours > capacityHours (over-allocated)
 */

import { cn } from '@/lib/utils';
import { allocationToHours } from '@/lib/services/projects/resource-service';

interface CapacityBarProps {
  allocationPct: number | null;
  assignedHours: number;
  className?: string;
}

export function CapacityBar({ allocationPct, assignedHours, className }: CapacityBarProps) {
  const capacityHours = allocationToHours(allocationPct);
  const fillRatio = capacityHours > 0 ? assignedHours / capacityHours : 0;
  const fillPct = Math.min(fillRatio * 100, 100); // cap bar at 100% visually

  const colour =
    fillRatio > 1
      ? 'bg-red-500'
      : fillRatio > 0.75
        ? 'bg-amber-400'
        : 'bg-emerald-500';

  return (
    <div className={cn('space-y-1', className)}>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colour)}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {assignedHours.toFixed(1)}h&nbsp;/&nbsp;{capacityHours.toFixed(0)}h capacity
      </p>
    </div>
  );
}
