/**
 * Regression tests for which section the attendance list hands to the mark page.
 *
 * BUG (reported 2026-08-16): "The selected section belongs to a different
 * semester than this timetable and was ignored." shown on the Attendance page
 * during normal use.
 *
 * That toast is verifySectionInTimetableScope rejecting the `sectionId` URL
 * query param. The param is built in academic/attendance/page.tsx, which ranked
 * `searchContext.section_id` — whatever section is selected in the FILTER PANEL
 * — ABOVE the period's own section, in all three navigation paths
 * (practical, subdivided, and getSingleSectionId).
 *
 * So clicking a period whose timetable belongs to a different semester than the
 * filter's section sent that foreign section to the mark page, and the guard
 * correctly refused it. The guard was doing its job; the ordering upstream was
 * wrong. It is the same ordering blamed in the 2026-08-06 comment in
 * mark/page.tsx for putting a Semester V roster on a Semester III lab — the
 * guard was added to catch that, but the cause was never fixed.
 *
 * Inverting the precedence is safe as of the 2026-08-16 section backfill: all
 * 12,534 slot→section references across active timetables resolve to a section
 * in the timetable's own semester, so a period's own section can never trip the
 * guard. The filter's section survives only as a last resort, for slots that
 * still carry no section of their own.
 *
 * Multi-section periods never reach this helper — handlePeriodSelection routes
 * them to the "mark all sections together" path before it is called — so
 * preferring the period's section cannot override a deliberate section choice.
 */

import { describe, it, expect } from 'vitest';
import { resolvePeriodSectionId } from '@/lib/utils/academic/attendance-section-scope';

const FILTER_SECTION_SEM_I = 'd7f00d41-3306-4224-a9da-c86badb4982d';
const PERIOD_SECTION_SEM_III = '442bdd4d-1af3-40dd-9750-bf3f7f3dce3b';

describe('resolvePeriodSectionId', () => {
  it("prefers the period's own section over the filter panel's", () => {
    // The reported bug: the filter still held a Semester I section while the
    // clicked period belonged to a Semester III timetable.
    expect(
      resolvePeriodSectionId(
        { sections: [{ id: PERIOD_SECTION_SEM_III }] },
        FILTER_SECTION_SEM_I
      )
    ).toBe(PERIOD_SECTION_SEM_III);
  });

  it('reads section_ids when the enriched sections array is absent', () => {
    expect(
      resolvePeriodSectionId(
        { section_ids: [PERIOD_SECTION_SEM_III] },
        FILTER_SECTION_SEM_I
      )
    ).toBe(PERIOD_SECTION_SEM_III);
  });

  it('falls back to the filter section only when the period has none', () => {
    // Still the right answer for a slot authored with no section: a possibly
    // wrong section that the guard can vet beats no section at all.
    expect(resolvePeriodSectionId({}, FILTER_SECTION_SEM_I)).toBe(FILTER_SECTION_SEM_I);
    expect(
      resolvePeriodSectionId({ sections: [], section_ids: [] }, FILTER_SECTION_SEM_I)
    ).toBe(FILTER_SECTION_SEM_I);
  });

  it('returns undefined when nothing anywhere names a section', () => {
    // navigateToMarkAttendance omits the param entirely on undefined, which lets
    // the mark page resolve scope from the slot instead of from a stale filter.
    expect(resolvePeriodSectionId({}, '')).toBeUndefined();
    expect(resolvePeriodSectionId({}, undefined)).toBeUndefined();
    expect(resolvePeriodSectionId(null, null)).toBeUndefined();
  });

  it('ignores empty-string ids rather than treating them as a section', () => {
    // searchContext.section_id is initialised to '' , not null.
    expect(
      resolvePeriodSectionId({ sections: [{ id: '' }], section_ids: [''] }, '')
    ).toBeUndefined();
  });
});
