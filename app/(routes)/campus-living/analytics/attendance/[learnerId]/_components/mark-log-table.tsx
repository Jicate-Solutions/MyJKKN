'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_META, formatDate } from '../../_components/format';
import type { AttendanceMark } from '@/types/campus-living/attendance-analytics';

/**
 * Every mark on record for this learner, newest first — the audit view. Shows
 * who marked each day, which is what a disputed absence actually turns on.
 */
export function MarkLogTable({
  marks,
  isLoading,
}: {
  marks: AttendanceMark[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Mark log</CardTitle>
        <CardDescription>Every record in the selected range, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[420px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Block</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Marked by</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!isLoading && marks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No attendance marked in this range.
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                marks.map((m) => {
                  const meta = STATUS_META[m.status];
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(m.date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta ? meta.badge : ''}>
                          {meta?.label ?? m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{m.block_name ?? '—'}</TableCell>
                      <TableCell className="text-sm capitalize">
                        {m.marking_method?.replace('_', ' ') ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">{m.marked_by_name ?? '—'}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                        {m.remarks || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
