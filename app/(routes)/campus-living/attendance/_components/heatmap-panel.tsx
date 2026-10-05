'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { heatmap, type CubeFilter } from '@/lib/campus-living/attendance-cube';
import type { AttendanceBreakdown } from '@/types/campus-living/attendance-analytics';
import { formatInt, formatPct, RATE_PIVOT, shortDate, useVizPalette } from './palette';

type D = 'institution' | 'department';

/**
 * Rate heatmap: rows = institution or department, columns = day (or week past 31
 * days). Colour = rate, and the tooltip names the counted marks behind it — a pale
 * cell with 3 marks is not the same evidence as one with 300. Click a row label to
 * filter to it.
 */
export function HeatmapPanel({
  data,
  filter,
  isLoading,
  onSelect,
}: {
  data: AttendanceBreakdown | undefined;
  filter: CubeFilter;
  isLoading: boolean;
  onSelect: (dim: D, key: string) => void;
}) {
  const viz = useVizPalette();
  const [dim, setDim] = useState<D>('institution');
  const map = useMemo(() => (data ? heatmap(data, dim, filter) : null), [data, dim, filter]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Attendance heatmap</CardTitle>
          <CardDescription>
            Spot the bad days: each cell is the rate for that {map?.bucket ?? 'day'}. Grey = nothing counted.
          </CardDescription>
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={dim}
          onValueChange={(v) => v && setDim(v as D)}
        >
          <ToggleGroupItem value="institution">Institution</ToggleGroupItem>
          <ToggleGroupItem value="department">Department</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {isLoading || !map ? (
          <Skeleton className="h-[220px] w-full" />
        ) : map.rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nothing marked for this selection.</p>
        ) : (
          <>
            <div className="overflow-x-auto" role="table" aria-label="Attendance rate heatmap">
              <div
                className="grid gap-px"
                style={{
                  gridTemplateColumns: `minmax(112px,190px) repeat(${map.columns.length}, minmax(24px, 1fr))`,
                }}
              >
                <div role="row" className="contents">
                  <div className="sticky left-0 bg-card" />
                  {map.columns.map((c) => (
                    <div key={c} role="columnheader" className="pb-1 text-center text-[10px] text-muted-foreground">
                      {map.columns.length > 20 ? shortDate(c).slice(3) : shortDate(c)}
                    </div>
                  ))}
                </div>
                {map.rows.map((r) => (
                  <div key={r.key} role="row" className="contents">
                    <button
                      type="button"
                      onClick={() => onSelect(dim, r.key)}
                      className="sticky left-0 truncate bg-card py-1 pr-2 text-left text-xs hover:underline"
                      title={r.label}
                    >
                      {r.label}
                    </button>
                    {map.columns.map((c) => {
                      const cell = map.cells[r.key][c];
                      return (
                        <div
                          key={c}
                          role="cell"
                          className="h-7 rounded-[2px]"
                          style={{ backgroundColor: viz.rateFill(cell.pct) }}
                          title={`${r.label} · ${map.bucket === 'week' ? 'week of ' : ''}${c}: ${formatPct(cell.pct)} (${formatInt(cell.denom)} counted)`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            {/* Diverging legend: red below the line, gray at it, blue above. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>≤40%</span>
                <span
                  className="h-3 w-36 rounded-[2px]"
                  style={{ backgroundImage: `linear-gradient(to right, ${viz.rateRamp.join(', ')})` }}
                  aria-hidden
                />
                <span>100%</span>
                <span className="text-foreground/70">· gray = {RATE_PIVOT}% at-risk line</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-6 rounded-[2px]" style={{ backgroundColor: viz.noData }} />
                <span>No data</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
