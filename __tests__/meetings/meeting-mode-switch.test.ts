// __tests__/meetings/meeting-mode-switch.test.ts
//
// Contracts for turning a face-to-face booking into a Google Meet without
// cancelling it. The load-bearing guarantees, in the Director's own order:
//
//   4. A visitor can only ASK. The request must never take effect on its own —
//      nothing about the booking may change until the host approves.
//   6. ALL-OR-NOTHING. If Google refuses, or returns no Meet link, or someone
//      moved the booking underneath us, the row ends exactly as it started.
//   7. No Google Calendar connection = blocked, with the REAL reason named.
//   8. The cut-off is the meeting type's existing min_notice_min...
//   C. ...and it is checked TWICE: when the request is made AND when it is
//      approved. A request made Monday must not move a Tuesday meeting on
//      Thursday.
//   A. reschedule_count means "times the slot moved". A mode-only switch must
//      not touch it.
//   B. A pending request that outlived its notice window reads as declined.
//
// All times are explicit UTC instants (…Z). The suite is run under both IST
// and TZ=UTC — a date literal without a zone passes locally and goes red on a
// UTC runner.

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  effectiveLocationMode,
  isSwitchAllowedNow,
  switchBackState,
  switchRequestState,
  switchSourceMode,
} from '@/lib/services/meetings/meeting-mode-switch';
import { MeetingModeSwitchService } from '@/lib/services/meetings/meeting-mode-switch-service';

// ── mocks ────────────────────────────────────────────────────────────────────
// Declared before vi.mock but only DEREFERENCED inside the arrow bodies, which
// run at call time. vi.mock is hoisted above these consts; a factory that read
// them eagerly would explode (PR #3127 fixed exactly that in booking-crm-bridge).

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

vi.mock('@/lib/services/meetings/native-scheduling-service', () => ({
  NativeSchedulingService: {
    getMeetingType: (...a: unknown[]) => getMeetingType(...a),
    resolveMoveContext: (...a: unknown[]) => resolveMoveContext(...a),
  },
}));

// ── fixtures ─────────────────────────────────────────────────────────────────

const HOST = 'host-1';
const TOKEN = 'cancel-token-1';
/** "now" for every test, so nothing depends on the wall clock. */
const NOW = new Date('2026-09-01T00:00:00.000Z');
/** Comfortably outside a 60-minute notice window. */
const START = '2026-09-02T04:30:00+00:00';
const END = '2026-09-02T05:00:00+00:00';

const MEETING_TYPE = {
  id: 'mt-1',
  host_profile_id: HOST,
  title: 'Admission counselling',
  duration_min: 30,
  min_notice_min: 60,
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
  /** Result of the guarded claim UPDATE (…select().maybeSingle()). */
  claim?: { data: unknown; error?: { code?: string; message: string } | null };
  /** Result of a plain awaited UPDATE (link write-back, revert, request). */
  plainUpdate?: { error: { code?: string; message: string } | null };
  profile?: Record<string, unknown> | null;
  /**
   * The host's ACTIVE online meeting types, which is how the service works out
   * which schedule holds their online hours. Default `[]` — this file's HOST
   * owns one in-person type and nothing else, which is the state most of the
   * 110 in-person hosts are in, so every expectation below is the unchanged
   * behaviour of a host with no online schedule to switch to.
   */
  onlineTypes?: Array<{ schedule_id: string | null }>;
}

/**
 * Minimal Supabase stub. The update builder is BOTH awaitable (plain updates)
 * and chainable into .select().maybeSingle() (the guarded claim), because the
 * service uses each shape in a different place.
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
                data:
                  opts.profile === undefined
                    ? { is_super_admin: false, full_name: 'Dr Host', email: 'host@jkkn.ac.in' }
                    : opts.profile,
              }),
            }),
          }),
        };
      }
      if (table === 'meeting_types') {
        // Three chained .eq() and then AWAITED as a list — no maybeSingle.
        const rows = opts.onlineTypes ?? [];
        const builder: Record<string, unknown> = {};
        builder.eq = () => builder;
        builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(res, rej);
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
            maybeSingle: async () => opts.claim ?? { data: { id: 'b1' }, error: null },
          });
          builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(opts.plainUpdate ?? { error: null }).then(res, rej);
          return builder;
        },
      };
    },
  };
  return { db: db as never, updates };
}

/** The claim UPDATE is the one that sets the override. */
const claimPatch = (updates: Record<string, unknown>[]) =>
  updates.find((u) => u.location_mode_override === 'online');
/** The revert restores the override to its prior (null) value. */
const revertPatch = (updates: Record<string, unknown>[]) =>
  updates.find((u) => 'location_mode_override' in u && u.location_mode_override !== 'online');

beforeEach(() => {
  vi.clearAllMocks();
  getConnection.mockResolvedValue({ status: 'active' });
  patchEventToOnline.mockResolvedValue({ ok: true, meetUrl: 'https://meet.google.com/abc-defg-hij' });
  // The re-read only runs when the PATCH came back without a link; default it
  // to "still no link" so a test that wants the retry to succeed must say so.
  getEvent.mockResolvedValue({ startIso: START, endIso: END, meetUrl: null });
  revertEventFromOnline.mockResolvedValue(true);
  sendSwitchedEmails.mockResolvedValue({ attendee: { success: true }, host: { success: true } });
  sendSwitchedBackEmails.mockResolvedValue({ attendee: { success: true }, host: { success: true } });
  getMeetingType.mockResolvedValue({ ...MEETING_TYPE });
  // Default: no move requested → timezone only. When a start IS requested the
  // mock echoes it back as a valid slot, mirroring the real engine's contract.
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

// ── pure rules ───────────────────────────────────────────────────────────────

describe('meeting-mode-switch (pure rules)', () => {
  it('the booking override beats the meeting type', () => {
    expect(effectiveLocationMode('in_person', 'online')).toBe('online');
    expect(effectiveLocationMode('in_person', null)).toBe('in_person');
    expect(effectiveLocationMode('online', null)).toBe('online');
  });

  it('an unrecognised override falls back to the type, never to an unknown mode', () => {
    expect(effectiveLocationMode('phone', 'hologram')).toBe('phone');
    expect(effectiveLocationMode('nonsense', null)).toBe('in_person');
  });

  // The GATE must not reuse effectiveLocationMode. That helper answers "what do
  // we SHOW", and it deliberately falls back to 'in_person' for a mode it does
  // not recognise — which as a gate would wave through exactly the modes nobody
  // has decided about. switchSourceMode reads the type's RAW mode instead.
  it('in person AND phone are switchable sources (ruling 1, 2026-08-21)', () => {
    expect(switchSourceMode('in_person', null)).toBe('switchable');
    // 95 live phone types with 95 hosts — the bigger of the two populations,
    // and locked out of this feature until the Director decided it.
    expect(switchSourceMode('phone', null)).toBe('switchable');
    expect(switchSourceMode('online', null)).toBe('online');
    expect(switchSourceMode('in_person', 'online')).toBe('online');
    expect(switchSourceMode('phone', 'online')).toBe('online');
  });

  it('an unrecognised mode is still unsupported, never waved through', () => {
    // The exact shape effectiveLocationMode would have mislabelled 'in_person'.
    expect(switchSourceMode('nonsense', null)).toBe('unsupported');
    expect(switchSourceMode(null, null)).toBe('unsupported');
    expect(switchSourceMode(undefined, null)).toBe('unsupported');
  });

  it('switching back is only possible when the OVERRIDE made it online', () => {
    // The column's CHECK admits NULL or 'online' and nothing else, so the only
    // thing "switch back" can do is clear it.
    expect(switchBackState('in_person', 'online')).toBe('switchable');
    expect(switchBackState('phone', 'online')).toBe('switchable');
    // Online by TYPE: clearing the override would change nothing, and the
    // column cannot say "in person" for one booking.
    expect(switchBackState('online', null)).toBe('online_by_type');
    expect(switchBackState('online', 'online')).toBe('online_by_type');
    // Nothing to undo.
    expect(switchBackState('in_person', null)).toBe('not_online');
    expect(switchBackState('phone', null)).toBe('not_online');
    expect(switchBackState('nonsense', null)).toBe('not_online');
  });

  it('the cut-off is min_notice_min before the meeting starts', () => {
    // 90 minutes away, 60-minute notice → still allowed.
    expect(isSwitchAllowedNow('2026-09-01T01:30:00.000Z', 60, NOW)).toBe(true);
    // Exactly on the boundary counts as allowed.
    expect(isSwitchAllowedNow('2026-09-01T01:00:00.000Z', 60, NOW)).toBe(true);
    // 59 minutes away → inside the window.
    expect(isSwitchAllowedNow('2026-09-01T00:59:00.000Z', 60, NOW)).toBe(false);
    // Already started.
    expect(isSwitchAllowedNow('2026-08-31T23:00:00.000Z', 0, NOW)).toBe(false);
  });

  it('a pending request outliving its notice window reads as expired', () => {
    const pending = {
      mode_switch_request_status: 'pending',
      start_time: '2026-09-01T02:00:00.000Z',
    };
    expect(switchRequestState(pending, 60, NOW)).toBe('pending');
    // Same request, read an hour and a half later.
    expect(switchRequestState(pending, 60, new Date('2026-09-01T01:30:00.000Z'))).toBe('expired');
    expect(switchRequestState({ mode_switch_request_status: null }, 60, NOW)).toBe('none');
    expect(switchRequestState({ mode_switch_request_status: 'declined' }, 60, NOW)).toBe('none');
  });
});

// ── host switches directly ───────────────────────────────────────────────────

describe('MeetingModeSwitchService.switchToOnline (host)', () => {
  it('switches a face-to-face booking to a Meet link', async () => {
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res.ok).toBe(true);
    expect(res.data?.videoUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(claimPatch(updates)).toMatchObject({ location_mode_override: 'online' });
    expect(updates.some((u) => u.video_url === 'https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(patchEventToOnline).toHaveBeenCalledOnce();
    // Decision 9: exactly one email, and it is NOT a cancellation.
    expect(sendSwitchedEmails).toHaveBeenCalledOnce();
    expect(sendSwitchedEmails.mock.calls[0][0]).toMatchObject({
      switchedBy: 'host',
      locationMode: 'online',
      previousStartTime: null,
    });
  });

  it('a mode-only switch does not bump reschedule_count (craft decision A)', async () => {
    const { db, updates } = makeDb();
    await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', { actorProfileId: HOST }, {
      now: NOW,
    });

    const patch = claimPatch(updates) as Record<string, unknown>;
    expect(patch).not.toHaveProperty('reschedule_count');
    expect(patch).not.toHaveProperty('rescheduled_at');
    expect(patch).not.toHaveProperty('previous_start_time');
    expect(patch).not.toHaveProperty('start_time');
    // And Google was told to add conferencing WITHOUT moving the event.
    expect(patchEventToOnline.mock.calls[0][3]).toEqual({});
  });

  it('re-requesting the SAME instant in a different string form is not a move', async () => {
    // Postgres hands back '…+00:00'; the engine returns '…Z'. String-comparing
    // those would read an unchanged time as a move and bump reschedule_count.
    const { db, updates } = makeDb();
    await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: '2026-09-02T04:30:00.000Z', now: NOW },
    );
    expect(claimPatch(updates)).not.toHaveProperty('reschedule_count');
  });

  it('a switch that also moves the meeting bumps reschedule_count once', async () => {
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: '2026-09-02T06:30:00.000Z', now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(res.data?.timeMoved).toBe(true);
    expect(claimPatch(updates)).toMatchObject({
      location_mode_override: 'online',
      start_time: '2026-09-02T06:30:00.000Z',
      previous_start_time: START,
      reschedule_count: 1,
    });
    // Decision 6 on Google's side: conferencing AND the new time in ONE call.
    expect(patchEventToOnline.mock.calls[0][3]).toMatchObject({
      startIso: '2026-09-02T06:30:00.000Z',
      endIso: '2026-09-02T07:00:00.000Z',
    });
  });

  it('settles an open visitor request when the host just switches directly', async () => {
    const { db, updates } = makeDb({
      booking: makeBooking({
        mode_switch_requested_by: 'attendee',
        mode_switch_requested_at: '2026-08-31T09:00:00.000Z',
        mode_switch_request_status: 'pending',
      }),
    });
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res.ok).toBe(true);
    // Otherwise the pending badge outlives the thing it asked for: a second
    // attempt is refused ALREADY_ONLINE, so nothing else would ever clear it.
    expect(claimPatch(updates)).toMatchObject({ mode_switch_request_status: 'approved' });
  });

  it('leaves the request columns alone when there was no request', async () => {
    const { db, updates } = makeDb();
    await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', { actorProfileId: HOST }, {
      now: NOW,
    });
    expect(claimPatch(updates)).not.toHaveProperty('mode_switch_request_status');
  });

  it('refuses a caller who is neither the host nor a super admin', async () => {
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: 'someone-else',
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(updates).toHaveLength(0);
    expect(patchEventToOnline).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller outright', async () => {
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {}, { now: NOW });
    expect(res).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(updates).toHaveLength(0);
  });

  it('lets a super admin switch a booking they do not host', async () => {
    const { db } = makeDb({
      profile: { is_super_admin: true, full_name: 'Admin', email: 'admin@jkkn.ac.in' },
    });
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: 'super-1',
    }, { now: NOW });
    expect(res.ok).toBe(true);
  });

  it('blocks with the REAL reason when the calendar is not connected (decision 7)', async () => {
    getConnection.mockResolvedValue(null);
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'CALENDAR_NOT_CONNECTED' });
    expect(updates).toHaveLength(0);
    expect(patchEventToOnline).not.toHaveBeenCalled();
  });

  it('blocks on a BROKEN connection too, not just a missing one', async () => {
    getConnection.mockResolvedValue({ status: 'broken' });
    const { db } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });
    expect(res).toMatchObject({ ok: false, error: 'CALENDAR_NOT_CONNECTED' });
  });

  it('refuses inside the notice window (decision 8)', async () => {
    const { db, updates } = makeDb({
      booking: makeBooking({ start_time: '2026-09-01T00:30:00.000Z' }),
    });
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'TOO_LATE' });
    expect(updates).toHaveLength(0);
  });

  it('refuses a booking that is already online', async () => {
    getMeetingType.mockResolvedValue({ ...MEETING_TYPE, location_mode: 'online' });
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'ALREADY_ONLINE' });
    expect(updates).toHaveLength(0);
  });

  it('switches a PHONE booking too (ruling 1, 2026-08-21)', async () => {
    // The gap this closes: phone is the LARGER population (95 live types / 95
    // hosts against 141 in-person types / 110 hosts) and was refused outright
    // until the Director decided it. A phone call becomes a video call exactly
    // as a face-to-face meeting does — same claim, same Google patch, same one
    // email.
    getMeetingType.mockResolvedValue({ ...MEETING_TYPE, location_mode: 'phone' });
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res.ok).toBe(true);
    expect(res.data?.videoUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(claimPatch(updates)).toMatchObject({ location_mode_override: 'online' });
    expect(patchEventToOnline).toHaveBeenCalledOnce();
    expect(sendSwitchedEmails).toHaveBeenCalledOnce();
    // Still mode-only: switching a phone call must not look like a reschedule.
    expect(claimPatch(updates)).not.toHaveProperty('reschedule_count');
  });

  it('refuses an unrecognised source mode instead of defaulting it to in_person', async () => {
    getMeetingType.mockResolvedValue({ ...MEETING_TYPE, location_mode: 'hologram' });
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'UNSUPPORTED_SOURCE_MODE' });
    expect(updates).toHaveLength(0);
  });

  it('refuses a booking with no Google event to upgrade', async () => {
    const { db, updates } = makeDb({ booking: makeBooking({ google_event_id: null }) });
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'NO_CALENDAR_EVENT' });
    expect(updates).toHaveLength(0);
  });
});

// ── all-or-nothing (decision 6) ──────────────────────────────────────────────

describe('MeetingModeSwitchService — all-or-nothing', () => {
  it('rolls everything back when Google returns no Meet link (craft decision D)', async () => {
    patchEventToOnline.mockResolvedValue({ ok: true, meetUrl: null });
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: '2026-09-02T06:30:00.000Z', now: NOW },
    );

    expect(res).toMatchObject({ ok: false, error: 'NO_MEET_LINK' });
    // The PATCH landed, so Google carries the change too — it must be undone
    // there as well, and put back at the ORIGINAL time since this one moved.
    expect(revertEventFromOnline).toHaveBeenCalledOnce();
    expect(revertEventFromOnline.mock.calls[0][3]).toMatchObject({
      startIso: START,
      endIso: END,
    });
    // The claim happened, then was undone to the EXACT prior values.
    expect(revertPatch(updates)).toMatchObject({
      location_mode_override: null,
      start_time: START,
      end_time: END,
      previous_start_time: null,
      rescheduled_at: null,
      reschedule_count: 0,
      video_url: null,
    });
    // No link was ever recorded, and nobody was emailed about a switch that
    // did not happen.
    expect(updates.some((u) => typeof u.video_url === 'string')).toBe(false);
    expect(sendSwitchedEmails).not.toHaveBeenCalled();
  });

  it('rolls back when the Google patch itself fails', async () => {
    patchEventToOnline.mockResolvedValue({ ok: false, meetUrl: null });
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'GOOGLE_FAILED' });
    expect(revertPatch(updates)).toMatchObject({ location_mode_override: null });
    expect(sendSwitchedEmails).not.toHaveBeenCalled();
  });

  it('rolls back when the Google call throws rather than returning', async () => {
    patchEventToOnline.mockRejectedValue(new Error('network down'));
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'GOOGLE_FAILED' });
    expect(revertPatch(updates)).toMatchObject({ location_mode_override: null });
  });

  it('changes NOTHING when the slot was taken underneath us', async () => {
    // The guarded claim matched no row — someone moved or cancelled it.
    const { db, updates } = makeDb({ claim: { data: null, error: null } });
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'SLOT_TAKEN' });
    // Google was never called, so there is nothing to undo and no revert write.
    expect(patchEventToOnline).not.toHaveBeenCalled();
    expect(revertPatch(updates)).toBeUndefined();
    expect(sendSwitchedEmails).not.toHaveBeenCalled();
  });

  it('maps the 23P01 exclusion violation to SLOT_TAKEN', async () => {
    const { db } = makeDb({
      claim: { data: null, error: { code: '23P01', message: 'conflicting key value' } },
    });
    const res = await MeetingModeSwitchService.switchToOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { newStart: '2026-09-02T06:30:00.000Z', now: NOW },
    );

    expect(res).toMatchObject({ ok: false, error: 'SLOT_TAKEN' });
    expect(patchEventToOnline).not.toHaveBeenCalled();
  });

  it('rolls back when the Meet link cannot be written to the booking', async () => {
    const { db, updates } = makeDb({
      plainUpdate: { error: { message: 'connection reset' } },
    });
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'INTERNAL' });
    expect(revertPatch(updates)).toMatchObject({ location_mode_override: null });
    // Google had already been patched here too, so the rollback reaches it.
    expect(revertEventFromOnline).toHaveBeenCalledOnce();
    expect(sendSwitchedEmails).not.toHaveBeenCalled();
  });

  // ── the PATCH landed but carried no link ───────────────────────────────────
  // These three cover the branch the first verifier flagged: patched.ok is TRUE
  // here, so Google has already been changed AND has already emailed the
  // visitor. Reverting only the database would leave the two systems disagreeing
  // about a meeting the visitor has already been told about.

  it('re-reads the event once, and CONTINUES when the link has appeared', async () => {
    // Google routinely provisions conferenceData a moment after the PATCH
    // answers. That is not a failure — asking again is the whole fix.
    patchEventToOnline.mockResolvedValue({ ok: true, meetUrl: null });
    getEvent.mockResolvedValue({
      startIso: START,
      endIso: END,
      meetUrl: 'https://meet.google.com/late-link-xyz',
    });

    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(getEvent).toHaveBeenCalledOnce();
    expect(res).toMatchObject({ ok: true });
    expect(res.data?.videoUrl).toBe('https://meet.google.com/late-link-xyz');
    // Nothing was rolled back, on either side.
    expect(revertEventFromOnline).not.toHaveBeenCalled();
    expect(revertPatch(updates)).toBeUndefined();
    // The late link is the one recorded and the one emailed.
    expect(updates.some((u) => u.video_url === 'https://meet.google.com/late-link-xyz')).toBe(true);
    expect(sendSwitchedEmails.mock.calls[0][0]).toMatchObject({
      videoUrl: 'https://meet.google.com/late-link-xyz',
    });
  });

  it('reverts GOOGLE FIRST, then the row, when the re-read still finds no link', async () => {
    patchEventToOnline.mockResolvedValue({ ok: true, meetUrl: null });
    getEvent.mockResolvedValue({ startIso: START, endIso: END, meetUrl: null });

    const { db, updates } = makeDb();
    // Order, not just outcome: at the moment Google is undone, the only write
    // so far must still be the claim — i.e. the row has NOT been restored yet.
    let updatesWhenGoogleReverted = -1;
    revertEventFromOnline.mockImplementation(async () => {
      updatesWhenGoogleReverted = updates.length;
      return true;
    });

    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'NO_MEET_LINK' });
    expect(getEvent).toHaveBeenCalledOnce();
    expect(revertEventFromOnline).toHaveBeenCalledOnce();
    expect(updatesWhenGoogleReverted).toBe(1); // the claim, and nothing else
    // …and the row is restored afterwards.
    expect(revertPatch(updates)).toMatchObject({ location_mode_override: null });
    expect(sendSwitchedEmails).not.toHaveBeenCalled();
  });

  it('names the inconsistency when the GOOGLE revert itself fails', async () => {
    patchEventToOnline.mockResolvedValue({ ok: true, meetUrl: null });
    getEvent.mockResolvedValue({ startIso: START, endIso: END, meetUrl: null });
    revertEventFromOnline.mockResolvedValue(false);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    // A distinct code — NOT NO_MEET_LINK, which would imply a clean rollback.
    expect(res).toMatchObject({ ok: false, error: 'GOOGLE_OUT_OF_SYNC' });
    // The row is still restored: "online with no link" is the one state
    // decision 6 exists to prevent, so it is never what we keep.
    expect(revertPatch(updates)).toMatchObject({ location_mode_override: null });
    // Loud, and carrying both identifiers a human needs to go find the event.
    const line = logged.mock.calls.map((c) => String(c[0])).join('\n');
    expect(line).toContain('GOOGLE ROLLBACK FAILED');
    expect(line).toContain('bk-abc');
    expect(line).toContain('gcal-evt-1');
    logged.mockRestore();
  });

  it('does NOT touch Google when the PATCH itself never applied', async () => {
    // Branch (a): Google was never changed, so the row alone is the whole
    // rollback. Undoing conferencing that was never added would be noise —
    // and with sendUpdates=all it would mail the visitor for nothing.
    patchEventToOnline.mockResolvedValue({ ok: false, meetUrl: null });
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchToOnline(db, 'bk-abc', {
      actorProfileId: HOST,
    }, { now: NOW });

    expect(res).toMatchObject({ ok: false, error: 'GOOGLE_FAILED' });
    expect(getEvent).not.toHaveBeenCalled();
    expect(revertEventFromOnline).not.toHaveBeenCalled();
    expect(revertPatch(updates)).toMatchObject({ location_mode_override: null });
  });
});

// ── visitor asks, host decides ───────────────────────────────────────────────

describe('MeetingModeSwitchService.requestSwitchToOnline (visitor)', () => {
  it('lets a visitor on a PHONE booking ask, now that phone is decided', async () => {
    // The two gates must move together. If applySwitch accepted phone while
    // requestSwitchToOnline still refused it, a visitor holding a phone booking
    // would be told "no" about something their host can do.
    getMeetingType.mockResolvedValue({ ...MEETING_TYPE, location_mode: 'phone' });
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.requestSwitchToOnline(db, 'bk-abc', TOKEN, {
      now: NOW,
    });

    expect(res.ok).toBe(true);
    expect(res.data?.pending).toBe(true);
    expect(updates[0]).toMatchObject({ mode_switch_request_status: 'pending' });
    // Still only a REQUEST (decision 4) — nothing about the booking changed.
    expect(updates[0]).not.toHaveProperty('location_mode_override');
  });

  it('still refuses an unrecognised mode from the visitor path (both gates)', async () => {
    getMeetingType.mockResolvedValue({ ...MEETING_TYPE, location_mode: 'hologram' });
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.requestSwitchToOnline(db, 'bk-abc', TOKEN, {
      now: NOW,
    });

    expect(res).toMatchObject({ ok: false, error: 'UNSUPPORTED_SOURCE_MODE' });
    expect(updates).toHaveLength(0);
  });

  it('records a PENDING request and mutates nothing else (decision 4)', async () => {
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.requestSwitchToOnline(db, 'bk-abc', TOKEN, {
      now: NOW,
    });

    expect(res.ok).toBe(true);
    expect(res.data?.pending).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      mode_switch_requested_by: 'attendee',
      mode_switch_requested_at: NOW.toISOString(),
      mode_switch_requested_start: null,
      mode_switch_request_status: 'pending',
    });
    // The booking itself is untouched: no mode, no time, no link, no email.
    expect(updates[0]).not.toHaveProperty('location_mode_override');
    expect(updates[0]).not.toHaveProperty('start_time');
    expect(updates[0]).not.toHaveProperty('video_url');
    expect(patchEventToOnline).not.toHaveBeenCalled();
    expect(sendSwitchedEmails).not.toHaveBeenCalled();
  });

  it('carries a requested new time without applying it', async () => {
    const { db, updates } = makeDb();
    await MeetingModeSwitchService.requestSwitchToOnline(db, 'bk-abc', TOKEN, {
      newStart: '2026-09-02T06:30:00.000Z',
      now: NOW,
    });

    expect(updates[0]).toMatchObject({
      mode_switch_requested_start: '2026-09-02T06:30:00.000Z',
      mode_switch_request_status: 'pending',
    });
    expect(updates[0]).not.toHaveProperty('start_time');
  });

  it('refuses a wrong cancel_token with the same answer as an unknown booking', async () => {
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.requestSwitchToOnline(db, 'bk-abc', 'guessed', {
      now: NOW,
    });
    expect(res).toMatchObject({ ok: false, error: 'NOT_FOUND' });
    expect(updates).toHaveLength(0);

    const missing = makeDb({ booking: null });
    const res2 = await MeetingModeSwitchService.requestSwitchToOnline(
      missing.db,
      'bk-nope',
      TOKEN,
      { now: NOW },
    );
    expect(res2).toMatchObject({ ok: false, error: 'NOT_FOUND' });
  });

  it('refuses inside the notice window — check one of two (craft decision C)', async () => {
    const { db, updates } = makeDb({
      booking: makeBooking({ start_time: '2026-09-01T00:30:00.000Z' }),
    });
    const res = await MeetingModeSwitchService.requestSwitchToOnline(db, 'bk-abc', TOKEN, {
      now: NOW,
    });

    expect(res).toMatchObject({ ok: false, error: 'TOO_LATE' });
    expect(updates).toHaveLength(0);
  });

  it('tells the visitor the real reason when the host has no calendar', async () => {
    getConnection.mockResolvedValue(null);
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.requestSwitchToOnline(db, 'bk-abc', TOKEN, {
      now: NOW,
    });

    expect(res).toMatchObject({ ok: false, error: 'CALENDAR_NOT_CONNECTED' });
    expect(updates).toHaveLength(0);
  });
});

describe('MeetingModeSwitchService.resolveSwitchRequest (host decides)', () => {
  const pendingBooking = () =>
    makeBooking({
      mode_switch_requested_by: 'attendee',
      mode_switch_requested_at: '2026-08-31T09:00:00.000Z',
      mode_switch_request_status: 'pending',
    });

  it('approval applies the switch and marks the request approved', async () => {
    const { db, updates } = makeDb({ booking: pendingBooking() });
    const res = await MeetingModeSwitchService.resolveSwitchRequest(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      'approve',
      { now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(res.data?.videoUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(claimPatch(updates)).toMatchObject({
      location_mode_override: 'online',
      mode_switch_request_status: 'approved',
      mode_switch_requested_start: null,
    });
    // The visitor asked, so the email says so.
    expect(sendSwitchedEmails.mock.calls[0][0]).toMatchObject({ switchedBy: 'attendee' });
  });

  it('approval also applies the time the visitor asked for', async () => {
    const { db, updates } = makeDb({
      booking: makeBooking({
        mode_switch_requested_by: 'attendee',
        mode_switch_requested_at: '2026-08-31T09:00:00.000Z',
        mode_switch_request_status: 'pending',
        mode_switch_requested_start: '2026-09-02T06:30:00.000Z',
      }),
    });
    const res = await MeetingModeSwitchService.resolveSwitchRequest(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      'approve',
      { now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(claimPatch(updates)).toMatchObject({
      start_time: '2026-09-02T06:30:00.000Z',
      previous_start_time: START,
      reschedule_count: 1,
    });
  });

  it('refuses approval once the notice window has closed — check two of two', async () => {
    // The request was made in good time; the host is approving too late.
    const { db, updates } = makeDb({
      booking: makeBooking({
        mode_switch_requested_by: 'attendee',
        mode_switch_requested_at: '2026-08-31T09:00:00.000Z',
        mode_switch_request_status: 'pending',
      }),
    });
    const res = await MeetingModeSwitchService.resolveSwitchRequest(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      'approve',
      // 30 minutes before a meeting whose type wants 60 minutes' notice.
      { now: new Date('2026-09-02T04:00:00.000Z') },
    );

    expect(res).toMatchObject({ ok: false, error: 'NO_REQUEST' });
    expect(updates).toHaveLength(0);
    expect(patchEventToOnline).not.toHaveBeenCalled();
  });

  it('an expired request behaves as declined (decision B)', async () => {
    const expired = makeBooking({
      mode_switch_requested_by: 'attendee',
      mode_switch_requested_at: '2026-08-31T09:00:00.000Z',
      mode_switch_request_status: 'pending',
      start_time: '2026-08-31T10:00:00.000Z', // already in the past
    });
    expect(switchRequestState(expired, 60, NOW)).toBe('expired');

    const { db, updates } = makeDb({ booking: expired });
    const res = await MeetingModeSwitchService.resolveSwitchRequest(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      'approve',
      { now: NOW },
    );
    expect(res).toMatchObject({ ok: false, error: 'NO_REQUEST' });
    expect(updates).toHaveLength(0);
  });

  it('declining clears the request without touching the booking', async () => {
    const { db, updates } = makeDb({ booking: pendingBooking() });
    const res = await MeetingModeSwitchService.resolveSwitchRequest(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      'decline',
      { now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(updates).toEqual([
      { mode_switch_request_status: 'declined', mode_switch_requested_start: null },
    ]);
    expect(patchEventToOnline).not.toHaveBeenCalled();
    expect(sendSwitchedEmails).not.toHaveBeenCalled();
  });

  it('refuses when there is no request at all', async () => {
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.resolveSwitchRequest(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      'approve',
      { now: NOW },
    );
    expect(res).toMatchObject({ ok: false, error: 'NO_REQUEST' });
    expect(updates).toHaveLength(0);
  });

  it('refuses a non-host trying to approve someone else’s request', async () => {
    const { db, updates } = makeDb({ booking: pendingBooking() });
    const res = await MeetingModeSwitchService.resolveSwitchRequest(
      db,
      'bk-abc',
      { actorProfileId: 'stranger' },
      'approve',
      { now: NOW },
    );
    expect(res).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(updates).toHaveLength(0);
  });
});

// ── host turns a video meeting back (ruling 2, 2026-08-21) ───────────────────
//
// Until this existed the switch was one-way: a host who moved a meeting online
// by mistake, or whose visitor turned out to be on campus after all, had no way
// back except cancel + rebook. The revert/revertBoth paths in the service are
// FAILURE ROLLBACK — they undo a half-applied switch — and are not this.

describe('MeetingModeSwitchService.switchBackFromOnline (host only)', () => {
  const MEET = 'https://meet.google.com/abc-defg-hij';

  /** A booking that is online BECAUSE the forward switch set the override. */
  const onlineBooking = (over: Record<string, unknown> = {}) =>
    makeBooking({ location_mode_override: 'online', video_url: MEET, ...over });

  /** The claim: the update that CLEARS the override. */
  const backClaim = (updates: Record<string, unknown>[]) =>
    updates.find((u) => 'location_mode_override' in u && u.location_mode_override === null);
  /** The rollback: the update that puts 'online' back. */
  const backRestore = (updates: Record<string, unknown>[]) =>
    updates.find((u) => u.location_mode_override === 'online');

  it('clears the override and the Meet link, and emails both sides', async () => {
    const { db, updates } = makeDb({ booking: onlineBooking() });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(res.data?.videoUrl).toBeNull();
    expect(backClaim(updates)).toMatchObject({
      location_mode_override: null,
      video_url: null,
    });
    // Google was told to strip the conferencing off the SAME event.
    expect(revertEventFromOnline).toHaveBeenCalledOnce();
    expect(revertEventFromOnline.mock.calls[0][2]).toBe('gcal-evt-1');
    expect(sendSwitchedBackEmails).toHaveBeenCalledOnce();
    expect(sendSwitchedBackEmails.mock.calls[0][0]).toMatchObject({
      locationMode: 'in_person',
      videoUrl: null,
    });
    // And it is NOT the "moved online" mail.
    expect(sendSwitchedEmails).not.toHaveBeenCalled();
  });

  it('a phone-typed booking goes back to a PHONE call, not to in person', async () => {
    // The mode it lands in is the TYPE's own mode with the override gone. Get
    // this wrong and 95 hosts' visitors are told to travel to a phone call.
    getMeetingType.mockResolvedValue({ ...MEETING_TYPE, location_mode: 'phone' });
    const { db } = makeDb({ booking: onlineBooking() });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(sendSwitchedBackEmails.mock.calls[0][0]).toMatchObject({ locationMode: 'phone' });
  });

  it('never moves the meeting, so reschedule_count is untouched (decision A)', async () => {
    const { db, updates } = makeDb({
      booking: onlineBooking({ reschedule_count: 2, rescheduled_at: '2026-08-30T00:00:00.000Z' }),
    });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { now: NOW },
    );

    expect(res.ok).toBe(true);
    expect(res.data?.timeMoved).toBe(false);
    // No update anywhere in the flow may carry a scheduling column.
    for (const patch of updates) {
      expect(patch).not.toHaveProperty('reschedule_count');
      expect(patch).not.toHaveProperty('rescheduled_at');
      expect(patch).not.toHaveProperty('previous_start_time');
      expect(patch).not.toHaveProperty('start_time');
      expect(patch).not.toHaveProperty('end_time');
    }
    // Google was told to strip conferencing WITHOUT a new time.
    expect(revertEventFromOnline.mock.calls[0][3]).toBeUndefined();
  });

  it('refuses a NON-host holding a perfectly valid booking id', async () => {
    // Ruling 2 is the whole point: a visitor may ASK to go online, never to
    // come back off it. Hiding the button is not the control — this is.
    const { db, updates } = makeDb({ booking: onlineBooking() });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: 'someone-else' },
      { now: NOW },
    );

    expect(res).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(updates).toHaveLength(0);
    expect(revertEventFromOnline).not.toHaveBeenCalled();
    expect(sendSwitchedBackEmails).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller outright', async () => {
    const { db, updates } = makeDb({ booking: onlineBooking() });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: null },
      { now: NOW },
    );

    expect(res).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect(updates).toHaveLength(0);
  });

  it('lets a super admin switch back a booking they do not host', async () => {
    const { db } = makeDb({
      booking: onlineBooking(),
      profile: { is_super_admin: true, full_name: 'Admin', email: 'admin@jkkn.ac.in' },
    });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: 'admin-1' },
      { now: NOW },
    );

    expect(res.ok).toBe(true);
  });

  it('refuses a booking that is not a video call at all', async () => {
    const { db, updates } = makeDb();
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { now: NOW },
    );

    expect(res).toMatchObject({ ok: false, error: 'NOT_ONLINE' });
    expect(updates).toHaveLength(0);
  });

  it('refuses a booking that is online because its TYPE is online', async () => {
    // location_mode_override's CHECK admits only NULL or 'online', so one
    // booking cannot be pulled out of an online type. Named honestly rather
    // than failing in a way that reads like a bug.
    getMeetingType.mockResolvedValue({ ...MEETING_TYPE, location_mode: 'online' });
    const { db, updates } = makeDb({ booking: onlineBooking() });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { now: NOW },
    );

    expect(res).toMatchObject({ ok: false, error: 'ONLINE_BY_TYPE' });
    expect(updates).toHaveLength(0);
    expect(revertEventFromOnline).not.toHaveBeenCalled();
  });

  it('refuses inside the notice window — travel time is the reason it matters', async () => {
    const { db, updates } = makeDb({ booking: onlineBooking() });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      // 30 minutes before a meeting with a 60-minute notice window.
      { now: new Date('2026-09-02T04:00:00.000Z') },
    );

    expect(res).toMatchObject({ ok: false, error: 'TOO_LATE' });
    expect(updates).toHaveLength(0);
  });

  it('blocks with the REAL reason when the calendar is not connected', async () => {
    getConnection.mockResolvedValue({ status: 'broken' });
    const { db, updates } = makeDb({ booking: onlineBooking() });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { now: NOW },
    );

    expect(res).toMatchObject({ ok: false, error: 'CALENDAR_NOT_CONNECTED' });
    expect(updates).toHaveLength(0);
  });

  it('changes NOTHING when the booking moved underneath us', async () => {
    const { db } = makeDb({
      booking: onlineBooking(),
      claim: { data: null, error: null },
    });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { now: NOW },
    );

    expect(res).toMatchObject({ ok: false, error: 'SLOT_TAKEN' });
    expect(revertEventFromOnline).not.toHaveBeenCalled();
    expect(sendSwitchedBackEmails).not.toHaveBeenCalled();
  });

  // ── all-or-nothing, in this direction too ──────────────────────────────────

  it('puts the row back exactly as it was when Google refuses', async () => {
    revertEventFromOnline.mockResolvedValue(false);
    const { db, updates } = makeDb({ booking: onlineBooking() });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { now: NOW },
    );

    // The PATCH never applied, so restoring the row makes both systems agree
    // and the honest answer is "nothing was changed".
    expect(res).toMatchObject({ ok: false, error: 'GOOGLE_FAILED' });
    expect(backRestore(updates)).toMatchObject({
      location_mode_override: 'online',
      video_url: MEET,
    });
    expect(sendSwitchedBackEmails).not.toHaveBeenCalled();
  });

  it('rolls back when the Google call THROWS rather than returning false', async () => {
    revertEventFromOnline.mockRejectedValue(new Error('socket hang up'));
    const { db, updates } = makeDb({ booking: onlineBooking() });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { now: NOW },
    );

    expect(res).toMatchObject({ ok: false, error: 'GOOGLE_FAILED' });
    expect(backRestore(updates)).toMatchObject({ location_mode_override: 'online' });
  });

  it('names the inconsistency when the row cannot be put back either', async () => {
    // Google refused AND the rollback write failed: the booking now reads
    // face-to-face while the calendar event still carries the video call.
    // Reporting "nothing was changed" here would be a plain lie — the same
    // reasoning GOOGLE_OUT_OF_SYNC exists for on the forward path.
    revertEventFromOnline.mockResolvedValue(false);
    const { db } = makeDb({
      booking: onlineBooking(),
      plainUpdate: { error: { message: 'connection reset' } },
    });
    const res = await MeetingModeSwitchService.switchBackFromOnline(
      db,
      'bk-abc',
      { actorProfileId: HOST },
      { now: NOW },
    );

    expect(res).toMatchObject({ ok: false, error: 'GOOGLE_OUT_OF_SYNC' });
    expect(sendSwitchedBackEmails).not.toHaveBeenCalled();
  });
});
