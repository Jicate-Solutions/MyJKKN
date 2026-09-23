/**
 * BUG-006196 (2026-09-23, DR.S.UMAMAHESWARI, faculty): "Bharanidharan is not
 * assigned for GENERIC ELECTIVE CLASS". Her 2 July Zoology practical (P4,
 * Batch B) was saved with 11 learners — the 10 now in Batch B plus BHARANIDHARAN
 * S, who was moved out of Batch B when the timetable was edited on 2026-09-22.
 * Eight re-saves that morning could not drop him: mergeAttendancePeriod unioned
 * every save into the stored students, so a learner once saved stuck forever.
 *
 * The union exists so a SECOND batch sharing the slot does not wipe the first
 * batch's students. The fix keeps exactly those — existing students who belong
 * to another batch of the slot — and lets the saving batch replace the rest.
 */
import { describe, it, expect } from 'vitest';
import {
  mergeAttendancePeriod,
  otherBatchStudentIds,
} from '@/lib/utils/academic/merge-attendance-period';

const stu = (id: string, status = 'Present') => ({ student_id: id, status });
const ids = (p: any) => p.students.map((s: any) => s.student_id).sort();

const SLOT = 'c3a0a366-58f7-44df-ae61-e1c5466048cd';
const timetableData = {
  'cycle-1': {
    '25cc384f': {
      slot_id: SLOT,
      period_mode: 'practical',
      practical_config: {
        batches: [
          { batch_id: 'A', batch_name: 'Batch A', student_ids: ['a1', 'a2'] },
          { batch_id: 'B', batch_name: 'Batch B', student_ids: ['b1', 'kavin'] },
        ],
      },
    },
    other: { slot_id: 'unrelated', practical_config: { batches: [{ batch_id: 'X', student_ids: ['x1'] }] } },
  },
};

describe('otherBatchStudentIds', () => {
  it('collects learners of every OTHER batch of the slot', () => {
    expect([...otherBatchStudentIds(timetableData, SLOT, 'B')!].sort()).toEqual(['a1', 'a2']);
  });

  it('matches a subdivided period key by its base slot id', () => {
    expect([...otherBatchStudentIds(timetableData, `${SLOT}_group_1`, 'A')!]).toEqual(['b1', 'kavin']);
  });

  it('returns null when the slot or its batches cannot be found', () => {
    expect(otherBatchStudentIds(timetableData, 'missing', 'B')).toBeNull();
    expect(otherBatchStudentIds(null, SLOT, 'B')).toBeNull();
    expect(otherBatchStudentIds({ c: { p: { slot_id: SLOT } } }, SLOT, 'B')).toBeNull();
  });
});

describe('mergeAttendancePeriod', () => {
  const incomingB = {
    period_mode: 'practical',
    batch_selected: { batch_id: 'B', batch_name: 'Batch B' },
    students: [stu('b1'), stu('kavin')],
  } as any;

  it('drops a learner removed from the saving batch (the BUG-006196 ghost)', () => {
    const existing = {
      period_mode: 'practical',
      batch_selected: { batch_id: 'B' },
      students: [stu('b1'), stu('bharani')],
    } as any;
    const merged = mergeAttendancePeriod(existing, incomingB, new Set(['a1', 'a2']));
    expect(ids(merged)).toEqual(['b1', 'kavin']);
  });

  it("keeps another batch's learners when a second batch saves", () => {
    const existing = {
      period_mode: 'practical',
      batch_selected: { batch_id: 'A' },
      students: [stu('a1'), stu('a2', 'Absent')],
    } as any;
    const merged = mergeAttendancePeriod(existing, incomingB, new Set(['a1', 'a2']));
    expect(ids(merged)).toEqual(['a1', 'a2', 'b1', 'kavin']);
    expect(merged.students.find((s: any) => s.student_id === 'a2').status).toBe('Absent');
    expect(merged.batch_selected.batch_id).toBe('B');
  });

  it('lets the incoming status win for a learner in both lists', () => {
    const existing = { students: [stu('b1', 'Present')] } as any;
    const merged = mergeAttendancePeriod(
      existing,
      { ...incomingB, students: [stu('b1', 'Absent')] },
      new Set()
    );
    expect(merged.students).toEqual([stu('b1', 'Absent')]);
  });

  it('falls back to the old union when batch membership is unknown', () => {
    const existing = { students: [stu('b1'), stu('bharani')] } as any;
    expect(ids(mergeAttendancePeriod(existing, incomingB, null))).toEqual(['b1', 'bharani', 'kavin']);
  });

  it('returns incoming when nothing is stored yet', () => {
    expect(mergeAttendancePeriod(undefined, incomingB, null)).toBe(incomingB);
  });
});
