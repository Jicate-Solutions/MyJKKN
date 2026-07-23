'use client';

import { cn } from '@/lib/utils';
import { EventDot } from './event-dot';
import type { CalendarEvent } from '@/types/campus-living/calendar';

interface DayCellProps {
  isoDate: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  onClick: (isoDate: string) => void;
}

const MAX_DOTS = 4;

/**
 * One cell in the month grid. Shows day number, up to 4 event dots
 * (one per unique source), and a "+N" badge if more events exist.
 * Clicking opens the day-detail dialog.
 */
export function DayCell({
  isoDate,
  dayNumber,
  inCurrentMonth,
  isToday,
  events,
  onClick,
}: DayCellProps) {
  // Show each source at most once in the dot row (dedupe by source).
  const seenSources = new Set<string>();
  const dotEvents: CalendarEvent[] = [];
  for (const e of events) {
    if (seenSources.has(e.source)) continue;
    seenSources.add(e.source);
    dotEvents.push(e);
    if (dotEvents.length >= MAX_DOTS) break;
  }
  const hidden = Math.max(0, events.length - dotEvents.length);

  return (
    <button
      type="button"
      onClick={() => onClick(isoDate)}
      className={cn(
        'group relative flex h-20 sm:h-24 flex-col items-stretch border-b border-r p-1.5 text-left transition-colors',
        'hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset',
        !inCurrentMonth && 'bg-muted/30 text-muted-foreground',
        events.length === 0 && 'cursor-default',
      )}
      aria-label={`${isoDate}${events.length ? ` — ${events.length} event${events.length === 1 ? '' : 's'}` : ''}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
            isToday && 'bg-primary text-primary-foreground',
          )}
        >
          {dayNumber}
        </span>
        {events.length > 0 && (
          <span className="text-[10px] font-medium text-muted-foreground">
            {events.length}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-1">
        {dotEvents.map((e) => (
          <EventDot key={e.id} source={e.source} />
        ))}
        {hidden > 0 && (
          <span className="ml-1 text-[10px] font-medium text-muted-foreground">+{hidden}</span>
        )}
      </div>
    </button>
  );
}
