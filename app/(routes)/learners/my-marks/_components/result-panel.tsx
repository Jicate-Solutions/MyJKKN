'use client';

/**
 * Result Panel — content area for a single semester on the Result tab.
 *
 * Flow (mirrors AssessmentPanel):
 *   1. Resolve the dominant exam session for the chosen semester. The COE
 *      /results endpoint is keyed by session, so we ask for the session that
 *      most of the semester's registrations belong to.
 *   2. Fetch the caller's published result for that session.
 *   3. Join each result row to the semester's registration list by
 *      course_offering_id (results carry no course label).
 *   4. Render a summary card (SGPA, credits, pass count) + the subject table.
 *
 * When COE hasn't declared the result yet the response is empty — we show a
 * "not published yet" card while still letting the student switch semesters.
 */

import { useMemo, type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Hourglass, Trophy, CheckCircle2, BookOpen } from 'lucide-react';
import { useMyMarksResult, useMyMarksGradeSystem } from '@/hooks/learners/use-my-marks';
import type {
  MyMarksGradeBand,
  MyMarksResultRow,
  MyMarksSemesterGroup,
} from '@/types/my-marks';
import { ResultTable, type ResultRowItem } from './result-table';
import { GradeSystemLegend } from './grade-system-legend';

/**
 * Temporarily hide the SGPA stat on the summary card. Flip back to `true`
 * to restore it once the SGPA calculation/source is confirmed.
 */
const SHOW_SGPA = false;

/**
 * Resolve the human grade description for a result row from the grade bands.
 * Primary match is by grade LETTER (authoritative; handles non-range bands
 * like U / AAA). Falls back to a mark-range match when the letter is absent.
 */
function resolveGradeDescription(
  bands: MyMarksGradeBand[] | undefined,
  letterGrade: string | null,
  totalObtained: number | null
): string | null {
  if (!bands || bands.length === 0) return null;
  if (letterGrade) {
    const byLetter = bands.find(
      (b) => b.grade.toUpperCase() === letterGrade.toUpperCase()
    );
    if (byLetter) return byLetter.description ?? null;
  }
  if (totalObtained !== null) {
    const byRange = bands.find(
      (b) =>
        b.min_mark !== null &&
        b.max_mark !== null &&
        totalObtained >= b.min_mark &&
        totalObtained <= b.max_mark
    );
    if (byRange) return byRange.description ?? null;
  }
  return null;
}

interface Props {
  semester: MyMarksSemesterGroup;
}

export function ResultPanel({ semester }: Props) {
  // Dominant exam session within the semester (same heuristic as AssessmentPanel).
  const dominantSession = useMemo(() => {
    const counts = new Map<string, number>();
    for (const reg of semester.registrations) {
      if (!reg.examination_session_id) continue;
      counts.set(
        reg.examination_session_id,
        (counts.get(reg.examination_session_id) ?? 0) + 1
      );
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? undefined;
  }, [semester]);

  const { data, isLoading, error } = useMyMarksResult(dominantSession);
  const { data: gradeData } = useMyMarksGradeSystem();
  const gradeBands = gradeData?.bands;
  const gradeSystemCode = gradeData?.grade_system_code ?? null;

  // Join results → registrations by course_offering_id.
  const { rows, summary } = useMemo(() => {
    const byOffering = new Map<string, MyMarksResultRow>();
    for (const r of data?.results ?? []) {
      if (r.course_offering_id) byOffering.set(r.course_offering_id, r);
    }

    const joined: ResultRowItem[] = semester.registrations.map((registration) => {
      const result = registration.course_offering_id
        ? byOffering.get(registration.course_offering_id) ?? null
        : null;
      // Enrich the result with the course labels it lacks.
      return {
        registration,
        result: result
          ? {
              ...result,
              course_code: registration.course_code,
              course_name: registration.course_name,
              grade_description: resolveGradeDescription(
                gradeBands,
                result.letter_grade,
                result.total_obtained
              ),
            }
          : null,
      };
    });

    // SGPA = Σ(grade_points × credit) / Σ(credit), over published rows.
    let totalCredits = 0;
    let weightedPoints = 0;
    let passCount = 0;
    let publishedCount = 0;
    for (const { result } of joined) {
      if (!result) continue;
      publishedCount++;
      const credit = result.credit ?? 0;
      if (result.is_pass) passCount++;
      if (credit > 0 && result.grade_points !== null) {
        totalCredits += credit;
        weightedPoints +=
          result.total_grade_points ?? result.grade_points * credit;
      }
    }
    const sgpa = totalCredits > 0 ? weightedPoints / totalCredits : null;

    return {
      rows: joined,
      summary: {
        sgpa,
        totalCredits,
        passCount,
        publishedCount,
        subjectCount: joined.length,
        allPass: publishedCount > 0 && passCount === publishedCount,
      },
    };
  }, [data, semester, gradeBands]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading your result...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Could not load your result
          </CardTitle>
          <CardDescription>{(error as Error).message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Nothing declared yet — keep it encouraging, not error-like.
  if (!data || !data.declared || summary.publishedCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hourglass className="h-5 w-5 text-amber-600" />
            Result not published yet
          </CardTitle>
          <CardDescription>
            Your result for {semester.semester_label} will appear here once the
            examination office declares it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span>
              You have <strong>{semester.registrations.length}</strong> registered
              course{semester.registrations.length === 1 ? '' : 's'} this semester.
              Check the <strong>Internal Marks</strong> tab for round-wise CIA marks
              in the meantime.
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary card */}
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          {gradeSystemCode && (
            <div className="mb-3 flex items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Grade System
              </span>
              <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                {gradeSystemCode}
              </span>
            </div>
          )}
          <div
            className={
              SHOW_SGPA
                ? 'grid grid-cols-2 sm:grid-cols-4 gap-3'
                : 'grid grid-cols-2 sm:grid-cols-3 gap-3'
            }
          >
            {SHOW_SGPA && (
              <SummaryStat
                icon={<Trophy className="h-4 w-4 text-amber-600" />}
                label="SGPA"
                value={summary.sgpa !== null ? summary.sgpa.toFixed(2) : '—'}
                highlight
              />
            )}
            <SummaryStat
              icon={<BookOpen className="h-4 w-4 text-sky-600" />}
              label="Credits"
              value={String(summary.totalCredits)}
            />
            <SummaryStat
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              label="Passed"
              value={`${summary.passCount} / ${summary.publishedCount}`}
            />
            <SummaryStat
              icon={
                summary.allPass ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )
              }
              label="Status"
              value={summary.allPass ? 'All Clear' : 'Arrears'}
            />
          </div>
        </CardContent>
      </Card>

      <ResultTable rows={rows} />

      {gradeBands && gradeBands.length > 0 && (
        <GradeSystemLegend bands={gradeBands} gradeSystemCode={gradeSystemCode} />
      )}
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span
        className={
          highlight
            ? 'text-2xl font-bold tabular-nums text-amber-600'
            : 'text-2xl font-bold tabular-nums'
        }
      >
        {value}
      </span>
    </div>
  );
}
