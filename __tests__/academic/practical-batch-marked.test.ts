/**
 * BUG-006204 (2026-09-23, DR.S.UMAMAHESWARI, faculty): "Generic Elective
 * attendance marked but again and again not shown as completed" — the second
 * report of BUG-006198, reviewed on PR #3970.
 *
 * Every practical batch of a slot saves under ONE attendance_data[slot_id]
 * key. The marked checks asked only "does that key hold any learners?", so
 * once Batch B marked, Batch A counted as marked too: its faculty got a
 * read-only mark page and (after #3970) a "marked" card in My Classes. In
 * prod (timetable e9d019bd, I B.SC CHEMISTRY) every practical record since
 * July holds exactly one batch.
 *
 * A batch is marked only when the stored learners include one of ITS learners.
 */
import { describe, it, expect } from 'vitest';
import {
  practicalStudentIdsForStaff,
  periodMarkedForLearners,
} from '@/lib/utils/practical-period-sections';

const SEC = '442bdd4d-1af3-40dd-9750-bf3f7f3dce3b';
const UMA = 'b034275b-c128-4ddf-a6b8-4c0b9213435a';
const RADHA = 'dcb7d625-8f8b-43e9-b13b-0789e91ddbeb';

// Shape of prod slot d5beef9e (timetable e9d019bd, Period 2).
const batches = [
  {
    batch_name: 'Batch A',
    section_ids: [SEC],
    student_ids: ['a1', 'a2'],
    staff_mapping: { 'd22bdafd-8a09-4e0b-ae4c-b695b352b253': [RADHA] },
  },
  {
    batch_name: 'Batch B',
    section_ids: [SEC],
    student_ids: ['b1', 'b2'],
    staff_mapping: { '30ac2f74-4e2b-4d70-9b04-e8bbbd230d17': [UMA] },
  },
];

const PRESENT = 'Present';
// The stored attendance_data shape: { students: [{ student_id, status }] }.
const saved = (ids: string[]) => ({ students: ids.map((student_id) => ({ student_id, status: PRESENT })) });

describe('practicalStudentIdsForStaff', () => {
  it("returns the learners of the team member's own batches", () => {
    expect(practicalStudentIdsForStaff(batches, UMA)).toEqual(['b1', 'b2']);
    expect(practicalStudentIdsForStaff(batches, RADHA)).toEqual(['a1', 'a2']);
  });

  it('returns null when one of the team member batches names no learners (section-assigned)', () => {
    const sectionBatch = [{ ...batches[1], student_ids: [] }];
    expect(practicalStudentIdsForStaff(sectionBatch, UMA)).toBeNull();
  });

  it('returns null when the team member teaches no batch or input is malformed', () => {
    expect(practicalStudentIdsForStaff(batches, 'nobody')).toBeNull();
    expect(practicalStudentIdsForStaff(null, UMA)).toBeNull();
  });
});

describe('periodMarkedForLearners', () => {
  it("does not count another batch's save as this batch's (the BUG-006204 lockout)", () => {
    expect(periodMarkedForLearners(saved(['b1', 'b2']), ['a1', 'a2'])).toBe(false);
  });

  it("counts the batch as marked once any of its learners is stored", () => {
    expect(periodMarkedForLearners(saved(['b1', 'b2']), ['b1', 'b2'])).toBe(true);
    expect(periodMarkedForLearners(saved(['b1', 'a2']), ['a1', 'a2'])).toBe(true);
  });

  it('falls back to "any learners stored" when the batch is unknown', () => {
    expect(periodMarkedForLearners(saved(['b1']), null)).toBe(true);
    expect(periodMarkedForLearners(saved(['b1']), [])).toBe(true);
    expect(periodMarkedForLearners(saved([]), null)).toBe(false);
    expect(periodMarkedForLearners(undefined, ['a1'])).toBe(false);
  });

  it('reads subdivided group rosters too', () => {
    const grouped = { groups: [saved(['a1'])] };
    expect(periodMarkedForLearners(grouped, ['a1'])).toBe(true);
    expect(periodMarkedForLearners(grouped, ['b1'])).toBe(false);
    expect(periodMarkedForLearners(grouped, null)).toBe(true);
  });
});
