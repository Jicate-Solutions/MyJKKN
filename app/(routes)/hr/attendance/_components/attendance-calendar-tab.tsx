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

import { AttendanceLegend, cellWashFor, tonesFor } from './attendance-legend';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function AttendanceCalendarTab({
  weeks,
  isLoading,
  closed = false,
}: {
  weeks: AttendanceDay[][];
  isLoading: boolean;
  /**
   * HR has closed this month. Only then does the grid paint days green/red —
   * an open month's figures can still move, and a paid/unpaid verdict on them
   * would be a promise the data has not made yet.
   */
  closed?: boolean;
}) {
  if (isLoading) return <Skeleton className="h-[32rem] w-full rounded-md" />;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <AttendanceLegend closed={closed} />

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
                  <CalendarCell key={day.date} day={day} closed={closed} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function CalendarCell({ day, closed }: { day: AttendanceDay; closed: boolean }) {
  const tones = tonesFor(day.token);
  const showToken = day.inMonth && !day.isFuture;
  /**
   * An undecided request covering this day.
   *
   * The token is NOT changed — attendance restamps only on approval, because
   * status feeds payable_days and the register. The dot distinguishes "absent,
   * and somebody has claimed it" from "absent, unexplained", which read
   * identically until 2026-09-02.
   */
  const awaiting = day.requests.some((r) => r.decision === 'awaiting');
  const [first, second] = day.halfPair;
  // halfPairFor repeats the day token unless the day is HALF_DAY, so a split
  // pair IS the half day. Rendering only the pair — the reference UI's
  // `AB : AB` — meant a half day appeared as `AB : P`, which reads as "absent"
  // against a legend whose entries are all DAY tokens (P, HD, AB, WO...) and
  // never pairs. The day's own verdict now leads; the split is the detail
  // under it, and an unsplit day drops the redundant `P : P` entirely.
  const isSplit = first !== second;

  return (
    <div
      className={cn(
        'min-h-[5.5rem] border-r p-2 last:border-r-0',
        // A future day carries no verdict yet, so it stays unwashed even in a
        // closed month — closing December does not make the 31st "paid".
        day.inMonth ? cellWashFor(day.token, closed && !day.isFuture) : 'bg-muted/30',
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
                {day.tokenLabel}
                {awaiting && (
                  <span
                    aria-label="a request is awaiting approval"
                    className="ml-0.5 align-super text-[9px] text-amber-600 dark:text-amber-400"
                  >
                    ●
                  </span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <CellTooltip day={day} />
            </TooltipContent>
          </Tooltip>

          {isSplit && (
            <span className="text-[10px] font-medium text-muted-foreground">
              {STATUS_TOKENS[first].short} : {STATUS_TOKENS[second].short}
            </span>
          )}

          {day.inTime && day.outTime && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {day.inTime}–{day.outTime}
            </span>
          )}

          {/* Which holiday, in the cell and not only on hover — a holiday day
              has no split and no punches, so the caption slot is free, and on a
              phone there is no hover. */}
          {day.token === 'HOLIDAY' && day.tokenDetail && (
            <span
              className="line-clamp-2 text-[10px] leading-tight text-muted-foreground"
              title={day.tokenDetail}
            >
              {day.tokenDetail}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CellTooltip({ day }: { day: AttendanceDay }) {
  const [first, second] = day.halfPair;
  return (
    <div className="space-y-1">
      <p className="font-semibold">
        {format(day.dateObj, 'EEEE, d MMMM yyyy')} — {STATUS_TOKENS[day.token].label}
        {day.tokenDetail ? ` (${day.tokenDetail})` : ''}
      </p>
      {/* Spell the halves out. "AB : P" on the cell is compact, not obvious. */}
      {first !== second && (
        <p>
          Morning {STATUS_TOKENS[first].label.toLowerCase()} · afternoon{' '}
          {STATUS_TOKENS[second].label.toLowerCase()}
        </p>
      )}
      {day.inTime && day.outTime && (
        <p>
          In {day.inTime} · Out {day.outTime} · Effective{' '}
          {formatDuration(day.effectiveMinutes)}
        </p>
      )}
      {day.lateMinutes !== null && day.lateMinutes > 0 && (
        <p>
          Late by {day.lateMinutes} minute(s).
          {/* Without this line a 09:24 arrival reading PRESENT looks like the
              bug fixed on 2026-08-20 rather than an approved permission. */}
          {day.excusedMinutes ? ` ${day.excusedMinutes} minute(s) covered by an approved permission.` : ''}
        </p>
      )}
      {!day.lateMinutes && day.excusedMinutes ? (
        <p>{day.excusedMinutes} minute(s) covered by an approved permission.</p>
      ) : null}
      {/* Names the pending claim behind the dot on the cell. A marker with no
          explanation only moves the question from "why absent" to "why dot". */}
      {day.requests
        .filter((r) => r.decision === 'awaiting')
        .map((r) => (
          <p key={r.id} className="text-xs text-amber-300 dark:text-amber-400">
            {r.type_name}
            {r.start_time && r.end_time ? ` ${r.start_time}–${r.end_time}` : ''} — awaiting
            approval
            {r.category === 'short_time_off'
              ? '; would excuse the shortfall'
              : '; the day restamps once decided'}
          </p>
        ))}
      {day.exception?.reason && <p className="text-xs">{day.exception.reason}</p>}
    </div>
  );
}
