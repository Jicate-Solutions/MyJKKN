// Updated: 2026-09-07 - The day rollup for one learner's attendance history.
//
// These tests exist for one reason: the percentage a Senior Learner reads off
// the marking screen must never quietly count a day nobody marked as a day the
// learner was absent.

import { describe, it, expect } from 'vitest';
import {
  buildLearnerAttendanceHistory,
  normalizeAttendanceStatus,
  type LearnerAttendanceHistoryRow,
} from '@/lib/utils/academic/learner-attendance-history';

function row(
  date: string,
  periodKey: string,
  status: string | null,
  extra: Partial<LearnerAttendanceHistoryRow> = {}
): LearnerAttendanceHistoryRow {
  return {
    lah_attendance_date: date,
    lah_period_key: periodKey,
    lah_period_name: extra.lah_period_name ?? `Period ${periodKey}`,
    lah_start_time: extra.lah_start_time ?? '09:00',
    lah_end_time: extra.lah_end_time ?? '10:00',
    lah_course_name: extra.lah_course_name ?? 'Data Structures',
    lah_status: status,
    lah_marked_at: extra.lah_marked_at ?? null,
  };
}

describe('normalizeAttendanceStatus', () => {
  it('maps the saved capitalised strings onto the four states', () => {
    expect(normalizeAttendanceStatus('Present')).toBe('present');
    expect(normalizeAttendanceStatus('Absent')).toBe('absent');
    expect(normalizeAttendanceStatus('OnDuty')).toBe('on_duty');
    expect(normalizeAttendanceStatus('On Duty')).toBe('on_duty');
  });

  it('returns null for a missing status — never a status of its own', () => {
    expect(normalizeAttendanceStatus(null)).toBeNull();
    expect(normalizeAttendanceStatus(undefined)).toBeNull();
    expect(normalizeAttendanceStatus('   ')).toBeNull();
  });

  it('never turns an unrecognised status into absence', () => {
    expect(normalizeAttendanceStatus('Excused')).toBe('other');
    expect(normalizeAttendanceStatus('Excused')).not.toBe('absent');
  });
});

describe('buildLearnerAttendanceHistory — day rollup', () => {
  it('rolls a day with a present period AND an absent period up to Present, keeping both periods', () => {
    const { days, summary } = buildLearnerAttendanceHistory([
      row('2026-09-01', 'p1', 'Absent'),
      row('2026-09-01', 'p2', 'Present'),
    ]);

    expect(days).toHaveLength(1);
    expect(days[0].state).toBe('present');
    // Detail survives the rollup — the dialog can still show which period was missed.
    expect(days[0].periods.map((p) => p.status)).toEqual(['absent', 'present']);
    expect(days[0].markedPeriodCount).toBe(2);
    expect(summary.presentDays).toBe(1);
    expect(summary.absentDays).toBe(0);
  });

  it('distinguishes "unmarked for this learner" from an absence', () => {
    const { days, summary } = buildLearnerAttendanceHistory([
      // The register exists for the section, but this learner is not in it.
      row('2026-09-02', 'p1', null),
      row('2026-09-02', 'p2', null),
    ]);

    expect(days[0].state).toBe('unmarked');
    expect(days[0].state).not.toBe('absent');
    expect(days[0].markedPeriodCount).toBe(0);
    expect(days[0].unmarkedPeriodCount).toBe(2);
    expect(summary.unmarkedDays).toBe(1);
    expect(summary.absentDays).toBe(0);
    expect(summary.markedDays).toBe(0);
  });

  it('counts a day as marked when only some of its periods carry a status', () => {
    const { days, summary } = buildLearnerAttendanceHistory([
      row('2026-09-03', 'p1', 'Absent'),
      row('2026-09-03', 'p2', null),
    ]);

    expect(days[0].state).toBe('absent');
    expect(days[0].markedPeriodCount).toBe(1);
    expect(days[0].unmarkedPeriodCount).toBe(1);
    expect(summary.absentDays).toBe(1);
    expect(summary.unmarkedDays).toBe(0);
  });

  it('reports an on-duty day as on duty, not as present and not as absent', () => {
    const { days, summary } = buildLearnerAttendanceHistory([
      row('2026-09-04', 'p1', 'OnDuty'),
      row('2026-09-04', 'p2', 'Absent'),
    ]);

    expect(days[0].state).toBe('on_duty');
    expect(summary.onDutyDays).toBe(1);
    expect(summary.presentDays).toBe(0);
    expect(summary.absentDays).toBe(0);
  });
});

describe('buildLearnerAttendanceHistory — the percentage', () => {
  it('divides by marked days only; unmarked days are excluded from both sides', () => {
    const { summary } = buildLearnerAttendanceHistory([
      row('2026-09-01', 'p1', 'Present'),
      row('2026-09-02', 'p1', 'Present'),
      row('2026-09-03', 'p1', 'Absent'),
      // Two days the section was marked but this learner never was.
      row('2026-09-04', 'p1', null),
      row('2026-09-05', 'p1', null),
    ]);

    expect(summary.daysWithRegister).toBe(5);
    expect(summary.markedDays).toBe(3);
    expect(summary.unmarkedDays).toBe(2);
    expect(summary.presentDays).toBe(2);
    // 2/3, NOT 2/5 (40%) — folding the unmarked days in would understate by 26.7 points.
    expect(summary.presentPercent).toBe(66.7);
  });

  it('returns null rather than 0% when nothing has been marked', () => {
    const { summary } = buildLearnerAttendanceHistory([
      row('2026-09-04', 'p1', null),
    ]);

    expect(summary.markedDays).toBe(0);
    expect(summary.presentPercent).toBeNull();
    expect(summary.presentPercent).not.toBe(0);
  });

  it('handles an empty or missing result without inventing a rate', () => {
    for (const input of [[], null, undefined]) {
      const { days, summary } = buildLearnerAttendanceHistory(input);
      expect(days).toEqual([]);
      expect(summary.daysWithRegister).toBe(0);
      expect(summary.presentPercent).toBeNull();
    }
  });

  it('keeps an unrecognised status out of the present count and out of absence', () => {
    const { summary } = buildLearnerAttendanceHistory([
      row('2026-09-01', 'p1', 'Present'),
      row('2026-09-02', 'p1', 'Excused'),
    ]);

    expect(summary.otherDays).toBe(1);
    expect(summary.absentDays).toBe(0);
    expect(summary.markedDays).toBe(2);
    expect(summary.presentPercent).toBe(50);
  });
});

describe('buildLearnerAttendanceHistory — ordering', () => {
  it('returns days newest first regardless of the order the rows arrive in', () => {
    const { days } = buildLearnerAttendanceHistory([
      row('2026-09-01', 'p1', 'Present'),
      row('2026-09-05', 'p1', 'Absent'),
      row('2026-09-03', 'p1', 'Present'),
    ]);

    expect(days.map((d) => d.date)).toEqual([
      '2026-09-05',
      '2026-09-03',
      '2026-09-01',
    ]);
  });
});
