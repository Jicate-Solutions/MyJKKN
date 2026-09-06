// __tests__/events/event-venue-booking-range.test.ts
//
// Regression cover for the bug that stopped events holding their room:
// an organizer entered 09:45–15:45 (event ef52b700…, room "COMMERCE CA AND BBA
// DEPARTMENT"), the spine rejected it with "Start and end times must align to
// 30-minute steps", and the event was created with the room demoted to
// `venue_text = "… (not reserved)"`.
//
// The 30-minute grid is the Resource Management PICKER's granularity (its inputs
// carry step={CUSTOM_RANGE_STEP_MINUTES * 60} and it validates client-side before
// it ever calls the spine). It is not a booking invariant: the only time rule on
// `resource_reservations` is CHECK (end_time > start_time). The events form uses a
// plain <input type="time"> with no step, so organizer-chosen hours are arbitrary
// by design.
//
// Likewise the 09:00–17:30 window in DEFAULT_TIME_SLOT_CONFIG is a default used to
// OFFER chips for the 542 of 552 resources nobody has configured — not a rule to
// book by. An admin-configured window is still real policy and stays enforced.

import { describe, it, expect, vi } from 'vitest';

// The range guard is pure, but importing the spine drags in the notification
// service, which builds a Supabase client at MODULE level and needs env vars.
// Stub the client factory so the module graph loads; nothing here touches it.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import { ReservationService } from '@/lib/services/reservation/reservation-service';
import { buildDaySlots } from '@/lib/services/events/venue/event-venue';
import type { TimeSlotConfig } from '@/types/resource-management';

// The guard is private because it is an internal step of createReservation, but
// the bug lives in WHICH config it validates against — calling it directly
// reproduces production without standing up Supabase.
const validateRange = (bookingConfig: unknown, startIso: string, endIso: string) =>
  (ReservationService as unknown as {
    validateBookingRange: (c: unknown, id: string, s: string, e: string) => void;
  }).validateBookingRange(bookingConfig, 'resource-1', startIso, endIso);

/** Local wall-clock HH:mm on a fixed day -> the ISO instant the spine receives. */
const iso = (time: string, day = '2026-08-10') => new Date(`${day}T${time}:00`).toISOString();

/** A room nobody has configured — 542 of 552 in production. */
const UNCONFIGURED = { time_slot_config: null };

/** A room an admin really did configure: open 09:00–17:00, closed on Sunday. */
const CONFIGURED: { time_slot_config: TimeSlotConfig } = {
  time_slot_config: {
    operating_hours: { default: { start: '09:00', end: '17:00' } },
    slot_generation: 'custom',
    custom_slots: [],
  },
};

describe('reservation range guard — organizer-chosen event hours', () => {
  it('accepts the exact hours that failed in production (09:45–15:45)', () => {
    expect(() => validateRange(UNCONFIGURED, iso('09:45'), iso('15:45'))).not.toThrow();
  });

  it('accepts the other production failure (09:57–11:57)', () => {
    expect(() => validateRange(UNCONFIGURED, iso('09:57'), iso('11:57'))).not.toThrow();
  });

  it('accepts an evening programme on an unconfigured room (18:00–20:30)', () => {
    // Same root cause as the step rule: an invented 09:00–17:30 window would
    // reject every cultural/evening event on a room nobody has configured.
    expect(() => validateRange(UNCONFIGURED, iso('18:00'), iso('20:30'))).not.toThrow();
  });

  it('still accepts an aligned booking (09:00–17:00)', () => {
    expect(() => validateRange(UNCONFIGURED, iso('09:00'), iso('17:00'))).not.toThrow();
  });

  it('holds every day of a multi-day event to the same organizer hours', () => {
    const slots = buildDaySlots('2026-08-10', '2026-08-12', '09:45', '15:45');
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(() => validateRange(UNCONFIGURED, slot.startIso, slot.endIso)).not.toThrow();
    }
  });
});

describe('reservation range guard — invariants that must survive', () => {
  it('rejects a booking shorter than the 30-minute minimum', () => {
    expect(() => validateRange(UNCONFIGURED, iso('09:45'), iso('09:50'))).toThrow(
      /at least 30 minutes/i
    );
  });

  it('rejects an end at or before the start', () => {
    expect(() => validateRange(UNCONFIGURED, iso('15:45'), iso('09:45'))).toThrow();
  });

  it("enforces an admin's real operating window", () => {
    // The room's owner configured 09:00–17:00. That is genuine policy, not an
    // invented default, so a 18:00 booking must still be refused.
    expect(() => validateRange(CONFIGURED, iso('18:00'), iso('20:30'))).toThrow(
      /operating hours/i
    );
  });

  it('allows organizer-chosen minutes inside an admin window', () => {
    // Configured does NOT mean "on the half hour" — 09:45–15:45 sits inside
    // 09:00–17:00 and must pass.
    expect(() => validateRange(CONFIGURED, iso('09:45'), iso('15:45'))).not.toThrow();
  });
});
