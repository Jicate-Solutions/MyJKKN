'use client';

// Exam IA Audit — the Registrar's walk-in sheet (Director, 2026-07-13).
//
// Question this page answers, program by program, for one exam session:
// "Is the internal assessment as per JKKN data, or some other data?" — plus
// "who is at eligibility risk by OUR day-one attendance record" so the
// manual register the college sends to the university can be audited against
// something. COE (university-bound records) is joined server-side against
// MyJKKN's continuous attendance; nothing here is self-reported.
//
// Verdict chips per program:
//   faculty_continuous — faculty-stamped entries spread over the term (intended)
//   partial            — some continuous signal, not clean
//   operator_bulk      — operator accounts / one-day dump ("some other data")
//   missing            — students registered for the exam, zero CIA rows
//
// Access: academic.internal_marks.exam_audit.view (super, administrator,
// principal=own college, ceo, eao, registrar). Explicit denied state — never
// a silent redirect (CLAUDE.md #27).

import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileDown,
  ShieldQuestion,
  Users,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CountedAttendance } from '@/components/attendance/counted-attendance';
import type {
  ExamAuditAttendanceBucket,
  ExamAuditEvidencePack,
  ExamAuditOverviewResponse,
  ExamAuditProgramDetailResponse,
  ExamAuditProgramRow,
  ExamAuditRubricVerdict,
  ExamAuditVerdict,
} from '@/types/exam-audit';

const BRAND_GREEN = '#0b6d41';

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

function RubricBadge({
  verdict,
  configured,
  used,
}: {
  verdict: ExamAuditRubricVerdict;
  configured: number | null;
  used: number;
}) {
  switch (verdict) {
    case 'follows_rubric':
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Follows rubric
        </Badge>
      );
    case 'partial':
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          Partial · {used}/{configured ?? '?'} rounds
        </Badge>
      );
    case 'off_rubric':
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          Off rubric · {used}/{configured ?? '?'} rounds
        </Badge>
      );
    case 'no_rubric':
      return <Badge variant="destructive">No rubric set</Badge>;
  }
}

function VerdictBadge({ verdict }: { verdict: ExamAuditVerdict }) {
  switch (verdict) {
    case 'faculty_continuous':
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Faculty · continuous
        </Badge>
      );
    case 'partial':
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          Partial
        </Badge>
      );
    case 'operator_bulk':
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          Operator dump
        </Badge>
      );
    case 'missing':
      return <Badge variant="destructive">No CIA data</Badge>;
  }
}

/** The rubric badge, clickable: opens the rubric's actual definition — rounds,
 *  entry windows, components with max marks (Director 2026-07-14: "where is
 *  the rubric?"). Rubrics are configured by the exam cell in the COE system;
 *  this shows what that configuration says, next to the verdict against it. */
function RubricViewer({ row }: { row: ExamAuditProgramRow }) {
  const def = row.rubric_definition;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="cursor-pointer rounded focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={`View rubric for ${row.program_code}`}
        >
          {def?.is_empty ? (
            // "Follows rubric" against a zero-mark rubric would be a lie — an
            // empty rubric grades nothing, so say that instead of the verdict.
            <Badge variant="destructive">Empty rubric · 0 marks</Badge>
          ) : (
            <RubricBadge
              verdict={row.rubric_verdict}
              configured={row.rubric_rounds_configured}
              used={row.rounds_used.length}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[calc(100vw-2rem)] max-w-[24rem] text-sm sm:w-96"
        onClick={(e) => e.stopPropagation()}
      >
        {!def ? (
          <div className="space-y-2">
            <p className="font-semibold">No rubric covers {row.program_code}</p>
            <p className="text-xs text-muted-foreground">
              No CIA entry setting in the exam system includes this program for
              this exam session. Rubrics are configured by the exam cell in the
              COE software (CIA entry settings) — per college, per exam session.
              Until one exists, there is no defined assessment pattern to grade
              the internal marks against.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="font-semibold">{def.setting_names.join(', ')}</p>
              <p className="text-xs text-muted-foreground">
                The assessment pattern configured in the exam system for{' '}
                {row.program_code} — internal marks are defined by this, never
                by attendance.
              </p>
            </div>
            {def.is_empty ? (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-xs font-medium text-red-800">
                Empty rubric: every component carries 0 max marks — this rubric
                exists on paper but grades nothing. Exam-cell follow-up.
              </p>
            ) : null}
            {def.rounds.map((r) => (
              <div key={`${r.round}-${r.round_name ?? ''}`} className="rounded border p-2">
                <p className="text-xs font-semibold">
                  Round {r.round}
                  {r.round_name && r.round_name !== String(r.round)
                    ? ` · ${r.round_name}`
                    : ''}
                  <span className="ml-1 font-normal text-muted-foreground">
                    {r.entry_from && r.entry_to
                      ? `· entry ${r.entry_from} → ${r.entry_to}`
                      : '· entry window not configured'}
                  </span>
                </p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {r.components.length === 0 ? (
                    <li className="text-muted-foreground">No components configured.</li>
                  ) : (
                    r.components.map((c, i) => (
                      <li key={`${c.name}-${i}`} className="flex justify-between">
                        <span>{c.name}</span>
                        <span className="tabular-nums">{c.max_marks}</span>
                      </li>
                    ))
                  )}
                  <li className="flex justify-between border-t pt-0.5 font-medium">
                    <span>Round total</span>
                    <span className="tabular-nums">{r.total_max}</span>
                  </li>
                </ul>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function BucketBadge({
  bucket,
  thresholds,
}: {
  bucket: ExamAuditAttendanceBucket;
  thresholds: { eligibility: number; condonation: number };
}) {
  switch (bucket) {
    case 'no_record':
      return <Badge variant="destructive">No record</Badge>;
    case 'below_65':
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          Below {thresholds.condonation}%
        </Badge>
      );
    case 'below_75':
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          Below {thresholds.eligibility}%
        </Badge>
      );
    case 'ok':
      return <Badge variant="outline">OK</Badge>;
  }
}

/** Per-student rows behind one program's audit counts (lazy-loaded on expand).
 *  Same permission key, same computation — the rows always sum to the counts. */
function ProgramDrilldown({
  institutionId,
  sessionCode,
  programCode,
}: {
  institutionId: string;
  sessionCode: string;
  programCode: string;
}) {
  const url = `/api/internal-marks/exam-audit?institutionId=${encodeURIComponent(
    institutionId,
  )}&sessionCode=${encodeURIComponent(sessionCode)}&program=${encodeURIComponent(programCode)}`;
  const { data, isLoading, isError, error } = useQuery<ExamAuditProgramDetailResponse>({
    queryKey: ['exam-audit-detail', institutionId, sessionCode, programCode],
    queryFn: () => fetchJson(url),
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-6 pl-8">
        <BeatLoader size={6} color={BRAND_GREEN} />
        <span className="text-xs text-muted-foreground">
          Loading the students behind these counts…
        </span>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="py-4 pl-8 text-xs text-red-600">
        {error instanceof Error ? error.message : 'Could not load the student rows.'}
      </p>
    );
  }

  const flagged = data.students.filter((s) => s.att_bucket !== 'ok');
  const okCount = data.students.length - flagged.length;

  return (
    <div className="space-y-2 py-3 pl-8 pr-2">
      <p className="text-xs text-muted-foreground">
        {data.students.length} registered student{data.students.length === 1 ? '' : 's'} —{' '}
        {flagged.length} at eligibility risk by JKKN&apos;s day-one record, {okCount} at/above{' '}
        {data.thresholds.eligibility}%. Sorted risk-first. Attendance gates who may SIT the
        exam; the marks themselves are judged by the rubric columns.
      </p>
      <div className="max-h-96 overflow-y-auto rounded border">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>Register no</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Eligibility</TableHead>
              <TableHead className="text-right">JKKN attendance</TableHead>
              <TableHead className="text-right">Courses reg.</TableHead>
              <TableHead className="text-right">CIA rows</TableHead>
              <TableHead className="text-right">CIA courses</TableHead>
              <TableHead className="text-right">Rounds</TableHead>
              <TableHead className="text-right">Faculty-stamped</TableHead>
              <TableHead className="text-right">Avg internal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.students.map((s) => (
              <TableRow key={s.student_id}>
                <TableCell className="font-mono text-xs">{s.register_no ?? '—'}</TableCell>
                <TableCell className="max-w-[200px] truncate text-xs">
                  {s.student_name ?? '—'}
                </TableCell>
                <TableCell>
                  <BucketBadge bucket={s.att_bucket} thresholds={data.thresholds} />
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {s.att_pct === null ? (
                    '—'
                  ) : (
                    <CountedAttendance
                      value={{
                        attended: s.att_present ?? 0,
                        excused: s.att_protected ?? 0,
                        total: s.att_total ?? 0,
                        pct: s.att_pct,
                      }}
                    />
                  )}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {s.registered_courses}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{s.cia_rows}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {s.cia_rows > 0 ? s.cia_courses : '—'}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {s.rounds_used.length > 0 ? s.rounds_used.join(', ') : '—'}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {s.faculty_stamped_pct === null ? '—' : `${s.faculty_stamped_pct}%`}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {s.avg_internal_pct === null ? '—' : `${s.avg_internal_pct}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** The rubric-coverage evidence pack — on-screen view + PDF download. Numbers
 *  come from the same computation as the table above; they cannot disagree. */
function EvidencePackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError, error } = useQuery<ExamAuditEvidencePack>({
    queryKey: ['exam-audit-evidence'],
    queryFn: () => fetchJson('/api/internal-marks/exam-audit/evidence'),
    staleTime: 300_000,
    retry: false,
    enabled: open,
  });

  const findingLabel: Record<string, string> = {
    no_rubric: 'No rubric',
    rubric_empty: 'Empty rubric (0 marks)',
    rubric_zero_entries: 'Rubric, zero entries',
    rounds_missing: 'Round(s) never happened',
    operator_bulk: 'Operator dump',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rubric &amp; coverage evidence pack</DialogTitle>
          <DialogDescription>
            The document the Registrar hands to the exam cell: which colleges have no exam
            sessions at all, which programs have no rubric, which rubrics sit at zero
            entries, which rounds never happened, and where the marks arrived as operator
            dumps. Same computation as the audit table — the pack cannot disagree with the
            page.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <BeatLoader color={BRAND_GREEN} />
            <p className="text-xs text-muted-foreground">
              Grading every college&apos;s current term…
            </p>
          </div>
        ) : isError || !data ? (
          <p className="py-6 text-center text-sm text-red-600">
            {error instanceof Error ? error.message : 'Could not build the evidence pack.'}
          </p>
        ) : (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Generated {data.generated_at} · {data.scope} · {data.totals.programs_flagged}{' '}
                program finding{data.totals.programs_flagged === 1 ? '' : 's'}
              </p>
              <Button asChild size="sm" style={{ backgroundColor: BRAND_GREEN }}>
                <a href="/api/internal-marks/exam-audit/evidence?format=pdf" download>
                  <FileDown className="mr-1.5 h-4 w-4" />
                  Download PDF
                </a>
              </Button>
            </div>

            <section>
              <h3 className="mb-1 font-semibold">
                1. Colleges with NO exam sessions in the exam system (
                {data.colleges_no_sessions.length})
              </h3>
              {data.colleges_no_sessions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  None — every college has at least one exam session.
                </p>
              ) : (
                <ul className="list-inside list-disc text-xs">
                  {data.colleges_no_sessions.map((c) => (
                    <li key={c.institution_code}>
                      <span className="font-medium">{c.institution_code}</span> — {c.name}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-1 font-semibold">2. Program findings — current term per college</h3>
              <div className="space-y-3">
                {data.colleges.map((c) => {
                  const entries = (
                    Object.keys(findingLabel) as Array<keyof typeof c.findings>
                  ).flatMap((k) => c.findings[k].map((f) => ({ kind: findingLabel[k], ...f })));
                  return (
                    <div key={c.institution_code} className="rounded border p-3">
                      <p className="mb-1 text-xs font-medium">
                        {c.institution_code} · {c.session_code}
                        <span className="ml-1 font-normal text-muted-foreground">
                          (exams {c.exam_start_date} → {c.exam_end_date} ·{' '}
                          {c.registered_students} registered · {c.programs_ok}/
                          {c.programs_total} programs clean)
                        </span>
                      </p>
                      {c.no_registrations ? (
                        <p className="text-xs text-amber-700">
                          Sessions exist but the graded term has zero exam registrations —
                          exam-cell follow-up.
                        </p>
                      ) : entries.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No findings.</p>
                      ) : (
                        <ul className="space-y-0.5 text-xs">
                          {entries.map((f, i) => (
                            <li key={`${f.program_code}-${f.kind}-${i}`}>
                              <Badge variant="outline" className="mr-1.5">
                                {f.kind}
                              </Badge>
                              <span className="font-medium">{f.program_code}</span>{' '}
                              ({f.registered_students}) — {f.detail}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="mb-1 font-semibold">
                3. JKKN attendance-record coverage (eligibility — separate from marks)
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>College</TableHead>
                    <TableHead>Session graded</TableHead>
                    <TableHead className="text-right">Registered</TableHead>
                    <TableHead className="text-right">With JKKN record</TableHead>
                    <TableHead className="text-right">No record</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.colleges.map((c) => (
                    <TableRow key={c.institution_code}>
                      <TableCell className="text-xs font-medium">
                        {c.institution_code}
                      </TableCell>
                      <TableCell className="text-xs">{c.session_code ?? '—'}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {c.registered_students}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {c.attendance?.with_record ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {(c.attendance?.no_record ?? 0) > 0 ? (
                          <span className="font-semibold text-red-600">
                            {c.attendance?.no_record ?? 0}
                          </span>
                        ) : (
                          0
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ExamAuditPage() {
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);
  const [packOpen, setPackOpen] = useState(false);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (institutionId) p.set('institutionId', institutionId);
    if (sessionCode) p.set('sessionCode', sessionCode);
    const qs = p.toString();
    return `/api/internal-marks/exam-audit${qs ? `?${qs}` : ''}`;
  }, [institutionId, sessionCode]);

  const { data, isLoading, isError, error } = useQuery<
    ExamAuditOverviewResponse & { needsInstitution?: boolean; noTerm?: boolean }
  >({
    queryKey: ['exam-audit', institutionId ?? 'none', sessionCode ?? 'auto'],
    queryFn: () => fetchJson(url),
    staleTime: 60_000,
    retry: false,
  });

  const programs = data?.programs ?? [];

  return (
    <ContentLayout title="Exam IA Audit">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/academic">Academic</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/academic/internal-marks">Assessment</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Exam IA Audit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Pickers */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardCheck className="h-5 w-5" style={{ color: BRAND_GREEN }} />
                Audit scope
              </CardTitle>
              <CardDescription>
                Pick the college and exam session to audit. Internal-assessment
                provenance and attendance figures are computed fresh from JKKN
                day-one records and the exam system — nothing is self-reported.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPackOpen(true)}>
              <FileDown className="mr-1.5 h-4 w-4" />
              Evidence pack
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              College
            </Label>
            <Select
              value={institutionId ?? undefined}
              onValueChange={(v) => {
                setInstitutionId(v);
                setSessionCode(null); // re-detect the term for the new college
                setExpandedProgram(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a college" />
              </SelectTrigger>
              <SelectContent>
                {(data?.institutions ?? []).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name ?? i.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              Exam session
            </Label>
            <Select
              value={sessionCode ?? data?.session?.session_code ?? undefined}
              onValueChange={(v) => {
                setSessionCode(v);
                setExpandedProgram(null);
              }}
              disabled={!institutionId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={institutionId ? 'Auto-detected term' : 'Pick a college first'}
                />
              </SelectTrigger>
              <SelectContent>
                {(data?.sessions ?? []).map((s) =>
                  s.session_code ? (
                    <SelectItem key={s.session_code} value={s.session_code}>
                      {s.session_code}
                      {s.session_status ? ` · ${s.session_status}` : ''}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <BeatLoader color={BRAND_GREEN} />
          <p className="mt-4 text-sm text-muted-foreground">
            Computing audit from day-one records…
          </p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <p className="max-w-md text-sm font-medium text-foreground">
            {error instanceof Error
              ? error.message
              : 'Could not load the exam audit.'}
          </p>
        </div>
      ) : data?.needsInstitution || !institutionId ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <ShieldQuestion className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Select a college to begin the audit.
          </p>
        </div>
      ) : data?.noTerm ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {/* QA sweep 2026-07-13: "pick a session above" with an EMPTY picker is
              misleading — Dental has zero exam sessions in the exam system, so
              say that instead of pointing at a dropdown with nothing in it. */}
          {(data.sessions ?? []).length === 0
            ? 'This college has no exam sessions in the exam system yet — there is nothing to audit until the exam cell creates one.'
            : 'No current exam term detected for this college — pick a session above.'}
        </div>
      ) : data ? (
        <>
          {/* Session header + headline strip */}
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-xl font-semibold">
              {data.session.session_code}
            </h2>
            <span className="text-sm text-muted-foreground">
              {data.session.session_status ?? ''}
              {data.session.exam_start_date
                ? ` · exams ${data.session.exam_start_date} → ${data.session.exam_end_date ?? '…'}`
                : ''}
              {data.session.auto_detected ? ' · auto-detected term' : ''}
            </span>
            <span className="text-xs text-muted-foreground">
              JKKN attendance window {data.window.from} → {data.window.to}
            </span>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs text-muted-foreground">Programs</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {data.totals.programs}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  Registered students
                </span>
                <span className="text-2xl font-semibold tabular-nums">
                  {data.totals.registered_students}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs text-muted-foreground">
                  Programs with no CIA data
                </span>
                <span
                  className={`text-2xl font-semibold tabular-nums ${data.totals.missing_programs > 0 ? 'text-red-600' : ''}`}
                >
                  {data.totals.missing_programs}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-xs text-muted-foreground">
                  Programs on operator dumps
                </span>
                <span
                  className={`text-2xl font-semibold tabular-nums ${data.totals.operator_bulk_programs > 0 ? 'text-red-600' : ''}`}
                >
                  {data.totals.operator_bulk_programs}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Program table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" style={{ color: BRAND_GREEN }} />
                Program-wise audit
              </CardTitle>
              <CardDescription>
                CIA source = who entered the internal marks and how they landed
                (faculty spread over the term vs an exam-cell dump). Rubric =
                the entries graded against the configured assessment pattern
                (rounds, components, entry windows) — internal marks are defined
                by that rubric, never by attendance. The eligibility columns are
                a separate check: they count REGISTERED students against
                JKKN&apos;s continuous attendance (below{' '}
                {data.thresholds.eligibility}% needs condonation; below{' '}
                {data.thresholds.condonation}% is at risk of ineligibility;
                &ldquo;No record&rdquo; = registered for the exam but absent
                from JKKN attendance — audit those first). Attendance gates who
                may SIT the exam; it does not decide the marks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {programs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No exam registrations found for this session.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Program</TableHead>
                        <TableHead>CIA source</TableHead>
                        <TableHead>Rubric</TableHead>
                        <TableHead className="text-right">On-window</TableHead>
                        <TableHead className="text-right">Students</TableHead>
                        <TableHead className="text-right">CIA rows</TableHead>
                        <TableHead className="text-right">Enterers</TableHead>
                        <TableHead className="text-right">Entry days</TableHead>
                        <TableHead className="text-right">Busiest day</TableHead>
                        <TableHead className="text-right">Rounds</TableHead>
                        <TableHead className="text-right">Verified</TableHead>
                        <TableHead className="text-right">&lt;{data.thresholds.eligibility}%</TableHead>
                        <TableHead className="text-right">&lt;{data.thresholds.condonation}%</TableHead>
                        <TableHead className="text-right">No record</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {programs.map((r: ExamAuditProgramRow) => (
                        <Fragment key={r.program_code}>
                        <TableRow
                          className="cursor-pointer"
                          aria-expanded={expandedProgram === r.program_code}
                          onClick={() =>
                            setExpandedProgram(
                              expandedProgram === r.program_code ? null : r.program_code,
                            )
                          }
                        >
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-1">
                              {expandedProgram === r.program_code ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              {r.program_code}
                            </span>
                            {r.program_name ? (
                              <span className="block max-w-[220px] truncate pl-[18px] text-xs font-normal text-muted-foreground">
                                {r.program_name}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <VerdictBadge verdict={r.verdict} />
                          </TableCell>
                          <TableCell>
                            <RubricViewer row={r} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.on_window_pct === null ? '—' : `${r.on_window_pct}%`}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.registered_students}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.cia_rows}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.cia_rows > 0 ? r.distinct_enterers : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.cia_rows > 0 ? r.entry_days : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.cia_rows > 0 ? `${r.top_day_share_pct}%` : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.rounds_used.length > 0 ? r.rounds_used.join(', ') : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.cia_rows > 0 ? `${r.verified_pct}%` : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.att_below_75 > 0 ? (
                              <span className="font-semibold text-amber-600">
                                {r.att_below_75}
                              </span>
                            ) : (
                              0
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.att_below_65 > 0 ? (
                              <span className="font-semibold text-red-600">
                                {r.att_below_65}
                              </span>
                            ) : (
                              0
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.att_no_record > 0 ? (
                              <Badge variant="destructive">{r.att_no_record}</Badge>
                            ) : (
                              0
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedProgram === r.program_code &&
                        institutionId &&
                        data.session.session_code ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={14} className="bg-muted/30 p-0">
                              <ProgramDrilldown
                                institutionId={institutionId}
                                sessionCode={data.session.session_code}
                                programCode={r.program_code}
                              />
                            </TableCell>
                          </TableRow>
                        ) : null}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                &ldquo;Operator dump&rdquo; means the internal marks reached the
                university system through a handful of exam-cell accounts in a
                burst — not that the marks are wrong. It flags where the
                continuous-assessment trail must be audited against department
                registers in person.
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
      <EvidencePackDialog open={packOpen} onOpenChange={setPackOpen} />
    </ContentLayout>
  );
}
