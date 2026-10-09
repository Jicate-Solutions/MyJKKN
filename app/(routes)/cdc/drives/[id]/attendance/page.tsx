'use client';

/**
 * /cdc/drives/[id]/attendance — drive-day attendance.
 *
 * NOT wrapped in a cdc.drives PermissionGuard on purpose: assigned faculty /
 * coordinators hold no CDC permission. The API decides access (cdc.drives.view,
 * or an assignment row for THIS drive) and answers 403 otherwise; this page
 * renders that refusal.
 *
 * The roster is the finalized participant list. Nobody types a learner in.
 */

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
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
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Calendar, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Clock, Download, FilterX, Info, Loader2, MapPin, RotateCcw, Search, ShieldCheck, Users, XCircle } from 'lucide-react';
import {
  cdcDriveAttendanceExportUrl,
  useCdcDriveAttendance,
  useMarkCdcDriveAttendance,
} from '@/hooks/cdc/use-cdc-drive-day';
import type { CdcDriveAttendanceStatus } from '@/types/cdc';
import { CDC_COORDINATOR_ROLLBACK_FROM } from '@/types/cdc';
import { DriveStatusBadge } from '../../_components/drive-status-badge';
import { MoveBackButton } from '../../_components/move-back-dialog';
import { Pill, TONE, initials, type Tone } from '../../_components/status-pill';

const STATUS_LABEL: Record<CdcDriveAttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
  not_attended: 'Not Attended',
};
const STATUS_CLASS: Record<CdcDriveAttendanceStatus, string> = {
  present: 'bg-green-600 hover:bg-green-600 text-white',
  late: 'bg-amber-500 hover:bg-amber-500 text-white',
  absent: 'bg-red-600 hover:bg-red-600 text-white',
  excused: 'bg-blue-600 hover:bg-blue-600 text-white',
  not_attended: 'bg-muted text-muted-foreground hover:bg-muted',
};
const ORDER: CdcDriveAttendanceStatus[] = ['present', 'absent', 'late', 'excused', 'not_attended'];
const PAGE_SIZES = [10, 20, 50, 100, 250, 500] as const;
const STATUS_TONE: Record<CdcDriveAttendanceStatus, Tone> = {
  present: 'emerald',
  absent: 'rose',
  late: 'amber',
  excused: 'blue',
  not_attended: 'slate',
};

/** Bulk action buttons: `outline` for the ticked row, `solid` for the "all shown" row. */
const BULK_ACTIONS: Array<{
  status: CdcDriveAttendanceStatus;
  label: string;
  short: string;
  icon: typeof CheckCircle2;
  outline: string;
  solid: string;
}> = [
  {
    status: 'present',
    label: 'Mark Present',
    short: 'Present',
    icon: CheckCircle2,
    outline: 'border-green-600/40 bg-background text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40',
    solid: 'bg-green-600 text-white hover:bg-green-700',
  },
  {
    status: 'absent',
    label: 'Mark Absent',
    short: 'Absent',
    icon: XCircle,
    outline: 'border-red-600/40 bg-background text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40',
    solid: 'bg-red-600 text-white hover:bg-red-700',
  },
  {
    status: 'late',
    label: 'Mark Late',
    short: 'Late',
    icon: Clock,
    outline: 'border-amber-500/50 bg-background text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40',
    solid: 'bg-amber-500 text-white hover:bg-amber-600',
  },
  {
    status: 'excused',
    label: 'Mark Excused',
    short: 'Excused',
    icon: ShieldCheck,
    outline: 'border-blue-600/40 bg-background text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40',
    solid: 'bg-blue-600 text-white hover:bg-blue-700',
  },
];

export default function CdcDriveAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useCdcDriveAttendance(id);
  const mark = useMarkCdcDriveAttendance(id);

  const [filter, setFilter] = useState<'all' | 'unmarked' | CdcDriveAttendanceStatus>('all');
  const [search, setSearch] = useState('');
  const [institution, setInstitution] = useState('all');
  const [program, setProgram] = useState('all');
  const [semester, setSemester] = useState('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [remarks, setRemarks] = useState('');
  // Which control started the save ("ticked:present", "all:absent", "row:<id>:late", …)
  // so ONLY that control shows a spinner instead of every button at once.
  const [pending, setPending] = useState<{ key: string; count: number } | null>(null);
  const [pageSize, setPageSize] = useState<number | 'all'>(50);
  const [page, setPage] = useState(1);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  // Cascade: institution narrows programs, institution + program narrow semesters.
  const institutionOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (r.institution_id) m.set(r.institution_id, r.institution_name ?? r.institution_id);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const programOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (!r.program_id) return;
      if (institution !== 'all' && r.institution_id !== institution) return;
      m.set(r.program_id, r.program_name ?? 'Unnamed program');
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, institution]);
  const semesterOptions = useMemo(() => {
    const s = new Set<number>();
    rows.forEach((r) => {
      if (r.semester_order == null) return;
      if (institution !== 'all' && r.institution_id !== institution) return;
      if (program !== 'all' && r.program_id !== program) return;
      s.add(r.semester_order);
    });
    return Array.from(s).sort((a, b) => a - b);
  }, [rows, institution, program]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'unmarked' ? !!r.attendance_status : filter !== 'all' && r.attendance_status !== filter) return false;
      if (institution !== 'all' && r.institution_id !== institution) return false;
      if (program !== 'all' && r.program_id !== program) return false;
      if (semester !== 'all' && String(r.semester_order ?? '') !== semester) return false;
      if (!q) return true;
      return [r.learner_name, r.register_number, r.department_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, filter, search, institution, program, semester]);
  const filtersActive = institution !== 'all' || program !== 'all' || semester !== 'all' || filter !== 'all' || !!search.trim();

  if (isLoading) {
    return (
      <ContentLayout title="Drive attendance">
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading attendance…
        </div>
      </ContentLayout>
    );
  }
  if (error || !data) {
    return (
      <ContentLayout title="Drive attendance">
        <div className="p-6">
          <Alert variant="destructive">
            <Info className="h-4 w-4" />
            <AlertTitle>Attendance is not available</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : 'Could not load this drive'}</AlertDescription>
          </Alert>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/cdc/drives/coordinating">My assigned drives</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const { drive, summary, access, preview } = data;
  const canMark = access.canMark;
  // Coordinators hold no CDC permission, so they go back to their own list.
  const backHref = access.canView ? `/cdc/drives/${id}` : '/cdc/drives/coordinating';
  const backLabel = access.canView ? 'Back to Drive' : 'Back to my assigned drives';
  const markedCount = summary.total - summary.unmarked;
  const markedPct = summary.total ? Math.round((markedCount / summary.total) * 100) : 0;
  const stats: Array<{ label: string; value: number; icon: typeof Users; tone: Tone; filter: typeof filter }> = [
    { label: preview ? 'Willing (preview)' : 'Participants', value: summary.total, icon: Users, tone: 'violet', filter: 'all' },
    { label: 'Present', value: summary.present, icon: CheckCircle2, tone: 'emerald', filter: 'present' },
    { label: 'Absent', value: summary.absent, icon: XCircle, tone: 'rose', filter: 'absent' },
    { label: 'Late', value: summary.late, icon: Clock, tone: 'amber', filter: 'late' },
    { label: 'Excused', value: summary.excused, icon: ShieldCheck, tone: 'blue', filter: 'excused' },
    { label: 'Not marked', value: summary.unmarked, icon: CircleDashed, tone: 'slate', filter: 'unmarked' },
  ];

  // Client-side paging over the filtered list.
  const pageCount = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = pageSize === 'all' ? 0 : (safePage - 1) * pageSize;
  const pageRows = pageSize === 'all' ? visible : visible.slice(pageStart, pageStart + pageSize);
  const allPageOn = pageRows.length > 0 && pageRows.every((r) => picked.has(r.learner_id));

  function toggle(idv: string) {
    const next = new Set(picked);
    if (next.has(idv)) next.delete(idv);
    else next.add(idv);
    setPicked(next);
  }
  function setRows(list: typeof visible, on: boolean) {
    const next = new Set(picked);
    list.forEach((r) => (on ? next.add(r.learner_id) : next.delete(r.learner_id)));
    setPicked(next);
  }

  /** status = null clears the mark (back to "Not marked"). */
  async function apply(status: CdcDriveAttendanceStatus | null, ids: string[], key: string) {
    if (ids.length === 0) return;
    setPending({ key, count: ids.length });
    try {
      const res = await mark.mutateAsync({ learner_ids: ids, status, remarks: remarks.trim() || null });
      toast.success(status ? `${res.marked} marked ${STATUS_LABEL[status]}` : `${res.cleared} mark${res.cleared === 1 ? '' : 's'} cleared`);
      setPicked(new Set());
      setRemarks('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save attendance');
    } finally {
      setPending(null);
    }
  }

  /** One-click bulk for everything the filters currently show (all pages). */
  function applyToAllShown(status: CdcDriveAttendanceStatus | null) {
    const ids = visible.map((r) => r.learner_id);
    if (ids.length === 0) return;
    const what = status ? `mark ${ids.length} learner${ids.length === 1 ? '' : 's'} ${STATUS_LABEL[status]}` : `clear the attendance mark of ${ids.length} learner${ids.length === 1 ? '' : 's'}`;
    if (!window.confirm(`This will ${what} (everything the current filters show, across all pages). Continue?`)) return;
    void apply(status, ids, `all:${status ?? 'clear'}`);
  }

  return (
    <ContentLayout title="Drive attendance">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={access.canView ? '/cdc/drives' : '/cdc/drives/coordinating'}>
                {access.canView ? 'Drives' : 'My assigned drives'}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {access.canView ? (
            <>
              <BreadcrumbItem><BreadcrumbLink asChild><Link href={`/cdc/drives/${id}`}>{drive.title}</Link></BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          ) : null}
          <BreadcrumbItem><BreadcrumbPage>Attendance</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-5">
        {/* ── Page header ── */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button asChild variant="outline" size="icon" className="mt-0.5 h-9 w-9 shrink-0 rounded-full shadow-sm" title={backLabel}>
              <Link href={backHref} aria-label={backLabel}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{drive.title}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <DriveStatusBadge status={drive.status} />
                {drive.drive_date ? <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{drive.drive_date}</span> : null}
                {drive.venue_label ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{drive.venue_label}</span> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Editors may step back from any stage; a coordinator only within the drive-day stages. */}
            {access.canManage || (access.isCoordinator && CDC_COORDINATOR_ROLLBACK_FROM.has(drive.status)) ? (
              <MoveBackButton driveId={id} status={drive.status} size="default" />
            ) : null}
            {summary.total > 0 ? (
              <Button asChild variant="outline" className="shadow-sm">
                <a href={cdcDriveAttendanceExportUrl(id, filter, { institution_id: institution, program_id: program, semester_order: semester })}>
                  <Download className="h-4 w-4 mr-2" /> Download Excel
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        {/* ── Score cards — each one also filters the list. ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {stats.map((st) => {
            const Icon = st.icon;
            const active = filter === st.filter;
            return (
              <button
                key={st.label}
                type="button"
                onClick={() => {
                  setFilter(st.filter);
                  setPage(1);
                }}
                aria-pressed={active}
                className={cn(
                  'rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow',
                  active && 'border-primary ring-1 ring-primary'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{st.label}</span>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset', TONE[st.tone])}>
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-3xl font-semibold leading-none tracking-tight tabular-nums">{st.value}</p>
              </button>
            );
          })}
        </div>

        {/* ── Marking progress ── */}
        {summary.total > 0 && !preview ? (
          <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Attendance marked</span>
              <span className="tabular-nums text-muted-foreground">
                {markedCount} of {summary.total} · {markedPct}%
              </span>
            </div>
            <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(summary.present / summary.total) * 100}%` }} title={`Present ${summary.present}`} />
              <div className="h-full bg-amber-500 transition-all" style={{ width: `${(summary.late / summary.total) * 100}%` }} title={`Late ${summary.late}`} />
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${(summary.excused / summary.total) * 100}%` }} title={`Excused ${summary.excused}`} />
              <div className="h-full bg-rose-500 transition-all" style={{ width: `${(summary.absent / summary.total) * 100}%` }} title={`Absent ${summary.absent}`} />
            </div>
          </div>
        ) : null}

        {!drive.participants_finalized_at ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Participants are not finalized yet</AlertTitle>
            <AlertDescription>
              {summary.total > 0
                ? `Showing the ${summary.total} learner${summary.total === 1 ? '' : 's'} who answered Willing, as a preview. Attendance can be marked once the list is finalized.`
                : 'Nobody has answered Willing yet, so there is no one to list.'}
              {access.canManage ? (
                <> <Link href={`/cdc/drives/${id}/participants`} className="underline">Finalize participants</Link> to begin.</>
              ) : (
                ' The CDC office has not finalized it yet.'
              )}
            </AlertDescription>
          </Alert>
        ) : !canMark && access.markBlockedReason ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>View only</AlertTitle>
            <AlertDescription>{access.markBlockedReason}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="overflow-hidden rounded-xl shadow-sm">
          <CardHeader className="space-y-4 border-b bg-muted/20 pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  Attendance list
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                    {visible.length === rows.length ? rows.length : `${visible.length} of ${rows.length}`}
                  </span>
                  {picked.size > 0 ? <Pill tone="violet">{picked.size} ticked</Pill> : null}
                </CardTitle>
                <CardDescription>The finalized participant list. Mark one learner, the ticked ones, or everyone shown.</CardDescription>
              </div>
              <div className="relative w-full lg:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="bg-background pl-9" placeholder="Search name / register no" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>

            {/* Attendance status — segmented control */}
            <div className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-1" role="tablist" aria-label="Show">
              {(['all', 'unmarked', ...ORDER] as Array<typeof filter>).map((k) => {
                const active = filter === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setFilter(k);
                      setPage(1);
                    }}
                    className={cn(
                      'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
                      active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {k === 'all' ? 'All' : k === 'unmarked' ? 'Not marked' : STATUS_LABEL[k]}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
              <Select
                value={institution}
                onValueChange={(v) => {
                  setInstitution(v);
                  setProgram('all');
                  setSemester('all');
                }}
              >
                <SelectTrigger className={cn('bg-background', institution !== 'all' && 'border-primary/60')}><SelectValue placeholder="Institution" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All institutions</SelectItem>
                  {institutionOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={program}
                onValueChange={(v) => {
                  setProgram(v);
                  setSemester('all');
                }}
              >
                <SelectTrigger className={cn('bg-background', program !== 'all' && 'border-primary/60')}><SelectValue placeholder="Program" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All programs</SelectItem>
                  {programOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={semester} onValueChange={setSemester}>
                <SelectTrigger className={cn('bg-background', semester !== 'all' && 'border-primary/60')}><SelectValue placeholder="Semester" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All semesters</SelectItem>
                  {semesterOptions.map((o) => (
                    <SelectItem key={o} value={String(o)}>Semester {o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                disabled={!filtersActive}
                onClick={() => {
                  setInstitution('all');
                  setProgram('all');
                  setSemester('all');
                  setFilter('all');
                  setSearch('');
                }}
              >
                <FilterX className="mr-1.5 h-4 w-4" /> Clear
              </Button>
            </div>

            {canMark ? (
              <div className="rounded-xl border bg-background shadow-sm">
                {/* Ticked learners */}
                <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-[9.5rem]">
                    <span
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold ${
                        picked.size > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {picked.size}
                    </span>
                    <span className="text-xs font-medium">Ticked learners</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {BULK_ACTIONS.map((a) => (
                      <button
                        key={a.status}
                        type="button"
                        disabled={picked.size === 0 || mark.isPending}
                        onClick={() => apply(a.status, Array.from(picked), `ticked:${a.status}`)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${a.outline}`}
                      >
                        {pending?.key === `ticked:${a.status}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <a.icon className="h-3.5 w-3.5" />}
                        {a.label}
                      </button>
                    ))}
                    <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
                    <button
                      type="button"
                      disabled={picked.size === 0 || mark.isPending}
                      onClick={() => apply(null, Array.from(picked), 'ticked:clear')}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {pending?.key === 'ticked:clear' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Clear mark
                    </button>
                    {picked.size > 0 ? (
                      <button
                        type="button"
                        onClick={() => setPicked(new Set())}
                        className="inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Untick all
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Everything the filters show */}
                <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                  <div className="flex items-center gap-2 min-w-[9.5rem]">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">
                      {visible.length}
                    </span>
                    <span className="text-xs font-medium">All shown</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {BULK_ACTIONS.filter((a) => a.status !== 'excused').map((a) => (
                      <button
                        key={a.status}
                        type="button"
                        disabled={visible.length === 0 || mark.isPending}
                        onClick={() => applyToAllShown(a.status)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${a.solid}`}
                      >
                        {pending?.key === `all:${a.status}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <a.icon className="h-3.5 w-3.5" />}
                        All {a.short}
                      </button>
                    ))}
                    <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
                    <button
                      type="button"
                      disabled={visible.length === 0 || mark.isPending}
                      onClick={() => applyToAllShown(null)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {pending?.key === 'all:clear' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Clear all shown
                    </button>
                  </div>
                  <Input
                    className="ml-auto h-8 w-full sm:w-60 bg-background"
                    placeholder="Remarks for this action (optional)"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    maxLength={500}
                  />
                </div>
                {pending && pending.count > 1 ? (
                  <div className="border-t px-3 py-2" role="status" aria-live="polite">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving attendance for {pending.count} learners…
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-12 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </span>
                <p className="text-sm font-medium">
                  {summary.total === 0
                    ? preview
                      ? 'No learner has answered Willing yet.'
                      : 'No finalized participants yet.'
                    : 'No learners match these filters.'}
                </p>
                {summary.total > 0 ? <p className="text-xs text-muted-foreground">Try clearing the search or filters.</p> : null}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 [&>th]:h-10 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide">
                      <TableHead className="w-10">
                        {canMark ? <Checkbox checked={allPageOn} onCheckedChange={(v) => setRows(pageRows, v === true)} aria-label="Select all on this page" /> : null}
                      </TableHead>
                      <TableHead>Learner</TableHead>
                      <TableHead>Program / Dept</TableHead>
                      <TableHead>Willingness</TableHead>
                      <TableHead>Attendance</TableHead>
                      <TableHead>Marked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => (
                      <TableRow key={r.learner_id} className={cn('transition-colors', picked.has(r.learner_id) && 'bg-primary/5 hover:bg-primary/10')}>
                        <TableCell>{canMark ? <Checkbox checked={picked.has(r.learner_id)} onCheckedChange={() => toggle(r.learner_id)} aria-label={`Select ${r.learner_name ?? 'learner'}`} /> : null}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset',
                                r.attendance_status ? TONE[STATUS_TONE[r.attendance_status]] : 'bg-muted text-muted-foreground ring-transparent'
                              )}
                            >
                              {initials(r.learner_name)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-medium">{r.learner_name ?? '—'}</div>
                              <div className="font-mono text-xs text-muted-foreground">{r.register_number ?? '—'}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{r.program_name ?? r.department_name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">
                            {[r.program_name ? r.department_name : null, r.semester_label].filter(Boolean).join(' · ')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Pill tone={r.bucket === 'willing' ? 'emerald' : r.bucket === 'not_willing' ? 'slate' : 'amber'}>
                            {r.bucket === 'willing' ? 'Willing' : r.bucket === 'not_willing' ? 'Not willing' : 'Pending'}
                          </Pill>
                        </TableCell>
                        <TableCell>
                          {canMark ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(['present', 'absent', 'late'] as CdcDriveAttendanceStatus[]).map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  disabled={mark.isPending}
                                  onClick={() => apply(s, [r.learner_id], `row:${r.learner_id}:${s}`)}
                                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                    r.attendance_status === s ? STATUS_CLASS[s] + ' border-transparent shadow-sm' : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                                  }`}
                                >
                                  {pending?.key === `row:${r.learner_id}:${s}` ? (
                                    <Loader2 className="inline h-3 w-3 animate-spin" />
                                  ) : (
                                    STATUS_LABEL[s]
                                  )}
                                </button>
                              ))}
                              {r.attendance_status && !['present', 'absent', 'late'].includes(r.attendance_status) ? (
                                <Badge className={STATUS_CLASS[r.attendance_status]}>{STATUS_LABEL[r.attendance_status]}</Badge>
                              ) : null}
                              {r.attendance_status ? (
                                <button
                                  type="button"
                                  disabled={mark.isPending}
                                  onClick={() => apply(null, [r.learner_id], `row:${r.learner_id}:clear`)}
                                  title="Clear this mark"
                                  aria-label="Clear this mark"
                                  className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                                >
                                  {pending?.key === `row:${r.learner_id}:clear` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                                </button>
                              ) : null}
                            </div>
                          ) : r.attendance_status ? (
                            <Pill tone={STATUS_TONE[r.attendance_status]}>{STATUS_LABEL[r.attendance_status]}</Pill>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not marked</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.attendance_marked_at ? (
                            <>
                              <div className="whitespace-nowrap text-foreground/80">{new Date(r.attendance_marked_at).toLocaleString()}</div>
                              <div>{r.attendance_marked_by ?? ''}{r.attendance_remarks ? ` · ${r.attendance_remarks}` : ''}</div>
                            </>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {visible.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Rows per page</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(v === 'all' ? 'all' : parseInt(v, 10));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {pageStart + 1}–{Math.min(pageStart + pageRows.length, visible.length)} of {visible.length}
                  </span>
                  <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-muted-foreground">Page {safePage} / {pageCount}</span>
                  <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label="Next page">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
