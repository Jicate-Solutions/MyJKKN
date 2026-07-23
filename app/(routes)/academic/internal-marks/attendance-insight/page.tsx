'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import {
  Loader2,
  Scale,
  TrendingDown,
  Sparkles,
  Users,
  ClipboardList,
  CheckCircle2,
  SlidersHorizontal,
  History,
  AlertTriangle,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
interface FlaggedRow {
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
interface OwesRow {
  student_id: string;
  student_name: string | null;
  register_no: string | null;
  attendance_pct: number;
  present: number;
  total: number;
}
interface CheckDataRow {
  student_id: string | null;
  student_name: string | null;
  register_no: string | null;
  course_code: string | null;
  course_name: string | null;
  cia_pct: number;
  total: number;
}
interface InsightResponse {
  needsInstitution?: boolean;
  noTerm?: boolean;
  institution: string | null;
  term: {
    session_code: string;
    session_name: string | null;
    auto_detected: boolean;
    reason: string | null;
  } | null;
  canPeek: boolean;
  thresholds: { attendance: number; anomaly_cia: number; struggling_cia: number };
  summary: {
    students_with_attendance: number;
    students_with_marks: number;
    owes_marks: number;
    struggling: number;
    anomaly: number;
    check_data: number;
    marks_without_attendance: number;
  };
  owesMarksTotal: number;
  owesMarks: OwesRow[];
  flaggedTotal: number;
  flagged: FlaggedRow[];
  checkDataTotal: number;
  checkData: CheckDataRow[];
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
  const qc = useQueryClient();
  const canView =
    isLoadingPermissions || isSuperAdmin || canAccess('academic.internal-marks', 'view');

  const [institutionId, setInstitutionId] = useState<string>('');
  const [peekOpen, setPeekOpen] = useState(false);
  const [peekSession, setPeekSession] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { institutions, loading: isLoadingInstitutions } = useInstitutionsWithAccess({
    autoFetch: true,
  });

  const institutionParam = isSuperAdmin ? institutionId : profile?.institution_id ?? '';
  const activePeek = peekOpen && peekSession ? peekSession : '';

  const insightUrl = () => {
    const p = new URLSearchParams();
    if (institutionParam) p.set('institutionId', institutionParam);
    if (activePeek) p.set('sessionCode', activePeek);
    return `/api/internal-marks/attendance-insight?${p.toString()}`;
  };

  const {
    data: insight,
    isFetching,
    error,
  } = useQuery<InsightResponse>({
    queryKey: ['att-insight', institutionParam, activePeek],
    queryFn: () => fetchJson(insightUrl()),
    enabled: canView && !!institutionParam,
  });

  // Term list for the admin peek dropdown.
  const { data: sessionsData } = useQuery({
    queryKey: ['att-insight-sessions', institutionParam],
    queryFn: () =>
      fetchJson(`/api/internal-marks/attendance-insight?institutionId=${institutionParam}&listSessions=1`),
    enabled: canView && !!institutionParam && peekOpen && isSuperAdmin,
  });
  const sessions: SessionOption[] = sessionsData?.sessions ?? [];

  const summary = insight?.summary;
  const term = insight?.term;

  if (!canView) {
    return (
      <ContentLayout title="Attendance & Live Marks">
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
    <ContentLayout title="Attendance & Live Marks">
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
            <Scale className="h-6 w-6" /> Attendance &amp; Live Marks
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Tracks the current term so internal marks get entered live through the semester, not
            all at the end. Two views: <span className="font-medium">who still owes marks</span>{' '}
            (attending but nothing entered yet), and{' '}
            <span className="font-medium text-amber-700 dark:text-amber-400">Struggling</span> /{' '}
            <span className="font-medium text-violet-700 dark:text-violet-400">Anomaly</span> once
            marks exist. Attendance % is overall, not per-course.
          </p>
        </div>

        {/* Institution + term controls */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            {isSuperAdmin && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Institution <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={institutionId}
                    onValueChange={(v) => {
                      setInstitutionId(v);
                      setPeekOpen(false);
                      setPeekSession('');
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
              </div>
            )}

            {/* Term banner */}
            {term && !needsInstitution && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Monitoring term:</span>
                  <Badge variant="secondary" className="font-mono">
                    {term.session_name ?? term.session_code}
                  </Badge>
                  {term.auto_detected ? (
                    <span className="text-xs text-muted-foreground">
                      auto-detected ({term.reason === 'most_recent_past'
                        ? 'most recent'
                        : 'ongoing / next exam'})
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <History className="h-3.5 w-3.5" /> viewing another term
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {insight?.canPeek && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPeekOpen((v) => !v);
                        if (peekOpen) setPeekSession('');
                      }}
                    >
                      <History className="h-4 w-4 mr-1" />
                      {peekOpen ? 'Back to current' : 'View another term'}
                    </Button>
                  )}
                  {insight?.canPeek && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSettingsOpen((v) => !v)}
                    >
                      <SlidersHorizontal className="h-4 w-4 mr-1" /> Adjust line
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Peek dropdown + warning */}
            {peekOpen && isSuperAdmin && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3">
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Attendance shown is today&apos;s number,
                  not that term&apos;s — old terms can look off.
                </p>
                <Select value={peekSession} onValueChange={setPeekSession}>
                  <SelectTrigger className="max-w-sm">
                    <SelectValue placeholder="Pick a term to view" />
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
            )}

            {/* Threshold settings */}
            {settingsOpen && insight?.canPeek && institutionParam && insight.thresholds && (
              <ThresholdSettings
                institutionId={institutionParam}
                current={insight.thresholds}
                onSaved={() => {
                  setSettingsOpen(false);
                  qc.invalidateQueries({ queryKey: ['att-insight'] });
                }}
              />
            )}
          </CardContent>
        </Card>

        {/* States */}
        {needsInstitution && (
          <EmptyState icon={<Scale />} text="Select an institution to start monitoring." />
        )}

        {institutionParam && isFetching && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading the current term…</span>
          </div>
        )}

        {institutionParam && error && !isFetching && (
          <EmptyState
            icon={<AlertTriangle className="text-amber-500" />}
            text={error instanceof Error ? error.message : 'Failed to load.'}
          />
        )}

        {insight?.noTerm && !isFetching && (
          <EmptyState
            icon={<Scale />}
            text="No exam term is currently active for this college. An admin can view a past term from the controls above."
          />
        )}

        {/* Content */}
        {insight && term && summary && !isFetching && !error && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                icon={<Users className="h-5 w-5" />}
                label="With attendance"
                value={summary.students_with_attendance}
                tone="neutral"
              />
              <StatTile
                icon={<CheckCircle2 className="h-5 w-5" />}
                label="Marks entered"
                value={summary.students_with_marks}
                tone="good"
              />
              <StatTile
                icon={<ClipboardList className="h-5 w-5" />}
                label="Owe marks"
                value={summary.owes_marks}
                tone={summary.owes_marks > 0 ? 'warn' : 'good'}
                footer={<p className="mt-2 text-[11px] text-muted-foreground">attending, none entered</p>}
              />
              <StatTile
                icon={<Sparkles className="h-5 w-5" />}
                label="Anomalies"
                value={summary.anomaly}
                tone={summary.anomaly > 0 ? 'accent' : 'neutral'}
                footer={
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    +{summary.struggling} struggling
                  </p>
                }
              />
            </div>

            {/* Section A: Owes marks (live-entry chase) */}
            <SectionCard
              icon={<ClipboardList className="h-5 w-5 text-amber-600" />}
              title="Students who owe marks"
              subtitle="Attending this term, but no internal marks entered yet — the live-entry chase list."
              count={insight.owesMarksTotal}
              shown={insight.owesMarks.length}
            >
              {insight.owesMarks.length === 0 ? (
                <EmptyRow text="Every attending student has marks entered. 🎉" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead className="text-center">Attendance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insight.owesMarks.map((r, i) => (
                      <TableRow key={`${r.student_id}-${i}`}>
                        <TableCell className="text-sm">
                          <span className="font-medium">{r.student_name ?? '—'}</span>
                          <span className="block text-[11px] text-muted-foreground font-mono">
                            {r.register_no ?? r.student_id.slice(0, 8)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          <span
                            className={cn(
                              'font-semibold',
                              r.attendance_pct >= 75 ? 'text-emerald-600' : 'text-amber-600',
                            )}
                          >
                            {r.attendance_pct.toFixed(1)}%
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {r.present}/{r.total} classes
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </SectionCard>

            {/* Section B: Attendance vs marks (anomalies) */}
            <SectionCard
              icon={<Scale className="h-5 w-5 text-violet-600" />}
              title="Attendance vs marks"
              subtitle={`Flagged using this college's line: ≥${insight.thresholds.attendance}% attendance + <${insight.thresholds.struggling_cia}% = struggling; <${insight.thresholds.attendance}% attendance + ≥${insight.thresholds.anomaly_cia}% = anomaly.`}
              count={insight.flaggedTotal}
              shown={insight.flagged.length}
            >
              {insight.flagged.length === 0 ? (
                <EmptyRow
                  text={
                    summary.students_with_marks === 0
                      ? 'No marks entered for this term yet — nothing to compare.'
                      : 'No struggling students or anomalies for this term.'
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead className="text-center">Attendance</TableHead>
                      <TableHead className="text-center">Marks</TableHead>
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
                          <TableCell className="text-sm max-w-[220px]">
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
                                row.attendance_pct >= insight.thresholds.attendance
                                  ? 'text-emerald-600'
                                  : 'text-amber-600',
                              )}
                            >
                              {row.attendance_pct.toFixed(1)}%
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              {row.present}/{row.total}
                            </span>
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            <span
                              className={cn(
                                'font-semibold',
                                row.cia_pct >= insight.thresholds.struggling_cia
                                  ? 'text-emerald-600'
                                  : 'text-red-600',
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
              )}
            </SectionCard>

            {/* Check-data group */}
            {insight.checkData.length > 0 && (
              <SectionCard
                icon={<AlertTriangle className="h-5 w-5 text-slate-500" />}
                title="Check this data"
                subtitle="Marks entered but 0% attendance — usually the student isn't really in these classes (missing data), not a real anomaly."
                count={insight.checkDataTotal}
                shown={insight.checkData.length}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead className="text-center">Marks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insight.checkData.map((r, i) => (
                      <TableRow key={`${r.student_id ?? 'x'}-${r.course_code ?? i}-${i}`}>
                        <TableCell className="text-sm">
                          <span className="font-medium">{r.student_name ?? '—'}</span>
                          <span className="block text-[11px] text-muted-foreground font-mono">
                            {r.register_no ?? ''}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm max-w-[220px]">
                          <span className="font-mono text-xs">{r.course_code ?? '—'}</span>
                          <span className="block text-[11px] text-muted-foreground truncate">
                            {r.course_name ?? ''}
                          </span>
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-semibold">
                          {r.cia_pct.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}

function ThresholdSettings({
  institutionId,
  current,
  onSaved,
}: {
  institutionId: string;
  current: { attendance: number; anomaly_cia: number; struggling_cia: number };
  onSaved: () => void;
}) {
  const [attendance, setAttendance] = useState(String(current.attendance));
  const [anomaly, setAnomaly] = useState(String(current.anomaly_cia));
  const [struggling, setStruggling] = useState(String(current.struggling_cia));

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/internal-marks/attendance-insight/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionId,
          attendance: Number(attendance),
          anomaly_cia: Number(anomaly),
          struggling_cia: Number(struggling),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Save failed');
      return json;
    },
    onSuccess: () => {
      toast.success('Line updated for this college.');
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
  });

  return (
    <div className="rounded-md border bg-muted/30 px-4 py-4 space-y-3">
      <p className="text-sm font-medium">This college&apos;s line</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NumField label="Regular attendance ≥ (%)" value={attendance} onChange={setAttendance} />
        <NumField label="Anomaly if marks ≥ (%)" value={anomaly} onChange={setAnomaly} />
        <NumField label="Struggling if marks < (%)" value={struggling} onChange={setStruggling} />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Save line
        </Button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium">{label}</Label>
      <Input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
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
  tone: 'neutral' | 'good' | 'warn' | 'accent';
  footer?: React.ReactNode;
}) {
  const toneClass =
    tone === 'warn'
      ? 'text-amber-600'
      : tone === 'accent'
        ? 'text-violet-600'
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
        <p className={cn('mt-2 text-3xl font-bold tabular-nums', toneClass)}>
          {value.toLocaleString()}
        </p>
        {footer}
      </CardContent>
    </Card>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  count,
  shown,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  shown: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-base font-semibold">{title}</h2>
            <Badge variant="secondary" className="ml-1 tabular-nums">
              {count.toLocaleString()}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-3xl">{subtitle}</p>
          {count > shown && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Showing the first {shown.toLocaleString()} of {count.toLocaleString()}.
            </p>
          )}
        </div>
        <div className="overflow-x-auto">{children}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 text-muted-foreground mb-4 [&>svg]:h-12 [&>svg]:w-12">
          {icon}
        </div>
        <p className="text-muted-foreground max-w-md">{text}</p>
      </CardContent>
    </Card>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>;
}
