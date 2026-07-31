'use client';

// "You start at 100 out of 100 — watch how much it comes down." (Director,
// 2026-07-13.) The learner's own per-course exam-eligibility transparency:
// the SAME day-one attendance record the Registrar's exam audit holds
// departments to, shown to the student continuously instead of surfacing as
// a surprise at university-submission time.
//
// Bands mirror the audit thresholds (eligible · condonation band · at risk),
// read from platform_policies via useEligibilityThresholds() — defaults 75/65,
// configurable per institution. SELF-SCOPED server-side (fn_my_running_attendance
// reads only the caller's own learner rows) — no props, no ids.
//
// Self-hides on error/empty: this card is additive to the attendance page,
// which already has its own tables and error surfaces.

import { useQuery } from '@tanstack/react-query';
import { Gauge, ShieldAlert, ShieldCheck } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { ExcusedNote, countedPresent } from '@/components/attendance/counted-attendance';
import type { MyRunningAttendanceRow } from '@/types/exam-audit';
import { useEligibilityThresholds } from '@/hooks/academic/use-eligibility-thresholds';
import type { EligibilityThresholds } from '@/lib/services/exam-audit/compute';

// One-time explanation of the 2026-07-26 correction (Director decision, 2026-07-27).
// Practical sessions were recorded but invisible to this score for eight months;
// counting them moved 487 learners' percentages — 290 up and 197 DOWN. A learner
// whose number fell has no way to tell a correction from a mistake, so the card
// says so itself rather than leaving them to ask.
//
// SELF-EXPIRING BY DESIGN: it disappears after the date below with no follow-up
// change to ship. Anyone reading this after that date can delete this block.
const PRACTICALS_NOTICE_UNTIL = new Date('2026-09-30T23:59:59+05:30');

function band(
  pct: number | null,
  t: EligibilityThresholds,
): { label: string; cls: string } {
  if (pct === null) return { label: '—', cls: 'text-muted-foreground' };
  if (pct >= t.eligibility) return { label: 'Eligible', cls: 'text-green-600' };
  if (pct >= t.condonation) return { label: 'Condonation band', cls: 'text-amber-600' };
  return { label: 'At risk', cls: 'text-red-600' };
}

export function MyRunningScoreCard() {
  // Thresholds are configuration, not constants (2026-07-26). Self-scoped card, so
  // no institution id is passed — fn_get_policy resolves the caller's own scope.
  const { thresholds } = useEligibilityThresholds();
  const ELIGIBILITY = thresholds.eligibility;
  const CONDONATION = thresholds.condonation;

  const { data } = useQuery<{ courses: MyRunningAttendanceRow[] }>({
    queryKey: ['my-running-attendance'],
    queryFn: async () => {
      const res = await fetch('/api/internal-marks/my-running-attendance', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('failed');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const rows = data?.courses ?? [];
  if (rows.length === 0) return null;

  const atRisk = rows.filter((r) => r.pct !== null && r.pct < CONDONATION).length;
  const showPracticalsNotice = new Date() <= PRACTICALS_NOTICE_UNTIL;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-[#0b6d41]" />
          Your Exam-Eligibility Score
        </CardTitle>
        <CardDescription>
          Every course starts at 100 — each absence brings it down. This is the
          continuous record from your first class, the same figure your college
          submits for exam eligibility ({ELIGIBILITY}% needed;{' '}
          {CONDONATION}–{ELIGIBILITY}% needs condonation).
          {atRisk > 0 ? (
            <>
              {' '}
              <span className="font-medium text-red-600">
                {atRisk} course{atRisk === 1 ? '' : 's'} at risk.
              </span>
            </>
          ) : null}
          {showPracticalsNotice ? (
            <span className="mt-2 block rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Practical sessions are now counted in this score. They were always
              recorded, but were not being included here — so if your percentage
              moved recently, that is why.
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="w-[30%]">Score</TableHead>
                <TableHead className="text-right">Standing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const b = band(r.pct, thresholds);
                // The score credits approved on-duty days, so the number this
                // row counts is not always the number of days attended. Both
                // are shown rather than one silently standing in for the other.
                const att = {
                  attended: r.present,
                  excused: r.protected,
                  total: r.total,
                  pct: r.pct,
                };
                return (
                  <TableRow key={r.course_id ?? r.course_code ?? 'unknown'}>
                    <TableCell className="font-medium">
                      {r.course_code ?? '—'}
                      {r.course_name ? (
                        <span className="block max-w-[240px] truncate text-xs font-normal text-muted-foreground">
                          {r.course_name}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="block">{countedPresent(att)}</span>
                      <ExcusedNote value={att} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${Math.max(2, Math.min(100, r.pct ?? 0))}%`,
                              backgroundColor:
                                r.pct === null
                                  ? '#9ca3af'
                                  : r.pct >= ELIGIBILITY
                                    ? '#0b6d41'
                                    : r.pct >= CONDONATION
                                      ? '#d97706'
                                      : '#dc2626',
                            }}
                            aria-hidden
                          />
                        </div>
                        <span
                          className={`w-12 text-right text-sm font-semibold tabular-nums ${b.cls}`}
                        >
                          {r.pct === null ? '—' : `${r.pct}`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.pct !== null && r.pct < CONDONATION ? (
                        <Badge variant="destructive" className="gap-1">
                          <ShieldAlert className="h-3 w-3" aria-hidden />
                          {b.label}
                        </Badge>
                      ) : (
                        <span className={`text-xs font-medium ${b.cls}`}>
                          {r.pct !== null && r.pct >= ELIGIBILITY ? (
                            <span className="inline-flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" aria-hidden />
                              {b.label}
                            </span>
                          ) : (
                            b.label
                          )}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Computed live from the class-by-class record since your first session
          — nothing is entered at the end of the term.
        </p>
      </CardContent>
    </Card>
  );
}
