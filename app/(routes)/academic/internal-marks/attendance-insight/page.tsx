'use client';

import { useState } from 'react';
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
import { Loader2, Scale, TrendingDown, Sparkles, Users } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { cn } from '@/lib/utils';

/**
 * Sibling sub-page of the internal-marks module (same parent as Monitor/Report),
 * so the route-manifest nests it under Internal Marks.
 */
export const navMeta = {
  invokedFrom: '/academic/internal-marks',
  label: 'Attendance vs Marks',
} as const;

interface SessionOption {
  id: string;
  session_code: string | null;
  session_name: string | null;
}

type Note = 'struggling' | 'anomaly';

interface InsightRow {
  student_id: string | null;
  student_name: string | null;
  register_no: string | null;
  program_code: string | null;
  course_code: string | null;
  course_name: string | null;
  attendance_pct: number;
  present: number;
  total: number;
  cia_pct: number;
  note: Note;
}

interface InsightResponse {
  sessionCode: string;
  institution: string | null;
  thresholds: { attend_high: number; attend_low: number; cia_low: number; cia_high: number };
  summary: {
    cia_students: number;
    students_compared: number;
    cia_students_without_attendance: number;
    struggling: number;
    anomaly: number;
  };
  flagged_total: number;
  flagged: InsightRow[];
}

const NOTE_STYLE: Record<Note, { label: string; className: string }> = {
  struggling: {
    label: 'Struggling',
    className: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/30',
  },
  anomaly: {
    label: 'Anomaly',
    className: 'bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950/30',
  },
};

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json;
}

export default function AttendanceVsMarksPage() {
  const { isSuperAdmin, canAccess, isLoading: isLoadingPermissions } = usePermissions();
  const { profile } = useAuth();
  const canView =
    isLoadingPermissions || isSuperAdmin || canAccess('academic.internal-marks', 'view');

  const [institutionId, setInstitutionId] = useState<string>('');
  const [sessionCode, setSessionCode] = useState<string>('');

  const { institutions, loading: isLoadingInstitutions } = useInstitutionsWithAccess({
    autoFetch: true,
  });

  const institutionParam = isSuperAdmin ? institutionId : profile?.institution_id ?? '';
  const qs = institutionParam ? `institutionId=${institutionParam}` : '';

  const { data: sessionData, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['att-insight-sessions', institutionParam],
    queryFn: () => fetchJson(`/api/internal-marks/attendance-insight${qs ? `?${qs}` : ''}`),
    enabled: canView,
  });
  const sessions: SessionOption[] = sessionData?.sessions ?? [];

  const {
    data: insight,
    isFetching: isLoadingInsight,
    error: insightError,
  } = useQuery<InsightResponse>({
    queryKey: ['att-insight', institutionParam, sessionCode],
    queryFn: () =>
      fetchJson(
        `/api/internal-marks/attendance-insight?sessionCode=${encodeURIComponent(sessionCode)}${qs ? `&${qs}` : ''}`,
      ),
    enabled: canView && !!sessionCode && !!institutionParam,
  });

  const summary = insight?.summary;

  if (!canView) {
    return (
      <ContentLayout title="Attendance vs Internal Marks">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">
            You do not have permission to view internal-marks insights.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const needsInstitution = isSuperAdmin && !institutionId;

  return (
    <ContentLayout title="Attendance vs Internal Marks">
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
            <BreadcrumbPage>Attendance vs Marks</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
            <Scale className="h-6 w-6" /> Attendance vs Internal Marks
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Puts each student&apos;s attendance (from MyJKKN) next to their internal marks (from
            the exam system) for a session, and flags two patterns worth a look:{' '}
            <span className="font-medium text-amber-700 dark:text-amber-400">Struggling</span>{' '}
            (attends regularly but scores low) and{' '}
            <span className="font-medium text-violet-700 dark:text-violet-400">Anomaly</span>{' '}
            (scores well despite low attendance). Attendance % is overall (across all marked
            classes), not per-course.
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* Summary */}
        {summary && sessionCode && !isLoadingInsight && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile
              icon={<Users className="h-5 w-5" />}
              label="Students compared"
              value={summary.students_compared}
              tone="neutral"
              footer={
                summary.cia_students_without_attendance > 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {summary.cia_students_without_attendance} more have marks but no attendance
                    recorded
                  </p>
                ) : undefined
              }
            />
            <StatTile
              icon={<TrendingDown className="h-5 w-5" />}
              label="Struggling"
              value={summary.struggling}
              tone={summary.struggling > 0 ? 'warn' : 'neutral'}
              footer={
                insight ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    ≥{insight.thresholds.attend_high}% attend · &lt;{insight.thresholds.cia_low}%
                    marks
                  </p>
                ) : undefined
              }
            />
            <StatTile
              icon={<Sparkles className="h-5 w-5" />}
              label="Anomalies"
              value={summary.anomaly}
              tone={summary.anomaly > 0 ? 'accent' : 'neutral'}
              footer={
                insight ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    &lt;{insight.thresholds.attend_low}% attend · ≥{insight.thresholds.cia_high}%
                    marks
                  </p>
                ) : undefined
              }
            />
          </div>
        )}

        {isLoadingInsight && sessionCode && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Comparing attendance and marks…</span>
          </div>
        )}

        {insightError && sessionCode && !isLoadingInsight && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Scale className="h-10 w-10 text-amber-500 mb-3" />
              <p className="text-muted-foreground text-center">
                {insightError instanceof Error ? insightError.message : 'Failed to load insight.'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Flagged table */}
        {insight && sessionCode && !isLoadingInsight && !insightError && (
          <Card>
            <CardContent className="p-0">
              {insight.flagged.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <Scale className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No struggling students or anomalies in this session
                    {summary ? ` (compared ${summary.students_compared} students).` : '.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {insight.flagged_total > insight.flagged.length && (
                    <p className="px-4 pt-4 text-xs text-muted-foreground">
                      Showing the {insight.flagged.length} most severe of{' '}
                      {insight.flagged_total.toLocaleString()} flagged rows (widest gap between
                      attendance and marks first).
                    </p>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Course</TableHead>
                        <TableHead className="text-center">Attendance</TableHead>
                        <TableHead className="text-center">Internal marks</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {insight.flagged.map((row, i) => {
                        const s = NOTE_STYLE[row.note];
                        return (
                          <TableRow
                            key={`${row.student_id ?? 'x'}-${row.course_code ?? i}-${i}`}
                            className={cn(
                              row.note === 'struggling'
                                ? 'bg-amber-50/40 dark:bg-amber-950/10'
                                : 'bg-violet-50/40 dark:bg-violet-950/10',
                            )}
                          >
                            <TableCell className="text-sm">
                              <span className="font-medium">{row.student_name ?? '—'}</span>
                              <span className="block text-[11px] text-muted-foreground font-mono">
                                {row.register_no ?? ''}
                                {row.program_code ? ` · ${row.program_code}` : ''}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm max-w-[240px]">
                              <span className="font-mono text-xs">{row.course_code ?? '—'}</span>
                              <span
                                className="block text-[11px] text-muted-foreground truncate"
                                title={row.course_name ?? ''}
                              >
                                {row.course_name ?? ''}
                              </span>
                            </TableCell>
                            <TableCell className="text-center tabular-nums">
                              <span
                                className={cn(
                                  'font-semibold',
                                  row.attendance_pct >= 75 ? 'text-emerald-600' : 'text-amber-600',
                                )}
                              >
                                {row.attendance_pct.toFixed(1)}%
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                {row.present}/{row.total} classes
                              </span>
                            </TableCell>
                            <TableCell className="text-center tabular-nums">
                              <span
                                className={cn(
                                  'font-semibold',
                                  row.cia_pct >= 50 ? 'text-emerald-600' : 'text-red-600',
                                )}
                              >
                                {row.cia_pct.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn('font-medium', s.className)}>
                                {s.label}
                              </Badge>
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
        )}

        {/* Empty state */}
        {!sessionCode && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Scale className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                {needsInstitution
                  ? 'Select an institution and an exam session to compare attendance against internal marks.'
                  : 'Select an exam session to compare attendance against internal marks.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

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
  tone: 'neutral' | 'warn' | 'accent';
  footer?: React.ReactNode;
}) {
  const toneClass =
    tone === 'warn'
      ? 'text-amber-600'
      : tone === 'accent'
        ? 'text-violet-600'
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
