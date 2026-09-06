// __tests__/meetings/native-slot-engine.test.ts
//
// Adversarial suite for the pure slot engine (Phase N1). Expected instants are
// re-derived BY HAND in comments — the test encodes the arithmetic, not the
// engine's own output. IST = UTC+05:30 fixed (no DST); America/New_York covers
// the DST lenses.

import { describe, expect, it } from 'vitest';
import {
  applyGroupCapacity,
  computeSlots,
  groupSlotsByDate,
  intersectCollectiveSlots,
  pickRoundRobinHost,
  zonedToUtc,
  type Slot,
} from '@/lib/services/meetings/native-slot-engine';

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';

// A "now" far before all test ranges: 2026-06-01T00:00:00Z
const NOW = new Date('2026-06-01T00:00:00Z');

// 2026-06-12 is a Friday (weekday 5).
const FRI = '2026-06-12';

describe('zonedToUtc', () => {
  it('converts IST minutes-of-day to the correct UTC instant', () => {
    // 09:30 IST = 04:00Z (IST is +05:30)
    expect(zonedToUtc(2026, 6, 12, 9 * 60 + 30, IST).toISOString()).toBe(
      '2026-06-12T04:00:00.000Z',
    );
  });

  it('handles IST early-morning times that land on the PREVIOUS UTC day', () => {
    // 00:30 IST on Jun 12 = Jun 11 19:00Z
    expect(zonedToUtc(2026, 6, 12, 30, IST).toISOString()).toBe(
      '2026-06-11T19:00:00.000Z',
    );
  });

  it('handles EDT (summer, UTC-4)', () => {
    // 09:00 New York on Jun 12 (EDT) = 13:00Z
    expect(zonedToUtc(2026, 6, 12, 9 * 60, NY).toISOString()).toBe(
      '2026-06-12T13:00:00.000Z',
    );
  });

  it('handles EST (winter, UTC-5)', () => {
    // 09:00 New York on Jan 12 (EST) = 14:00Z
    expect(zonedToUtc(2026, 1, 12, 9 * 60, NY).toISOString()).toBe(
      '2026-01-12T14:00:00.000Z',
    );
  });
});

describe('computeSlots — windows and intervals', () => {
  it('generates duration-stepped slots inside a window', () => {
    // Fri 09:30–11:00 IST, 30-min slots → 09:30, 10:00, 10:30 (11:00 start would end 11:30 > end)
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      windows: [{ weekday: 5, startMinute: 9 * 60 + 30, endMinute: 11 * 60 }],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots.map((s) => s.start)).toEqual([
      '2026-06-12T04:00:00.000Z', // 09:30 IST
      '2026-06-12T04:30:00.000Z', // 10:00
      '2026-06-12T05:00:00.000Z', // 10:30
    ]);
  });

  it('drops a tail slot whose duration does not fit', () => {
    // 09:00–09:50, 30-min: only 09:00 fits (09:30 start would end 10:00 > 09:50)
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      windows: [{ weekday: 5, startMinute: 9 * 60, endMinute: 9 * 60 + 50 }],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].start).toBe('2026-06-12T03:30:00.000Z'); // 09:00 IST
  });

  it('honours a custom slot interval shorter than the duration', () => {
    // 09:00–10:00, 30-min duration, 15-min interval → 09:00, 09:15, 09:30 (09:45+30 > 10:00)
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      slotIntervalMin: 15,
      windows: [{ weekday: 5, startMinute: 9 * 60, endMinute: 10 * 60 }],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots.map((s) => s.start)).toEqual([
      '2026-06-12T03:30:00.000Z',
      '2026-06-12T03:45:00.000Z',
      '2026-06-12T04:00:00.000Z',
    ]);
  });

  it('produces nothing on weekdays with no window', () => {
    // Window only on Monday (1); Friday queried.
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      windows: [{ weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 }],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots).toHaveLength(0);
  });

  it('multi-day range spans the right weekdays', () => {
    // Sat(6) window 10:00–10:30; range Fri..Sun → exactly Saturday's one slot
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      windows: [{ weekday: 6, startMinute: 10 * 60, endMinute: 10 * 60 + 30 }],
      fromDate: '2026-06-12',
      toDate: '2026-06-14',
      now: NOW,
    });
    expect(slots.map((s) => s.start)).toEqual(['2026-06-13T04:30:00.000Z']);
  });

  it('does not duplicate instants when two windows overlap', () => {
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      windows: [
        { weekday: 5, startMinute: 9 * 60, endMinute: 10 * 60 },
        { weekday: 5, startMinute: 9 * 60, endMinute: 10 * 60 }, // duplicate row
      ],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots).toHaveLength(2); // 09:00, 09:30 — not 4
  });
});

describe('computeSlots — minimum notice', () => {
  it('filters slots earlier than now + minNotice', () => {
    // now = 03:00Z (08:30 IST Fri). Window 09:00–10:00 IST. minNotice 60 →
    // earliest bookable = 04:00Z (09:30 IST) → only 09:30 remains.
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      minNoticeMin: 60,
      windows: [{ weekday: 5, startMinute: 9 * 60, endMinute: 10 * 60 }],
      fromDate: FRI,
      toDate: FRI,
      now: new Date('2026-06-12T03:00:00Z'),
    });
    expect(slots.map((s) => s.start)).toEqual(['2026-06-12T04:00:00.000Z']);
  });
});

describe('computeSlots — booking conflicts and buffers', () => {
  const window = [{ weekday: 5, startMinute: 9 * 60, endMinute: 11 * 60 }]; // 09:00–11:00 IST = 03:30–05:30Z

  it('removes exactly the overlapped slots', () => {
    // Booking 04:00–04:30Z (09:30–10:00 IST) → 09:30 gone; 09:00, 10:00, 10:30 remain
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      windows: window,
      bookings: [{ start: '2026-06-12T04:00:00Z', end: '2026-06-12T04:30:00Z' }],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots.map((s) => s.start)).toEqual([
      '2026-06-12T03:30:00.000Z',
      '2026-06-12T04:30:00.000Z',
      '2026-06-12T05:00:00.000Z',
    ]);
  });

  it('partial overlap also blocks (booking not slot-aligned)', () => {
    // Booking 04:15–04:45Z straddles the 04:00 and 04:30 slots → both gone
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      windows: window,
      bookings: [{ start: '2026-06-12T04:15:00Z', end: '2026-06-12T04:45:00Z' }],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots.map((s) => s.start)).toEqual([
      '2026-06-12T03:30:00.000Z',
      '2026-06-12T05:00:00.000Z',
    ]);
  });

  it('back-to-back bookings do NOT block adjacent slots (half-open ranges)', () => {
    // Booking ends exactly 04:00Z → the 04:00 slot is bookable
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      windows: window,
      bookings: [{ start: '2026-06-12T03:30:00Z', end: '2026-06-12T04:00:00Z' }],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots.map((s) => s.start)).toEqual([
      '2026-06-12T04:00:00.000Z',
      '2026-06-12T04:30:00.000Z',
      '2026-06-12T05:00:00.000Z',
    ]);
  });

  it('buffers expand the exclusion zone', () => {
    // Same booking 03:30–04:00Z but 15-min buffer-before on candidates:
    // candidate 04:00 padded to 03:45 start → overlaps booking → gone.
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      bufferBeforeMin: 15,
      windows: window,
      bookings: [{ start: '2026-06-12T03:30:00Z', end: '2026-06-12T04:00:00Z' }],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots.map((s) => s.start)).toEqual([
      '2026-06-12T04:30:00.000Z',
      '2026-06-12T05:00:00.000Z',
    ]);
  });
});

describe('computeSlots — overrides', () => {
  const weekly = [{ weekday: 5, startMinute: 9 * 60, endMinute: 10 * 60 }];

  it('override REPLACES weekly windows for that date', () => {
    // Friday override 14:00–15:00 → morning weekly window gone, afternoon offered
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      windows: weekly,
      overrides: [{ date: FRI, startMinute: 14 * 60, endMinute: 15 * 60 }],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots.map((s) => s.start)).toEqual([
      '2026-06-12T08:30:00.000Z', // 14:00 IST
      '2026-06-12T09:00:00.000Z', // 14:30
    ]);
  });

  it('null/null override closes the whole day', () => {
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      windows: weekly,
      overrides: [{ date: FRI, startMinute: null, endMinute: null }],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots).toHaveLength(0);
  });

  it('override-only schedules (no weekly windows) offer only override dates', () => {
    // The Calendly "Mid Month IQAC" pattern: empty weekly, dated windows.
    const slots = computeSlots({
      timezone: IST,
      durationMin: 30,
      windows: [],
      overrides: [{ date: '2026-06-15', startMinute: 10 * 60, endMinute: 11 * 60 }],
      fromDate: '2026-06-12',
      toDate: '2026-06-18',
      now: NOW,
    });
    expect(slots.map((s) => s.start)).toEqual([
      '2026-06-15T04:30:00.000Z', // 10:00 IST Mon 15th
      '2026-06-15T05:00:00.000Z',
    ]);
  });

  it('overrides on other dates leave weekly days untouched', () => {
    const slots = computeSlots({
      timezone: IST,
      durationMin: 60,
      windows: weekly,
      overrides: [{ date: '2026-06-13', startMinute: null, endMinute: null }],
      fromDate: FRI,
      toDate: FRI,
      now: NOW,
    });
    expect(slots).toHaveLength(1); // Friday 09:00 IST unaffected
  });
});

describe('computeSlots — DST correctness (America/New_York)', () => {
  it('spring-forward day maps post-transition windows to EDT', () => {
    // US DST starts 2026-03-08 (02:00→03:00). Window 09:00–10:00 NY that
    // Sunday is EDT (UTC-4) → 13:00Z, NOT 14:00Z.
    const slots = computeSlots({
      timezone: NY,
      durationMin: 60,
      windows: [{ weekday: 0, startMinute: 9 * 60, endMinute: 10 * 60 }],
      fromDate: '2026-03-08',
      toDate: '2026-03-08',
      now: NOW0(),
    });
    expect(slots.map((s) => s.start)).toEqual(['2026-03-08T13:00:00.000Z']);
    function NOW0() {
      return new Date('2026-03-01T00:00:00Z');
    }
  });

  it('day before transition is still EST', () => {
    // Sat 2026-03-07, 09:00 NY = 14:00Z (EST, UTC-5)
    const slots = computeSlots({
      timezone: NY,
      durationMin: 60,
      windows: [{ weekday: 6, startMinute: 9 * 60, endMinute: 10 * 60 }],
      fromDate: '2026-03-07',
      toDate: '2026-03-07',
      now: new Date('2026-03-01T00:00:00Z'),
    });
    expect(slots.map((s) => s.start)).toEqual(['2026-03-07T14:00:00.000Z']);
  });
});

describe('groupSlotsByDate', () => {
  it('groups by the DISPLAY timezone date, not UTC date', () => {
    // 19:00Z Jun 11 = 00:30 IST Jun 12 → groups under 2026-06-12 in IST
    const grouped = groupSlotsByDate(
      [{ start: '2026-06-11T19:00:00.000Z' }],
      IST,
    );
    expect(Object.keys(grouped)).toEqual(['2026-06-12']);
  });
});

describe('computeSlots — input validation', () => {
  it('throws on non-positive duration', () => {
    expect(() =>
      computeSlots({
        timezone: IST,
        durationMin: 0,
        windows: [],
        fromDate: FRI,
        toDate: FRI,
        now: NOW,
      }),
    ).toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Wave-3 variants
// ────────────────────────────────────────────────────────────────────────────

const slot = (iso: string): Slot => ({ start: iso });
const A = '2026-06-12T04:00:00.000Z';
const B = '2026-06-12T04:30:00.000Z';
const C = '2026-06-12T05:00:00.000Z';

describe('applyGroupCapacity (group variant)', () => {
  it('keeps a slot with free seats and reports seatsLeft', () => {
    // capacity 3, slot A has 1 booking → 2 left; B has 0 → 3 left
    const out = applyGroupCapacity([slot(A), slot(B)], 3, [{ start: A, count: 1 }]);
    expect(out).toEqual([
      { start: A, seatsLeft: 2 },
      { start: B, seatsLeft: 3 },
    ]);
  });

  it('drops a slot once it is full', () => {
    // capacity 2, slot A already has 2 confirmed → removed entirely
    const out = applyGroupCapacity([slot(A), slot(B)], 2, [{ start: A, count: 2 }]);
    expect(out).toEqual([{ start: B, seatsLeft: 2 }]);
  });

  it('over-full (count > capacity) still drops the slot, never negative seats', () => {
    const out = applyGroupCapacity([slot(A)], 2, [{ start: A, count: 5 }]);
    expect(out).toEqual([]);
  });

  it('capacity <= 0 / NaN collapses to solo (1 seat)', () => {
    expect(applyGroupCapacity([slot(A)], 0, [])).toEqual([{ start: A, seatsLeft: 1 }]);
    expect(applyGroupCapacity([slot(A)], NaN, [{ start: A, count: 1 }])).toEqual([]);
  });

  it('normalises usage keys (non-canonical ISO) before counting', () => {
    // '+00:00' offset form must match the canonical 'Z' slot start.
    const out = applyGroupCapacity([slot(A)], 1, [
      { start: '2026-06-12T04:00:00+00:00', count: 1 },
    ]);
    expect(out).toEqual([]);
  });
});

describe('intersectCollectiveSlots (collective variant)', () => {
  it('offers only instants EVERY host shares', () => {
    const hostX = [slot(A), slot(B), slot(C)];
    const hostY = [slot(B), slot(C)];
    const hostZ = [slot(C), slot(B)];
    expect(intersectCollectiveSlots([hostX, hostY, hostZ]).map((s) => s.start)).toEqual([B, C]);
  });

  it('a host with no free slots empties the intersection', () => {
    expect(intersectCollectiveSlots([[slot(A), slot(B)], []])).toEqual([]);
  });

  it('returns nothing when there are no hosts', () => {
    expect(intersectCollectiveSlots([])).toEqual([]);
  });

  it('single host yields that host’s slots (sorted, unique)', () => {
    expect(intersectCollectiveSlots([[slot(C), slot(A), slot(A)]]).map((s) => s.start)).toEqual([
      A,
      C,
    ]);
  });
});

describe('pickRoundRobinHost (round_robin variant)', () => {
  it('prefers a never-booked host over any booked host', () => {
    const pick = pickRoundRobinHost([
      { hostProfileId: 'h1', lastBookedAt: '2026-06-10T00:00:00Z' },
      { hostProfileId: 'h2', lastBookedAt: null },
    ]);
    expect(pick).toBe('h2');
  });

  it('among booked hosts, picks the least-recently-booked (oldest)', () => {
    const pick = pickRoundRobinHost([
      { hostProfileId: 'h1', lastBookedAt: '2026-06-11T00:00:00Z' },
      { hostProfileId: 'h2', lastBookedAt: '2026-06-09T00:00:00Z' }, // oldest
      { hostProfileId: 'h3', lastBookedAt: '2026-06-10T00:00:00Z' },
    ]);
    expect(pick).toBe('h2');
  });

  it('breaks ties deterministically by hostProfileId', () => {
    const pick = pickRoundRobinHost([
      { hostProfileId: 'hZ', lastBookedAt: null },
      { hostProfileId: 'hA', lastBookedAt: null },
    ]);
    expect(pick).toBe('hA');
  });

  it('returns null for an empty pool', () => {
    expect(pickRoundRobinHost([])).toBeNull();
  });
});
