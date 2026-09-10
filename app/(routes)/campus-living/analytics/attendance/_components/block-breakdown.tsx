'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatInt, formatPct, pctTone, toneClass } from './format';
import type { AttendanceBlockRow } from '@/types/campus-living/attendance-analytics';

/**
 * Block × institution breakdown.
 *
 * Split by BOTH because blocks here genuinely serve several institutions —
 * Girls Hostel A houses learners from six, and presence ranges from 54% to 82%
 * *within that one block*. Collapsing to block alone averages that away and
 * hides the most actionable split on the page.
 */
export function BlockBreakdown({
  rows,
  isLoading,
}: {
  rows: AttendanceBlockRow[];
  isLoading: boolean;
}) {
  // Group by block so the institutions under it read as a set, not 14 flat rows.
  const byBlock = new Map<string, { name: string; type: string | null; rows: AttendanceBlockRow[] }>();
  for (const r of rows) {
    const key = r.block_id ?? 'unknown';
    const entry = byBlock.get(key) ?? {
      name: r.block_name ?? 'Unnamed block',
      type: r.hostel_type,
      rows: [],
    };
    entry.rows.push(r);
    byBlock.set(key, entry);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">By block and institution</CardTitle>
        <CardDescription>
          A block can house several institutions, and their attendance can differ
          sharply — so each is listed separately rather than averaged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : byBlock.size === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No attendance marked in this range.
          </p>
        ) : (
          <div className="space-y-5">
            {[...byBlock.entries()].map(([blockId, block]) => (
              <div key={blockId} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{block.name}</span>
                  {block.type && (
                    <Badge variant="outline" className="capitalize text-[10px] px-1 py-0">
                      {block.type}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2 pl-1">
                  {block.rows
                    .slice()
                    .sort((a, b) => (b.marks ?? 0) - (a.marks ?? 0))
                    .map((r) => (
                      <div key={`${blockId}-${r.institution_id}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-muted-foreground">
                            {r.institution_name ?? 'No institution'}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            <span className={toneClass(pctTone(r.attendance_pct))}>
                              {formatPct(r.attendance_pct)}
                            </span>
                            <span className="ml-2 text-muted-foreground">
                              {formatInt(r.learners)} learners · {formatInt(r.marks)} marks
                            </span>
                          </span>
                        </div>
                        <Progress value={r.attendance_pct ?? 0} className="h-1.5" />
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
