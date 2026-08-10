'use client';

/**
 * Calendar — the month as a Monday→Sunday grid.
 * Created: 2026-08-09.
 *
 * Plain CSS grid, not react-big-calendar. RBC is a dependency here, but it is
 * an event-scheduling component: a static month grid needs none of its drag,
 * overlap or view machinery, and its dark-mode overrides are already a
 * documented source of pain in this repo.
 */

import { format } from 'date-fns';

import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  formatDuration,
  STATUS_TOKENS,
  type AttendanceDay,
} from '@/types/hr-attendance';

import { AttendanceLegend, tonesFor } from './attendance-legend';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function AttendanceCalendarTab({
  weeks,
  isLoading,
}: {
  weeks: AttendanceDay[][];
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-[32rem] w-full rounded-md" />;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <AttendanceLegend />

        <div className="overflow-x-auto">
          <div className="min-w-[52rem] overflow-hidden rounded-md border">
            <div className="grid grid-cols-7 border-b bg-muted/60">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <span className="hidden sm:inline">{d}</span>
                  <span className="sm:hidden">{d.slice(0, 3)}</span>
                </div>
              ))}
            </div>

            {weeks.map((week) => (
              <div key={week[0].date} className="grid grid-cols-7 border-b last:border-b-0">
                {week.map((day) => (
                  <CalendarCell key={day.date} day={day} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function CalendarCell({ day }: { day: AttendanceDay }) {
  const tones = tonesFor(day.token);
  const showToken = day.inMonth && !day.isFuture;
  const [first, second] = day.halfPair;

  return (
    <div
      className={cn(
        'min-h-[5.5rem] border-r p-2 last:border-r-0',
        day.inMonth ? tones.cell : 'bg-muted/30',
      )}
    >
      <div
        className={cn(
          'text-xs font-semibold',
          !day.inMonth && 'text-muted-foreground/50',
          day.isToday &&
            'inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground',
        )}
      >
        {format(day.dateObj, 'dd')}
      </div>

      {showToken && (
        <div className="mt-3 flex flex-col items-center gap-0.5 text-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn('text-xs font-bold', tones.text)}>
                {STATUS_TOKENS[first].short} : {STATUS_TOKENS[second].short}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <CellTooltip day={day} />
            </TooltipContent>
          </Tooltip>

          {day.inTime && day.outTime && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {day.inTime}–{day.outTime}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CellTooltip({ day }: { day: AttendanceDay }) {
  return (
    <div className="space-y-1">
      <p className="font-semibold">
        {format(day.dateObj, 'EEEE, d MMMM yyyy')} — {STATUS_TOKENS[day.token].label}
        {day.tokenDetail ? ` (${day.tokenDetail})` : ''}
      </p>
      {day.inTime && day.outTime && (
        <p>
          In {day.inTime} · Out {day.outTime} · Effective{' '}
          {formatDuration(day.effectiveMinutes)}
        </p>
      )}
      {day.lateMinutes !== null && day.lateMinutes > 0 && (
        <p>Late by {day.lateMinutes} minute(s).</p>
      )}
      {day.exception?.reason && <p className="text-xs">{day.exception.reason}</p>}
    </div>
  );
}
