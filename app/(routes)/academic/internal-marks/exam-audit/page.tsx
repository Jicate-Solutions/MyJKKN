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

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ClipboardCheck,
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
import { Label } from '@/components/ui/label';
import type {
  ExamAuditOverviewResponse,
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

export default function ExamAuditPage() {
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);

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
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardCheck className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            Audit scope
          </CardTitle>
          <CardDescription>
            Pick the college and exam session to audit. Internal-assessment
            provenance and attendance figures are computed fresh from JKKN
            day-one records and the exam system — nothing is self-reported.
          </CardDescription>
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
              onValueChange={(v) => setSessionCode(v)}
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
          No current exam term detected for this college — pick a session above.
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
                        <TableRow key={r.program_code}>
                          <TableCell className="font-medium">
                            {r.program_code}
                            {r.program_name ? (
                              <span className="block max-w-[220px] truncate text-xs font-normal text-muted-foreground">
                                {r.program_name}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <VerdictBadge verdict={r.verdict} />
                          </TableCell>
                          <TableCell>
                            <RubricBadge
                              verdict={r.rubric_verdict}
                              configured={r.rubric_rounds_configured}
                              used={r.rounds_used.length}
                            />
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
    </ContentLayout>
  );
}
