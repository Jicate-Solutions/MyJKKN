// The host's "Switch to Google Meet" picker offered times it then refused.
//
// Director, 24 Sep 2026 (screenshot): picking 12:35 in the switch panel answered
// "That time is no longer available. Pick another slot." Two causes:
//   1. the panel listed times from the host's IN-PERSON hours, while
//   2. switchToOnline re-validated the pick against the host's ONLINE hours.
// And neither honoured the rule the Director set on 22 Sep: the host may put
// their own meeting at any time 07:00-22:00 (host-any-time.ts), which Reschedule
// already follows. The fix gives resolveMoveContext the same hostAnyTime switch
// and turns it on for a HOST switch only; a visitor's request stays on the
// host's online hours.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/services/integrations/google-calendar-service', () => ({ GoogleCalendarService: {} }));
vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({ MeetingBookingEmailService: {} }));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn(() => ({})) }));

import { NativeSchedulingService, type NativeMeetingType } from '@/lib/services/meetings/native-scheduling-service';

// Thursday 24 Sep 2026, 07:30 IST.
const NOW = new Date('2026-09-24T02:00:00.000Z');
const ist = (hhmm: string) => new Date(`2026-09-24T${hhmm}:00+05:30`).toISOString();

const MT = {
  id: 'mt-1',
  host_profile_id: 'host-1',
  duration_min: 15,
  schedule_id: 'sched-online',
  min_notice_min: 120,
  buffer_before_min: 0,
  buffer_after_min: 0,
  slot_interval_min: 15,
} as unknown as NativeMeetingType;

// The host's published hours that day: 09:00-10:00 only (weekday 4 = Thursday).
const SCHEDULE = {
  timezone: 'Asia/Kolkata',
  windows: [{ weekday: 4, startMinute: 9 * 60, endMinute: 10 * 60 }],
  overrides: [],
};

const svc = NativeSchedulingService as unknown as {
  loadSchedule: (...a: unknown[]) => unknown;
  loadBusy: (...a: unknown[]) => unknown;
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(svc, 'loadSchedule').mockResolvedValue(SCHEDULE);
  vi.spyOn(svc, 'loadBusy').mockResolvedValue([]);
});

describe('resolveMoveContext — the host may choose any time 07:00-22:00', () => {
  it('refuses a time outside the published hours when hostAnyTime is not set (unchanged)', async () => {
    const r = await NativeSchedulingService.resolveMoveContext({} as never, MT, { newStartIso: ist('15:00'), now: NOW });
    expect(r).toMatchObject({ ok: false, error: 'INVALID_SLOT' });
  });

  it('accepts that same time for the host', async () => {
    const r = await NativeSchedulingService.resolveMoveContext({} as never, MT, {
      newStartIso: ist('15:00'),
      now: NOW,
      hostAnyTime: true,
    });
    expect(r.ok).toBe(true);
    expect(r.startIso).toBe(ist('15:00'));
    expect(r.endIso).toBe(ist('15:15'));
  });

  it('still refuses a time the host is already booked in — "any time" is not "on top of something else"', async () => {
    vi.spyOn(svc, 'loadBusy').mockResolvedValue([{ start: ist('15:00'), end: ist('15:30') }]);
    const r = await NativeSchedulingService.resolveMoveContext({} as never, MT, {
      newStartIso: ist('15:00'),
      now: NOW,
      hostAnyTime: true,
    });
    expect(r).toMatchObject({ ok: false, error: 'INVALID_SLOT' });
  });

  it('still refuses a time after 22:00', async () => {
    const r = await NativeSchedulingService.resolveMoveContext({} as never, MT, {
      newStartIso: ist('22:15'),
      now: NOW,
      hostAnyTime: true,
    });
    expect(r).toMatchObject({ ok: false, error: 'INVALID_SLOT' });
  });

  it('drops the notice window for the host, as Reschedule does: 08:00 today is allowed at 07:30', async () => {
    const r = await NativeSchedulingService.resolveMoveContext({} as never, MT, {
      newStartIso: ist('08:00'),
      now: NOW,
      hostAnyTime: true,
    });
    expect(r.ok).toBe(true);
  });
});
