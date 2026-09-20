'use client';

/**
 * /cdc/drives/[id]/attendance — record who actually turned up to a drive.
 *
 * Every learner who declared willing (or was confirmed) for the drive, with a
 * present / absent control, a reason box that appears only on an absence, and a
 * running "N of M marked" count.
 *
 * Learners who DECLINED are listed too, below the invited ones and flagged
 * "Declined" (Director ruling, 2026-09-18 — "let them be marked"): someone who
 * said no and then walked in on the day can be recorded present. They are kept
 * out of the "N of M marked" count so that count can still reach M; the number
 * of declined learners who turned up is reported on its own.
 *
 * Data comes from
 * GET  /api/cdc/drives/[id]/attendance (gate: cdc.drives.view) and is saved by
 * POST /api/cdc/drives/[id]/attendance (gate: cdc.drives.edit).
 *
 * Only changed rows are sent, so two coordinators marking different halves of
 * the same hall do not overwrite each other.
 */

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ClipboardCheck, Loader2, Save, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useCdcDrive } from '@/hooks/cdc/use-cdc-drives';
import {
  CDC_ATTENDANCE_ROUND_TYPES,
  CDC_ATTENDANCE_ROUND_TYPE_LABEL,
  MAX_ROUND_NO,
  MIN_ROUND_NO,
  summariseRoster,
  type CdcAttendanceRosterResponse,
  type CdcAttendanceRosterRow,
  type CdcAttendanceRoundType,
} from '@/lib/services/cdc/attendance-service';
import { DriveStatusBadge } from '../../_components/drive-status-badge';

/** Local, unsaved state for one learner. */
interface Draft {
  attended: boolean | null;
  no_show_reason: string;
}

const ROUND_NUMBERS = Array.from(
  { length: MAX_ROUND_NO - MIN_ROUND_NO + 1 },
  (_, i) => MIN_ROUND_NO + i
);

async function fetchRoster(driveId: string, roundNo: number): Promise<CdcAttendanceRosterResponse> {
  const res = await fetch(`/api/cdc/drives/${driveId}/attendance?round_no=${roundNo}`, {
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? 'Failed to load the attendance roster');
  return json as CdcAttendanceRosterResponse;
}

export default function CdcDriveAttendancePage(props: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGuard module="cdc.drives" action="view">
      <AttendanceContent {...props} />
    </PermissionGuard>
  );
}

function AttendanceContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { data: detail } = useCdcDrive(id);
  const drive = detail?.data;

  const [roundNo, setRoundNo] = useState(MIN_ROUND_NO);
  const [roundTypeChoice, setRoundTypeChoice] = useState<CdcAttendanceRoundType | 'none' | null>(null);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['cdc-drive-attendance', id, roundNo],
    queryFn: () => fetchRoster(id, roundNo),
    enabled: !!id,
  });

  // Until the coordinator picks one, the round type shown is whatever the saved
  // rows for this round already carry. Derived, not synchronised in an effect.
  const roundType: CdcAttendanceRoundType | 'none' = roundTypeChoice ?? data?.round_type ?? 'none';

  /** A new round is a different sheet: drop unsaved marks and the type override. */
  function changeRound(next: number) {
    setRoundNo(next);
    setDrafts({});
    setRoundTypeChoice(null);
  }

  const rows = useMemo(() => data?.data ?? [], [data]);

  /** Saved value overlaid with the unsaved draft, which is what the table shows. */
  const effective = useMemo(() => {
    const map = new Map<string, Draft>();
    for (const r of rows) {
      const draft = drafts[r.learner_id];
      map.set(r.learner_id, {
        attended: draft ? draft.attended : r.attended,
        no_show_reason: draft ? draft.no_show_reason : (r.no_show_reason ?? ''),
      });
    }
    return map;
  }, [rows, drafts]);

  const summary = useMemo(
    () =>
      summariseRoster(
        rows.map((r) => ({
          attended: effective.get(r.learner_id)?.attended ?? null,
          declined: r.declined,
        }))
      ),
    [rows, effective]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.learner_name, r.register_number, r.department_name, r.institution_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  function setDraft(row: CdcAttendanceRosterRow, next: Partial<Draft>) {
    setDrafts((prev) => {
      const current = prev[row.learner_id] ?? {
        attended: row.attended,
        no_show_reason: row.no_show_reason ?? '',
      };
      return { ...prev, [row.learner_id]: { ...current, ...next } };
    });
  }

  // Only rows whose mark actually differs from what is stored get sent.
  const pending = useMemo(
    () =>
      rows
        .filter((r) => {
          const d = drafts[r.learner_id];
          if (!d || d.attended == null) return false;
          const reasonChanged = (d.no_show_reason || '') !== (r.no_show_reason ?? '');
          return d.attended !== r.attended || (d.attended === false && reasonChanged);
        })
        .map((r) => ({
          learner_id: r.learner_id,
          attended: drafts[r.learner_id].attended as boolean,
          no_show_reason: drafts[r.learner_id].no_show_reason || null,
        })),
    [rows, drafts]
  );

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/cdc/drives/${id}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round_no: roundNo,
          round_type: roundType === 'none' ? null : roundType,
          marks: pending,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Failed to save attendance');
      return json as { saved: number; round_no: number };
    },
    onSuccess: (result) => {
      toast.success(`Saved attendance for ${result.saved} learner${result.saved === 1 ? '' : 's'}.`);
      setDrafts({});
      queryClient.invalidateQueries({ queryKey: ['cdc-drive-attendance', id, roundNo] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save attendance');
    },
  });

  return (
    <ContentLayout title="Drive attendance">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/cdc/drives">Drives</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/cdc/drives/${id}`}>{drive?.title ?? 'Drive'}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Attendance</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
              {drive?.title ?? 'Drive'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
              {drive ? <DriveStatusBadge status={drive.status} /> : null}
              <span>
                {summary.marked} of {summary.total} marked
              </span>
              <span>· {summary.present} present</span>
              <span>· {summary.absent} absent</span>
              <span>· {summary.unmarked} not yet marked</span>
              {summary.declined > 0 ? (
                <span>
                  · {summary.declined} declined
                  {summary.declined_present > 0 ? `, ${summary.declined_present} turned up anyway` : ''}
                </span>
              ) : null}
            </p>
          </div>
          <PermissionGuard module="cdc.drives" action="edit" fallback={null}>
            <Button onClick={() => save.mutate()} disabled={pending.length === 0 || save.isPending}>
              {save.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save {pending.length > 0 ? `${pending.length} change${pending.length === 1 ? '' : 's'}` : 'attendance'}
            </Button>
          </PermissionGuard>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Round</CardTitle>
            <CardDescription>
              Attendance is kept per round, so the same learner can be present for the aptitude test and
              absent for the interview. Changing the round loads that round&apos;s sheet.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <Select value={String(roundNo)} onValueChange={(v) => changeRound(parseInt(v, 10))}>
              <SelectTrigger aria-label="Round number">
                <SelectValue placeholder="Round" />
              </SelectTrigger>
              <SelectContent>
                {ROUND_NUMBERS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    Round {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={roundType}
              onValueChange={(v) => setRoundTypeChoice(v as CdcAttendanceRoundType | 'none')}
            >
              <SelectTrigger aria-label="Round type">
                <SelectValue placeholder="Round type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not specified</SelectItem>
                {CDC_ATTENDANCE_ROUND_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CDC_ATTENDANCE_ROUND_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search name, register no, department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading the roster…</p>
            ) : error ? (
              <p className="p-6 text-sm text-destructive">
                {error instanceof Error ? error.message : 'Failed to load'}
              </p>
            ) : visible.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No learners to mark</p>
                <p className="text-xs text-muted-foreground">
                  {rows.length > 0
                    ? 'No rows match your search.'
                    : 'The roster is every learner who answered this drive, whether they said yes or no. Nobody has answered yet.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Learner</TableHead>
                      <TableHead>Institution / Dept</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead className="w-48">Attendance</TableHead>
                      <TableHead>Reason for absence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((r, i) => {
                      const state = effective.get(r.learner_id) ?? { attended: null, no_show_reason: '' };
                      return (
                        <TableRow key={r.learner_id}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            <div className="font-medium flex flex-wrap items-center gap-2">
                              <span>{r.learner_name ?? '—'}</span>
                              {r.declined ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs font-normal border-amber-500/60 text-amber-700 dark:text-amber-400"
                                  title="This learner told the CDC they were not coming. Mark them present if they turned up anyway."
                                >
                                  Declined
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">{r.register_number ?? ''}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{r.institution_name ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">{r.department_name ?? ''}</div>
                          </TableCell>
                          <TableCell>{r.semester_label ?? '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={state.attended === true ? 'default' : 'outline'}
                                aria-pressed={state.attended === true}
                                onClick={() => setDraft(r, { attended: true })}
                              >
                                Present
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={state.attended === false ? 'destructive' : 'outline'}
                                aria-pressed={state.attended === false}
                                onClick={() => setDraft(r, { attended: false })}
                              >
                                Absent
                              </Button>
                              {state.attended === null ? (
                                <Badge variant="outline" className="text-xs">
                                  Not marked
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            {state.attended === false ? (
                              <Input
                                value={state.no_show_reason}
                                placeholder="Why were they absent? (optional)"
                                aria-label={`Reason ${r.learner_name ?? r.register_number ?? ''} was absent`}
                                onChange={(e) => setDraft(r, { no_show_reason: e.target.value })}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
