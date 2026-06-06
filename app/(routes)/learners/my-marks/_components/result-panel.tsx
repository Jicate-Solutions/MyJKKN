'use client';

/**
 * Result Panel — renders one exam-session tab from the aggregate view payload.
 *
 * No data fetching here: the shell loads the whole StudentResultView in a single
 * call and passes the active session + grade legend down. The tab lists the
 * session's regular papers plus any arrears (is_regular === false, badged in the
 * table). The summary is the regular-papers scorecard (COE-computed).
 */

import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Hourglass, BookOpen, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ResultViewSession, ResultViewGradeBand } from '@/types/my-marks';
import { ResultTable, type ResultRowItem } from './result-table';
import { GradeSystemLegend } from './grade-system-legend';

// SGPA is hidden for now (kept as a one-line toggle). COE provides it in
// session.summary.sgpa — flip to true to surface it.
const SHOW_SGPA = false;

// Summary card (Grade System badge + Credits / Passed / Status + arrear line)
// hidden for now — flip to true to surface it as a feature.
const SHOW_SUMMARY = false;

interface Props {
  session: ResultViewSession;
  gradeBands: ResultViewGradeBand[];
  gradeSystemCode: string | null;
}

export function ResultPanel({ session, gradeBands, gradeSystemCode }: Props) {
  const rows: ResultRowItem[] = session.courses.map((c, i) => ({
    key: `${c.course_code ?? 'course'}-${c.semester_index ?? 'x'}-${i}`,
    course_code: c.course_code,
    course_name: c.course_name,
    credit: c.credit,
    is_published: c.is_published,
    is_regular: c.is_regular,
    internal_obtained: c.internal_obtained,
    internal_max: c.internal_max,
    external_obtained: c.external_obtained,
    external_max: c.external_max,
    total_obtained: c.total_obtained,
    total_max: c.total_max,
    letter_grade: c.letter_grade,
    is_pass: c.is_pass,
    pass_status: c.pass_status,
  }));

  const anyPublished = session.courses.some((c) => c.is_published);

  // Semester scorecard = REGULAR papers only (is_regular !== false; null treated
  // as regular). Computed here rather than trusting session.summary, since COE
  // folds arrears into that count. Arrears are tracked separately.
  const regularCourses = session.courses.filter((c) => c.is_regular !== false);
  const arrearCourses = session.courses.filter((c) => c.is_regular === false);

  const regularTotal = regularCourses.length;
  const regularPassed = regularCourses.filter(
    (c) => c.is_published && c.is_pass === true
  ).length;
  const regularCredits = regularCourses
    .filter((c) => c.credit_included !== false)
    .reduce((sum, c) => sum + (c.credit ?? 0), 0);

  const arrearTotal = arrearCourses.length;
  const arrearCleared = arrearCourses.filter(
    (c) => c.is_published && c.is_pass === true
  ).length;

  // Status INCLUDES arrears: "All Clear" only when no published paper — regular
  // OR arrear — has failed. A pending/failed arrear keeps the student in Arrears.
  const statusAllClear = !session.courses.some(
    (c) => c.is_published && c.is_pass === false
  );

  // Nothing declared yet for this session.
  if (!anyPublished) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hourglass className="h-5 w-5 text-amber-600" />
            Result not published yet
          </CardTitle>
          <CardDescription>
            Your result for {session.semester_label} will appear here once the
            examination office declares it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span>
              You have <strong>{session.courses.length}</strong> registered
              course{session.courses.length === 1 ? '' : 's'} this session
              {arrearTotal > 0 ? ` (${arrearTotal} arrear)` : ''}.
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary card — regular-papers scorecard for this semester.
          Hidden behind SHOW_SUMMARY until enabled as a feature. */}
      {SHOW_SUMMARY && (
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
                : 'grid grid-cols-3 gap-3'
            }
          >
            {SHOW_SGPA && (
              <SummaryStat
                icon={<CheckCircle2 className="h-4 w-4 text-amber-600" />}
                label="SGPA"
                value={
                  session.summary?.sgpa != null
                    ? session.summary.sgpa.toFixed(2)
                    : '—'
                }
                highlight
              />
            )}
            <SummaryStat
              icon={<BookOpen className="h-4 w-4 text-sky-600" />}
              label="Credits"
              value={String(regularCredits)}
            />
            <SummaryStat
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              label="Passed"
              value={`${regularPassed} / ${regularTotal}`}
            />
            <SummaryStat
              icon={
                statusAllClear ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )
              }
              label="Status"
              value={statusAllClear ? 'All Clear' : 'Arrears'}
            />
          </div>

          {/* Separate arrear line — arrears belong to earlier semesters, so they
              are tracked apart from the regular semester scorecard. */}
          {arrearTotal > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-sm">
              <span className="inline-flex items-center rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                Arrear
              </span>
              <span className="text-muted-foreground">Arrears this session:</span>
              <span className="font-semibold tabular-nums">
                {arrearCleared} / {arrearTotal} cleared
              </span>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <ResultTable rows={rows} />

      {gradeBands.length > 0 && (
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
