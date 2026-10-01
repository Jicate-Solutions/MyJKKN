/**
 * Regression tests for the attendance DIVISION scope check.
 *
 * BUG-006033 and BUG-006034 (cluster ad0e2dca, both reported 2026-09-03 by
 * team members at JKKN College of Arts and Science (Aided)):
 *
 *   "For Nonmajor only three students have to be visible because only three
 *    students took zoology as nonmajor - Elavarasi, Preethi and Rubikasri"
 *   "For NonMajor as zoology only three students are alloted by commerce
 *    department but here whole class is visible."
 *
 * A non-major elective is a PER-LEARNER choice inside one section, so no section
 * can express it. The timetable has exactly one way to record it: name the
 * learners on the sub-slot (SubdivisionGroup.student_ids) or on the practical
 * batch (BatchDefinition.student_ids) - the fields and pickers added by
 * e57c978c0b on 2026-08-17 for BUG-005826. Neither reported slot named anybody,
 * verified against production on 2026-09-17:
 *
 *   BUG-006033  timetable 5e8a824d, slot 3b4b03f5, is_combined, 2 sub-slots,
 *               both section_ids [f2cf7de7], neither with student_ids.
 *               Group B teaches 48c2a489 (NME-I-SERICULTURE), Group A teaches
 *               c937e0a1.                              35 listed, 3 belong.
 *   BUG-006034  timetable fb3e1253, slot cb9516f2, practical, 3 batches, all
 *               section_ids [54f6f44a], none with student_ids. Batch C teaches
 *               48c2a489 and records estimated_count 3.  51 listed, 3 belong.
 *
 * Both narrowing branches in mark/page.tsx are written to leave an unnamed
 * division alone, deliberately, so that section-assigned batches keep working.
 * That is right when the sections differ and wrong when they do not: three
 * batches on one section, none naming anyone, are not three batches.
 *
 * What this helper does NOT do is decide the roster. There is no academic
 * course-enrolment table on this database (`course_enrollments` is the
 * public/online-courses module - course_events, packages, payments), so the
 * enrolment set exists nowhere but the slot. And it does not refuse: active
 * timetables hold 96 practical batches and 32 subdivision groups in this state,
 * against 1,024 marked practical and 150 marked subdivided periods in the last
 * 90 days.
 */

import { describe, it, expect } from 'vitest';
import {
  assessDivisionRosterScope,
  shouldWarnUnfilteredRoster,
  attendanceStatusForSave,
  attendanceRowsForSave,
  withUrlNarrowing,
  type RosterDivision,
  type RosterDivisionVerdict
} from '@/lib/utils/academic/attendance-section-scope';

// Real production identifiers from the two reports.
const COMMERCE_A = 'f2cf7de7-2020-4e3f-a455-3e54bcad7aa1'; // 35 active learners
const HOST_SECTION = '54f6f44a-026f-450e-a24c-d505f19fdead'; // 51 active learners
const OTHER_SECTION = '5a1f1c7e-0000-4000-8000-000000000001';
const SERICULTURE = '48c2a489-187c-4ec2-b1de-ea6a15a5a01b';
const MATHS_NME = '32619a67-2260-4832-8cd7-b02400245d51';
const TAMIL = 'c937e0a1-8cca-415c-a0e6-8c1650181c95';
const THE_THREE = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
];

/** BUG-006034's slot, exactly as `practical_config.batches` holds it. */
const REPORTED_BATCHES: RosterDivision[] = [
  {
    key: 'batch_1785391225600',
    label: 'Batch A',
    studentIds: [],
    sectionIds: [HOST_SECTION],
    courseId: '3453a1aa-5cb4-4e8b-8518-9b0ac1b589e6',
    expectedCount: 47
  },
  {
    key: 'batch_1785391251478',
    label: 'Batch B',
    studentIds: [],
    sectionIds: [HOST_SECTION],
    courseId: MATHS_NME,
    expectedCount: 2
  },
  {
    key: 'batch_1785391255108',
    label: 'Batch C',
    studentIds: [],
    sectionIds: [HOST_SECTION],
    courseId: SERICULTURE,
    expectedCount: 3
  }
];

/** BUG-006033's slot, exactly as `sub_slots` holds it. */
const REPORTED_SUB_SLOTS: RosterDivision[] = [
  {
    key: '1',
    label: 'Group A',
    studentIds: [],
    sectionIds: [COMMERCE_A],
    courseId: TAMIL,
    expectedCount: null
  },
  {
    key: '2',
    label: 'Group B',
    studentIds: [],
    sectionIds: [COMMERCE_A],
    courseId: SERICULTURE,
    expectedCount: null
  }
];

describe('assessDivisionRosterScope', () => {
  describe('the empty-enrolment case that must not fall back silently', () => {
    it('flags BUG-006034: Batch C names nobody and shares its section with A and B', () => {
      const verdict = assessDivisionRosterScope(
        'batch_1785391255108',
        REPORTED_BATCHES
      );

      expect(verdict.outcome).toBe('narrows_nothing');
      expect(verdict.narrowsNothing).toBe(true);
      expect(verdict.sharesScopeWith).toEqual(['Batch A', 'Batch B']);
      // Batch A teaches a different course, so the 51 listed learners provably
      // include people not taking NME-I-SERICULTURE.
      expect(verdict.siblingTeachesAnotherCourse).toBe(true);
      // The timetable recorded the real size all along; nobody was named.
      expect(verdict.expectedCount).toBe(3);
    });

    it('flags BUG-006033: Group B names nobody and shares its section with Group A', () => {
      const verdict = assessDivisionRosterScope('2', REPORTED_SUB_SLOTS);

      expect(verdict.outcome).toBe('narrows_nothing');
      expect(verdict.narrowsNothing).toBe(true);
      expect(verdict.sharesScopeWith).toEqual(['Group A']);
      expect(verdict.siblingTeachesAnotherCourse).toBe(true);
      expect(verdict.expectedCount).toBeNull();
    });

    it('flags a same-course split too, and says the sibling course does not differ', () => {
      // Two halves of one class for one course. The right cohort, divided the
      // wrong way: marking either group still records the whole section.
      const verdict = assessDivisionRosterScope('2', [
        { key: '1', label: 'Group 1', sectionIds: [COMMERCE_A], courseId: TAMIL },
        { key: '2', label: 'Group 2', sectionIds: [COMMERCE_A], courseId: TAMIL }
      ]);

      expect(verdict.narrowsNothing).toBe(true);
      expect(verdict.siblingTeachesAnotherCourse).toBe(false);
    });

    it('flags divisions that share "no section at all"', () => {
      // A sectionless slot falls back to programme/semester scope on this
      // screen, which is wider than a section, not narrower.
      const verdict = assessDivisionRosterScope('b2', [
        { key: 'b1', label: 'Batch A', sectionIds: [] },
        { key: 'b2', label: 'Batch B', sectionIds: null }
      ]);

      expect(verdict.narrowsNothing).toBe(true);
      expect(verdict.sharesScopeWith).toEqual(['Batch A']);
    });

    it('ignores the order section ids sit in inside the JSONB blob', () => {
      const verdict = assessDivisionRosterScope('b2', [
        { key: 'b1', label: 'Batch A', sectionIds: [COMMERCE_A, HOST_SECTION] },
        { key: 'b2', label: 'Batch B', sectionIds: [HOST_SECTION, COMMERCE_A] }
      ]);

      expect(verdict.narrowsNothing).toBe(true);
    });
  });

  describe('a non-empty enrolment set narrows, and is left alone', () => {
    it('accepts Batch C once the three learners are named', () => {
      // The fix these reports actually need: the coordinator names the 3 on the
      // batch. narrowRosterToPracticalBatch then applies and this must stay quiet.
      const named = REPORTED_BATCHES.map((batch) =>
        batch.key === 'batch_1785391255108'
          ? { ...batch, studentIds: THE_THREE }
          : batch
      );

      const verdict = assessDivisionRosterScope('batch_1785391255108', named);

      expect(verdict.outcome).toBe('narrowed_by_learners');
      expect(verdict.narrowsNothing).toBe(false);
      expect(verdict.sharesScopeWith).toEqual([]);
    });

    it('accepts a group once its learners are named, even sharing a section', () => {
      const verdict = assessDivisionRosterScope('2', [
        REPORTED_SUB_SLOTS[0],
        { ...REPORTED_SUB_SLOTS[1], studentIds: THE_THREE }
      ]);

      expect(verdict.outcome).toBe('narrowed_by_learners');
      expect(verdict.narrowsNothing).toBe(false);
    });

    it('treats a list of blanks and nulls as naming nobody', () => {
      const verdict = assessDivisionRosterScope('2', [
        REPORTED_SUB_SLOTS[0],
        { ...REPORTED_SUB_SLOTS[1], studentIds: ['', null, undefined] }
      ]);

      expect(verdict.narrowsNothing).toBe(true);
    });
  });

  describe('what must keep working unchanged', () => {
    it('leaves a section-assigned batch alone when its sections really differ', () => {
      // The case the practical-batch feature was built for: each batch IS a
      // whole section. Refusing here would trade this bug for BUG-003160.
      const verdict = assessDivisionRosterScope('b2', [
        { key: 'b1', label: 'Batch A', sectionIds: [HOST_SECTION] },
        { key: 'b2', label: 'Batch B', sectionIds: [OTHER_SECTION] }
      ]);

      expect(verdict.outcome).toBe('narrowed_by_section');
      expect(verdict.narrowsNothing).toBe(false);
      expect(verdict.sharesScopeWith).toEqual([]);
    });

    it('leaves a batch alone when it overlaps a sibling without matching it', () => {
      // Partial overlap is still a real difference in who loads.
      const verdict = assessDivisionRosterScope('b2', [
        { key: 'b1', label: 'Batch A', sectionIds: [HOST_SECTION] },
        { key: 'b2', label: 'Batch B', sectionIds: [HOST_SECTION, OTHER_SECTION] }
      ]);

      expect(verdict.outcome).toBe('narrowed_by_section');
      expect(verdict.narrowsNothing).toBe(false);
    });

    it('leaves the only division in a slot alone', () => {
      // One batch on the host section means the whole section does the lab
      // together. That is a configuration, not a mistake.
      const verdict = assessDivisionRosterScope('b1', [
        { key: 'b1', label: 'Batch A', sectionIds: [HOST_SECTION] }
      ]);

      expect(verdict.outcome).toBe('sole_division');
      expect(verdict.narrowsNothing).toBe(false);
    });

    it('judges nothing when the chosen division is not in the slot', () => {
      // A stale URL or an edited timetable. Anything it cannot judge narrows.
      const verdict = assessDivisionRosterScope('batch_gone', REPORTED_BATCHES);

      expect(verdict.outcome).toBe('unknown');
      expect(verdict.narrowsNothing).toBe(false);
      expect(verdict.expectedCount).toBeNull();
    });

    it('judges nothing without a chosen division or without divisions', () => {
      expect(
        assessDivisionRosterScope(null, REPORTED_BATCHES).narrowsNothing
      ).toBe(false);
      expect(assessDivisionRosterScope('2', []).outcome).toBe('unknown');
      expect(assessDivisionRosterScope('2', null).outcome).toBe('unknown');
      expect(assessDivisionRosterScope('2', undefined).outcome).toBe('unknown');
    });

    it('does not report a different course when either side has none', () => {
      const verdict = assessDivisionRosterScope('b2', [
        { key: 'b1', label: 'Batch A', sectionIds: [HOST_SECTION], courseId: null },
        { key: 'b2', label: 'Batch B', sectionIds: [HOST_SECTION], courseId: SERICULTURE }
      ]);

      expect(verdict.narrowsNothing).toBe(true);
      expect(verdict.siblingTeachesAnotherCourse).toBe(false);
    });
  });
});

/**
 * The two reported slots exactly as `timetables.timetable_data` holds them on
 * production, read 2026-09-17, mapped by the same expressions mark/page.tsx
 * uses. This guards the MAPPING as well as the verdict: transcribing the shape
 * by hand above proves the rule, but only the raw blob proves that
 * `student_ids` really arrives as null rather than [], that `assigned_courses`
 * is an array whose first element is the course, and that `sub_slot_order` is a
 * number the page has to stringify.
 */
const BUG_006034_BATCHES = [
  {
    batch_id: 'batch_1785391225600',
    batch_name: 'Batch A',
    assignment_type: 'section',
    section_ids: ['54f6f44a-026f-450e-a24c-d505f19fdead'],
    student_ids: null,
    assigned_courses: ['3453a1aa-5cb4-4e8b-8518-9b0ac1b589e6'],
    estimated_count: 47
  },
  {
    batch_id: 'batch_1785391251478',
    batch_name: 'Batch B',
    assignment_type: 'section',
    section_ids: ['54f6f44a-026f-450e-a24c-d505f19fdead'],
    student_ids: null,
    assigned_courses: ['32619a67-2260-4832-8cd7-b02400245d51'],
    estimated_count: 2
  },
  {
    batch_id: 'batch_1785391255108',
    batch_name: 'Batch C',
    assignment_type: 'section',
    section_ids: ['54f6f44a-026f-450e-a24c-d505f19fdead'],
    student_ids: null,
    assigned_courses: ['48c2a489-187c-4ec2-b1de-ea6a15a5a01b'],
    estimated_count: 3
  }
] as any[];

const BUG_006033_SLOT = {
  slot_id: '3b4b03f5-c28d-4aee-9148-7834cdd9c7e7',
  course_id: 'c937e0a1-8cca-415c-a0e6-8c1650181c95',
  is_combined: true,
  is_subdivided: false,
  period_mode: 'standard',
  section_ids: ['f2cf7de7-2020-4e3f-a455-3e54bcad7aa1'],
  sub_slots: [
    {
      course_id: 'c937e0a1-8cca-415c-a0e6-8c1650181c95',
      staff_ids: ['391dd531-8454-428f-9eff-2cad48c25d17'],
      section_ids: ['f2cf7de7-2020-4e3f-a455-3e54bcad7aa1'],
      sub_slot_order: 1
    },
    {
      course_id: '48c2a489-187c-4ec2-b1de-ea6a15a5a01b',
      staff_ids: ['54404153-7f84-4ad1-a41e-f8bd4684969a'],
      section_ids: ['f2cf7de7-2020-4e3f-a455-3e54bcad7aa1'],
      sub_slot_order: 2
    }
  ]
} as any;

/** Copied from mark/page.tsx's loadStudents. */
const mapBatches = (batches: any[]): RosterDivision[] =>
  batches.map((batch) => ({
    key: batch?.batch_id,
    label: batch?.batch_name || 'this batch',
    studentIds: batch?.student_ids || [],
    sectionIds: batch?.section_ids || [],
    courseId: (batch?.assigned_courses || [])[0] || null,
    expectedCount:
      typeof batch?.estimated_count === 'number' ? batch.estimated_count : null
  }));

/** Copied from mark/page.tsx's context effect. */
const mapSubSlots = (slot: any): RosterDivision[] =>
  slot.sub_slots.map((subSlot: any) => ({
    key: String(subSlot.sub_slot_order || 1),
    label: subSlot.group_name || `Group ${subSlot.sub_slot_order || 1}`,
    studentIds: subSlot.student_ids || [],
    sectionIds: subSlot.section_ids || [],
    courseId: subSlot.course_id || slot.course_id || null,
    expectedCount:
      typeof subSlot.max_capacity === 'number' ? subSlot.max_capacity : null
  }));

describe('the reported production slots, through the page mapping', () => {
  it('BUG-006034: picking Batch C narrows nothing (51 listed, 3 expected)', () => {
    const verdict = assessDivisionRosterScope(
      'batch_1785391255108',
      mapBatches(BUG_006034_BATCHES)
    );

    expect(verdict.narrowsNothing).toBe(true);
    expect(verdict.sharesScopeWith).toEqual(['Batch A', 'Batch B']);
    expect(verdict.siblingTeachesAnotherCourse).toBe(true);
    expect(verdict.expectedCount).toBe(3);
  });

  it('BUG-006034: every batch in that slot narrows nothing, not just Batch C', () => {
    for (const batch of BUG_006034_BATCHES) {
      expect(
        assessDivisionRosterScope(batch.batch_id, mapBatches(BUG_006034_BATCHES))
          .narrowsNothing
      ).toBe(true);
    }
  });

  it('BUG-006033: picking Group B narrows nothing (35 listed, 3 belong)', () => {
    const divisions = mapSubSlots(BUG_006033_SLOT);

    // The URL carried subdivisionGroupOrder=2; the page keys on that string.
    const verdict = assessDivisionRosterScope('2', divisions);

    expect(divisions.map((d) => d.label)).toEqual(['Group 1', 'Group 2']);
    expect(verdict.narrowsNothing).toBe(true);
    expect(verdict.sharesScopeWith).toEqual(['Group 1']);
    expect(verdict.siblingTeachesAnotherCourse).toBe(true);
    expect(verdict.expectedCount).toBeNull();
  });

  it('both slots go quiet once the coordinator names the three learners', () => {
    const namedBatches = mapBatches(
      BUG_006034_BATCHES.map((b) =>
        b.batch_id === 'batch_1785391255108'
          ? { ...b, student_ids: THE_THREE }
          : b
      )
    );
    expect(
      assessDivisionRosterScope('batch_1785391255108', namedBatches)
        .narrowsNothing
    ).toBe(false);

    const namedSubSlots = mapSubSlots({
      ...BUG_006033_SLOT,
      sub_slots: BUG_006033_SLOT.sub_slots.map((s: any) =>
        s.sub_slot_order === 2 ? { ...s, student_ids: THE_THREE } : s
      )
    });
    expect(assessDivisionRosterScope('2', namedSubSlots).narrowsNothing).toBe(
      false
    );
  });
});

describe('shouldWarnUnfilteredRoster — the shapes narrowsNothing misses (BUG-006034)', () => {
  const v = (
    outcome: RosterDivisionVerdict['outcome'],
    expectedCount: number | null,
    narrowsNothing = false,
  ) => ({ outcome, expectedCount, narrowsNothing });

  it('warns for the sibling-sharing case exactly as before', () => {
    expect(shouldWarnUnfilteredRoster(v('narrows_nothing', null, true), 51)).toBe(true);
    // ...even with no count to compare, which is what narrowsNothing is for.
    expect(shouldWarnUnfilteredRoster(v('narrows_nothing', null, true), null)).toBe(true);
  });

  it('warns for a sole division that names nobody and lists more than it expects', () => {
    // BUG-006034: Sericulture Batch C, estimated_count 3, 51 listed.
    expect(shouldWarnUnfilteredRoster(v('sole_division', 3), 51)).toBe(true);
  });

  it('warns for a uniquely-scoped division that names nobody and lists more than it expects', () => {
    expect(shouldWarnUnfilteredRoster(v('narrowed_by_section', 3), 51)).toBe(true);
  });

  it('stays quiet when the roster matches or undercuts the expected count', () => {
    expect(shouldWarnUnfilteredRoster(v('sole_division', 30), 30)).toBe(false);
    expect(shouldWarnUnfilteredRoster(v('sole_division', 30), 28)).toBe(false);
  });

  it('stays quiet when there is no count to compare — the 96 batches that narrow legitimately', () => {
    expect(shouldWarnUnfilteredRoster(v('sole_division', null), 51)).toBe(false);
    expect(shouldWarnUnfilteredRoster(v('narrowed_by_section', null), 51)).toBe(false);
    expect(shouldWarnUnfilteredRoster(v('sole_division', 0), 51)).toBe(false);
  });

  it('never warns when the division named its learners, or none was chosen', () => {
    expect(shouldWarnUnfilteredRoster(v('narrowed_by_learners', 3), 51)).toBe(false);
    expect(shouldWarnUnfilteredRoster(v('unknown', 3), 51)).toBe(false);
    expect(shouldWarnUnfilteredRoster(null, 51)).toBe(false);
  });

  it('is not fooled by a missing or non-numeric listed count', () => {
    expect(shouldWarnUnfilteredRoster(v('sole_division', 3), null)).toBe(false);
    expect(shouldWarnUnfilteredRoster(v('sole_division', 3), Number.NaN)).toBe(false);
  });
});

describe('attendanceStatusForSave — nobody pre-ticked must reach the payload (BUG-006034)', () => {
  it('keeps the old default on every ordinary period', () => {
    // 1,024 marked practical + 150 marked subdivided periods in 90 days rely on it.
    expect(attendanceStatusForSave(undefined, false)).toBe('Present');
    expect(attendanceStatusForSave('', false)).toBe('Present');
    expect(attendanceStatusForSave('Present', false)).toBe('Present');
    expect(attendanceStatusForSave('Absent', false)).toBe('Absent');
    expect(attendanceStatusForSave('OnDuty', false)).toBe('OnDuty');
  });

  it('drops an untouched learner on an unfiltered roster instead of saving them Present', () => {
    expect(attendanceStatusForSave(undefined, true)).toBeNull();
    expect(attendanceStatusForSave('', true)).toBeNull();
  });

  it('still saves everyone who was ticked on an unfiltered roster', () => {
    expect(attendanceStatusForSave('Present', true)).toBe('Present');
    expect(attendanceStatusForSave('Absent', true)).toBe('Absent');
    expect(attendanceStatusForSave('OnDuty', true)).toBe('OnDuty');
  });

  it('builds the payload for the reported elective: 3 ticked of 51 listed', () => {
    // BUG-006033: only Elavarasi, Preethi and Rubikasri took zoology as a
    // non-major; the other 48 must not be in the save at all.
    const roster = Array.from({ length: 51 }, (_, i) => ({ id: `s${i}` }));
    const marked = { s0: 'Present', s1: 'Present', s2: 'Absent' } as Record<string, string>;

    const rows = attendanceRowsForSave(roster, marked, true, (l, status) => ({
      student_id: l.id,
      status,
    }));
    expect(rows).toEqual([
      { student_id: 's0', status: 'Present' },
      { student_id: 's1', status: 'Present' },
      { student_id: 's2', status: 'Absent' },
    ]);

    // The same roster on an ordinary period still records all 51.
    expect(attendanceRowsForSave(roster, marked, false, (l, status) => ({
      student_id: l.id,
      status,
    }))).toHaveLength(51);
  });
});

describe('withUrlNarrowing — the warning must not go silent when the office fixes the data (BUG-006033)', () => {
  const stored: RosterDivision[] = [
    { key: '1', label: 'Group A', studentIds: ['a', 'b'], sectionIds: ['sec1'], courseId: 'c1', expectedCount: 3 },
    { key: '2', label: 'Group B', studentIds: ['x', 'y', 'z'], sectionIds: ['sec1'], courseId: 'c2', expectedCount: 3 },
  ];

  it('uses the URL learner list for the chosen group and leaves the others alone', () => {
    const out = withUrlNarrowing(stored, '2', 'x,y');
    expect(out.find((d) => d.key === '2')?.studentIds).toEqual(['x', 'y']);
    expect(out.find((d) => d.key === '1')?.studentIds).toEqual(['a', 'b']);
  });

  it('empties the chosen group when the URL names nobody, even though the stored slot does', () => {
    // The exact regression: coordinator fills in Group B, teacher reopens the
    // old bookmarked URL with no subdivisionStudentIds. The roster is NOT
    // filtered, so the verdict must not read "narrowed by learners".
    const out = withUrlNarrowing(stored, '2', null);
    expect(out.find((d) => d.key === '2')?.studentIds).toEqual([]);

    const verdict = assessDivisionRosterScope('2', out);
    expect(verdict.outcome).not.toBe('narrowed_by_learners');
    expect(shouldWarnUnfilteredRoster(verdict, 51)).toBe(true);
  });

  it('stays quiet when the URL really did narrow the group', () => {
    const out = withUrlNarrowing(stored, '2', 'x,y,z');
    const verdict = assessDivisionRosterScope('2', out);
    expect(verdict.outcome).toBe('narrowed_by_learners');
    expect(shouldWarnUnfilteredRoster(verdict, 3)).toBe(false);
  });

  it('ignores blank and whitespace-only ids in the URL list', () => {
    expect(withUrlNarrowing(stored, '2', ' , ,')?.find((d) => d.key === '2')?.studentIds).toEqual([]);
  });

  it('is a no-op when no group was chosen', () => {
    expect(withUrlNarrowing(stored, null, 'x')).toEqual(stored);
  });
});
