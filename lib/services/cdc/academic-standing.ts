/**
 * lib/services/cdc/academic-standing.ts
 *
 * Derives the CGPA + arrears figures a recruiter asks for from the learner's
 * COE result view. MyJKKN stores no per-learner CGPA / backlog column (see
 * types/cdc/idp.ts); COE publishes per-course grades, so both numbers are
 * computed here, the same way the learner's own Result tab reasons about
 * arrears (`is_regular === false` / `is_pass === false`).
 *
 * Pure: no I/O. Feed it the view from lib/services/coe/learner-result-view.ts.
 */

import type { StudentResultView, ResultViewCourse } from '@/types/my-marks';

export interface ArrearDetail {
  course_code: string | null;
  course_name: string | null;
  /** The course's OWN semester (e.g. "3" / "III"). */
  semester: string | null;
  attempts: number;
  /** COE result_status / pass_status wording for the latest attempt. */
  status: string | null;
}

export interface AcademicStanding {
  /** Credit-weighted grade-point average over every passed, credit-bearing paper. null = nothing published yet. */
  cgpa: number | null;
  /** Papers whose LATEST published attempt is not a pass. */
  arrears_count: number;
  arrears: ArrearDetail[];
  /** Papers considered for CGPA (passed + credit_included). */
  papers_considered: number;
  /** Published papers seen at all (regular + arrear attempts, all sessions). */
  papers_published: number;
}

interface Attempt {
  course: ResultViewCourse;
  order: number; // session order (later = higher)
}

function courseKey(c: ResultViewCourse, fallback: number): string {
  const code = (c.course_code ?? '').trim().toUpperCase();
  if (code) return code;
  const name = (c.course_name ?? '').trim().toUpperCase();
  return name ? `NAME:${name}` : `IDX:${fallback}`;
}

function isPassed(c: ResultViewCourse): boolean {
  if (c.is_pass === true) return true;
  if (c.is_pass === false) return false;
  const s = (c.pass_status ?? c.result_status ?? '').toLowerCase();
  return s === 'pass' || s === 'passed' || s === 'p';
}

/**
 * Attempt ordering: attempt_number when COE supplies it, otherwise the
 * session's position in the view (sessions are chronological).
 */
function attemptRank(a: Attempt): number {
  return a.course.attempt_number != null ? a.course.attempt_number * 1000 + a.order : a.order;
}

export function summarizeAcademicStanding(view: StudentResultView | null): AcademicStanding {
  const empty: AcademicStanding = {
    cgpa: null,
    arrears_count: 0,
    arrears: [],
    papers_considered: 0,
    papers_published: 0,
  };
  if (!view || !Array.isArray(view.sessions)) return empty;

  // Group every published attempt by course.
  const byCourse = new Map<string, Attempt[]>();
  let published = 0;
  let idx = 0;
  view.sessions.forEach((session, sessionOrder) => {
    (session.courses ?? []).forEach((course) => {
      idx += 1;
      if (course.is_published === false) return;
      published += 1;
      const key = courseKey(course, idx);
      const list = byCourse.get(key) ?? [];
      list.push({ course, order: sessionOrder });
      byCourse.set(key, list);
    });
  });

  let weighted = 0;
  let credits = 0;
  let considered = 0;
  const arrears: ArrearDetail[] = [];

  for (const attempts of byCourse.values()) {
    attempts.sort((a, b) => attemptRank(a) - attemptRank(b));
    const latest = attempts[attempts.length - 1].course;
    const passedAttempt = [...attempts].reverse().find((a) => isPassed(a.course))?.course ?? null;

    if (passedAttempt) {
      const credit = Number(passedAttempt.credit ?? 0);
      const gp = passedAttempt.grade_points;
      if (passedAttempt.credit_included !== false && credit > 0 && gp != null) {
        weighted += credit * Number(gp);
        credits += credit;
        considered += 1;
      }
      continue;
    }

    // No passed attempt on record and the latest attempt is a declared fail → arrear.
    if (!isPassed(latest)) {
      arrears.push({
        course_code: latest.course_code ?? null,
        course_name: latest.course_name ?? null,
        semester: latest.semester_code ?? (latest.semester_index != null ? String(latest.semester_index) : null),
        attempts: attempts.length,
        status: latest.result_status ?? latest.pass_status ?? (latest.is_pass === false ? 'Fail' : null),
      });
    }
  }

  arrears.sort((a, b) => (a.semester ?? '').localeCompare(b.semester ?? '') || (a.course_code ?? '').localeCompare(b.course_code ?? ''));

  return {
    cgpa: credits > 0 ? Math.round((weighted / credits) * 100) / 100 : null,
    arrears_count: arrears.length,
    arrears,
    papers_considered: considered,
    papers_published: published,
  };
}

/** Compact "CODE (Sem 3)" list for spreadsheets / one-line displays. */
export function formatArrearsForExport(arrears: ArrearDetail[] | null | undefined): string {
  if (!arrears || arrears.length === 0) return '';
  return arrears
    .map((a) => {
      const label = a.course_code || a.course_name || 'Unknown';
      const sem = a.semester ? ` (Sem ${a.semester})` : '';
      return `${label}${sem}`;
    })
    .join('; ');
}
