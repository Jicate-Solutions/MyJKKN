/**
 * Regression tests for the attendance section-scope guard.
 *
 * BUG (reported 2026-08-06 by Ms. Mouniga G, CET244, JKKN CET / ECE): the
 * "Mark Attendance" screen for the Wednesday CET P5 Skill Development Course
 * lab — a SECOND-year (Semester III) practical — listed the THIRD-year
 * (Semester V) roster.
 *
 * Root cause chain, all verified against production:
 *   1. The four practical slots in timetable 288dae4a ("II ECE 2026",
 *      semester-level, Semester III) were authored with no section anywhere:
 *      slot.section_ids = [] AND practical_config.batches[*].section_ids = [].
 *      Every other slot in the same timetable carried ["35b81c8d…"] (ECE
 *      Section A, Semester III, 58 active learners).
 *   2. practical-attendance-selector then handed the page section_ids: [],
 *      so mark/page.tsx fell through to contextData.section_id — which is just
 *      the `sectionId` URL query param, never validated against the timetable.
 *   3. That param was 168bbeb9… = ECE Section A **Semester V** (60 active
 *      learners), sourced from the filter panel's Section pick in
 *      attendance/page.tsx (it prefers searchContext.section_id over the slot's
 *      own sections, and the slot had none to offer).
 *   4. fn_attendance_roster treats section as AUTHORITATIVE — when
 *      p_section_ids is non-null it ignores degree/program/semester entirely
 *      (deliberate, per BUG-003249/003250). So the wrong section produced a
 *      pristine wrong roster instead of an empty one.
 *
 * The slot data was backfilled separately. This guard closes step 3 so the
 * class of bug cannot recur: a section arriving from the URL is only trusted
 * when it belongs to the timetable's own semester.
 *
 * Safety of the invariant: across every active timetable in production, 0 of
 * 12,335 slot→section references point at a section outside the timetable's
 * semester. No legitimate cross-semester slot exists to be broken by this.
 */

import { describe, it, expect } from 'vitest';
import { verifySectionInTimetableScope } from '@/lib/utils/academic/attendance-section-scope';

// Real production identifiers from the report.
const TIMETABLE_II_ECE = {
  id: '288dae4a-e4d7-457e-a276-659b4a4d4448',
  timetable_type: 'semester',
  semester_id: '9609959f-aa51-4c4d-81db-4ba448adf855', // Semester III
};

const SECTION_SEM_III = {
  id: '35b81c8d-cc17-44a4-8f2e-895fc19c7ebd', // ECE "A", Semester III — correct
  semester_id: '9609959f-aa51-4c4d-81db-4ba448adf855',
};

const SECTION_SEM_V = {
  id: '168bbeb9-14cf-498b-8117-5dc38970a12c', // ECE "A", Semester V — the leak
  semester_id: 'f35cc63e-625c-4a05-900b-1935b0a732b0',
};

describe('verifySectionInTimetableScope', () => {
  it('rejects the third-year section that leaked into the second-year SDC lab', () => {
    const verdict = verifySectionInTimetableScope(SECTION_SEM_V, TIMETABLE_II_ECE);

    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe('semester_mismatch');
  });

  it('accepts the section that genuinely belongs to the timetable', () => {
    const verdict = verifySectionInTimetableScope(SECTION_SEM_III, TIMETABLE_II_ECE);

    expect(verdict.accepted).toBe(true);
    expect(verdict.reason).toBeUndefined();
  });

  it('accepts when the section is absent — there is nothing to disprove', () => {
    expect(verifySectionInTimetableScope(null, TIMETABLE_II_ECE).accepted).toBe(true);
    expect(verifySectionInTimetableScope(undefined, TIMETABLE_II_ECE).accepted).toBe(true);
  });

  it('accepts when either side has no semester recorded', () => {
    // A section row whose semester_id was never populated cannot be judged;
    // refusing it here would turn a data gap into a blank roster.
    expect(
      verifySectionInTimetableScope({ id: SECTION_SEM_V.id, semester_id: null }, TIMETABLE_II_ECE)
        .accepted
    ).toBe(true);

    // Batch/cycle timetables may carry no semester_id of their own.
    expect(
      verifySectionInTimetableScope(SECTION_SEM_V, {
        ...TIMETABLE_II_ECE,
        semester_id: null,
      }).accepted
    ).toBe(true);
  });

  it('accepts when the timetable itself is absent', () => {
    expect(verifySectionInTimetableScope(SECTION_SEM_III, null).accepted).toBe(true);
  });

  it('judges on semester only — it must not reject on unrelated drift', () => {
    // department_id/program_id are deliberately NOT part of the verdict.
    // fn_attendance_roster already declines to filter on department because
    // faculty teach across departments (subdivision groups / electives);
    // widening this guard would re-introduce the empty-roster bug it avoids.
    const verdict = verifySectionInTimetableScope(
      { ...SECTION_SEM_III, program_id: 'some-other-program', department_id: 'other-dept' } as never,
      { ...TIMETABLE_II_ECE, program_id: '894b702c-c7ca-49a8-8b10-bf286169ba7d' } as never
    );

    expect(verdict.accepted).toBe(true);
  });
});
