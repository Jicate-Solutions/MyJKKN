// __tests__/meetings/meeting-mode-switch-online-hours.test.ts
//
// WHOSE HOURS DOES A SWITCHED MEETING KEEP?
//
// The mode switch sets meeting_bookings.location_mode_override and deliberately
// never touches meeting_type_id — that single flag is what makes the feature
// work for all 110 hosts who own an in-person type rather than only the one
// account that owns the online ones. The cost of that design was invisible: the
// meeting type handed to the slot engine was ALWAYS the original, in-person
// one, so a meeting that had just become a video call was still being validated
// against its host's face-to-face hours.
//
// Those hours genuinely differ. Measured in production 2026-08-31:
//   in_person  141 types / 13 distinct schedules / 108 sitting on the default
//   online      14 types /  2 distinct schedules /   0 sitting on the default
// Every online type is pinned to a schedule that is not the host's default, so
// "the same hours" was never true for any of them.
//
// meeting_host_schedules has NO mode column (id, host_profile_id,
// institution_id, name, timezone, is_default, created_at, updated_at) — so the
// online schedule cannot be read off a row and must not be matched by NAME,
// which is a human convention. It is derived from which schedule the host's own
// online meeting types point at.
//
// These tests pin the four cases that actually exist:
//   • a host with ONE online schedule      → that one is used
//   • a host with NONE (most of the 110)   → unchanged behaviour, never an error
//   • a host with TWO (the Director, 13+1) → the busier one, deterministically
//   • switching BACK                       → the ORIGINAL type's schedule again
//
// All times are explicit UTC instants (…Z or +00:00). The suite runs under both
// IST and TZ=UTC; a date literal without a zone passes locally and goes red on
// a UTC runner.

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { pickOnlineScheduleId } from '@/lib/services/meetings/meeting-mode-switch';
import { MeetingModeSwitchService } from '@/lib/services/meetings/meeting-mode-switch-service';

// ── mocks ────────────────────────────────────────────────────────────────────
// Declared before vi.mock but only DEREFERENCED inside the arrow bodies, which
// run at call time. vi.mock is hoisted above these consts; a factory reading
// them eagerly would explode. The meetings import chain also builds Resend and
// a browser Supabase client at import time, so those two are stubbed purely to
// get the module loaded.

const getConnection = vi.fn();
const patchEventToOnline = vi.fn();
const getEvent = vi.fn();
const revertEventFromOnline = vi.fn();
const sendSwitchedEmails = vi.fn();
const sendSwitchedBackEmails = vi.fn();
const getMeetingType = vi.fn();
const resolveMoveContext = vi.fn();

vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  GoogleCalendarService: {
    getConnection: (...a: unknown[]) => getConnection(...a),
    patchEventToOnline: (...a: unknown[]) => patchEventToOnline(...a),
    getEvent: (...a: unknown[]) => getEvent(...a),
    revertEventFromOnline: (...a: unknown[]) => revertEventFromOnline(...a),
  },
}));

vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({
  MeetingBookingEmailService: {
    sendBookingSwitchedToOnlineEmails: (...a: unknown[]) => sendSwitchedEmails(...a),
    sendBookingSwitchedBackEmails: (...a: unknown[]) => sendSwitchedBackEmails(...a),
  },
}));

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn(() => ({})) }));

vi.mock('@/lib/services/meetings/native-scheduling-service', () => ({
  NativeSchedulingService: {
    getMeetingType: (...a: unknown[]) => getMeetingType(...a),
    resolveMoveContext: (...a: unknown[]) => resolveMoveContext(...a),
  },
}));

// ── fixtures ─────────────────────────────────────────────────────────────────

const HOST = 'host-1';
const TOKEN = 'cancel-token-1';
const NOW = new Date('2026-09-01T00:00:00.000Z');
/** Comfortably outside a 60-minute notice window. */
const START = '2026-09-02T04:30:00+00:00';
const END = '2026-09-02T05:00:00+00:00';

/** The schedule the host's IN-PERSON type sits on. */
const IN_PERSON_SCHEDULE = 'sched-in-person';
/** The busier of the two online schedules — 13 of the Director's 14 types. */
const ONLINE_SCHEDULE = 'sched-online-main';
/** The other one — a single type ("JICATE Online Weekly Meeting"). */
const ONLINE_SCHEDULE_RARE = 'sched-online-weekly';

const MEETING_TYPE = {
  id: 'mt-1',
  host_profile_id: HOST,
  title: 'Admission counselling',
  duration_min: 30,
  min_notice_min: 60,
  schedule_id: IN_PERSON_SCHEDULE,
  location_mode: 'in_person' as const,
};

function makeBooking(over: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    uid: 'bk-abc',
    host_profile_id: HOST,
    cancel_token: TOKEN,
    status: 'confirmed',
    attendee_name: 'Priya R',
    attendee_email: 'priya@example.com',
    start_time: START,
    end_time: END,
    meeting_type_id: 'mt-1',
    google_event_id: 'gcal-evt-1',
    video_url: null,
    reschedule_count: 0,
    rescheduled_at: null,
    previous_start_time: null,
    location_mode_override: null,
    mode_switch_requested_by: null,
    mode_switch_requested_at: null,
    mode_switch_requested_start: null,
    mode_switch_request_status: null,
    ...over,
  };
}

interface DbOpts {
  booking?: Record<string, unknown> | null;
  /** The host's ACTIVE online meeting types, as the live query returns them. */
  onlineTypes?: Array<{ schedule_id: string | null }>;
  /** Make the meeting_types lookup fail, to prove the fallback holds. */
  onlineTypesError?: { message: string };
}

/**
 * Minimal Supabase stub. Three shapes, because the service uses three:
 *   • meeting_bookings — select().eq().maybeSingle(), and an update builder
 *     that is BOTH awaitable and chainable into .select().maybeSingle();
 *   • profiles        — select().eq().maybeSingle();
 *   • meeting_types   — select().eq().eq().eq() then AWAITED as a list.
 */
function makeDb(opts: DbOpts = {}) {
  const updates: Record<string, unknown>[] = [];
  const booking = opts.booking === undefined ? makeBooking() : opts.booking;

  const db = {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { is_super_admin: false, full_name: 'Dr Host', email: 'host@jkkn.ac.in' },
              }),
            }),
          }),
        };
      }
      if (table === 'meeting_types') {
        const builder: Record<string, unknown> = {};
        builder.eq = () => builder;
        builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(
            opts.onlineTypesError
              ? { data: null, error: opts.onlineTypesError }
              : { data: opts.onlineTypes ?? [], error: null },
          ).then(res, rej);
        return { select: () => builder };
      }
      // meeting_bookings
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: booking, error: null }) }),
        }),
        update(patch: Record<string, unknown>) {
          updates.push(patch);
          const builder: Record<string, unknown> = {};
          builder.eq = () => builder;
          builder.select = () => ({
            maybeSingle: async () => ({ data: { id: 'b1' }, error: null }),
          });
          builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(res, rej);
          return builder;
        },
      };
    },
  };
  return { db: db as never, updates };
}

/** The schedule ids resolveMoveContext was actually asked about, in order. */
const schedulesAsked = () =>
  resolveMoveContext.mock.calls.map((c) => (c[1] as { schedule_id?: string | null })?.schedule_id);

beforeEach(() => {
  vi.clearAllMocks();
  getConnection.mockResolvedValue({ status: 'active' });
  patchEventToOnline.mockResolvedValue({
    ok: true,
    meetUrl: 'https://meet.google.com/abc-defg-hij',
  });
  getEvent.mockResolvedValue({ startIso: START, endIso: END, meetUrl: null });
  revertEventFromOnline.mockResolvedValue(true);
  sendSwitchedEmails.mockResolvedValue({ attendee: { success: true }, host: { success: true } });
  sendSwitchedBackEmails.mockResolvedValue({ attendee: { success: true }, host: { success: true } });
  getMeetingType.mockResolvedValue({ ...MEETING_TYPE });
  // Mirrors the real engine's contract: no requested start → timezone only; a
  // requested start → echoed back as a valid slot.
  resolveMoveContext.mockImplementation(async (_sb: unknown, mt: any, o: any = {}) => {
    if (!o.newStartIso) return { ok: true, timezone: 'Asia/Kolkata' };
    const d = new Date(o.newStartIso);
    return {
      ok: true,
      timezone: 'Asia/Kolkata',
      startIso: d.toISOString(),
      endIso: new Date(d.getTime() + mt.duration_min * 60_000).toISOString(),
    };
  });
});

// ── the rule itself ──────────────────────────────────────────────────────────

describe('pickOnlineScheduleId', () => {
  it('a host with no online meeting types has no online schedule', () => {
    expect(pickOnlineScheduleId([])).toBeNull();
    expect(pickOnlineScheduleId(null)).toBeNull();
    expect(pickOnlineScheduleId(undefined)).toBeNull();
  });

  it('one online schedule is simply that schedule', () => {
    expect(
      pickOnlineScheduleId([{ schedule_id: ONLINE_SCHEDULE }, { schedule_id: ONLINE_SCHEDULE }]),
    ).toBe(ONLINE_SCHEDULE);
  });

  // The Director's real shape: 14 online types across 2 schedules, 13 + 1.
  it('with more than one, the schedule the most online types use wins', () => {
    const types = [
      ...Array.from({ length: 13 }, () => ({ schedule_id: ONLINE_SCHEDULE })),
      { schedule_id: ONLINE_SCHEDULE_RARE },
    ];
    expect(pickOnlineScheduleId(types)).toBe(ONLINE_SCHEDULE);
    // Row order is not promised by Postgres without an ORDER BY, so the answer
    // must not depend on it.
    expect(pickOnlineScheduleId([...types].reverse())).toBe(ONLINE_SCHEDULE);
  });

  it('a tie is broken by the lowest id, the same way every time', () => {
    const a = { schedule_id: 'aaa-1' };
    const b = { schedule_id: 'bbb-2' };
    expect(pickOnlineScheduleId([a, b])).toBe('aaa-1');
    expect(pickOnlineScheduleId([b, a])).toBe('aaa-1');
  });

  // A type on no schedule runs on the host's default; it is not evidence about
  // which schedule holds the online hours. Zero live online types are like this.
  it('types pinned to no schedule are skipped, not counted', () => {
    expect(
      pickOnlineScheduleId([
        { schedule_id: null },
        { schedule_id: null },
        { schedule_id: ONLINE_SCHEDULE },
      ]),
    ).toBe(ONLINE_SCHEDULE);
    expect(pickOnlineScheduleId([{ schedule_id: null }, { schedule_id: '' }])).toBeNull();
  });
});

// ── going online ─────────────────────────────────────────────────────────────

describe('switching to online uses the host ONLINE schedule', () => {
  it('validates the new time against the online schedule, not the in-person one', async () => {
    const { db } = makeDb({ onlineTypes: [{ schedule_id: ONLINE_SCHEDULE }] });
    const newStart = '2026-09-02T06:00:00.000Z';

    const res = await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart, now: NOW },
    );

    expect(res.ok).toBe(true);
    // This is the bug: before the fix every one of these read 'sched-in-person'.
    expect(schedulesAsked()).toContain(ONLINE_SCHEDULE);
    expect(schedulesAsked()).not.toContain(IN_PERSON_SCHEDULE);
  });

  it('never changes meeting_type_id — only the schedule handed to the engine', async () => {
    const { db, updates } = makeDb({ onlineTypes: [{ schedule_id: ONLINE_SCHEDULE }] });

    await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: '2026-09-02T06:00:00.000Z', now: NOW },
    );

    for (const patch of updates) expect(patch).not.toHaveProperty('meeting_type_id');
    expect(updates.some((u) => u.location_mode_override === 'online')).toBe(true);
  });

  it("the Director's two online schedules resolve to the busier one", async () => {
    const { db } = makeDb({
      onlineTypes: [
        { schedule_id: ONLINE_SCHEDULE_RARE },
        ...Array.from({ length: 13 }, () => ({ schedule_id: ONLINE_SCHEDULE })),
      ],
    });

    const res = await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: '2026-09-02T06:00:00.000Z', now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(schedulesAsked()).toContain(ONLINE_SCHEDULE);
    expect(schedulesAsked()).not.toContain(ONLINE_SCHEDULE_RARE);
  });

  // The fallback is the whole safety story: ~110 hosts own no online type, and
  // they must keep switching meetings exactly as they do today.
  it('a host with NO online schedule keeps the meeting type unchanged', async () => {
    const { db } = makeDb({ onlineTypes: [] });

    const res = await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: '2026-09-02T06:00:00.000Z', now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(schedulesAsked()).toEqual([IN_PERSON_SCHEDULE]);
  });

  it('a failed lookup falls back to today’s behaviour rather than erroring', async () => {
    const { db } = makeDb({ onlineTypesError: { message: 'permission denied' } });

    const res = await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: '2026-09-02T06:00:00.000Z', now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(schedulesAsked()).toEqual([IN_PERSON_SCHEDULE]);
  });

  it('an online type already on that schedule is passed through untouched', async () => {
    getMeetingType.mockResolvedValue({ ...MEETING_TYPE, schedule_id: ONLINE_SCHEDULE });
    const { db } = makeDb({ onlineTypes: [{ schedule_id: ONLINE_SCHEDULE }] });

    await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: '2026-09-02T06:00:00.000Z', now: NOW },
    );

    expect(schedulesAsked()).toEqual([ONLINE_SCHEDULE]);
  });

  it('a visitor’s requested time is checked against the online schedule too', async () => {
    const { db } = makeDb({ onlineTypes: [{ schedule_id: ONLINE_SCHEDULE }] });

    const res = await MeetingModeSwitchService.requestSwitchToOnline(db, 'bk-abc', TOKEN, {
      newStart: '2026-09-02T06:00:00.000Z',
      now: NOW,
    });

    expect(res.ok).toBe(true);
    expect(res.data?.pending).toBe(true);
    expect(schedulesAsked()).toEqual([ONLINE_SCHEDULE]);
  });
});

// ── the mode-only switch, and its warning ────────────────────────────────────

describe('a switch that keeps the time warns instead of moving it', () => {
  /** Valid for the timezone-only call, INVALID_SLOT for the hours check. */
  function onlineHoursReject() {
    resolveMoveContext.mockImplementation(async (_sb: unknown, _mt: any, o: any = {}) => {
      if (!o.newStartIso) return { ok: true, timezone: 'Asia/Kolkata' };
      return { ok: false, timezone: 'Asia/Kolkata', error: 'INVALID_SLOT' };
    });
  }

  it('flags a kept time that the online hours do not offer', async () => {
    onlineHoursReject();
    const { db, updates } = makeDb({ onlineTypes: [{ schedule_id: ONLINE_SCHEDULE }] });

    const res = await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: null, now: NOW },
    );

    // The switch still SUCCEEDS — the warning is information, not a refusal.
    expect(res.ok).toBe(true);
    expect(res.data?.outsideOnlineHours).toBe(true);
    expect(res.data?.timeMoved).toBe(false);
    // Craft decision A holds in both directions: nothing moved, so none of the
    // reschedule bookkeeping may be touched, warning or no warning.
    const claim = updates.find((u) => u.location_mode_override === 'online');
    expect(claim).not.toHaveProperty('start_time');
    expect(claim).not.toHaveProperty('reschedule_count');
    expect(claim).not.toHaveProperty('rescheduled_at');
    expect(claim).not.toHaveProperty('previous_start_time');
    expect(res.data?.start).toBe(START);
  });

  it('says nothing when the kept time IS inside the online hours', async () => {
    const { db } = makeDb({ onlineTypes: [{ schedule_id: ONLINE_SCHEDULE }] });

    const res = await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: null, now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(res.data?.outsideOnlineHours).toBeUndefined();
  });

  // "We could not tell" must never render as "you are outside your hours".
  it('never warns a host who has no online schedule to be outside of', async () => {
    onlineHoursReject();
    const { db } = makeDb({ onlineTypes: [] });

    const res = await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: null, now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(res.data?.outsideOnlineHours).toBeUndefined();
    // One call only: the timezone. No hours question was asked at all.
    expect(resolveMoveContext).toHaveBeenCalledTimes(1);
  });

  it('does not warn when the switch moved the meeting — that was validated', async () => {
    const { db } = makeDb({ onlineTypes: [{ schedule_id: ONLINE_SCHEDULE }] });

    const res = await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: '2026-09-02T06:00:00.000Z', now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(res.data?.timeMoved).toBe(true);
    expect(res.data?.outsideOnlineHours).toBeUndefined();
  });
});

// ── coming back ──────────────────────────────────────────────────────────────

describe('switching BACK reads the original type’s schedule', () => {
  it('uses the in-person schedule, never the online one', async () => {
    const { db } = makeDb({
      booking: makeBooking({
        location_mode_override: 'online',
        video_url: 'https://meet.google.com/abc-defg-hij',
      }),
      onlineTypes: [{ schedule_id: ONLINE_SCHEDULE }],
    });

    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { now: NOW },
    );

    expect(res.ok).toBe(true);
    // The meeting is going back to the mode its type describes, so the hours
    // and the timezone the visitor is emailed in are that type's own again.
    expect(schedulesAsked()).toEqual([IN_PERSON_SCHEDULE]);
  });
});
