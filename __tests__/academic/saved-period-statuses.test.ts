/**
 * BUG-005969 / BUG-004995 / BUG-004356 / BUG-006120 (MBA, II MBA TIME TABLE):
 * reopening a marked period showed every learner Present (e.g. 21/21) although
 * the saved record held absences (15/21). The mark page copied the saved
 * statuses in, then the roster loader reset everyone to 'Present' - whichever
 * finished last won. It also merged the students of EVERY slot of the day.
 */
import { describe, it, expect } from 'vitest';
import { savedStatusesForPeriod } from '@/lib/utils/academic/saved-period-statuses';

const PTM = 'e91305b8-298f-4e15-bce6-101cbf6e706e';
const OTHER = '6abc759f-fd58-483e-b6f4-3c1e3cc6b512';

const record = {
  attendance_data: {
    [PTM]: {
      period_id: 'period-p8',
      students: [
        { student_id: 's1', status: 'Present' },
        { student_id: 's2', status: 'Absent' }
      ]
    },
    [OTHER]: {
      period_id: 'period-p5',
      students: [
        { student_id: 's1', status: 'Absent' },
        { student_id: 's3', status: 'Absent' }
      ]
    }
  }
};

describe('savedStatusesForPeriod', () => {
  it('returns the saved statuses of the opened slot only', () => {
    expect(savedStatusesForPeriod(record, PTM)).toEqual({ s1: 'Present', s2: 'Absent' });
  });

  it('finds the entry by its period_id when the key is not the slot id', () => {
    expect(savedStatusesForPeriod(record, 'period-p5')).toEqual({ s1: 'Absent', s3: 'Absent' });
  });

  it('falls back to every entry when no period is given', () => {
    expect(savedStatusesForPeriod(record, null)).toEqual({ s1: 'Absent', s2: 'Absent', s3: 'Absent' });
  });

  it('returns nothing for no record, no data, or an unknown period', () => {
    expect(savedStatusesForPeriod(null, PTM)).toEqual({});
    expect(savedStatusesForPeriod({ attendance_data: null }, PTM)).toEqual({});
    expect(savedStatusesForPeriod(record, 'nope')).toEqual({});
  });

  it('skips malformed student rows', () => {
    const r = { attendance_data: { [PTM]: { students: [{ student_id: 's1' }, { status: 'Absent' }, null] } } };
    expect(savedStatusesForPeriod(r, PTM)).toEqual({});
  });
});
