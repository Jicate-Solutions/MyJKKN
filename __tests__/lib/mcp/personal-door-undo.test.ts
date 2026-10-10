/**
 * cancel_meeting, move_meeting and "next free times" at the personal-key door
 * (lib/mcp/personal-door.ts; Director's rulings, 9 Oct 2026).
 *
 * What these prove, through a real MCP JSON-RPC request:
 *   - every booking the door makes is stamped with the key that made it;
 *   - a clash answers with the owner's next free times, as start_local values;
 *   - cancel and move act ONLY on a meeting this key booked for this owner:
 *     a Schedule-page meeting of the same owner, another key's meeting, another
 *     host's meeting and an unknown uid all get the same refusal;
 *   - a closed or already-started meeting, a switched-off key, and an owner
 *     without Meetings access are refused, and nothing is changed;
 *   - move moves the SAME meeting in place (same uid, same Meet link;
 *     Director 9 Oct: "Keep the same link"), counts toward the booking
 *     limits, and gives the reservation back when nothing changed; an
 *     overlapping time is refused before anything is reserved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const OWNER = '0b3b1b8e-1111-4111-8111-000000000001';
const FORGED = '0b3b1b8e-9999-4999-8999-000000000009';
const KNOWN_PERSON = '0b3b1b8e-2222-4222-8222-000000000002';
const KEY = 'jkkn_pk_' + 'b'.repeat(48);
const KEY_ID = 'key-book-1';

// ── service-role client: key lookup, booking grant, limits, invitee profiles ─
let keyRow: Record<string, unknown> | null = null;
let grantRow: Record<string, unknown> | null = null;
let ownerProfile: Record<string, unknown> = { institution_id: 'inst-1', is_super_admin: false };
let ownerRoles: unknown[] = [];
let people: { id: string; email: string; institution_id: string }[] = [];
let reserveAnswer: { data: unknown; error: unknown } = { data: { ok: true, id: 'res-1' }, error: null };
let afterReserve: (() => void) | null = null;
let keyLookupHangsAfterReserve = false;
let meetingRow: Record<string, unknown> | null = null;
/** After this many key reads the key reads as switched off (simulates a switch-off mid-request). */
let keyOffAfterReads = Infinity;
let keyReads = 0;
let reserved = false;
const serviceRpc = vi.fn(async (fn: string, _args?: Record<string, unknown>) => {
  if (fn === 'fn_ai_booking_reserve') {
    reserved = true;
    afterReserve?.();
    return reserveAnswer;
  }
  if (fn === 'fn_ai_booking_release') return { data: true, error: null };
  return { data: null, error: null };
});
const released = () => serviceRpc.mock.calls.filter(([fn]) => fn === 'fn_ai_booking_release').map(([, a]) => a);
const tablesRead: string[] = [];
const profileQueries: Array<{ ilike?: string; institution?: string }> = [];
function makeServiceClient() {
  return {
    rpc: serviceRpc,
    from: vi.fn((table: string) => {
      tablesRead.push(table);
      const f: Record<string, unknown> = {};
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.limit = vi.fn(() => b);
      b.eq = vi.fn((col: string, val: unknown) => ((f[col] = val), b));
      b.gte = vi.fn((col: string, val: unknown) => ((f[`gte:${col}`] = val), b));
      b.ilike = vi.fn((col: string, val: unknown) => ((f[`ilike:${col}`] = val), b));
      b.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
      b.maybeSingle = vi.fn(async () => {
        if (table === 'api_keys' && reserved && keyLookupHangsAfterReserve) return new Promise(() => {});
        if (table === 'api_keys' && ++keyReads > keyOffAfterReads) {
          return { data: { ...(keyRow as object), is_active: false }, error: null };
        }
        return {
        data:
          table === 'api_keys'
            ? keyRow
            : table === 'ai_personal_key_booking_grants'
              ? grantRow
              : table === 'profiles'
                ? ownerProfile
                : table === 'meeting_bookings'
                  ? meetingRow
                  : null,
        error: null,
        };
      });
      const resolve = () => {
        if (table === 'user_roles') return { data: ownerRoles, error: null };
        if (table === 'profiles') {
          const pattern = String(f['ilike:email'] ?? '');
          profileQueries.push({ ilike: pattern, institution: f.institution_id as string | undefined });
          const unescaped = pattern.replace(/\\([\\%_])/g, '$1').toLowerCase();
          const rows = people.filter(
            (r) =>
              r.email.toLowerCase() === unescaped &&
              (f.institution_id === undefined || r.institution_id === f.institution_id)
          );
          return { data: rows.slice(0, 2).map((r) => ({ id: r.id })), error: null };
        }
        return { data: null, error: null };
      };
      b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad);
      return b;
    }),
  };
}
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => makeServiceClient()),
}));

// ── the owner's own session client ─────────────────────────────────────────
let ownerIsSuper = false;
let ownerHasMeetings = true;
const userRpc = vi.fn(async (fn: string) => {
  if (fn === 'fn_ai_tool_menu') return { data: [], error: null };
  if (fn === 'is_super_admin') return { data: ownerIsSuper, error: null };
  if (fn === 'user_has_permission') return { data: ownerHasMeetings, error: null };
  return { data: null, error: null };
});
const getUserSessionClient = vi.fn(async (_userId: string) => ({ rpc: userRpc }));
vi.mock('@/lib/ai-tools/run-as-user', () => ({
  getUserSessionClient: (userId: string) => getUserSessionClient(userId),
  AccountOffError: class AccountOffError extends Error {},
}));

const logApiUsage = vi.fn();
vi.mock('@/lib/api-keys/audit-logger', () => ({
  logApiUsage: (entry: unknown) => logApiUsage(entry),
}));

// ── the booking service ────────────────────────────────────────────────────
const scheduleDirect = vi.fn();
const moveDirect = vi.fn();
vi.mock('@/lib/services/meetings/host-scheduling-service', () => ({
  CAMPUS_TZ: 'Asia/Kolkata',
  HOST_DIRECT_SOURCE: 'host-direct',
  HostSchedulingService: {
    scheduleDirect: (...a: unknown[]) => scheduleDirect(...a),
    moveDirect: (...a: unknown[]) => moveDirect(...a),
  },
}));

// ── the cancel service and the free-time finder (loaded lazily by the door) ─
const cancelBooking = vi.fn();
vi.mock('@/lib/services/meetings/native-scheduling-service', () => ({
  NativeSchedulingService: { cancelBooking: (...a: unknown[]) => cancelBooking(...a) },
}));
const nextFreeTimes = vi.fn();
vi.mock('@/lib/services/meetings/host-free-times', () => ({
  nextFreeTimes: (...a: unknown[]) => nextFreeTimes(...a),
}));

import { handlePersonalKeyRequest, isoToIndiaLocal } from '@/lib/mcp/personal-door';
import { _resetForTesting as resetRateLimiter } from '@/lib/api-keys/rate-limiter';

function rpcRequest(body: unknown): Request {
  return new Request('http://localhost/api/mcp/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify(body),
  });
}

async function readRpc(res: Response): Promise<{ result?: any; error?: any }> {
  const text = await res.text();
  if (text.trimStart().startsWith('{')) return JSON.parse(text);
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  if (!line) throw new Error(`no data line in: ${text}`);
  return JSON.parse(line.slice(5).trim());
}

const listTools = () => handlePersonalKeyRequest(rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), KEY);
const book = (args: Record<string, unknown>) =>
  handlePersonalKeyRequest(
    rpcRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'schedule_meeting', arguments: args } }),
    KEY
  );

/** A start far enough ahead that it is never "already passed". */
const FUTURE_DATE = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const FUTURE_LOCAL = `${FUTURE_DATE}T15:30`;
const GOOD_ARGS = {
  title: 'Chat with Viswanathan',
  start_local: FUTURE_LOCAL,
  duration_min: 10,
  location_mode: 'online',
  attendees: [{ email: 'viswanathan.s@jkkn.ac.in', name: 'Viswanathan S' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  tablesRead.length = 0;
  profileQueries.length = 0;
  ownerProfile = { institution_id: 'inst-1', is_super_admin: false };
  ownerRoles = [];
  people = [{ id: KNOWN_PERSON, email: 'Viswanathan.S@jkkn.ac.in', institution_id: 'inst-1' }];
  reserveAnswer = { data: { ok: true, id: 'res-1' }, error: null };
  afterReserve = null;
  reserved = false;
  keyLookupHangsAfterReserve = false;
  serviceRpc.mockImplementation(async (fn: string) => {
    if (fn === 'fn_ai_booking_reserve') {
      reserved = true;
      afterReserve?.();
      return reserveAnswer;
    }
    if (fn === 'fn_ai_booking_release') return { data: true, error: null };
    return { data: null, error: null };
  });
  resetRateLimiter();
  keyRow = {
    id: KEY_ID,
    name: 'Front desk',
    user_id: OWNER,
    institution_id: 'inst-1',
    is_active: true,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    key_kind: 'personal',
  };
  grantRow = { active: true };
  ownerIsSuper = false;
  ownerHasMeetings = true;
  scheduleDirect.mockResolvedValue({
    ok: true,
    data: {
      uid: 'u1',
      bookingId: 'b1',
      startIso: '2099-10-08T10:00:00.000Z',
      endIso: '2099-10-08T10:10:00.000Z',
      videoUrl: 'https://meet.google.com/x',
      googleEventId: 'g1',
      warning: null,
    },
  });
});

const call = (name: string, args: Record<string, unknown>) =>
  handlePersonalKeyRequest(
    rpcRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } }),
    KEY
  );
/** The answer's text; a refusal arrives as {"error": "..."}. */
const textOf = (res: { result?: any }): string => {
  const t: string = res.result.content[0].text;
  return res.result.isError ? (JSON.parse(t) as { error: string }).error : t;
};

const MEETING_UID = 'mtg_uid_abcdef12';
const OLD_START = `${FUTURE_DATE}T05:00:00.000Z`; // 10:30 India time
const OLD_END = `${FUTURE_DATE}T05:30:00.000Z`;
function doorMeeting(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uid: MEETING_UID,
    host_profile_id: OWNER,
    source: 'host-direct',
    meeting_type_id: null,
    status: 'confirmed',
    start_time: OLD_START,
    end_time: OLD_END,
    answers: {
      scheduled_by_host: true,
      title: 'Parent meeting',
      note: 'Bring the fee receipt',
      location_mode: 'in_person',
      location_text: 'Principal office',
      participants: [
        { email: 'parent@gmail.com', name: 'A Parent' },
        { email: 'viswanathan.s@jkkn.ac.in', name: 'Viswanathan S' },
      ],
      booked_via_key_id: KEY_ID,
    },
    ...over,
  };
}

beforeEach(() => {
  moveDirect.mockReset();
  moveDirect.mockResolvedValue({
    ok: true,
    data: {
      uid: MEETING_UID,
      startIso: `${FUTURE_DATE}T12:30:00.000Z`,
      endIso: `${FUTURE_DATE}T13:00:00.000Z`,
      previousStartIso: OLD_START,
      videoUrl: 'https://meet.google.com/same-link',
    },
    warning: null,
  });
  keyReads = 0;
  keyOffAfterReads = Infinity;
  meetingRow = doorMeeting();
  cancelBooking.mockResolvedValue({ success: true });
  nextFreeTimes.mockResolvedValue([]);
});

describe('tools and the stamp', () => {
  it('offers cancel_meeting and move_meeting only with booking switched on', async () => {
    const on = await readRpc(await listTools());
    expect(on.result.tools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(['schedule_meeting', 'cancel_meeting', 'move_meeting'])
    );
    grantRow = null;
    const off = await readRpc(await listTools());
    const names = off.result.tools.map((t: { name: string }) => t.name);
    expect(names).not.toContain('cancel_meeting');
    expect(names).not.toContain('move_meeting');
    const res = await readRpc(await call('cancel_meeting', { uid: MEETING_UID }));
    expect(res.result.isError).toBe(true);
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it('stamps every door booking with the key that made it', async () => {
    await readRpc(await book(GOOD_ARGS));
    expect(scheduleDirect.mock.calls[0][1].bookedViaKeyId).toBe(KEY_ID);
  });
});

describe('a clash offers the next free times', () => {
  it('lists them as start_local values and books nothing', async () => {
    scheduleDirect.mockResolvedValue({
      ok: false,
      error: { code: 'SLOT_TAKEN', message: 'You already have a meeting at that time.' },
    });
    nextFreeTimes.mockResolvedValue([`${FUTURE_DATE}T10:30:00.000Z`, `${FUTURE_DATE}T11:00:00.000Z`]);
    const res = await readRpc(await book(GOOD_ARGS));
    expect(res.result.isError).toBe(true);
    expect(textOf(res)).toBe(
      `You already have a meeting at that time. Nothing was booked. Next free times (India time, use as start_local): ${FUTURE_DATE}T16:00, ${FUTURE_DATE}T16:30.`
    );
    const [, host, opts] = nextFreeTimes.mock.calls[0];
    expect(host).toBe(OWNER);
    expect(opts).toEqual({ afterIso: `${FUTURE_DATE}T10:00:00.000Z`, durationMin: 10 });
    expect(released()).toEqual([{ p_reservation_id: 'res-1' }]);
  });

  it('still refuses plainly when no free time can be found', async () => {
    scheduleDirect.mockResolvedValue({ ok: false, error: { code: 'SLOT_TAKEN', message: 'Taken.' } });
    nextFreeTimes.mockRejectedValue(new Error('calendar down'));
    const res = await readRpc(await book(GOOD_ARGS));
    expect(textOf(res)).toBe('Taken. Nothing was booked.');
  });

  it('reads India time back correctly', () => {
    expect(isoToIndiaLocal('2026-10-09T18:45:00.000Z')).toBe('2026-10-10T00:15');
  });
});

describe('cancel_meeting', () => {
  it('a cancel whose calendar step failed answers with attention first', async () => {
    cancelBooking.mockResolvedValue({ success: true, warning: 'Its Google Calendar invite could not be marked cancelled.' });
    const res = await readRpc(await call('cancel_meeting', { uid: MEETING_UID }));
    const body = JSON.parse(textOf(res));
    expect(Object.keys(body)).toEqual(['cancelled', 'attention', 'uid']);
    expect(body.attention).toMatch(/^Cancelled, but not complete: Its Google Calendar invite/);
  });

  it('a cancel with failed invitee emails answers with attention naming them', async () => {
    cancelBooking.mockResolvedValue({ success: true, warning: 'The cancellation email could not be sent to: a@x.in.' });
    const body = JSON.parse(textOf(await readRpc(await call('cancel_meeting', { uid: MEETING_UID }))));
    expect(body.attention).toBe('Cancelled, but not complete: The cancellation email could not be sent to: a@x.in. Tell the person who asked.');
  });

  it('cancels a meeting this key booked, as the owner', async () => {
    const res = await readRpc(await call('cancel_meeting', { uid: MEETING_UID, reason: 'Parent is unwell' }));
    expect(res.result.isError).toBeFalsy();
    expect(JSON.parse(textOf(res))).toEqual({ cancelled: true, uid: MEETING_UID });
    expect(cancelBooking).toHaveBeenCalledTimes(1);
    const [, uid, auth, reason] = cancelBooking.mock.calls[0];
    expect(uid).toBe(MEETING_UID);
    expect(auth).toEqual({ actorProfileId: OWNER });
    expect(reason).toBe('Parent is unwell');
  });

  const NOT_OURS = 'This key did not book a meeting with that uid, so it cannot change it.';
  const notOurs: [string, () => void][] = [
    ['a meeting the owner made on the Schedule page', () => {
      const m = doorMeeting();
      delete (m.answers as Record<string, unknown>).booked_via_key_id;
      meetingRow = m;
    }],
    ['a meeting another key booked', () => {
      meetingRow = doorMeeting({ answers: { ...(doorMeeting().answers as object), booked_via_key_id: 'other-key' } });
    }],
    ['another host’s meeting', () => {
      meetingRow = doorMeeting({ host_profile_id: FORGED });
    }],
    ['an unknown uid', () => {
      meetingRow = null;
    }],
    ['a TYPED booking whose form answers carry a forged stamp for this key', () => {
      meetingRow = doorMeeting({ meeting_type_id: 'type-1', source: 'direct' });
    }],
    ['a booking with no type whose source is not host-direct', () => {
      meetingRow = doorMeeting({ source: 'routing-form' });
    }],
  ];
  for (const [label, arrange] of notOurs) {
    it(`refuses ${label} with the same words`, async () => {
      arrange();
      for (const tool of ['cancel_meeting', 'move_meeting']) {
        const res = await readRpc(await call(tool, { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
        expect(res.result.isError).toBe(true);
        expect(textOf(res)).toBe(NOT_OURS);
      }
      expect(cancelBooking).not.toHaveBeenCalled();
      expect(scheduleDirect).not.toHaveBeenCalled();
    });
  }

  it('refuses a meeting that is already closed or has started', async () => {
    meetingRow = doorMeeting({ status: 'cancelled' });
    expect(textOf(await readRpc(await call('cancel_meeting', { uid: MEETING_UID })))).toMatch(/already cancelled or closed/);
    meetingRow = doorMeeting({ start_time: new Date(Date.now() - 60_000).toISOString() });
    expect(textOf(await readRpc(await call('cancel_meeting', { uid: MEETING_UID })))).toMatch(/already started/);
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it('refuses when the key is switched off between reading the request and changing anything', async () => {
    keyOffAfterReads = 1; // the request's own key check passes; the re-check before cancelling does not
    const res = await readRpc(await call('cancel_meeting', { uid: MEETING_UID }));
    expect(keyReads).toBeGreaterThanOrEqual(2);
    expect(textOf(res)).toBe('Booking was switched off for this key, so nothing was changed.');
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it('refuses an owner without Meetings access', async () => {
    ownerHasMeetings = false;
    const res = await readRpc(await call('cancel_meeting', { uid: MEETING_UID }));
    expect(textOf(res)).toMatch(/no longer has access to Meetings/);
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it('rejects a malformed uid before reading anything', async () => {
    const res = await readRpc(await call('cancel_meeting', { uid: "x' OR 1=1" }));
    expect(textOf(res)).toMatch(/uid must be/);
    expect(tablesRead).not.toContain('meeting_bookings');
  });
});

describe('move_meeting (in place)', () => {
  const reserves = () => serviceRpc.mock.calls.filter(([fn]) => fn === 'fn_ai_booking_reserve');

  it('moves the same meeting, keeping its uid and Meet link', async () => {
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    expect(res.result.isError).toBeFalsy();
    expect(moveDirect).toHaveBeenCalledTimes(1);
    expect(moveDirect.mock.calls[0][1]).toEqual({
      uid: MEETING_UID,
      hostProfileId: OWNER,
      startIso: `${FUTURE_DATE}T12:30:00.000Z`,
      durationMin: 30,
      // the start and end the overlap was checked against are the compare-and-swap values
      expectedStartIso: OLD_START,
      expectedEndIso: OLD_END,
    });
    expect(JSON.parse(textOf(res))).toEqual({
      moved: true,
      uid: MEETING_UID,
      start: `${FUTURE_DATE}T12:30:00.000Z`,
      end: `${FUTURE_DATE}T13:00:00.000Z`,
      previous_start: OLD_START,
      meet_link: 'https://meet.google.com/same-link',
    });
    // nothing is booked again and nothing is cancelled
    expect(scheduleDirect).not.toHaveBeenCalled();
    expect(cancelBooking).not.toHaveBeenCalled();
    // it counts toward the limits like a booking (2 invitees)
    expect(reserves()).toHaveLength(1);
    expect(reserves()[0][1]).toMatchObject({ p_invitees: 2 });
    expect(released()).toEqual([]);
  });

  it('can change the length', async () => {
    await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00`, duration_min: 45 }));
    expect(moveDirect.mock.calls[0][1].durationMin).toBe(45);
  });

  it('refuses a new time that overlaps the old one, before reserving anything', async () => {
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T10:45` }));
    expect(textOf(res)).toMatch(/overlaps the current meeting/);
    expect(reserves()).toHaveLength(0);
    expect(moveDirect).not.toHaveBeenCalled();
  });

  it('a clash at the new time changes nothing, gives the reservation back and offers free times', async () => {
    moveDirect.mockResolvedValue({ ok: false, error: { code: 'SLOT_TAKEN', message: 'Taken.' } });
    nextFreeTimes.mockResolvedValue([`${FUTURE_DATE}T13:30:00.000Z`]);
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    expect(textOf(res)).toBe(
      `Taken. Nothing was changed. The meeting is still at its old time. Next free times (India time, use as start_local): ${FUTURE_DATE}T19:00.`
    );
    expect(released()).toEqual([{ p_reservation_id: 'res-1' }]);
  });

  it('an UNKNOWN whose update may have landed keeps the reservation counted', async () => {
    moveDirect.mockResolvedValue({
      ok: false,
      error: { code: 'UNKNOWN', message: 'MyJKKN could not confirm whether the meeting moved.' },
      mayHaveChanged: true,
    });
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    expect(res.result.isError).toBe(true);
    expect(released()).toEqual([]);
  });

  it('another move that won mid-move is reported as such, and the reservation stays counted', async () => {
    moveDirect.mockResolvedValue({
      ok: false,
      error: { code: 'CHANGED_MEANWHILE', message: 'The meeting was moved again by another change while this move ran; that later change stands. Nobody was sent this move\'s time.' },
    });
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    expect(textOf(res)).toMatch(/moved again by another change/);
    expect(released()).toEqual([]);
  });

  it('an UNKNOWN failure (nothing changed) also gives the reservation back', async () => {
    moveDirect.mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'The meeting could not be moved.' } });
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    expect(res.result.isError).toBe(true);
    expect(released()).toEqual([{ p_reservation_id: 'res-1' }]);
  });

  it('a slow move says the meeting may already be at the new time (never a duplicate)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      moveDirect.mockImplementation(() => new Promise(() => {}));
      const pending = call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` });
      await vi.advanceTimersByTimeAsync(26_000);
      const text = textOf(await readRpc(await pending));
      expect(text).toBe(
        "MyJKKN did not confirm the move in time. The meeting may already be at the new time: check the owner's Meetings inbox before trying again."
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('when Google does not accept the new time, nothing changes and the reservation is given back', async () => {
    moveDirect.mockResolvedValue({
      ok: false,
      error: { code: 'CALENDAR_FAILED', message: 'Google Calendar did not accept the new time, so nothing was changed.' },
    });
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    expect(res.result.isError).toBe(true);
    expect(textOf(res)).toMatch(/nothing was changed\. The meeting is still at its old time\./);
    expect(released()).toEqual([{ p_reservation_id: 'res-1' }]);
  });

  it('a move that half worked says so first, and keeps the reservation counted', async () => {
    moveDirect.mockResolvedValue({
      ok: true,
      data: {
        uid: MEETING_UID, startIso: `${FUTURE_DATE}T12:30:00.000Z`, endIso: `${FUTURE_DATE}T13:00:00.000Z`,
        previousStartIso: OLD_START, videoUrl: 'https://meet.google.com/same-link',
      },
      warning: 'The Google invite still shows the old time.',
    });
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    const body = JSON.parse(textOf(res));
    expect(Object.keys(body)[0]).toBe('moved');
    expect(body.attention).toMatch(/^Moved, but not complete: The Google invite still shows the old time\./);
    expect(released()).toEqual([]);
  });

  it('refuses when the key is switched off before the move, and gives the reservation back', async () => {
    keyOffAfterReads = 1;
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    expect(textOf(res)).toBe('Booking was switched off for this key, so nothing was changed.');
    expect(moveDirect).not.toHaveBeenCalled();
    expect(released()).toEqual([{ p_reservation_id: 'res-1' }]);
  });

  it('a cancel that won mid-move is reported as such, and the reservation stays counted', async () => {
    moveDirect.mockResolvedValue({
      ok: false,
      error: {
        code: 'CANCELLED_MEANWHILE',
        message: 'The meeting was cancelled while it was being moved. The cancellation stands; nobody was sent the new time.',
      },
    });
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    expect(textOf(res)).toBe(
      'The meeting was cancelled while it was being moved. The cancellation stands; nobody was sent the new time.'
    );
    expect(released()).toEqual([]);
  });

  it('refuses a new start in the past, even by a minute (no grace for moves)', async () => {
    const past = new Date(Date.now() - 60_000);
    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(past).replace(', ', 'T');
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: local }));
    expect(textOf(res)).toMatch(/already passed/);
    expect(reserves()).toHaveLength(0);
  });

  it('a meeting changed or cancelled meanwhile: says this request changed nothing, not where it is', async () => {
    moveDirect.mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: 'That meeting was cancelled meanwhile, so it was not moved.' } });
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    expect(textOf(res)).toBe(
      "That meeting was cancelled meanwhile, so it was not moved. This request changed nothing; check the owner's Meetings inbox for where it is now."
    );
    expect(released()).toEqual([{ p_reservation_id: 'res-1' }]);
  });

  it('rejects a bad time before reserving anything', async () => {
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: 'tomorrow 3pm' }));
    expect(textOf(res)).toMatch(/start_local must be India time/);
    expect(reserves()).toHaveLength(0);
  });
});
