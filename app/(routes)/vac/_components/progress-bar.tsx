'use client';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  completed: number;
  total: number;
  showLabel?: boolean;
}

export function ProgressBar({ completed, total, showLabel = true }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const colorClass =
    pct >= 80
      ? '[&>div]:bg-green-500'
      : pct >= 40
        ? '[&>div]:bg-yellow-500'
        : '[&>div]:bg-red-500';

  return (
    <div className="space-y-1.5">
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {completed} / {total} completed
          </span>
          <span
            className={cn(
              'font-semibold tabular-nums',
              pct >= 80
                ? 'text-green-600 dark:text-green-400'
                : pct >= 40
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-red-600 dark:text-red-400'
            )}
          >
            {pct}%
          </span>
        </div>
      )}
      <Progress value={pct} className={cn('h-2', colorClass)} />
    </div>
  );
}
