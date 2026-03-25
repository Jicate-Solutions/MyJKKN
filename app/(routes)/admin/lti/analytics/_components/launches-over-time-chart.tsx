/**
 * Launches Over Time Chart Component
 * Line chart showing LTI launches per day
 *
 * Created: 2026-01-12
 */

'use client';

import { useMemo } from 'react';
import { format, eachDayOfInterval, startOfDay } from 'date-fns';

interface Launch {
  id: string;
  launched_at: string;
}

interface LaunchesOverTimeChartProps {
  launches: Launch[];
  startDate: Date;
  endDate: Date;
}

export function LaunchesOverTimeChart({
  launches,
  startDate,
  endDate
}: LaunchesOverTimeChartProps) {
  const chartData = useMemo(() => {
    // Get all days in range
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    // Count launches per day
    const launchesPerDay = new Map<string, number>();

    days.forEach((day) => {
      const dayKey = format(day, 'yyyy-MM-dd');
      launchesPerDay.set(dayKey, 0);
    });

    launches.forEach((launch) => {
      const launchDate = startOfDay(new Date(launch.launched_at));
      const dayKey = format(launchDate, 'yyyy-MM-dd');

      if (launchesPerDay.has(dayKey)) {
        launchesPerDay.set(dayKey, launchesPerDay.get(dayKey)! + 1);
      }
    });

    // Convert to array
    return Array.from(launchesPerDay.entries()).map(([date, count]) => ({
      date,
      count,
      label: format(new Date(date), 'MMM dd')
    }));
  }, [launches, startDate, endDate]);

  const maxCount = Math.max(...chartData.map((d) => d.count), 1);

  if (launches.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No launches in selected date range
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="font-medium">Total: </span>
          <span className="text-muted-foreground">
            {launches.length.toLocaleString()} launches
          </span>
        </div>
        <div>
          <span className="font-medium">Avg: </span>
          <span className="text-muted-foreground">
            {(launches.length / chartData.length).toFixed(1)} launches/day
          </span>
        </div>
        <div>
          <span className="font-medium">Peak: </span>
          <span className="text-muted-foreground">
            {maxCount} launches
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="space-y-2">
        {chartData.map((day) => (
          <div key={day.date} className="flex items-center gap-2">
            <div className="w-16 text-xs text-muted-foreground text-right">
              {day.label}
            </div>
            <div className="flex-1 relative">
              <div className="h-8 bg-secondary rounded flex items-center overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-500 flex items-center justify-end pr-2"
                  style={{
                    width: `${(day.count / maxCount) * 100}%`
                  }}
                >
                  {day.count > 0 && (
                    <span className="text-xs font-medium text-white">
                      {day.count}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
