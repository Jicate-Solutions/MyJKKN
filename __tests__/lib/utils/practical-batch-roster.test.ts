/**
 * Regression tests for narrowing a practical period's roster to the batch the
 * faculty selected.
 *
 * BUG-005826 (reported 2026-08-14 08:28 UTC, JKKN College of Arts and Science
 * (Aided), Chemistry): marking the I B.Sc Chemistry "GENERIC ELECTIVE ZOOLOGY
 * PRACTICAL" period showed 19 learners. Only the 9 who chose the Zoology allied
 * should appear. The reporter wrote "Again" — BUG-005781 is the same complaint
 * against the theory period of the same split.
 *
 * Root cause, verified against production slot
 * c3a0a366-58f7-44df-ae61-e1c5466048cd of timetable
 * e9d019bd-c8e9-45de-8e12-c910af5d4ae8:
 *
 *   The allied split is a PER-LEARNER elective choice inside ONE section —
 *   21 students in I B.Sc Chemistry, 12 taking Maths allied and 9 taking
 *   Zoology allied. Every narrowing mechanism a practical period has is
 *   SECTION-shaped:
 *
 *     Batch A "Maths"   -> assignment_type 'manual', section_ids [], count 12
 *     Batch B "Zoology" -> assignment_type 'section',
 *                          section_ids ['442bdd4d-1af3-40dd-9750-bf3f7f3dce3b'],
 *                          count 9
 *
 *   442bdd4d is section "A" — the WHOLE class (20 learners, 19 active). It is
 *   the only section the programme has, so "Batch B = the 9 Zoology students"
 *   resolves to all 19. Batch A fares no better: `manual` was offered in the
 *   config UI as "Manual student selection at attendance", but BatchDefinition
 *   had no field to hold the chosen learners and the mark page had no picker,
 *   so an empty section_ids fell through to the programme/semester roster —
 *   again all 19.
 *
 * The fix gives BatchDefinition the `student_ids` field that SubdivisionGroup
 * has had since 2025-10-11, and narrows the loaded roster by it.
 *
 * Deliberately NOT done here: falling back to the full roster when a batch
 * names members that no longer match. Showing everyone is exactly the bug being
 * fixed, and a silent widening is what let this survive two reports. An empty
 * roster with the unmatched ids reported is the honest answer.
 */

import { describe, it, expect } from 'vitest';
import { narrowRosterToPracticalBatch } from '@/lib/utils/academic/practical-batch-roster';

// Real production learner ids from the I B.SC CHEMISTRY roster (section A).
const ZOOLOGY_ALLIED = [
  '3f371271-5b02-4bc6-a20a-464d78f9db7e', // AKILA N
  'de83c015-ebe5-41c1-ba09-f9ca92227160', // DHARSHINI S
  'd275961e-c7a2-4634-824c-8a9aec01a9f8', // KOPIKA A
  '4378d511-9a09-46b1-b165-0e164afc1fe3', // MALASRI S
  '3183aef4-4bc6-4f0c-85f6-cabed3a8c7b8', // OVIYA SRI S
  'a8bc9e8a-8f28-4bb0-b0e9-11d956630860', // SANTHIYA V
  '77c66108-5171-48e7-afef-86999b1de33d', // YOGAPRIYA M
  '894f29eb-ac74-4f88-b542-438f75764739'  // DEVIPRIYA V
];

const MATHS_ALLIED = [
  '3047b29d-dd6c-49ae-b5b0-89b949d191e4', // ARCHANA K
  '9b644107-3e22-49a3-a808-1fd67eb9cc0e', // DHANAPRIYA G
  'b8d00922-b454-47ce-864e-20a2cf1e60a3', // ELAVARASI G
  'e442b8dc-f125-482b-9315-f173027ff244', // HARINI M
  '8a21ab43-1200-4e00-9232-00a637329d72', // JANARITHIK M
  'e139de12-f7ae-4ec9-9ca4-afd146f95627', // JANARITHISH M
  'd83d3d24-374c-4ff8-b35f-d4d610d11009', // KEERTHIGA P
  '7e33e97d-669a-425c-aa46-60240910df2d', // KOWSALYA S
  '8108e9c1-035f-4a6b-ae0d-d5b50dbcd7cb', // MONIKA S
  'e3d1df11-18a9-4617-bbbb-4088524b2976', // RITHISH M S
  '9390d712-0148-4696-baa4-52a6bef3a545'  // SELVAM B
];

/** The roster loadStudents actually returns for this slot: all 19 actives. */
const FULL_ROSTER = [...ZOOLOGY_ALLIED, ...MATHS_ALLIED].map((id) => ({ id }));

describe('narrowRosterToPracticalBatch', () => {
  it('narrows the 19-learner roster to the 8 Zoology allied learners (BUG-005826)', () => {
    const result = narrowRosterToPracticalBatch(FULL_ROSTER, ZOOLOGY_ALLIED);

    expect(result.source).toBe('batch_students');
    expect(result.learners).toHaveLength(8);
    expect(result.learners.map((s) => s.id).sort()).toEqual([...ZOOLOGY_ALLIED].sort());
    expect(result.unmatchedIds).toEqual([]);
  });

  it('narrows the same roster to the Maths allied learners for the other batch', () => {
    const result = narrowRosterToPracticalBatch(FULL_ROSTER, MATHS_ALLIED);

    expect(result.source).toBe('batch_students');
    expect(result.learners).toHaveLength(11);
    expect(result.learners.every((s) => MATHS_ALLIED.includes(s.id))).toBe(true);
  });

  it('preserves roster order rather than the order ids were configured in', () => {
    // The roster arrives sorted by name from fn_attendance_roster. Reordering it
    // to match a hand-authored id list would shuffle the marking screen every
    // time someone edited the batch.
    const scrambled = [...ZOOLOGY_ALLIED].reverse();
    const result = narrowRosterToPracticalBatch(FULL_ROSTER, scrambled);

    expect(result.learners.map((s) => s.id)).toEqual(
      FULL_ROSTER.filter((s) => ZOOLOGY_ALLIED.includes(s.id)).map((s) => s.id)
    );
  });

  it('leaves the roster untouched when the batch names no learners', () => {
    // Section-assigned batches, and every batch authored before this field
    // existed, must keep working exactly as they do today.
    for (const empty of [undefined, null, []]) {
      const result = narrowRosterToPracticalBatch(FULL_ROSTER, empty);

      expect(result.source).toBe('unnarrowed');
      expect(result.learners).toBe(FULL_ROSTER);
      expect(result.unmatchedIds).toEqual([]);
    }
  });

  it('ignores blank and duplicate ids without treating the batch as empty', () => {
    const messy = ['', ZOOLOGY_ALLIED[0], ZOOLOGY_ALLIED[0], null as any, undefined as any];
    const result = narrowRosterToPracticalBatch(FULL_ROSTER, messy);

    expect(result.source).toBe('batch_students');
    expect(result.learners.map((s) => s.id)).toEqual([ZOOLOGY_ALLIED[0]]);
    expect(result.unmatchedIds).toEqual([]);
  });

  it('reports ids the roster does not contain instead of dropping them silently', () => {
    // S. BHARANIDHARAN and C. NIRMALKUMAR appear on the department's name list
    // but are not enrolled in the section, so a batch authored from that list
    // carries ids the roster cannot match. The caller needs to be able to say
    // so — "9 configured, 8 loaded" is a data problem the office must fix.
    const notEnrolled = '00000000-0000-4000-8000-000000000001';
    const result = narrowRosterToPracticalBatch(FULL_ROSTER, [
      ...ZOOLOGY_ALLIED,
      notEnrolled
    ]);

    expect(result.learners).toHaveLength(8);
    expect(result.unmatchedIds).toEqual([notEnrolled]);
  });

  it('returns an empty roster, NOT everyone, when no configured learner is enrolled', () => {
    // The whole point of the bug: widening on a miss is indistinguishable from
    // having no configuration at all, and puts 19 names on a 9-student lab.
    const stale = ['00000000-0000-4000-8000-000000000002'];
    const result = narrowRosterToPracticalBatch(FULL_ROSTER, stale);

    expect(result.source).toBe('batch_students');
    expect(result.learners).toEqual([]);
    expect(result.unmatchedIds).toEqual(stale);
  });

  it('tolerates an empty roster without claiming unmatched learners are missing data', () => {
    const result = narrowRosterToPracticalBatch([], ZOOLOGY_ALLIED);

    expect(result.learners).toEqual([]);
    expect(result.unmatchedIds).toEqual(ZOOLOGY_ALLIED);
  });
});
