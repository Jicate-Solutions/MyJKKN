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
        <CardHeader>
          <CardTitle className="text-base">Period Marking Heatmap</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data for selected filters
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Period Marking Heatmap</CardTitle>
        <p className="text-xs text-muted-foreground">
          Periods marked per day — top {topFacilitators.length} facilitators
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-max">
            {/* Date header row */}
            <div className="flex gap-0.5 mb-1 ml-32">
              {dates.map((date) => (
                <div
                  key={date.toISOString()}
                  className="w-4 text-center"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 40 }}
                >
                  <span className="text-[9px] text-muted-foreground">
                    {format(date, 'd')}
                  </span>
                </div>
              ))}
            </div>

            {/* Facilitator rows */}
            {topFacilitators.map((f) => (
              <div key={f.staffId} className="flex items-center gap-0.5 mb-0.5">
                <div className="w-32 text-xs text-right pr-2 text-muted-foreground truncate">
                  {f.firstName} {f.lastName}
                </div>
                {dates.map((date) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const count = lookup.get(f.staffId)?.get(dateStr) ?? 0;
                  return (
                    <div
                      key={dateStr}
                      className={`w-4 h-4 rounded-sm cursor-default ${getHeatColor(count)}`}
                      title={`${f.firstName} ${f.lastName} — ${format(date, 'MMM d, yyyy')}: ${count} period${count !== 1 ? 's' : ''}`}
                    />
                  );
                })}
              </div>
            ))}

            {/* Legend */}
            <div className="flex items-center gap-1 mt-3 ml-32">
              <span className="text-xs text-muted-foreground">Less</span>
              {[0, 1, 2, 3].map((v) => (
                <div key={v} className={`w-4 h-4 rounded-sm ${getHeatColor(v)}`} />
              ))}
              <span className="text-xs text-muted-foreground">More</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
