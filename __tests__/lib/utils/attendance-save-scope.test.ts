/**
 * Regression tests for the attendance SAVE-time section resolution.
 *
 * BUG-005824 (reported 2026-08-14 06:12 UTC by Dr. V. Radhamani, JKKN College
 * of Arts and Science (Aided), Mathematics): marking 13/08 attendance for
 * I B.Sc Mathematics failed with "Missing section information. Please go back
 * and select a section." There is no section picker to go back to.
 *
 * Root cause chain, all verified against production:
 *   1. A timetable slot may be authored with NO section anywhere:
 *      slot.section_id IS NULL *and* slot.section_ids = []. `timetable_data` is
 *      a JSONB blob, so no constraint prevents it. Across active timetables:
 *      569 such slots in 34 timetables; 281 of them (25 timetables) sit under a
 *      semester-level parent whose `timetables.section_id` is also NULL, so the
 *      whole precedence chain resolves to nothing.
 *   2. loadStudents (mark/page.tsx) deliberately does NOT bail on this — it logs
 *      "No section on this slot - falling back to programme/semester scope" and
 *      lets fn_attendance_roster scope by degree/program/semester instead. The
 *      faculty therefore sees a correct, complete roster and marks it.
 *   3. handleSaveAttendance then hard-refused, because its own resolution
 *      stopped at the same four empty sources. Work already done was discarded,
 *      and the message named a control that does not exist on that screen.
 *
 * The fix adds a fifth tier: the roster that is already on screen. Every learner
 * carries their own `section_id` (verified 11/11 for the reported Mathematics
 * cohort, 19/19 for the I B.SC CHEMISTRY cohort whose Period 4 slot is still
 * sectionless), and the per-learner save path at mark/page.tsx already prefers
 * `student.section_id` over the page-level value. So the section the parent
 * record needs is present all along — it just was not being read.
 *
 * This is deliberately a resolution fix, not a data backfill. 6 of the 25
 * affected timetables are batch-based (BDS/MBA/B.Pharmacy, 2-6 candidate
 * sections each) where guessing a section would produce a complete, plausible,
 * WRONG roster — the exact failure mode verifySectionInTimetableScope exists to
 * prevent. Deriving from the roster cannot invent a section that is not there.
 */

import { describe, it, expect } from 'vitest';
import { resolveAttendanceSaveScope } from '@/lib/utils/academic/attendance-section-scope';

// Real production identifiers from BUG-005824.
const MATHS_SECTION_A = 'd7f00d41-3306-4224-a9da-c86badb4982d';
const BATCH_SECTION = '35b81c8d-cc17-44a4-8f2e-895fc19c7ebd';
const URL_SECTION = '168bbeb9-14cf-498b-8117-5dc38970a12c';
const OTHER_SECTION = '9609959f-aa51-4c4d-81db-4ba448adf855';

describe('resolveAttendanceSaveScope', () => {
  it('recovers the section from the roster when the slot carries none (BUG-005824)', () => {
    // The reported slot: f0db7b14, timetable 8a758ded "I B.Sc (Mathematics)",
    // semester-level, timetables.section_id NULL, slot.section_ids []. The URL
    // had no sectionId param either — all four legacy sources are empty.
    const scope = resolveAttendanceSaveScope({
      practicalSectionIds: null,
      contextSectionId: null,
      urlSectionId: null,
      contextSectionIds: [],
      rosterSectionIds: Array(11).fill(MATHS_SECTION_A),
    });

    expect(scope.sectionId).toBe(MATHS_SECTION_A);
    expect(scope.source).toBe('roster');
    expect(scope.sectionIds).toEqual([MATHS_SECTION_A]);
  });

  it('still refuses when the roster cannot supply a section either', () => {
    // An empty roster, or learners with no section of their own, is a genuine
    // data gap. Inventing a section here is what produces a wrong roster.
    expect(
      resolveAttendanceSaveScope({
        contextSectionIds: [],
        rosterSectionIds: [],
      }).sectionId
    ).toBeNull();

    expect(
      resolveAttendanceSaveScope({
        contextSectionIds: [],
        rosterSectionIds: [null, undefined, ''],
      }).source
    ).toBe('none');
  });

  it('keeps the practical batch as the highest authority', () => {
    // The parent slot of a practical carries no section by design; the batch
    // selection is authoritative (BUG fixed 2026-07-20). The roster tier must
    // not outrank it — a practical roster spans the whole cohort, not the batch.
    const scope = resolveAttendanceSaveScope({
      practicalSectionIds: [BATCH_SECTION],
      contextSectionId: OTHER_SECTION,
      urlSectionId: URL_SECTION,
      contextSectionIds: [OTHER_SECTION],
      rosterSectionIds: [OTHER_SECTION],
    });

    expect(scope.sectionId).toBe(BATCH_SECTION);
    expect(scope.source).toBe('practical_batch');
  });

  it('preserves the existing precedence: context, then URL, then slot sections', () => {
    expect(
      resolveAttendanceSaveScope({
        contextSectionId: MATHS_SECTION_A,
        urlSectionId: URL_SECTION,
        contextSectionIds: [OTHER_SECTION],
        rosterSectionIds: [OTHER_SECTION],
      })
    ).toMatchObject({ sectionId: MATHS_SECTION_A, source: 'context_section' });

    expect(
      resolveAttendanceSaveScope({
        contextSectionId: null,
        urlSectionId: URL_SECTION,
        contextSectionIds: [OTHER_SECTION],
        rosterSectionIds: [OTHER_SECTION],
      })
    ).toMatchObject({ sectionId: URL_SECTION, source: 'url_param' });

    expect(
      resolveAttendanceSaveScope({
        contextSectionId: null,
        urlSectionId: null,
        contextSectionIds: [OTHER_SECTION, MATHS_SECTION_A],
        rosterSectionIds: [BATCH_SECTION],
      })
    ).toMatchObject({ sectionId: OTHER_SECTION, source: 'slot_sections' });
  });

  it('carries the full multi-section list through, not just the representative', () => {
    // saveConsolidatedAttendance only forwards section_ids when there is more
    // than one; dropping the tail here would silently narrow a multi-section
    // slot's save to its first section.
    const scope = resolveAttendanceSaveScope({
      contextSectionIds: [OTHER_SECTION, MATHS_SECTION_A],
    });

    expect(scope.sectionIds).toEqual([OTHER_SECTION, MATHS_SECTION_A]);
  });

  it('de-duplicates and orders a mixed roster deterministically', () => {
    // A programme/semester fallback roster can legitimately span sections. The
    // representative must not depend on learner ordering, or two saves of the
    // same screen would disagree on the parent record's section_id.
    const a = resolveAttendanceSaveScope({
      rosterSectionIds: [OTHER_SECTION, MATHS_SECTION_A, OTHER_SECTION],
    });
    const b = resolveAttendanceSaveScope({
      rosterSectionIds: [MATHS_SECTION_A, OTHER_SECTION, MATHS_SECTION_A],
    });

    expect(a.sectionIds).toEqual(b.sectionIds);
    expect(a.sectionId).toBe(b.sectionId);
    expect(a.sectionIds).toHaveLength(2);
  });

  it('tolerates every input being absent', () => {
    expect(resolveAttendanceSaveScope({})).toMatchObject({
      sectionId: null,
      sectionIds: [],
      source: 'none',
    });
  });
});
