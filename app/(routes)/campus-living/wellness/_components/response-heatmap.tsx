'use client';

/**
 * ResponseHeatmap — period × mood matrix for the warden dashboard.
 *
 * Pure-presentational. Receives pre-aggregated cells from
 * WellnessService.buildHeatmap(). Color intensity scales with count;
 * mood buckets 1..5 use a red→amber→green ramp so low-mood weeks pop.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';
import type { PulseHeatmapCell } from '@/types/campus-living/wellness';

interface ResponseHeatmapProps {
  cells: PulseHeatmapCell[];
}

const MOOD_BUCKETS = ['1', '2', '3', '4', '5', 'na'] as const;

const MOOD_BG: Record<string, string> = {
  '1': 'bg-red-600',
  '2': 'bg-red-400',
  '3': 'bg-amber-400',
  '4': 'bg-emerald-400',
  '5': 'bg-emerald-600',
  na: 'bg-slate-300',
};

const MOOD_LABEL: Record<string, string> = {
  '1': '1 · low',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5 · high',
  na: 'n/a',
};

function formatPeriodLabel(iso: string): string {
  // Already a date string from period_start (YYYY-MM-DD).
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function ResponseHeatmap({ cells }: ResponseHeatmapProps) {
  const periods = Array.from(new Set(cells.map((c) => c.period_start))).sort();
  const cellMap = new Map<string, number>();
  for (const c of cells) cellMap.set(`${c.period_start}|${c.mood_bucket}`, c.count);

  const max = cells.reduce((m, c) => Math.max(m, c.count), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mood × Period</CardTitle>
      </CardHeader>
      <CardContent>
        {periods.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Info className="h-4 w-4" />
            <span>No responses yet — heatmap fills once learners submit.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="text-left text-muted-foreground font-normal pr-2">
                    Mood
                  </th>
                  {periods.map((p) => (
                    <th
                      key={p}
                      className="text-muted-foreground font-normal px-1 whitespace-nowrap"
                    >
                      {formatPeriodLabel(p)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOOD_BUCKETS.map((bucket) => (
                  <tr key={bucket}>
                    <td className="text-right pr-2 text-muted-foreground whitespace-nowrap">
                      {MOOD_LABEL[bucket]}
                    </td>
                    {periods.map((p) => {
                      const count = cellMap.get(`${p}|${bucket}`) ?? 0;
                      const intensity =
                        count === 0 ? 0 : Math.max(0.25, count / Math.max(max, 1));
                      return (
                        <td key={`${p}|${bucket}`} className="p-0">
                          <div
                            className={`h-7 w-12 rounded ${
                              count === 0
                                ? 'bg-muted'
                                : MOOD_BG[bucket] ?? 'bg-slate-300'
                            } flex items-center justify-center text-white font-medium`}
                            style={count === 0 ? undefined : { opacity: intensity }}
                            title={`${MOOD_LABEL[bucket]} · ${formatPeriodLabel(p)} · ${count}`}
                          >
                            {count > 0 ? count : ''}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
