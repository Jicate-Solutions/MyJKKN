import { describe, expect, it } from 'vitest';
import { attendedOf, computeMarkAccess, summarizeAttendance } from '@/lib/services/cdc/drive-day';

const FINAL = '2026-09-19T10:00:00.000Z';

describe('computeMarkAccess', () => {
  it('refuses anyone who is neither a manager nor an assigned coordinator', () => {
    const r = computeMarkAccess({ status: 'attendance_day', participants_finalized_at: FINAL }, { canManage: false, isCoordinator: false });
    expect(r.canMark).toBe(false);
    expect(r.reason).toMatch(/not assigned/i);
  });

  it('refuses everyone until participants are finalized', () => {
    for (const who of [{ canManage: true, isCoordinator: false }, { canManage: false, isCoordinator: true }]) {
      const r = computeMarkAccess({ status: 'willingness_open', participants_finalized_at: null }, who);
      expect(r.canMark).toBe(false);
      expect(r.reason).toMatch(/finalized/i);
    }
  });

  it('lets coordinators mark while finalized / in progress, but not after results', () => {
    const who = { canManage: false, isCoordinator: true };
    expect(computeMarkAccess({ status: 'eligibility_locked', participants_finalized_at: FINAL }, who).canMark).toBe(true);
    expect(computeMarkAccess({ status: 'attendance_day', participants_finalized_at: FINAL }, who).canMark).toBe(true);
    const after = computeMarkAccess({ status: 'results_announced', participants_finalized_at: FINAL }, who);
    expect(after.canMark).toBe(false);
    expect(after.reason).toMatch(/CDC office/i);
  });

  it('lets managers correct attendance after results, but not once closed or cancelled', () => {
    const who = { canManage: true, isCoordinator: false };
    expect(computeMarkAccess({ status: 'results_announced', participants_finalized_at: FINAL }, who).canMark).toBe(true);
    expect(computeMarkAccess({ status: 'closed', participants_finalized_at: FINAL }, who).canMark).toBe(false);
    expect(computeMarkAccess({ status: 'cancelled', participants_finalized_at: FINAL }, who).canMark).toBe(false);
  });
});

describe('attendance helpers', () => {
  it('present and late count as attended; the rest do not', () => {
    expect(attendedOf('present')).toBe(true);
    expect(attendedOf('late')).toBe(true);
    expect(attendedOf('absent')).toBe(false);
    expect(attendedOf('excused')).toBe(false);
    expect(attendedOf('not_attended')).toBe(false);
  });

  it('summarizes every status and counts unmarked participants', () => {
    const s = summarizeAttendance([
      { attendance_status: 'present' },
      { attendance_status: 'present' },
      { attendance_status: 'late' },
      { attendance_status: 'absent' },
      { attendance_status: 'excused' },
      { attendance_status: null },
    ]);
    expect(s).toEqual({ total: 6, present: 2, absent: 1, late: 1, excused: 1, not_attended: 0, unmarked: 1 });
  });
});
