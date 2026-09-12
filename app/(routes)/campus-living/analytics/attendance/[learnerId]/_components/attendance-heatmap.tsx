'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { STATUS_META, formatDate } from '../../_components/format';
import type { AttendanceDay } from '@/types/campus-living/attendance-analytics';

const DOW_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Local YYYY-MM-DD, avoiding the UTC shift toISOString() would introduce. */
function isoLocal(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Month-grid heatmap of one learner's attendance.
 *
 * A day with no record renders as an empty cell, NOT as an absence. This is the
 * whole point: only 469 of 712 residents are marked at all, so painting
 * unmarked days red would invent dozens of absences for anyone whose block is
 * not running roll call.
 */
export function AttendanceHeatmap({
  days,
  from,
  to,
  isLoading,
}: {
  days: AttendanceDay[];
  from: string;
  to: string;
  isLoading: boolean;
}) {
  const byDate = new Map(days.map((d) => [d.date, d.status]));

  // Build the month buckets spanned by the range.
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const months: { key: string; label: string; cells: (string | null)[] }[] = [];

  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const first = new Date(year, month, 1);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      // Leading blanks so the 1st lands under its weekday column.
      const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
      for (let d = 1; d <= daysInMonth; d++) {
        cells.push(isoLocal(new Date(year, month, d)));
      }
      months.push({
        key: `${year}-${month}`,
        label: first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        cells,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Day by day</CardTitle>
        <CardDescription>
          Each square is one day. Blank squares were never marked — they are not
          absences.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : months.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Invalid date range.</p>
        ) : (
          <TooltipProvider delayDuration={100}>
            <div className="flex flex-wrap gap-6">
              {months.map((m) => (
                <div key={m.key} className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{m.label}</div>
                  <div className="grid grid-cols-7 gap-1">
                    {DOW_INITIALS.map((d, i) => (
                      <div
                        key={`h${i}`}
                        className="h-4 w-6 text-center text-[9px] leading-4 text-muted-foreground"
                      >
                        {d}
                      </div>
                    ))}
                    {m.cells.map((iso, i) => {
                      if (!iso) return <div key={`b${i}`} className="h-6 w-6" />;
                      const inRange = iso >= from && iso <= to;
                      const status = byDate.get(iso);
                      const meta = status ? STATUS_META[status] : undefined;
                      return (
                        <Tooltip key={iso}>
                          <TooltipTrigger asChild>
                            <div
                              className={`h-6 w-6 rounded-sm border text-[9px] leading-6 text-center ${
                                meta
                                  ? `${meta.dot} border-transparent text-white`
                                  : inRange
                                    ? 'border-dashed bg-muted/40 text-muted-foreground'
                                    : 'border-transparent bg-transparent text-muted-foreground/40'
                              }`}
                            >
                              {Number(iso.slice(8, 10))}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <div className="font-medium">{formatDate(iso)}</div>
                              <div>
                                {meta ? meta.label : inRange ? 'Not marked' : 'Outside range'}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {Object.entries(STATUS_META).map(([key, meta]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className={`h-3 w-3 rounded-sm ${meta.dot}`} />
                  {meta.label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border border-dashed bg-muted/40" />
                Not marked
              </span>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
