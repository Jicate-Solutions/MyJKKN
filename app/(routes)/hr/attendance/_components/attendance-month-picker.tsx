'use client';

/**
 * Month chip + prev/next + refresh, shared by both attendance tabs.
 * Created: 2026-08-09.
 */

import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { currentMonthKey, monthLabel, shiftMonth, type MonthKey } from '@/types/hr-attendance';

export function AttendanceMonthPicker({
  month,
  onMonthChange,
  onRefresh,
  isFetching,
  className,
}: {
  month: MonthKey;
  onMonthChange: (next: MonthKey) => void;
  onRefresh: () => void;
  isFetching?: boolean;
  className?: string;
}) {
  // Attendance is a record of what happened; there is nothing to show ahead of
  // the current month, and letting someone page into 2027 makes an empty grid
  // look like missing data.
  const atLatest = month >= currentMonthKey();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onMonthChange(shiftMonth(month, -1))}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <span className="inline-flex min-w-[10.5rem] items-center justify-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm font-semibold shadow-sm">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        {monthLabel(month)}
      </span>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => onMonthChange(shiftMonth(month, 1))}
        disabled={atLatest}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onRefresh}
        disabled={isFetching}
        aria-label="Refresh"
      >
        <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
      </Button>
    </div>
  );
}
