'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, GaugeCircle, AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { cn } from '@/lib/utils';

/**
 * navMeta — the monitor is a sibling sub-page of the internal-marks module,
 * reached from the same parent as the Report page. Mirrors report/page.tsx so
 * the route-manifest generator nests it under Internal Marks and the
 * reachability gate treats it like its sibling.
 */
export const navMeta = {
  invokedFrom: '/academic/internal-marks',
  label: 'IA Monitor',
} as const;

// ── API response shapes (see app/api/internal-marks/monitor/route.ts) ────────

interface SessionOption {
  id: string;
  session_code: string | null;
  session_name: string | null;
  session_status: string | null;
}

type CiaStatus = 'draft' | 'submitted' | 'verified' | 'approved' | 'locked';

interface MonitorRow {
  course_code: string | null;
  course_name: string | null;
  program_code: string | null;
  faculty_name: string | null;
  cia: {
    total_entries: number;
    draft: number;
    submitted: number;
    verified: number;
    approved: number;
    locked: number;
    avg_percentage: number | null;
    status: CiaStatus;
  };
  finals: {
    total_students: number;
    published: number;
    passed: number;
    failed: number;
  } | null;
  flags: string[];
}

interface MonitorResponse {
  sessionCode: string;
  institution: string | null;
  summary: { total_courses: number; needs_attention: number; finalized: number };
  rows: MonitorRow[];
}

// ── Presentation maps ────────────────────────────────────────────────────────

const CIA_STATUS_STYLE: Record<CiaStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/40' },
  submitted: { label: 'Submitted', className: 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30' },
  verified: { label: 'Verified', className: 'bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950/30' },
  approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30' },
  locked: { label: 'Locked', className: 'bg-emerald-100 text-emerald-800 border-emerald-400 dark:bg-emerald-900/40' },
};

const FLAG_STYLE: Record<string, { label: string; className: string }> = {
  cia_entered_not_finalized: {
    label: 'Results not published',
    className: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/30',
  },
  cia_still_draft: {
    label: 'CIA still draft',
    className: 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30',
  },
  finals_partially_published: {
    label: 'Results partial',
    className: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/30',
  },
};

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json;
}

export default function InternalMarksMonitorPage() {
  const { isSuperAdmin, canAccess, isLoading: isLoadingPermissions } = usePermissions();
  const { profile } = useAuth();
  const canView =
    isLoadingPermissions || isSuperAdmin || canAccess('academic.internal-marks', 'view');

  // Super admin picks an institution; everyone else is server-locked to their
  // own (the API resolves scope from the session, so we simply omit it).
  const [institutionId, setInstitutionId] = useState<string>('');
  const [sessionCode, setSessionCode] = useState<string>('');

  const { institutions, loading: isLoadingInstitutions } = useInstitutionsWithAccess({
    autoFetch: true,
  });

  const institutionParam = isSuperAdmin ? institutionId : profile?.institution_id ?? '';
  const qs = institutionParam ? `institutionId=${institutionParam}` : '';

  // Sessions for the picker. For super admins with no institution chosen, the
  // API returns all sessions; picking an institution narrows them.
  const { data: sessionData, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['ia-monitor-sessions', institutionParam],
    queryFn: () => fetchJson(`/api/internal-marks/monitor${qs ? `?${qs}` : ''}`),
    enabled: canView && (!isSuperAdmin || !!institutionParam || true),
  });
  const sessions: SessionOption[] = sessionData?.sessions ?? [];

  const {
    data: monitor,
    isFetching: isLoadingMonitor,
    error: monitorError,
  } = useQuery<MonitorResponse>({
    queryKey: ['ia-monitor', institutionParam, sessionCode],
    queryFn: () =>
      fetchJson(
        `/api/internal-marks/monitor?sessionCode=${encodeURIComponent(sessionCode)}${qs ? `&${qs}` : ''}`,
      ),
    enabled: canView && !!sessionCode,
  });

  const summary = monitor?.summary;
  const finalizedPct = useMemo(() => {
    if (!summary || summary.total_courses === 0) return 0;
    return Math.round((summary.finalized / summary.total_courses) * 100);
  }, [summary]);

  if (!canView) {
    return (
      <ContentLayout title="IA Completeness Monitor">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">
            You do not have permission to view the internal-marks monitor.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const needsInstitution = isSuperAdmin && !institutionId;

  return (
    <ContentLayout title="IA Completeness Monitor">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/academic/internal-marks">Internal Marks</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>IA Monitor</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
            <GaugeCircle className="h-6 w-6" /> IA Completeness Monitor
          </h1>
          <p className="text-sm text-muted-foreground">
            Track which courses have their CIA marks entered and their results published, for an
            exam session — read directly from the exam system, so it works even while the COE
            portal is offline.
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div
              className={cn(
                'grid grid-cols-1 gap-4',
                isSuperAdmin ? 'md:grid-cols-2' : 'md:grid-cols-1',
              )}
            >
              {isSuperAdmin && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Institution <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={institutionId}
                    onValueChange={(v) => {
                      setInstitutionId(v);
                      setSessionCode('');
                    }}
                    disabled={isLoadingInstitutions}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={isLoadingInstitutions ? 'Loading…' : 'Select institution'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Exam Session <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={sessionCode}
                  onValueChange={setSessionCode}
                  disabled={isLoadingSessions || needsInstitution}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        needsInstitution
                          ? 'Select institution first'
                          : isLoadingSessions
                            ? 'Loading sessions…'
                            : 'Select exam session'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions
                      .filter((s) => s.session_code)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.session_code!}>
                          {s.session_name ?? s.session_code}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary strip — the signature: a completeness meter over the session */}
        {summary && sessionCode && !isLoadingMonitor && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile
              icon={<ListChecks className="h-5 w-5" />}
              label="Courses in session"
              value={summary.total_courses}
              tone="neutral"
            />
            <StatTile
              icon={<AlertTriangle className="h-5 w-5" />}
              label="Needs attention"
              value={summary.needs_attention}
              tone={summary.needs_attention > 0 ? 'warn' : 'neutral'}
            />
            <StatTile
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="Results published"
              value={summary.finalized}
              tone={summary.finalized === summary.total_courses ? 'good' : 'neutral'}
              footer={
                <div className="mt-2">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${finalizedPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {finalizedPct}% of courses finalized
                  </p>
                </div>
              }
            />
          </div>
        )}

        {/* Loading */}
        {isLoadingMonitor && sessionCode && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading monitor…</span>
          </div>
        )}

        {/* Error */}
        {monitorError && sessionCode && !isLoadingMonitor && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
              <p className="text-muted-foreground text-center">
                {monitorError instanceof Error ? monitorError.message : 'Failed to load the monitor.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        {monitor && sessionCode && !isLoadingMonitor && !monitorError && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[130px]">Course</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Faculty</TableHead>
                      <TableHead className="text-center">CIA status</TableHead>
                      <TableHead className="text-center">CIA avg %</TableHead>
                      <TableHead className="text-center">Results (published / total)</TableHead>
                      <TableHead>Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monitor.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                          No courses found for this session.
                        </TableCell>
                      </TableRow>
                    )}
                    {monitor.rows.map((row, i) => {
                      const s = CIA_STATUS_STYLE[row.cia.status];
                      return (
                        <TableRow
                          key={`${row.course_code ?? 'x'}-${i}`}
                          className={cn(row.flags.length > 0 && 'bg-amber-50/40 dark:bg-amber-950/10')}
                        >
                          <TableCell className="font-mono text-xs font-medium">
                            {row.course_code ?? '—'}
                            {row.program_code && (
                              <span className="block text-[10px] text-muted-foreground">
                                {row.program_code}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-[240px] truncate" title={row.course_name ?? ''}>
                            {row.course_name ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.faculty_name ?? '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={cn('font-medium', s.className)}>
                              {s.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            {row.cia.avg_percentage != null
                              ? `${row.cia.avg_percentage.toFixed(1)}%`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">
                            {row.finals ? (
                              <span>
                                <span
                                  className={cn(
                                    'font-semibold',
                                    row.finals.published === 0
                                      ? 'text-amber-600'
                                      : row.finals.published < row.finals.total_students
                                        ? 'text-amber-600'
                                        : 'text-emerald-600',
                                  )}
                                >
                                  {row.finals.published}
                                </span>{' '}
                                <span className="text-muted-foreground">
                                  / {row.finals.total_students}
                                </span>
                                {row.finals.published > 0 && (
                                  <span className="block text-[10px] text-muted-foreground">
                                    {row.finals.passed} pass · {row.finals.failed} fail
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.flags.length === 0 ? (
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30"
                              >
                                OK
                              </Badge>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {row.flags.map((f) => {
                                  const fs = FLAG_STYLE[f] ?? {
                                    label: f,
                                    className: 'bg-muted text-muted-foreground border-border',
                                  };
                                  return (
                                    <Badge key={f} variant="outline" className={cn('text-[11px]', fs.className)}>
                                      {fs.label}
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state (no session picked) */}
        {!sessionCode && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <GaugeCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                {needsInstitution
                  ? 'Select an institution and an exam session to see IA completeness.'
                  : 'Select an exam session to see which courses have CIA entered and results published.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

// ── Small presentational stat tile ───────────────────────────────────────────

function StatTile({
  icon,
  label,
  value,
  tone,
  footer,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'neutral' | 'warn' | 'good';
  footer?: React.ReactNode;
}) {
  const toneClass =
    tone === 'warn'
      ? 'text-amber-600'
      : tone === 'good'
        ? 'text-emerald-600'
        : 'text-foreground';
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className={toneClass}>{icon}</span>
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className={cn('mt-2 text-3xl font-bold tabular-nums', toneClass)}>{value}</p>
        {footer}
      </CardContent>
    </Card>
  );
}
