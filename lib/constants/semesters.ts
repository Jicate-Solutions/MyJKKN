/**
 * The default "Freshers" semester.
 *
 * Every program is guaranteed one, seeded by the `programs_seed_freshers`
 * trigger (and backfilled by 20260727_seed_freshers_semester_and_section.sql),
 * so that the modules hanging off semesters/sections always have a valid target.
 *
 * It is ORG STRUCTURE, not an academic term. That distinction matters because
 * the admission entry-type auto-pick treats the lowest-ordered semester as the
 * program's first real academic term:
 *
 *   FIRST YEAR    → `semesters.find(initial_semester) ?? sorted[0]`
 *   LATERAL ENTRY → classifies the program as year-based vs semester-based by
 *                   probing `sorted[0].semester_name` with /year/i, then picks
 *                   semester_order 2 or 3 with a positional fallback.
 *
 * Freshers carries `semester_order = 0`, so it would land at `sorted[0]` and
 * quietly corrupt all three decisions — year-based programs (PharmD, BDS,
 * BSc-Nursing, whose semesters are literally named "1 Year".."5 YEAR") would be
 * misread as semester-based. Call sites therefore filter it out *before*
 * sorting; see `isFreshersSemester`.
 */
export const FRESHERS_SEMESTER_NAME = 'Freshers';
export const FRESHERS_SEMESTER_ORDER = 0;

/**
 * True when a semester row is the structural Freshers placeholder rather than a
 * real academic term.
 *
 * Both signals are checked: `semester_order === 0` is the sentinel the seed
 * writes (no other row in the system uses order 0), and the name check catches
 * rows created by hand through the semesters form or the Excel bulk import,
 * where the order may not have been set.
 */
export function isFreshersSemester(semester: {
  semester_name?: string | null;
  semester_order?: number | null;
}): boolean {
  return (
    semester.semester_order === FRESHERS_SEMESTER_ORDER ||
    semester.semester_name?.trim().toLowerCase() ===
      FRESHERS_SEMESTER_NAME.toLowerCase()
  );
}
