'use client';

// ============================================
// UNMARKED SESSION HISTORY — CLIENT
// ============================================
// Created: 2026-08-10
//
// Calls fn_aqs_attendance_unmarked_periods_range through the BROWSER client, so
// the request carries the user's own session JWT. That is load-bearing, not
// incidental: the function's identity guard compares p_user_id against
// auth.uid() and returns an empty result when they differ, and its permission
// gate and institution clamp are evaluated for that same user. Routing this
// through a service-role server call would hand every caller the cluster.
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CalendarSearch, Download } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/** One unmarked teaching session on one date, as the RPC returns it. */
interface UnmarkedSession {
  session_date: string;
  day_of_week: string;
  timetable_id: string;
  timetable_name: string | null;
  institution_id: string | null;
  institution_name: string | null;
  department_id: string | null;
  department_name: string | null;
  program_name: string | null;
  semester_name: string | null;
  /** NULL for a semester-level timetable — the population this view exists for. */
  section_name: string | null;
}

interface RangeResult {
  from: string;
  to: string;
  count: number;
  day_count: number;
  truncated: boolean;
  days: { session_date: string; count: number }[];
  sessions: UnmarkedSession[];
}

interface Props {
  userId: string;
  institutions: { id: string; name: string }[];
  canChooseInstitution: boolean;
}

/** Local-midnight ISO date. Never `toISOString()` — that is UTC and shifts the day. */
function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MAX_RANGE_DAYS = 366;

export function UnmarkedHistoryClient({
  userId,
  institutions,
  canChooseInstitution,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return isoDate(d);
  }, []);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => isoDate(today));
  const [institutionId, setInstitutionId] = useState<string>('');
  // Applied values are what the query actually runs on, so typing a date does
  // not fire a scan on every keystroke.
  const [applied, setApplied] = useState({ from: defaultFrom, to: isoDate(today), institutionId: '' });

  const rangeDays = useMemo(() => {
    const a = new Date(`${applied.from}T00:00:00`);
    const b = new Date(`${applied.to}T00:00:00`);
    return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
  }, [applied.from, applied.to]);

  const inverted = from > to;
  const tooLong =
    Math.round(
      (new Date(`${to}T00:00:00`).getTime() -
        new Date(`${from}T00:00:00`).getTime()) /
        86_400_000
    ) > MAX_RANGE_DAYS;

  const { data, isLoading, isFetching, error } = useQuery<RangeResult>({
    queryKey: ['unmarked-history', userId, applied.from, applied.to, applied.institutionId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data: result, error: rpcError } = await supabase.rpc(
        'fn_aqs_attendance_unmarked_periods_range',
        {
          p_user_id: userId,
          p_from: applied.from,
          p_to: applied.to,
          p_institution_id: applied.institutionId || null,
          p_limit: 500,
        }
      );
      if (rpcError) {
        logger.error(
          'academic/attendance',
          'Unmarked history: range RPC failed',
          rpcError
        );
        throw new Error(rpcError.message);
      }
      return result as unknown as RangeResult;
    },
  });

  const apply = useCallback(() => {
    if (inverted || tooLong) return;
    setApplied({ from, to, institutionId });
  }, [from, to, institutionId, inverted, tooLong]);

  // Keyboard parity with the rest of the attendance surfaces: Enter applies.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') apply();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apply]);

  const exportCsv = useCallback(() => {
    if (!data?.sessions?.length) return;
    const header = [
      'Date',
      'Day',
      'Institution',
      'Department',
      'Programme',
      'Semester',
      'Section',
      'Timetable',
    ];
    const rows = data.sessions.map((s) => [
      s.session_date,
      s.day_of_week,
      s.institution_name ?? '',
      s.department_name ?? '',
      s.program_name ?? '',
      s.semester_name ?? '',
      s.section_name ?? 'Whole semester',
      s.timetable_name ?? '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `unmarked-sessions-${data.from}-to-${data.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* ── Range picker ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Choose a period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[9rem] flex-1">
              <Label htmlFor="from-date">From</Label>
              <Input
                id="from-date"
                type="date"
                value={from}
                max={isoDate(today)}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="min-w-[9rem] flex-1">
              <Label htmlFor="to-date">To</Label>
              <Input
                id="to-date"
                type="date"
                value={to}
                max={isoDate(today)}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            {canChooseInstitution && institutions.length > 0 && (
              <div className="min-w-[12rem] flex-1">
                <Label htmlFor="institution">Institution</Label>
                <select
                  id="institution"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={institutionId}
                  onChange={(e) => setInstitutionId(e.target.value)}
                >
                  <option value="">All institutions</option>
                  {institutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button onClick={apply} disabled={inverted || tooLong || isFetching}>
              <CalendarSearch className="mr-2 h-4 w-4" />
              Show sessions
            </Button>
          </div>

          {inverted && (
            <p className="mt-3 text-sm text-destructive">
              The From date is after the To date. Swap them and try again.
            </p>
          )}
          {tooLong && !inverted && (
            <p className="mt-3 text-sm text-destructive">
              That is more than {MAX_RANGE_DAYS} days. Pick a shorter period —
              anything longer is trimmed to the last {MAX_RANGE_DAYS} days before
              the To date.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Result ───────────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>We could not load the history</AlertTitle>
          <AlertDescription>
            <p>{error instanceof Error ? error.message : 'Unknown error.'}</p>
            <p className="mt-2">
              If this keeps happening, contact your system administrator and
              mention the period you asked for.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Unmarked sessions</p>
                <p className="text-3xl font-bold">{data.count.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Days affected</p>
                <p className="text-3xl font-bold">{data.day_count.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Period shown</p>
                <p className="text-lg font-semibold">
                  {data.from} to {data.to}
                </p>
                <p className="text-xs text-muted-foreground">
                  {rangeDays} day{rangeDays === 1 ? '' : 's'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* A list that silently stops is how a history screen quietly starts
              under-reporting. Say when it has been cut. */}
          {data.truncated && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Showing the most recent {data.sessions.length} of {data.count.toLocaleString()}</AlertTitle>
              <AlertDescription>
                The counts above are for the whole period. Narrow the dates to
                see the rest.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Sessions</CardTitle>
              {data.sessions.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {data.sessions.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="font-medium">Nothing unmarked in this period</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Every session scheduled between {data.from} and {data.to}{' '}
                    that you can see has attendance against it.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Day</TableHead>
                        <TableHead>Institution</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Programme</TableHead>
                        <TableHead>Semester</TableHead>
                        <TableHead>Section</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.sessions.map((s) => (
                        <TableRow key={`${s.session_date}_${s.timetable_id}`}>
                          <TableCell className="whitespace-nowrap font-medium">
                            {s.session_date}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {s.day_of_week.charAt(0) +
                              s.day_of_week.slice(1).toLowerCase()}
                          </TableCell>
                          <TableCell>{s.institution_name ?? '—'}</TableCell>
                          <TableCell>{s.department_name ?? '—'}</TableCell>
                          <TableCell>{s.program_name ?? '—'}</TableCell>
                          <TableCell>{s.semester_name ?? '—'}</TableCell>
                          <TableCell>
                            {/* A semester-level timetable has no section. It is
                                not missing data — it is one timetable for the
                                whole semester, and it was invisible to this
                                count until the 2026-08-08 re-grain. */}
                            {s.section_name ?? (
                              <Badge variant="secondary">Whole semester</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            &ldquo;Unmarked&rdquo; means still unmarked now, not a snapshot of
            that evening — a session marked late drops off this list. Counted per
            teaching session per day, the same way the attendance dashboard
            counts today.
          </p>
        </>
      ) : null}
    </div>
  );
}
