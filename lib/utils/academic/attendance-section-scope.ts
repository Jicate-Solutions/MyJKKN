/**
 * Guard for section identifiers that arrive from outside the timetable.
 *
 * Added: 2026-08-06 — the "Mark Attendance" screen accepts a `sectionId` URL
 * query param and, for a practical period whose slot carries no section of its
 * own, uses it verbatim as the roster scope. Nothing checked that the section
 * belonged to the timetable being marked, so a Semester V section reached a
 * Semester III lab and produced a complete, confident, wrong roster (the
 * third-year list on a second-year SDC lab).
 *
 * The wrong roster rather than an empty one is the important part:
 * fn_attendance_roster treats section as AUTHORITATIVE and ignores
 * degree/program/semester whenever section ids are supplied (deliberate — see
 * BUG-003249/003250, where drifted denormalised copies were dropping valid
 * learners). So a bad section id cannot be caught downstream. It has to be
 * rejected before it becomes scope.
 */

export type SectionScopeRejection = 'semester_mismatch';

export interface SectionScopeRow {
  id: string;
  semester_id?: string | null;
}

export interface TimetableScopeRow {
  semester_id?: string | null;
  timetable_type?: string | null;
}

export interface SectionScopeVerdict {
  accepted: boolean;
  reason?: SectionScopeRejection;
}

const ACCEPTED: SectionScopeVerdict = { accepted: true };

/**
 * Decide whether `section` may be trusted as the attendance scope for
 * `timetable`.
 *
 * Judges on semester alone. Programme and department are deliberately excluded:
 * fn_attendance_roster already declines to filter on department because faculty
 * teach learners from other departments (subdivision groups, electives), and a
 * wider guard here would turn that supported case into a blank roster — trading
 * this bug for the one it was written to prevent.
 *
 * Anything it cannot judge is accepted. A missing semester on either side is a
 * data gap, not evidence of a mismatch, and refusing on absence would break
 * batch/cycle timetables that carry no semester of their own.
 */
export function verifySectionInTimetableScope(
  section: SectionScopeRow | null | undefined,
  timetable: TimetableScopeRow | null | undefined
): SectionScopeVerdict {
  if (!section || !timetable) return ACCEPTED;

  const sectionSemester = section.semester_id;
  const timetableSemester = timetable.semester_id;

  if (!sectionSemester || !timetableSemester) return ACCEPTED;

  if (sectionSemester !== timetableSemester) {
    return { accepted: false, reason: 'semester_mismatch' };
  }

  return ACCEPTED;
}
