'use client';

/**
 * Attendance Log — one row per day of the month, newest first.
 * Created: 2026-08-09.
 *
 * Renders EVERY day of the month, not only days that have a record. A day with
 * no row is a real state (AEYP — nothing has decided it yet), and collapsing
 * those rows would make a month with a partial import look complete.
 */

import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRight, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  formatDuration,
  isNonWorkingToken,
  isRegularizable,
  STATUS_TOKENS,
  type AttendanceDay,
} from '@/types/hr-attendance';

import { AttendanceTokenBadge, tonesFor } from './attendance-legend';

export function AttendanceLogTab({
  days,
  isLoading,
  canRegularize,
}: {
  days: AttendanceDay[];
  isLoading: boolean;
  /** False when an HR user is viewing someone else's record — you cannot file
   *  a self-service correction on another person's behalf. */
  canRegularize: boolean;
}) {
  if (isLoading) return <LogSkeleton />;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[16%]">Date</TableHead>
              <TableHead className="w-[22%]">Attendance Visual</TableHead>
              <TableHead className="w-[12%]">Status</TableHead>
              <TableHead className="w-[18%]">Time off</TableHead>
              <TableHead className="w-[10%] text-right">Effective hours</TableHead>
              <TableHead className="w-[10%] text-right">Gross hours</TableHead>
              <TableHead className="w-[12%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => (
              <LogRow key={day.date} day={day} canRegularize={canRegularize} />
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  leave: 'Leave',
  short_time_off: 'Permission',
  compensatory_off: 'Comp off',
};

/**
 * Time-off covering this day, decided or not.
 *
 * A LEAVE day already reads LEAVE from its status, but never WHICH leave. A
 * permission reads nothing at all — it deliberately does not stamp attendance,
 * it excuses a shortfall — so its only previous trace was an unexplained
 * excused_minutes on a day that looked ordinary.
 *
 * UNDECIDED REQUESTS APPEAR HERE TOO (2026-09-02), marked. Attendance restamps
 * only on approval — status feeds payable_days and the register — so until then
 * the day genuinely reads ABSENT or HALF_DAY. That was indistinguishable from
 * nobody having claimed anything: 695 records across ~200 staff. The badge
 * explains the gap without closing it.
 */
function TimeOffCell({ day }: { day: AttendanceDay }) {
  if (day.isFuture) return <span className="text-muted-foreground">—</span>;
  if (day.requests.length === 0) {
    // Excused with no request visible means the covering permission sits outside
    // this month's fetch. Say something rather than nothing.
    return day.excusedMinutes
      ? <span className="text-xs text-muted-foreground">{day.excusedMinutes}m excused</span>
      : <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-1">
      {day.requests.map((r) => (
        <div key={r.id} className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-1">
            <Badge
              variant="outline"
              className={cn(
                'font-normal',
                r.decision === 'awaiting' &&
                  'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400',
              )}
            >
              {CATEGORY_LABEL[r.category] ?? r.category}
            </Badge>
            <span className="truncate text-xs" title={r.type_name}>{r.type_name}</span>
            {r.start_time && r.end_time && (
              <span className="tabular-nums text-xs text-muted-foreground">
                {r.start_time}–{r.end_time}
              </span>
            )}
            {r.multi_day && <span className="text-[11px] text-muted-foreground">(multi-day)</span>}
          </div>
          {r.decision === 'awaiting' && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              {/* A permission EXCUSES a shortfall rather than replacing the day,
                  so it cannot promise the status will change — and permissions
                  are the larger group (367 of the 695). */}
              {r.category === 'short_time_off'
                ? 'Awaiting approval — would excuse the shortfall'
                : 'Awaiting approval — the day restamps once decided'}
            </p>
          )}
        </div>
      ))}
      {day.excusedMinutes ? (
        <p className="text-[11px] text-muted-foreground">
          {day.excusedMinutes}m of lateness covered
        </p>
      ) : null}
    </div>
  );
}

function LogRow({ day, canRegularize }: { day: AttendanceDay; canRegularize: boolean }) {
  const showRegularize =
    canRegularize && !day.isFuture && isRegularizable(day.token) && !isNonWorkingToken(day.token);
  /** Past day with no record yet — nothing to correct until the import lands. */
  const awaitingImport = !day.isFuture && day.token === 'AEYP';

  return (
    <TableRow className={cn(day.isToday && 'bg-muted/40')}>
      <TableCell className="font-medium">
        <span className={cn(day.isFuture && 'text-muted-foreground')}>
          {format(day.dateObj, 'MMM dd, EEE')}
        </span>
      </TableCell>

      <TableCell>
        <AttendanceVisual day={day} />
      </TableCell>

      {/* The day's CURRENT verdict, for every day — a punched day used to show
          only its bar, so an approved leave/OD/regularization changing the
          status was invisible unless the bar happened to change colour. The
          badge reads hr_attendance_records via day.token, i.e. exactly what
          the monthly report counts, and tokenLabel names the covering leave
          type (CL/OD) rather than a bare L. */}
      <TableCell>
        {day.isFuture ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1.5">
            <AttendanceTokenBadge token={day.token} label={day.tokenLabel} />
            {day.tokenDetail && (
              <span className="text-[11px] text-muted-foreground">{day.tokenDetail}</span>
            )}
          </span>
        )}
      </TableCell>

      <TableCell>
        <TimeOffCell day={day} />
      </TableCell>

      <TableCell className="text-right tabular-nums text-muted-foreground">
        {day.effectiveMinutes === null ? '—' : formatDuration(day.effectiveMinutes)}
      </TableCell>

      <TableCell className="text-right tabular-nums text-muted-foreground">
        {day.grossMinutes === null ? '—' : formatDuration(day.grossMinutes)}
      </TableCell>

      <TableCell className="text-right">
        {showRegularize ? (
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link href={`/hr/attendance/regularize?date=${day.date}`}>
              Regularize
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        ) : awaitingImport ? (
          // Says WHY there is no action: the day has no record yet, so there is
          // no verdict to dispute. Without this the empty cell reads as a bug.
          <span className="text-[11px] text-muted-foreground">Awaiting import</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * A worked day shows its punch pair as a bar; every other day shows the
 * `first half : second half` token pair in the status colour, matching the
 * reference UI. A future day shows nothing at all — it has not happened.
 */
function AttendanceVisual({ day }: { day: AttendanceDay }) {
  if (day.isFuture) return <span className="text-muted-foreground">—</span>;

  if (day.inTime && day.outTime) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="tabular-nums font-medium">{day.inTime}</span>
        <span
          aria-hidden
          className={cn(
            'h-1.5 w-16 rounded-full',
            day.token === 'HALF_DAY' ? 'bg-amber-400' : 'bg-emerald-400',
          )}
        />
        <span className="tabular-nums font-medium">{day.outTime}</span>
        {day.lateMinutes !== null && day.lateMinutes > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                +{day.lateMinutes}m late
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Arrived {day.lateMinutes} minute(s) after the grace deadline. Late arrival is
              recorded but does not cost the day.
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    );
  }

  const [first, second] = day.halfPair;
  const label = (
    <span className={cn('text-sm font-semibold', tonesFor(day.token).text)}>
      {STATUS_TOKENS[first].short} : {STATUS_TOKENS[second].short}
    </span>
  );

  if (day.token === 'AEYP' && day.exception) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1.5">
            {label}
            <TriangleAlert className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{day.exception.reason}</TooltipContent>
      </Tooltip>
    );
  }

  return label;
}

function LogSkeleton() {
  return (
    <div className="space-y-2 rounded-md border p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
