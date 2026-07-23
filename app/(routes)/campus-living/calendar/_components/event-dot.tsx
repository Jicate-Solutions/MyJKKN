'use client';

import { cn } from '@/lib/utils';
import type { CalendarEventSource } from '@/types/campus-living/calendar';
import { CALENDAR_SOURCE_META } from '@/types/campus-living/calendar';

interface EventDotProps {
  source: CalendarEventSource;
  className?: string;
}

/**
 * Small coloured dot used inside month-cells to indicate one event of a
 * given source. Multiple dots stack horizontally; overflow becomes "+N".
 */
export function EventDot({ source, className }: EventDotProps) {
  const meta = CALENDAR_SOURCE_META[source];
  return (
    <span
      className={cn('inline-block h-1.5 w-1.5 rounded-full', meta.dotClass, className)}
      aria-label={meta.label}
    />
  );
}
