/**
 * Holidays reaching attendance — the substitution rule and the RPC wrappers.
 *
 * THE DATE ARITHMETIC IS NOT TESTED HERE, DELIBERATELY. Which dates a calendar
 * entry covers is decided by `fn_hr_calendar_holiday_dates` in Postgres, so that
 * a trigger, a backfill, the biometric import and the recompute all answer the
 * question identically. Re-implementing the UTC expansion in a test would prove
 * only that the test agrees with itself. What IS tested here is everything the
 * TypeScript side owns: the ABSENT-only substitution, the batching, and the
 * refusal to treat a failed lookup as "no holidays".
 *
 * Run: npx vitest run __tests__/hr/attendance-holiday-dates.test.ts
 */

import { describe, expect, it, vi } from 'vitest';

import {
  applyHolidayToStatusCode,
  fetchHolidayKeys,
  holidayKey,
  isCalendarHoliday,
} from '@/lib/hr/attendance/holiday-dates';

/** Minimal Supabase stand-in: only `.rpc()` is ever called. */
function client(impl: (fn: string, args: Record<string, unknown>) => unknown) {
  return {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => impl(fn, args)),
  } as never;
}

const INST_A = 'a0000000-0000-0000-0000-00000000000a';
const INST_B = 'b0000000-0000-0000-0000-00000000000b';

describe('applyHolidayToStatusCode — only a no-show becomes a holiday', () => {
  it('turns ABSENT into HOLIDAY on a declared day', () => {
    expect(applyHolidayToStatusCode('ABSENT', true)).toBe('HOLIDAY');
  });

  /**
   * THE RULE THAT PROTECTS A PUNCH. Someone who came in on a holiday has a
   * device record saying so; overwriting it to HOLIDAY would erase the evidence
   * and leave them no basis to claim the day back.
   */
  it.each([
    ['PRESENT', 'PRESENT'],
    ['HALF_DAY', 'HALF_DAY'],
    ['WEEKLY_OFF', 'WEEKLY_OFF'],
    ['LEAVE', 'LEAVE'],
    ['REGULARIZED', 'REGULARIZED'],
  ])('leaves %s untouched on a declared holiday', (code, expected) => {
    expect(applyHolidayToStatusCode(code, true)).toBe(expected);
  });

  it('changes nothing at all when the day is not a holiday', () => {
    for (const code of ['ABSENT', 'PRESENT', 'HALF_DAY', 'WEEKLY_OFF']) {
      expect(applyHolidayToStatusCode(code, false)).toBe(code);
    }
  });
});

describe('fetchHolidayKeys', () => {
  it('keys each holiday by institution and date', async () => {
    const svc = client(() => ({
      data: [{ holiday_date: '2026-08-15' }, { holiday_date: '2026-08-26' }],
      error: null,
    }));

    const keys = await fetchHolidayKeys(svc, [INST_A], '2026-08-01', '2026-08-31');

    expect(keys.has(holidayKey(INST_A, '2026-08-15'))).toBe(true);
    expect(keys.has(holidayKey(INST_A, '2026-08-26'))).toBe(true);
    // A holiday for one institution is not a holiday for another.
    expect(keys.has(holidayKey(INST_B, '2026-08-15'))).toBe(false);
  });

  it('asks once per institution, not once per row', async () => {
    const svc = client(() => ({ data: [{ holiday_date: '2026-08-15' }], error: null }));

    await fetchHolidayKeys(svc, [INST_A, INST_B, INST_A, INST_B], '2026-08-01', '2026-08-31');

    // Four ids in, two distinct institutions, two calls.
    expect((svc as unknown as { rpc: { mock: { calls: unknown[] } } }).rpc.mock.calls).toHaveLength(2);
  });

  it('trims a timestamp to a date, so the key matches work_date', async () => {
    const svc = client(() => ({
      data: [{ holiday_date: '2026-08-15T00:00:00.000Z' }],
      error: null,
    }));

    const keys = await fetchHolidayKeys(svc, [INST_A], '2026-08-01', '2026-08-31');
    expect(keys.has(holidayKey(INST_A, '2026-08-15'))).toBe(true);
  });

  it('returns an empty set without calling out when there is nothing to ask', async () => {
    const svc = client(() => ({ data: [], error: null }));

    expect((await fetchHolidayKeys(svc, [], '2026-08-01', '2026-08-31')).size).toBe(0);
    expect((await fetchHolidayKeys(svc, [INST_A], '', '')).size).toBe(0);
    expect((svc as unknown as { rpc: { mock: { calls: unknown[] } } }).rpc.mock.calls).toHaveLength(0);
  });

  /**
   * THE FAILURE THAT MUST NOT BE SILENT. An empty Set means "no holidays", and
   * an import that believes that stamps a whole institution ABSENT for a
   * festival — which the Salary Register then pays as lost days. A failed
   * lookup has to stop the import, not quietly become good news.
   */
  it('throws rather than reporting no holidays when the lookup fails', async () => {
    const svc = client(() => ({ data: null, error: { message: 'permission denied' } }));

    await expect(
      fetchHolidayKeys(svc, [INST_A], '2026-08-01', '2026-08-31'),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('isCalendarHoliday', () => {
  it('passes the institution and date straight through', async () => {
    const svc = client((fn, args) => {
      expect(fn).toBe('fn_hr_is_calendar_holiday');
      expect(args).toEqual({ p_institution_id: INST_A, p_date: '2026-08-15' });
      return { data: true, error: null };
    });

    expect(await isCalendarHoliday(svc, INST_A, '2026-08-15')).toBe(true);
  });

  it('is false for a day with no holiday', async () => {
    const svc = client(() => ({ data: false, error: null }));
    expect(await isCalendarHoliday(svc, INST_A, '2026-08-20')).toBe(false);
  });

  it('short-circuits when the record carries no institution', async () => {
    const svc = client(() => ({ data: true, error: null }));
    expect(await isCalendarHoliday(svc, null, '2026-08-15')).toBe(false);
    expect((svc as unknown as { rpc: { mock: { calls: unknown[] } } }).rpc.mock.calls).toHaveLength(0);
  });

  it('throws rather than answering false when the lookup fails', async () => {
    const svc = client(() => ({ data: null, error: { message: 'boom' } }));
    await expect(isCalendarHoliday(svc, INST_A, '2026-08-15')).rejects.toThrow(/boom/);
  });
});
