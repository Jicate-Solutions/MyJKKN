/**
 * The host may take a time their own published hours do not offer.
 *
 * Director, 22 Sep 2026: "the host should be able to schedule anytime — it
 * should show time outside the availability hours also, for the host alone."
 *
 * The rule has to hold in TWO places or it is worse than useless: the times the
 * host is shown, and the re-validation that runs when they pick one
 * (rescheduleBooking recomputes the offered slots and refuses anything outside
 * them). A picker offering buttons that the save then rejects is a worse
 * experience than not offering them. Both callers spread the SAME object from
 * host-any-time.ts, and this file pins what that object does.
 */
import { describe, it, expect } from 'vitest';

import { computeSlots } from '@/lib/services/meetings/native-slot-engine';
import {
  hostAnyTimeWindows,
  hostAnyTimeSlotInput,
  HOST_ANY_TIME_START_MIN,
  HOST_ANY_TIME_END_MIN,
} from '@/lib/services/meetings/host-any-time';

/** A Tuesday. The host publishes 10:00–11:00 only. */
const PUBLISHED = [{ weekday: 2, startMinute: 600, endMinute: 660 }];
const DATE = '2026-09-22';
const NOW = new Date('2026-09-22T00:30:00.000Z'); // 06:00 IST

function slots(over: Record<string, unknown> = {}) {
  return computeSlots({
    timezone: 'Asia/Kolkata',
    durationMin: 30,
    windows: PUBLISHED,
    overrides: [],
    bookings: [],
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeMin: 120,
    fromDate: DATE,
    toDate: DATE,
    now: NOW,
    ...over,
  }).map((s) => s.start);
}

/** HH:mm in IST, for readable assertions. */
const ist = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));

describe('the published hours, unchanged', () => {
  it('offers only what the host published', () => {
    const times = slots().map(ist);
    expect(times).toEqual(['10:00', '10:30']);
  });
});

describe('the host asking for any time', () => {
  it('opens the whole day, not just the published hour', () => {
    const times = slots(hostAnyTimeSlotInput()).map(ist);
    expect(times.length).toBeGreaterThan(20);
    expect(times[0]).toBe('07:00');
    expect(times[times.length - 1]).toBe('21:30');
    // and the published hour is still in there, not replaced
    expect(times).toContain('10:00');
  });

  it('covers every weekday, so no day is missing', () => {
    expect(hostAnyTimeWindows().map((w) => w.weekday).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const w of hostAnyTimeWindows()) {
      expect(w.startMinute).toBe(HOST_ANY_TIME_START_MIN);
      expect(w.endMinute).toBe(HOST_ANY_TIME_END_MIN);
    }
  });

  it('ignores a day the schedule closed', () => {
    // A closed override wins normally; for the host it must not.
    const closed = [{ date: DATE, startMinute: null, endMinute: null }];
    expect(slots({ overrides: closed })).toHaveLength(0);
    expect(slots({ overrides: closed, ...hostAnyTimeSlotInput() }).length).toBeGreaterThan(20);
  });

  it('drops the notice window, so a time later today is offerable', () => {
    // 06:00 IST now, 120 minutes' notice: 07:00 is inside the window and would
    // normally be refused.
    expect(slots(hostAnyTimeSlotInput()).map(ist)).toContain('07:00');
  });
});

describe('what "any time" still refuses', () => {
  it('never offers a slot the host is already booked in', () => {
    // 15:00–15:30 IST is taken.
    const booked = [{ start: '2026-09-22T09:30:00.000Z', end: '2026-09-22T10:00:00.000Z' }];
    const times = slots({ bookings: booked, ...hostAnyTimeSlotInput() }).map(ist);
    expect(times).not.toContain('15:00');
    // the rest of the day is still there, so this is a real exclusion and not
    // an empty list
    expect(times).toContain('15:30');
  });

  it('keeps the buffers around an existing meeting', () => {
    // He asked for hours outside the published ones, not for the gap that
    // protects the meeting either side. A 30-minute slot at 14:30 would end
    // exactly as the 15:00 meeting begins, which is what a before-buffer is
    // for. Asserted both ways so this proves the buffer and not an empty list.
    const booked = [{ start: '2026-09-22T09:30:00.000Z', end: '2026-09-22T10:00:00.000Z' }];
    // bufferAfterMin, not Before: the engine pads the CANDIDATE, so an
    // after-buffer is what stops a slot butting up against the next meeting.
    const withBuffer = slots({
      bookings: booked,
      bufferAfterMin: 30,
      ...hostAnyTimeSlotInput(),
    }).map(ist);
    const without = slots({ bookings: booked, ...hostAnyTimeSlotInput() }).map(ist);

    expect(without).toContain('14:30');
    expect(withBuffer).not.toContain('14:30');
  });

  it('does not run past 10pm', () => {
    const times = slots(hostAnyTimeSlotInput()).map(ist);
    expect(times.some((t) => t >= '22:00')).toBe(false);
  });
});
