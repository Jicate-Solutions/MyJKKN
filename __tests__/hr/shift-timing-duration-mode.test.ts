/**
 * A day can owe MINUTES instead of a window (2026-09-08).
 *
 * The case that motivated it: Dr. Premalatha (DCH007, Dental) works Wednesday
 * only, any one hour. Before this, the only way to express her day was the
 * institution's Dental teaching Wednesday (09:00-13:00 + 11:30-15:30), which
 * judged an hour of genuine work as an absence and cost her a quarter of the
 * month's pay — a work pattern could remove her other days but never restate
 * the hours of the one she keeps.
 *
 * The mode reaches evaluateDay overlaid onto the resolved timing row by
 * fn_shift_timing_pick, from hr_work_pattern_week_days. Nothing about that
 * plumbing is exercised here; this file pins the ARITHMETIC.
 *
 * Run: npx vitest run __tests__/hr/shift-timing-duration-mode.test.ts
 */

import { describe, expect, it } from 'vitest';

import { evaluateDay } from '@/lib/hr/biometric/evaluate-day';
import type { ResolvedShiftTiming } from '@/types/hr-shift-timings';

/** A duration day carries NO windows — that is the point of the mode. */
function durationDay(requiredMinutes: number | null = 60): ResolvedShiftTiming {
  return {
    timing_id: 't-duration',
    institution_id: 'i1',
    staff_scope: 'teaching',
    employment_category_id: null,
    applicable_gender: 'all',
    day_of_week: 3,
    is_working_day: true,
    first_half_start: null,
    first_half_end: null,
    second_half_start: null,
    second_half_end: null,
    grace_minutes: 5,
    grace_deadline: null,
    matched_by: 'teaching',
    attendance_mode: 'duration',
    required_minutes: requiredMinutes,
  };
}

describe('evaluateDay — duration mode owes minutes, not a window', () => {
  it('counts an hour worked in the morning', () => {
    const r = evaluateDay({ inTime: '10:12', outTime: '11:20', timing: durationDay(60) });
    expect(r.verdict).toBe('PRESENT');
    expect(r.dayCalc).toBe('FULL');
  });

  it('counts the same hour worked in the afternoon — the clock is irrelevant', () => {
    const r = evaluateDay({ inTime: '15:40', outTime: '16:55', timing: durationDay(60) });
    expect(r.verdict).toBe('PRESENT');
  });

  it('refuses a short visit, and says how short', () => {
    const r = evaluateDay({ inTime: '15:40', outTime: '16:35', timing: durationDay(60) });
    expect(r.verdict).toBe('ABSENT');
    expect(r.dayCalc).toBe('NONE');
    expect(r.exceptionReason).toBe('Worked 55 min of the 60 min required on this day.');
  });

  it('treats exactly the required minutes as met', () => {
    const r = evaluateDay({ inTime: '09:00', outTime: '10:00', timing: durationDay(60) });
    expect(r.verdict).toBe('PRESENT');
  });

  it('is BINARY — a long-but-short day is absent, never half', () => {
    const r = evaluateDay({ inTime: '09:00', outTime: '12:00', timing: durationDay(240) });
    expect(r.verdict).toBe('ABSENT');
    expect(r.verdict).not.toBe('HALF_DAY');
  });

  it('reports lateMinutes as 0, not null — the day WAS judged', () => {
    // null would read as "could not evaluate". Lateness is simply not part of
    // the rule when the start time is not part of the rule.
    const r = evaluateDay({ inTime: '16:00', outTime: '17:30', timing: durationDay(60) });
    expect(r.lateMinutes).toBe(0);
  });

  it('reports the lone session in the single-session shape', () => {
    const r = evaluateDay({ inTime: '09:00', outTime: '10:30', timing: durationDay(60) });
    expect(r.firstHalfAttended).toBe(true);
    expect(r.secondHalfAttended).toBeNull();
  });

  it('still honours a non-working day over any punch', () => {
    const r = evaluateDay({
      inTime: '09:00', outTime: '18:00',
      timing: { ...durationDay(60), is_working_day: false },
    });
    expect(r.verdict).toBe('WEEKLY_OFF');
  });

  it('is absent with no punch at all', () => {
    const r = evaluateDay({ inTime: null, outTime: null, timing: durationDay(60) });
    expect(r.verdict).toBe('ABSENT');
  });

  it('is absent on a single punch — a lone IN proves no span', () => {
    const r = evaluateDay({ inTime: '10:00', outTime: null, timing: durationDay(60) });
    expect(r.verdict).toBe('ABSENT');
    expect(r.exceptionReason).toContain('Missing OUT');
  });

  it('raises an exception on a reversed pair rather than a negative span', () => {
    const r = evaluateDay({ inTime: '16:00', outTime: '09:00', timing: durationDay(60) });
    expect(r.verdict).toBe('EXCEPTION');
  });

  it('raises an exception when the mode is set but the minutes are not', () => {
    // A half-configured day must not silently pass everybody: 0 required
    // minutes would make every punch pair present.
    const r = evaluateDay({ inTime: '10:00', outTime: '10:01', timing: durationDay(null) });
    expect(r.verdict).toBe('EXCEPTION');
    expect(r.exceptionReason).toContain('no required minutes');
  });

  it('does NOT let short time off reinstate an unworked hour', () => {
    // A permission reinstates the missing minutes of a required WINDOW. A
    // duration day has no window to be missing from, so an hour not worked is
    // an hour not worked.
    const r = evaluateDay({
      inTime: '10:00', outTime: '10:20',
      timing: durationDay(60),
      permissions: [{ id: 'p1', from: '10:20', to: '11:00' }],
    });
    expect(r.verdict).toBe('ABSENT');
    expect(r.excusedBy).toEqual([]);
  });
});
