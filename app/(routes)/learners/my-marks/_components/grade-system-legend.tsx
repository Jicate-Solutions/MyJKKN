'use client';

/**
 * Grade System reference legend.
 *
 * Renders the institution's grade bands (grade letter, grade point, mark
 * range, description) as a compact reference table below the result. Data
 * comes from the same `useMyMarksGradeSystem` fetch that decorates each
 * subject's grade, so no extra request.
 *
 * Bands are shown highest-scale first (by min_mark desc) so the table reads
 * like a top-down scale (Outstanding → Re-Appear). Sentinel/absent bands
 * (negative min_mark) sink to the bottom.
 */

import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListChecks } from 'lucide-react';
import type { ResultViewGradeBand } from '@/types/my-marks';

interface Props {
  bands: ResultViewGradeBand[];
  gradeSystemCode?: string | null;
}

function fmtMark(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return String(v);
}

export function GradeSystemLegend({ bands, gradeSystemCode }: Props) {
  const sorted = useMemo(
    () =>
      [...bands].sort((a, b) => {
        // Highest min_mark first; nulls/sentinels (negatives) to the bottom.
        const am = a.min_mark ?? -Infinity;
        const bm = b.min_mark ?? -Infinity;
        return bm - am;
      }),
    [bands]
  );

  if (sorted.length === 0) return null;

  return (
    <Card className="overflow-hidden rounded-xl border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          Grade System
          {gradeSystemCode && (
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {gradeSystemCode}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-b from-muted/60 to-muted/20 hover:bg-transparent [&>th]:h-11 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider">
                <TableHead className="whitespace-nowrap">Grade</TableHead>
                <TableHead className="text-center whitespace-nowrap">Grade Point</TableHead>
                <TableHead className="text-center whitespace-nowrap">Min Mark</TableHead>
                <TableHead className="text-center whitespace-nowrap">Max Mark</TableHead>
                <TableHead className="min-w-[160px]">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((b, idx) => (
                <TableRow
                  key={`${b.grade ?? 'band'}-${idx}`}
                  className="border-border/50 transition-colors hover:bg-muted/40"
                >
                  <TableCell className="font-bold">{b.grade ?? '—'}</TableCell>
                  <TableCell className="text-center tabular-nums">
                    {b.grade_point ?? '—'}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {fmtMark(b.min_mark)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {fmtMark(b.max_mark)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {b.description ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
