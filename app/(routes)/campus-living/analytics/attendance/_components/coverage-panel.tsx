'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Info } from 'lucide-react';
import { formatInt, formatPct } from './format';
import type { AttendanceCoverageRow } from '@/types/campus-living/attendance-analytics';

/**
 * Marking coverage — allocated residents vs residents actually marked.
 *
 * This panel leads the dashboard on purpose. Every attendance percentage in the
 * app is present ÷ MARKED, so a block that never marks silently *improves* the
 * rate rather than dragging it down. At the time of writing 712 residents were
 * allocated and only 469 had ever been marked, with all three Boys hostels at
 * or near zero — so the headline rate described two thirds of the population
 * while looking like it described all of it.
 */
export function CoveragePanel({
  coverage,
  coverageVisible,
  isLoading,
}: {
  coverage: AttendanceCoverageRow[];
  coverageVisible: boolean;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marking coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    );
  }

  // hostel_allocations is gated by campus_living.allocations.view — a different
  // key from campus_living.attendance.view. Rather than divide by a zero we
  // mistook for a real total, say plainly that the denominator is unavailable.
  if (!coverageVisible) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Coverage unavailable</AlertTitle>
        <AlertDescription>
          Resident totals come from allocations, which your role cannot read
          (<code className="text-xs">campus_living.allocations.view</code>). The
          percentages below still describe only the learners who have been
          marked — they are not a group-wide figure.
        </AlertDescription>
      </Alert>
    );
  }

  const totals = coverage.reduce(
    (acc, r) => ({
      residents: acc.residents + r.residents,
      marked: acc.marked + r.ever_marked,
      inRange: acc.inRange + r.marked_in_range,
    }),
    { residents: 0, marked: 0, inRange: 0 },
  );

  const overallPct = totals.residents > 0 ? (totals.marked / totals.residents) * 100 : null;
  const notMarking = coverage.filter((r) => r.residents > 0 && r.ever_marked === 0);
  const barelyMarking = coverage.filter(
    (r) => r.residents > 0 && r.ever_marked > 0 && r.ever_marked / r.residents < 0.5,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <CardTitle className="text-base">Marking coverage</CardTitle>
            <CardDescription>
              Residents who have ever been marked, against everyone currently
              holding a bed. Every percentage on this page is calculated over
              marked learners only.
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">
              {formatInt(totals.marked)} / {formatInt(totals.residents)}
            </div>
            <div className="text-xs text-muted-foreground">{formatPct(overallPct)} of residents</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {(notMarking.length > 0 || barelyMarking.length > 0) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {notMarking.length > 0
                ? `${notMarking.length} block${notMarking.length === 1 ? '' : 's'} not marking attendance`
                : 'Some blocks are barely marking'}
            </AlertTitle>
            <AlertDescription>
              {[...notMarking, ...barelyMarking]
                .map((b) => `${b.block_name ?? 'Unnamed block'} (${formatInt(b.ever_marked)}/${formatInt(b.residents)})`)
                .join(', ')}
              . Their residents are absent from every figure on this page — the
              rate is not lower for them, they simply are not counted.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {coverage.length === 0 && (
            <p className="text-sm text-muted-foreground">No allocated residents in scope.</p>
          )}
          {coverage.map((row) => {
            const pct = row.residents > 0 ? (row.ever_marked / row.residents) * 100 : 0;
            const none = row.ever_marked === 0 && row.residents > 0;
            return (
              <div key={`${row.block_id}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate font-medium">{row.block_name ?? 'Unnamed block'}</span>
                    {row.hostel_type && (
                      <Badge variant="outline" className="capitalize text-[10px] px-1 py-0">
                        {row.hostel_type}
                      </Badge>
                    )}
                    {none && (
                      <Badge variant="destructive" className="text-[10px] px-1 py-0">
                        not marking
                      </Badge>
                    )}
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatInt(row.ever_marked)} / {formatInt(row.residents)}
                    <span className="ml-2 text-xs">({formatInt(row.marked_in_range)} in range)</span>
                  </span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
