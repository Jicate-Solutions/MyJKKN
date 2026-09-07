import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Course-code collision detection for BoS course-document creation.
 *
 * WHY THIS EXISTS
 * ---------------
 * Both create paths (POST /api/bos/syllabus and POST /api/bos/syllabus/[id]/clone)
 * insert a fresh row at `version_number: 1`. Production enforces TWO rules:
 *
 *   UNIQUE (regulation_id, course_code, version_number)          -- table constraint
 *   UNIQUE (regulation_id, course_code) WHERE is_latest = true   -- idx_bos_syllabi_one_latest
 *
 * Neither is scoped by institution, and that is deliberate: every regulation
 * shared by more than one institution is a CAS Aided + Self-Financed pair
 * sharing one counselling code, and the list deliberately shows that pair a
 * single merged set. One course code means one course document for the pair.
 *
 * The bug was that both routes pre-checked with `.eq('is_latest', true)` only.
 * A code whose only row is archived or superseded (is_latest = false) still
 * owns `version_number = 1`, so the pre-check passed, the insert hit 23505, and
 * the route reported a bare 500. Those rows are also hidden from the list
 * (which defaults to is_latest = true, is_archived = false), so the code looked
 * free from every angle while being permanently unusable.
 *
 * Because a new row is always version 1, ANY existing row for the same
 * (regulation_id, course_code) is a guaranteed collision — latest, superseded
 * or archived alike. This helper looks for all of them.
 *
 * The lookup runs on the service-role client for the same reason the list route
 * does: the bos_course_syllabi SELECT policy is not readable by every board
 * member, so a user-scoped pre-check can miss the very row that blocks the
 * insert. Nothing from the conflicting row is returned to the caller beyond
 * what the refusal message needs to be actionable.
 */
export interface CourseCodeConflict {
  id: string;
  course_name: string | null;
  version_number: number | null;
  is_latest: boolean | null;
  is_archived: boolean | null;
  institution_name: string | null;
}

type ConflictRow = {
  id: string;
  course_name: string | null;
  version_number: number | null;
  is_latest: boolean | null;
  is_archived: boolean | null;
  institutions: { name: string | null } | { name: string | null }[] | null;
};

/**
 * Pick the row that best explains the clash: the live one if there is one,
 * otherwise the highest version. Exported for tests.
 */
export function pickConflictRow<
  T extends { is_latest?: boolean | null; version_number?: number | null },
>(rows: T[]): T | null {
  if (!rows || rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const aLatest = a.is_latest === true ? 1 : 0;
    const bLatest = b.is_latest === true ? 1 : 0;
    if (aLatest !== bLatest) return bLatest - aLatest;
    return (b.version_number ?? 0) - (a.version_number ?? 0);
  })[0];
}

/**
 * Turn a collision into a refusal a colleague can act on: which record holds
 * the code, what state it is in, and the remedy for that state.
 *
 * The remedies name the row-menu actions verbatim — "Revise" and "View
 * History" — so the message points at a button that exists.
 *
 * Exported for tests.
 */
export function courseCodeConflictMessage(
  courseCode: string,
  conflict: CourseCodeConflict,
): string {
  const version = `Version ${conflict.version_number ?? 1}`;
  const title = conflict.course_name ? `"${conflict.course_name}"` : 'an existing course';
  const owner = conflict.institution_name ? `, ${conflict.institution_name}` : '';

  if (conflict.is_archived === true) {
    return (
      `Course code ${courseCode} is already used in this regulation by ${title} ` +
      `(${version}, archived${owner}). An archived record still holds its course code — ` +
      `open View History for this code to restore it, or upload under a different course code.`
    );
  }

  if (conflict.is_latest !== true) {
    return (
      `Course code ${courseCode} is already used in this regulation by ${title} ` +
      `(${version}, superseded${owner}). Open View History for this code and work from ` +
      `the existing version, or upload under a different course code.`
    );
  }

  return (
    `Course code ${courseCode} is already used in this regulation by ${title} ` +
    `(${version}${owner}). To publish an update, open that course and choose Revise. ` +
    `To keep both, upload under a different course code.`
  );
}

/**
 * Find any row that would collide with a new version-1 insert for this
 * regulation + course code. Returns null when the code is genuinely free.
 */
export async function findCourseCodeConflict(
  regulationId: string,
  courseCode: string,
): Promise<CourseCodeConflict | null> {
  const db = createServiceRoleClient();

  const { data } = await db
    .from('bos_course_syllabi')
    .select('id, course_name, version_number, is_latest, is_archived, institutions:institutions_id(name)')
    .eq('regulation_id', regulationId)
    .eq('course_code', courseCode);

  const row = pickConflictRow((data ?? []) as ConflictRow[]);
  if (!row) return null;

  const institution = Array.isArray(row.institutions) ? row.institutions[0] : row.institutions;

  return {
    id: row.id,
    course_name: row.course_name,
    version_number: row.version_number,
    is_latest: row.is_latest,
    is_archived: row.is_archived,
    institution_name: institution?.name ?? null,
  };
}

/** Postgres unique-violation SQLSTATE. */
export const UNIQUE_VIOLATION = '23505';

/**
 * Build the refusal for a unique violation raised by the insert itself — a race,
 * or any row the pre-check could not see. Falls back to a plain message when the
 * conflicting row can no longer be read.
 */
export async function courseCodeConflictMessageFor(
  regulationId: string | null | undefined,
  courseCode: string,
): Promise<string> {
  const conflict = regulationId ? await findCourseCodeConflict(regulationId, courseCode) : null;
  if (conflict) return courseCodeConflictMessage(courseCode, conflict);
  return (
    `Course code ${courseCode} is already used in this regulation. ` +
    `Open View History for this code, or upload under a different course code.`
  );
}
