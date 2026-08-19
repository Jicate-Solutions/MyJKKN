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
  switchRequestState,
} from '@/lib/services/meetings/meeting-mode-switch';
import { MeetingModeSwitchService } from '@/lib/services/meetings/meeting-mode-switch-service';

// ── mocks ────────────────────────────────────────────────────────────────────
// Declared before vi.mock but only DEREFERENCED inside the arrow bodies, which
// run at call time. vi.mock is hoisted above these consts; a factory that read
// them eagerly would explode (PR #3127 fixed exactly that in booking-crm-bridge).

const getConnection = vi.fn();
const patchEventToOnline = vi.fn();
const sendSwitchedEmails = vi.fn();
const getMeetingType = vi.fn();
const resolveMoveContext = vi.fn();

vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  GoogleCalendarService: {
    getConnection: (...a: unknown[]) => getConnection(...a),
    patchEventToOnline: (...a: unknown[]) => patchEventToOnline(...a),
  },
}));

vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({
  MeetingBookingEmailService: {
    sendBookingSwitchedToOnlineEmails: (...a: unknown[]) => sendSwitchedEmails(...a),
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
  sendSwitchedEmails.mockResolvedValue({ attendee: { success: true }, host: { success: true } });
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
    expect(sendSwitchedEmails).not.toHaveBeenCalled();
  });
});

// ── visitor asks, host decides ───────────────────────────────────────────────

describe('MeetingModeSwitchService.requestSwitchToOnline (visitor)', () => {
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
