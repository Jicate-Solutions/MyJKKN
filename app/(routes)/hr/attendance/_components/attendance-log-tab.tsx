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
              <TableHead className="w-[22%]">Date</TableHead>
              <TableHead className="w-[34%]">Attendance Visual</TableHead>
              <TableHead className="w-[14%] text-right">Effective hours</TableHead>
              <TableHead className="w-[14%] text-right">Gross hours</TableHead>
              <TableHead className="w-[16%] text-right">Actions</TableHead>
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

function LogRow({ day, canRegularize }: { day: AttendanceDay; canRegularize: boolean }) {
  const showRegularize =
    canRegularize && !day.isFuture && isRegularizable(day.token) && !isNonWorkingToken(day.token);

  return (
    <TableRow className={cn(day.isToday && 'bg-muted/40')}>
      <TableCell className="font-medium">
        <span className="flex items-center gap-2">
          <span className={cn(day.isFuture && 'text-muted-foreground')}>
            {format(day.dateObj, 'MMM dd, EEE')}
          </span>
          {!day.isFuture && isNonWorkingToken(day.token) && (
            <>
              <AttendanceTokenBadge token={day.token} />
              {day.tokenDetail && (
                <span className="text-[11px] text-muted-foreground">{day.tokenDetail}</span>
              )}
            </>
          )}
        </span>
      </TableCell>

      <TableCell>
        <AttendanceVisual day={day} />
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
