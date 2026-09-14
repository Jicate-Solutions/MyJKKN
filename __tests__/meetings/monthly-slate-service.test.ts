// __tests__/meetings/monthly-slate-service.test.ts
//
// The IMPURE half of the monthly slate (piece 4a) has three parts worth pinning
// with tests, and they are exactly the three the engine cannot check for itself:
//
//   1. MONTH ARITHMETIC — a wrong range silently proposes a short month.
//   2. PER-DURATION GROUPING — the engine matches availability on
//      (profileId, durationMin). Getting that wrong books a 120-minute meeting
//      into a 60-minute gap, and nothing downstream would notice.
//   3. FAIL CLOSED — a person whose availability could not be read must come
//      back FULLY BUSY. The failure mode this guards against is the dangerous
//      one: treating "we don't know" as "they're free" books a real person into
//      a real meeting on no evidence at all.
//
// House style, as in monthly-slate-engine.test.ts: IST = UTC+05:30, fixed, no
// DST, so 10:00 IST is 04:30Z on the same date, always — and every expected
// instant below is re-derived by hand rather than copied from the output.

import { describe, expect, it } from 'vitest';

import {
  buildSlateAvailability,
  CAMPUS_TZ,
  daysInMonth,
  defaultSlateMonth,
  distinctDurations,
  isMonthKey,
  monthDateRange,
  type PersonSchedule,
  defaultPersonSchedule,
} from '@/lib/services/meetings/monthly-slate-service';

const ALICE = 'p-alice';
const BOB = 'p-bob';

/** Mon–Fri, 10:00–12:00 IST. Two hours is enough to hold one 120 or two 60s. */
function workday(): PersonSchedule {
  return {
    timezone: CAMPUS_TZ,
    windows: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startMinute: 10 * 60,
      endMinute: 12 * 60,
    })),
    overrides: [],
  };
}

const NOV = { fromDate: '2026-11-02', toDate: '2026-11-02' }; // a single Monday
const NOW = new Date('2026-10-01T00:00:00.000Z');

// ============================================================================

describe('monthDateRange — the month is the whole month', () => {
  it('covers the first to the last day of a 30-day month', () => {
    const r = monthDateRange('2026-11');
    expect(r.fromDate).toBe('2026-11-01');
    expect(r.toDate).toBe('2026-11-30');
  });

  it('covers all 31 days of a 31-day month', () => {
    expect(monthDateRange('2026-12').toDate).toBe('2026-12-31');
  });

  it('gets February right in a common year and a leap year', () => {
    expect(monthDateRange('2026-02').toDate).toBe('2026-02-28');
    expect(monthDateRange('2028-02').toDate).toBe('2028-02-29');
  });

  it('applies the full Gregorian leap rule, not just "divisible by 4"', () => {
    // 2100 is divisible by 4 but NOT a leap year (century, not divisible by
    // 400). 2000 IS. A naive %4 test gets 2100 wrong.
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it('brackets the month with a day of padding on each side', () => {
    // The campus month starts at 2026-11-01 00:00 IST = 2026-10-31 18:30Z, so a
    // bound of exactly 2026-11-01T00:00Z would miss a booking that is already
    // running when the month begins. The lower bound is the previous UTC day.
    const r = monthDateRange('2026-11');
    expect(r.fromIso).toBe('2026-10-31T00:00:00.000Z');
    expect(new Date(r.toIsoExclusive).getTime()).toBeGreaterThan(
      Date.parse('2026-11-30T23:59:59.000Z'),
    );
  });

  it('rejects anything that is not a YYYY-MM month', () => {
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-00')).toBe(false);
    expect(isMonthKey('2026-1')).toBe(false);
    expect(isMonthKey('2026-11-01')).toBe(false);
    expect(isMonthKey(null)).toBe(false);
    expect(() => monthDateRange('2026-13')).toThrow();
  });

  it('suggests the month AFTER the current one, rolling the year over', () => {
    // 2026-12-15 12:00Z is 17:30 IST the same day → December → next is 2027-01.
    expect(defaultSlateMonth(new Date('2026-12-15T12:00:00.000Z'))).toBe('2027-01');
    expect(defaultSlateMonth(new Date('2026-11-01T12:00:00.000Z'))).toBe('2026-12');
  });

  it('reads the current month in CAMPUS time, not the server’s', () => {
    // 2026-11-30 20:00Z is already 2026-12-01 01:30 IST. A server reading UTC
    // would say November and propose the month that has already started.
    expect(defaultSlateMonth(new Date('2026-11-30T20:00:00.000Z'))).toBe('2027-01');
  });
});

// ============================================================================

describe('distinctDurations — one availability set per meeting length', () => {
  it('collapses duplicates and sorts ascending', () => {
    expect(
      distinctDurations([
        { durationMin: 60 },
        { durationMin: 120 },
        { durationMin: 60 },
        { durationMin: 30 },
      ]),
    ).toEqual([30, 60, 120]);
  });

  it('drops lengths that cannot be a meeting', () => {
    expect(
      distinctDurations([
        { durationMin: 60 },
        { durationMin: 0 },
        { durationMin: -30 },
        { durationMin: Number.NaN },
      ]),
    ).toEqual([60]);
  });

  it('returns nothing for no series', () => {
    expect(distinctDurations([])).toEqual([]);
  });
});

// ============================================================================

describe('buildSlateAvailability — grouped per duration', () => {
  it('emits one entry per (person, duration) pair', () => {
    const out = buildSlateAvailability({
      profileIds: [ALICE, BOB],
      durations: [60, 120],
      schedules: new Map([
        [ALICE, workday()],
        [BOB, workday()],
      ]),
      busyByProfile: new Map(),
      ...NOV,
      now: NOW,
    });

    expect(out).toHaveLength(4);
    for (const person of [ALICE, BOB]) {
      for (const d of [60, 120]) {
        expect(out.some((a) => a.profileId === person && a.durationMin === d)).toBe(true);
      }
    }
  });

  it('gives a LONGER meeting strictly fewer starts than a shorter one', () => {
    // 10:00-12:00 IST on a 15-minute grid:
    //   60 min fits starting 10:00, 10:15 ... 11:00  → 5 starts
    //   120 min fits only at 10:00                   → 1 start
    // This is the whole reason availability is duration-keyed: borrowing the
    // 60-minute answer for a 120-minute meeting would offer 11:00 and book over
    // whatever follows.
    const out = buildSlateAvailability({
      profileIds: [ALICE],
      durations: [60, 120],
      schedules: new Map([[ALICE, workday()]]),
      busyByProfile: new Map(),
      ...NOV,
      now: NOW,
    });

    const sixty = out.find((a) => a.durationMin === 60)!;
    const oneTwenty = out.find((a) => a.durationMin === 120)!;

    expect(sixty.freeStarts).toHaveLength(5);
    expect(sixty.freeStarts[0]).toBe('2026-11-02T04:30:00.000Z'); // 10:00 IST
    expect(oneTwenty.freeStarts).toEqual(['2026-11-02T04:30:00.000Z']);
    expect(oneTwenty.freeStarts.length).toBeLessThan(sixty.freeStarts.length);
  });

  it('removes the times a confirmed booking already holds', () => {
    // Busy 10:00-11:00 IST (04:30Z-05:30Z). A 60-minute meeting can then only
    // start at 11:00 IST (05:30Z) — 10:15/10:30/10:45 all overlap the booking.
    const out = buildSlateAvailability({
      profileIds: [ALICE],
      durations: [60],
      schedules: new Map([[ALICE, workday()]]),
      busyByProfile: new Map([
        [ALICE, [{ start: '2026-11-02T04:30:00.000Z', end: '2026-11-02T05:30:00.000Z' }]],
      ]),
      ...NOV,
      now: NOW,
    });

    expect(out[0].freeStarts).toEqual(['2026-11-02T05:30:00.000Z']);
  });

  it('does NOT subtract a rejected start globally — that rule was overruled', () => {
    // Director's ruling, 2026-09-14: turning a time down for ONE college must
    // not take it away from the others. "Not good for Pharmacy" is not "bad
    // for everyone". Availability here is per PERSON and cannot express a
    // per-COLLEGE exclusion, so this layer deliberately leaves rejections
    // alone; the engine's per-institution loop applies them when the Reject
    // button lands (piece 4b).
    //
    // This test previously asserted the OPPOSITE. It is kept, inverted, rather
    // than deleted, so that re-introducing the global filter fails loudly
    // instead of quietly shrinking every college's options.
    const out = buildSlateAvailability({
      profileIds: [ALICE],
      durations: [60],
      schedules: new Map([[ALICE, workday()]]),
      busyByProfile: new Map(),
      ...NOV,
      now: NOW,
      rejectedStarts: new Set(['2026-11-02T04:30:00.000Z']),
    });

    expect(out[0].freeStarts).toContain('2026-11-02T04:30:00.000Z');
  });
});

// ============================================================================

describe('buildSlateAvailability — fail closed', () => {
  it('treats a person whose availability could not be read as FULLY BUSY', () => {
    // Bob has a perfectly good schedule on file. He is nonetheless in the
    // unknown set — the load errored. He must come back with no free starts:
    // an unreadable calendar is not an empty one.
    const out = buildSlateAvailability({
      profileIds: [ALICE, BOB],
      durations: [60],
      schedules: new Map([
        [ALICE, workday()],
        [BOB, workday()],
      ]),
      busyByProfile: new Map(),
      unknownProfileIds: new Set([BOB]),
      ...NOV,
      now: NOW,
    });

    const alice = out.find((a) => a.profileId === ALICE)!;
    const bob = out.find((a) => a.profileId === BOB)!;

    expect(alice.freeStarts.length).toBeGreaterThan(0);
    expect(bob.freeStarts).toEqual([]);
  });

  it('still EMITS the entry for an unknown person rather than omitting it', () => {
    // Both read as "no shared time" to the engine, but an omitted entry loses
    // the distinction for anything that inspects this output — and an absent
    // row is exactly the shape of bug this module exists to prevent.
    // Bob has a usable schedule on file, so the ONLY reason he comes back empty
    // is the unknown flag — the branch under test, not an incidental throw.
    const out = buildSlateAvailability({
      profileIds: [BOB],
      durations: [60, 120],
      schedules: new Map([[BOB, workday()]]),
      busyByProfile: new Map(),
      unknownProfileIds: new Set([BOB]),
      ...NOV,
      now: NOW,
    });

    expect(out).toHaveLength(2);
    expect(out.every((a) => a.freeStarts.length === 0)).toBe(true);
  });

  it('fails closed for someone with no schedule at all', () => {
    const out = buildSlateAvailability({
      profileIds: [BOB],
      durations: [60],
      schedules: new Map(),
      busyByProfile: new Map(),
      ...NOV,
      now: NOW,
    });

    expect(out[0].freeStarts).toEqual([]);
  });

  it('fails closed rather than throwing when the schedule rows are unusable', () => {
    // endMinute before startMinute produces no candidates; a NaN weekday matches
    // no day. Neither may take the whole month down, and neither may be read as
    // "free all month".
    const out = buildSlateAvailability({
      profileIds: [ALICE],
      durations: [60],
      schedules: new Map([
        [
          ALICE,
          {
            timezone: CAMPUS_TZ,
            windows: [
              { weekday: 1, startMinute: 720, endMinute: 600 },
              { weekday: Number.NaN, startMinute: 600, endMinute: 720 },
            ],
            overrides: [],
          },
        ],
      ]),
      busyByProfile: new Map(),
      ...NOV,
      now: NOW,
    });

    expect(out[0].freeStarts).toEqual([]);
  });

  it('honours a closed-day override the same way the booking widget does', () => {
    const out = buildSlateAvailability({
      profileIds: [ALICE],
      durations: [60],
      schedules: new Map([
        [
          ALICE,
          { ...workday(), overrides: [{ date: '2026-11-02', startMinute: null, endMinute: null }] },
        ],
      ]),
      busyByProfile: new Map(),
      ...NOV,
      now: NOW,
    });

    expect(out[0].freeStarts).toEqual([]);
  });
});

// ============================================================================
// The Director's ruling on assumed hours (2026-09-14)
// ============================================================================

describe('defaultPersonSchedule — what we assume when hours are unrecorded', () => {
  it('is 09:00 to 16:30', () => {
    // 9 * 60 = 540; 16 * 60 + 30 = 990. Re-derived here rather than imported,
    // so changing the constant fails this test instead of silently agreeing
    // with itself.
    const s = defaultPersonSchedule();
    expect(s.windows.every((w) => w.startMinute === 540)).toBe(true);
    expect(s.windows.every((w) => w.endMinute === 990)).toBe(true);
  });

  it('is Monday to FRIDAY — never Saturday or Sunday', () => {
    // An earlier draft assumed Mon-Sat. The Director corrected it. A six-day
    // week would quietly propose institutional meetings on Saturdays.
    const days = defaultPersonSchedule().windows.map((w) => w.weekday).sort();
    expect(days).toEqual([1, 2, 3, 4, 5]);
    expect(days).not.toContain(6); // Saturday
    expect(days).not.toContain(0); // Sunday
  });

  it('carries no date overrides — it is an assumption, not a record', () => {
    expect(defaultPersonSchedule().overrides).toEqual([]);
  });
});
