'use client';

import { useMemo } from 'react';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FacilitatorAttendanceStat } from '@/types/attendance';

interface Props {
  facilitators: FacilitatorAttendanceStat[];
  dateFrom: string;
  dateTo: string;
}

function getHeatColor(count: number): string {
  if (count === 0) return 'bg-muted';
  if (count === 1) return 'bg-green-200 dark:bg-green-900';
  if (count === 2) return 'bg-green-400 dark:bg-green-700';
  return 'bg-green-600 dark:bg-green-500';
}

export function FacilitatorHeatmap({ facilitators, dateFrom, dateTo }: Props) {
  const topFacilitators = facilitators.slice(0, 15);

  const dates = useMemo(() => {
    try {
      return eachDayOfInterval({
        start: parseISO(dateFrom),
        end: parseISO(dateTo),
      });
    } catch {
      return [];
    }
  }, [dateFrom, dateTo]);

  // Build lookup: staffId -> dateStr -> count
  const lookup = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    topFacilitators.forEach((f) => {
      const dayMap = new Map<string, number>();
      f.dailyData.forEach((d) => dayMap.set(d.date, d.count));
      map.set(f.staffId, dayMap);
    });
    return map;
  }, [topFacilitators]);

  if (topFacilitators.length === 0 || dates.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm sm:text-base">Period Marking Heatmap</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-40 sm:h-48 text-muted-foreground text-xs sm:text-sm">
          No data for selected filters
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm sm:text-base">Period Marking Heatmap</CardTitle>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          Periods marked per day — top {topFacilitators.length} facilitators
        </p>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="overflow-x-auto -mx-1">
          <div className="min-w-max px-1">
            {/* Date header row */}
            <div className="flex gap-px sm:gap-0.5 mb-1 ml-20 sm:ml-28 md:ml-32">
              {dates.map((date) => (
                <div
                  key={date.toISOString()}
                  className="w-3 sm:w-4 text-center"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 32 }}
                >
                  <span className="text-[8px] sm:text-[9px] text-muted-foreground">
                    {format(date, 'd')}
                  </span>
                </div>
              ))}
            </div>

            {/* Facilitator rows */}
            {topFacilitators.map((f) => (
              <div key={f.staffId} className="flex items-center gap-px sm:gap-0.5 mb-px sm:mb-0.5">
                <div className="w-20 sm:w-28 md:w-32 text-[10px] sm:text-xs text-right pr-1.5 sm:pr-2 text-muted-foreground truncate shrink-0">
                  {f.firstName} {f.lastName}
                </div>
                {dates.map((date) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const count = lookup.get(f.staffId)?.get(dateStr) ?? 0;
                  return (
                    <div
                      key={dateStr}
                      className={`w-3 h-3 sm:w-4 sm:h-4 rounded-sm cursor-default ${getHeatColor(count)}`}
                      title={`${f.firstName} ${f.lastName} — ${format(date, 'MMM d, yyyy')}: ${count} period${count !== 1 ? 's' : ''}`}
                    />
                  );
                })}
              </div>
            ))}

            {/* Legend */}
            <div className="flex items-center gap-1 mt-2.5 ml-20 sm:ml-28 md:ml-32">
              <span className="text-[10px] sm:text-xs text-muted-foreground">Less</span>
              {[0, 1, 2, 3].map((v) => (
                <div key={v} className={`w-3 h-3 sm:w-4 sm:h-4 rounded-sm ${getHeatColor(v)}`} />
              ))}
              <span className="text-[10px] sm:text-xs text-muted-foreground">More</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
