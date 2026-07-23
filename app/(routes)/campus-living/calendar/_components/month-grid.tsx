'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayCell } from './day-cell';
import {
  buildMonthGrid,
  bucketEventsByDate,
  formatMonthLabel,
  WEEKDAY_LABELS,
} from './calendar-utils';
import type { CalendarEvent } from '@/types/campus-living/calendar';

interface MonthGridProps {
  anchor: Date;
  events: CalendarEvent[];
  onAnchorChange: (next: Date) => void;
  onDayClick: (isoDate: string) => void;
}

/**
 * 6×7 month grid. Stateless — receives anchor + events, calls back on nav.
 */
export function MonthGrid({ anchor, events, onAnchorChange, onDayClick }: MonthGridProps) {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const days = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const bucket = useMemo(() => bucketEventsByDate(events), [events]);
  const currentMonth = anchor.getUTCMonth();

  const goPrev = () => {
    const next = new Date(anchor);
    next.setUTCMonth(next.getUTCMonth() - 1);
    onAnchorChange(next);
  };
  const goNext = () => {
    const next = new Date(anchor);
    next.setUTCMonth(next.getUTCMonth() + 1);
    onAnchorChange(next);
  };
  const goToday = () => {
    const t = new Date();
    onAnchorChange(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)));
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={goPrev} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={goNext} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="text-base font-semibold">{formatMonthLabel(anchor)}</h2>
        <div className="w-[120px]" aria-hidden />
      </div>

      <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="px-2 py-1.5 text-center">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-t">
        {days.map((iso) => {
          const d = new Date(`${iso}T00:00:00Z`);
          const inMonth = d.getUTCMonth() === currentMonth;
          const dayEvents = bucket.get(iso) ?? [];
          return (
            <DayCell
              key={iso}
              isoDate={iso}
              dayNumber={d.getUTCDate()}
              inCurrentMonth={inMonth}
              isToday={iso === todayIso}
              events={dayEvents}
              onClick={onDayClick}
            />
          );
        })}
      </div>
    </div>
  );
}
