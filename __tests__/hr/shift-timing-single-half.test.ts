/**
 * A working day may have ONE half (2026-09-04).
 *
 * The case that motivated it: a 09:00–14:00 Saturday with no afternoon. Before
 * this the validator, the CHECK constraints and the evaluator all demanded
 * both halves, so the only way to model a morning-only day was to invent an
 * afternoon — which then judged every Saturday punch-out as an early leave.
 *
 * Run: npx vitest run __tests__/hr/shift-timing-single-half.test.ts
 */

import { describe, expect, it } from 'vitest';

import { evaluateDay } from '@/lib/hr/biometric/evaluate-day';
import {
  firstSessionStart,
  validateTimingRow,
  type ResolvedShiftTiming,
} from '@/types/hr-shift-timings';

function row(o: Partial<Parameters<typeof validateTimingRow>[0]> = {}) {
  return { is_working_day: true, day_of_week: 6 as const, grace_minutes: 5, ...o };
}

function timing(o: Partial<ResolvedShiftTiming> = {}): ResolvedShiftTiming {
  return {
    timing_id: 't1',
    institution_id: 'i1',
    staff_scope: 'teaching',
    employment_category_id: null,
    applicable_gender: 'all',
    day_of_week: 6,
    is_working_day: true,
    first_half_start: '09:00:00',
    first_half_end: '13:00:00',
    second_half_start: '12:30:00',
    second_half_end: '16:30:00',
    grace_minutes: 5,
    grace_deadline: '09:05',
    matched_by: 'teaching',
    ...o,
  };
}

describe('validateTimingRow — one half is enough, half a half is not', () => {
  it('accepts a first-half-only day', () => {
    expect(validateTimingRow(row({ first_half_start: '09:00', first_half_end: '14:00' }))).toBeNull();
  });

  it('accepts a second-half-only day', () => {
    expect(validateTimingRow(row({ second_half_start: '14:00', second_half_end: '18:00' }))).toBeNull();
  });

  it('still accepts both halves, overlap included', () => {
    expect(
      validateTimingRow(row({
        first_half_start: '09:00', first_half_end: '13:00',
        second_half_start: '12:30', second_half_end: '16:30',
      })),
    ).toBeNull();
  });

  it('rejects a working day with no half at all', () => {
    expect(validateTimingRow(row())).toMatch(/at least one half/);
  });

  it('rejects a half with only one of its two times', () => {
    expect(validateTimingRow(row({ first_half_start: '09:00' }))).toMatch(/First half needs both/);
    expect(
      validateTimingRow(row({ first_half_start: '09:00', first_half_end: '13:00', second_half_end: '16:30' })),
    ).toMatch(/Second half needs both/);
  });

  it('keeps the ordering rules within a half and between two halves', () => {
    expect(validateTimingRow(row({ first_half_start: '14:00', first_half_end: '09:00' }))).toMatch(/end after/);
    expect(
      validateTimingRow(row({
        first_half_start: '09:00', first_half_end: '13:00',
        second_half_start: '08:00', second_half_end: '16:30',
      })),
    ).toMatch(/cannot start before/);
  });

  it('names the first session of the day', () => {
    expect(firstSessionStart({ first_half_start: '09:00', second_half_start: '12:30' })).toBe('09:00');
    expect(firstSessionStart({ first_half_start: null, second_half_start: '14:00' })).toBe('14:00');
    expect(firstSessionStart({})).toBeNull();
  });
});

describe('evaluateDay — a single-session day is PRESENT or ABSENT, never HALF_DAY', () => {
  const morningOnly = timing({
    first_half_start: '09:00:00', first_half_end: '14:00:00',
    second_half_start: null, second_half_end: null,
  });
  const afternoonOnly = timing({
    first_half_start: null, first_half_end: null,
    second_half_start: '14:00:00', second_half_end: '18:00:00',
  });

  it('is a full PRESENT day when the only half is worked', () => {
    const r = evaluateDay({ inTime: '09:03', outTime: '14:10', timing: morningOnly });
    expect(r.verdict).toBe('PRESENT');
    expect(r.dayCalc).toBe('FULL');
    expect(r.firstHalfAttended).toBe(true);
    // The half the day does not have is "no such half", not "missed it".
    expect(r.secondHalfAttended).toBeNull();
    expect(r.lateMinutes).toBe(0);
  });

  it('is ABSENT, not HALF_DAY, when the only half is missed', () => {
    const r = evaluateDay({ inTime: '09:30', outTime: '14:10', timing: morningOnly });
    expect(r.verdict).toBe('ABSENT');
    expect(r.firstHalfAttended).toBe(false);
    expect(r.secondHalfAttended).toBeNull();
    expect(r.lateMinutes).toBe(25);
  });

  it('gates a lone afternoon on grace, exactly like a morning', () => {
    expect(evaluateDay({ inTime: '14:05', outTime: '18:00', timing: afternoonOnly }).verdict).toBe('PRESENT');
    const late = evaluateDay({ inTime: '14:06', outTime: '18:00', timing: afternoonOnly });
    expect(late.verdict).toBe('ABSENT');
    expect(late.lateMinutes).toBe(1);
    expect(late.firstHalfAttended).toBeNull();
    expect(late.secondHalfAttended).toBe(false);
  });

  it('lets an approved permission reinstate the only half', () => {
    const r = evaluateDay({
      inTime: '09:24', outTime: '14:00', timing: morningOnly,
      permissions: [{ id: 'p1', from: '09:05', to: '09:35' }],
    });
    expect(r.verdict).toBe('PRESENT');
    expect(r.excusedMinutes).toBe(19);
    expect(r.excusedBy).toEqual(['p1']);
  });

  it('still calls a half-filled half an exception, not an absence', () => {
    const broken = timing({ second_half_start: null });
    const r = evaluateDay({ inTime: '09:00', outTime: '16:30', timing: broken });
    expect(r.verdict).toBe('EXCEPTION');
    expect(r.exceptionReason).toMatch(/incomplete windows/);
  });

  it('leaves two-half days exactly as they were', () => {
    const both = timing();
    expect(evaluateDay({ inTime: '09:05', outTime: '16:30', timing: both }).verdict).toBe('PRESENT');
    expect(evaluateDay({ inTime: '09:06', outTime: '16:30', timing: both }).verdict).toBe('HALF_DAY');
    expect(evaluateDay({ inTime: '12:31', outTime: '16:30', timing: both }).verdict).toBe('HALF_DAY');
    expect(evaluateDay({ inTime: '11:00', outTime: '14:00', timing: both }).verdict).toBe('ABSENT');
  });
});
