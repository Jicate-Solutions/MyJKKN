'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Search, ChevronRight as Chevron } from 'lucide-react';
import { formatInt, formatPct, formatDate, pctTone, toneClass } from './format';
import { useAttendanceLearners } from '@/hooks/campus-living/use-attendance-analytics';

const PAGE_SIZE = 25;

const BAND_OPTIONS = [
  { value: 'all', label: 'All learners', maxPct: null },
  { value: '75', label: 'Below 75%', maxPct: 75 },
  { value: '50', label: 'Below 50%', maxPct: 50 },
  { value: '25', label: 'Below 25%', maxPct: 25 },
];

/**
 * Per-learner attendance, worst first — the actionable end of this dashboard.
 *
 * Search, band filter and paging all happen server-side in
 * fn_cl_attendance_learners so the browser never holds the whole roster.
 */
export function AtRiskTable({
  institutionId,
  from,
  to,
  blockId,
}: {
  institutionId: string | undefined;
  from: string;
  to: string;
  blockId: string | null;
}) {
  const [search, setSearch] = useState('');
  const [band, setBand] = useState('all');
  const [page, setPage] = useState(0);

  const maxPct = BAND_OPTIONS.find((b) => b.value === band)?.maxPct ?? null;

  const { data, isLoading, error } = useAttendanceLearners(institutionId, {
    from,
    to,
    blockId,
    search: search.trim() || null,
    maxPct,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));

  // Any control that changes the result set must reset paging, or page 4 of a
  // new filter renders empty and reads as "no results".
  const onSearch = (v: string) => {
    setSearch(v);
    setPage(0);
  };
  const onBand = (v: string) => {
    setBand(v);
    setPage(0);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Learners</CardTitle>
            <CardDescription>
              Lowest attendance first. Absence runs count consecutive{' '}
              <strong>marked</strong> days — a gap in marking does not break a run.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Name or roll number"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                className="w-full pl-8 sm:w-[220px]"
              />
            </div>
            <Select value={band} onValueChange={onBand}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAND_OPTIONS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {error ? (
          <p className="py-8 text-center text-sm text-destructive">
            Could not load learners: {(error as Error).message}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Learner</TableHead>
                    <TableHead>Block / Room</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Present</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Longest run</TableHead>
                    <TableHead>Last present</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading &&
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={`s${i}`}>
                        <TableCell colSpan={8}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}

                  {!isLoading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        No learners match this filter.
                      </TableCell>
                    </TableRow>
                  )}

                  {!isLoading &&
                    rows.map((r) => (
                      <TableRow key={r.learner_id} className="group">
                        <TableCell>
                          <Link
                            href={`/campus-living/analytics/attendance/${r.learner_id}?from=${from}&to=${to}`}
                            className="block hover:underline"
                          >
                            <div className="font-medium">{r.full_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {[r.roll_number, r.program_name].filter(Boolean).join(' · ') || '—'}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{r.block_name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.room_number ? `Room ${r.room_number}` : 'No current bed'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={`font-medium ${toneClass(pctTone(r.attendance_pct))}`}>
                            {formatPct(r.attendance_pct)}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            of {formatInt(r.pct_denominator)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatInt(r.present)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatInt(r.absent)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInt(r.longest_absent_run)}
                          {r.current_absent_run > 0 && (
                            <Badge variant="destructive" className="ml-2 px-1 py-0 text-[10px]">
                              {r.current_absent_run} ongoing
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(r.last_present_date)}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/campus-living/analytics/attendance/${r.learner_id}?from=${from}&to=${to}`}
                            aria-label={`Open ${r.full_name}'s attendance`}
                          >
                            <Chevron className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {formatInt(Number(total))} learner{Number(total) === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums text-muted-foreground">
                  {page + 1} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page + 1 >= pageCount || isLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
