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
 *   - move books the new time FIRST with the same people and place, then
 *     cancels the old one; an overlapping time is refused before anything is
 *     reserved; a half-made new meeting leaves the old one in place.
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
vi.mock('@/lib/services/meetings/host-scheduling-service', () => ({
  CAMPUS_TZ: 'Asia/Kolkata',
  HostSchedulingService: { scheduleDirect: (...a: unknown[]) => scheduleDirect(...a) },
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
const textOf = (res: { result: { content: { text: string }[]; isError?: boolean } }) => {
  const t = res.result.content[0].text;
  return res.result.isError ? (JSON.parse(t) as { error: string }).error : t;
};

const MEETING_UID = 'mtg_uid_abcdef12';
const OLD_START = `${FUTURE_DATE}T05:00:00.000Z`; // 10:30 India time
const OLD_END = `${FUTURE_DATE}T05:30:00.000Z`;
function doorMeeting(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uid: MEETING_UID,
    host_profile_id: OWNER,
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

describe('move_meeting', () => {
  it('books the new time with the same people and place, then cancels the old one', async () => {
    scheduleDirect.mockResolvedValue({
      ok: true,
      data: {
        uid: 'u1', bookingId: 'b1', startIso: `${FUTURE_DATE}T12:30:00.000Z`, endIso: `${FUTURE_DATE}T13:00:00.000Z`,
        videoUrl: 'https://meet.google.com/y', googleEventId: 'g2', warning: null,
      },
    });
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    expect(res.result.isError).toBeFalsy();
    const input = scheduleDirect.mock.calls[0][1];
    expect(input).toMatchObject({
      hostProfileId: OWNER,
      title: 'Parent meeting',
      startIso: `${FUTURE_DATE}T12:30:00.000Z`,
      durationMin: 30,
      locationMode: 'in_person',
      locationText: 'Principal office',
      note: 'Bring the fee receipt',
      bookedViaKeyId: KEY_ID,
    });
    expect(input.attendees.map((a: { email: string }) => a.email)).toEqual([
      'parent@gmail.com',
      'viswanathan.s@jkkn.ac.in',
    ]);
    expect(cancelBooking).toHaveBeenCalledTimes(1);
    expect(cancelBooking.mock.calls[0][1]).toBe(MEETING_UID);
    expect(cancelBooking.mock.calls[0][3]).toBe(`Moved to ${FUTURE_DATE}T18:00 (India time).`);
    // order: the new meeting exists before the old one is cancelled
    expect(scheduleDirect.mock.invocationCallOrder[0]).toBeLessThan(cancelBooking.mock.invocationCallOrder[0]);
    expect(JSON.parse(textOf(res))).toMatchObject({ booked: true, moved: true, old_uid: MEETING_UID, uid: 'u1' });
  });

  it('can change the length', async () => {
    await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00`, duration_min: 45 }));
    expect(scheduleDirect.mock.calls[0][1].durationMin).toBe(45);
  });

  it('refuses a new time that overlaps the old one, before reserving anything', async () => {
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T10:45` }));
    expect(textOf(res)).toMatch(/overlaps the current meeting/);
    expect(serviceRpc.mock.calls.filter(([fn]) => fn === 'fn_ai_booking_reserve')).toHaveLength(0);
    expect(scheduleDirect).not.toHaveBeenCalled();
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it('keeps the old meeting when the new one is only half made', async () => {
    scheduleDirect.mockResolvedValue({
      ok: true,
      data: {
        uid: 'u2', bookingId: 'b2', startIso: `${FUTURE_DATE}T12:30:00.000Z`, endIso: `${FUTURE_DATE}T13:00:00.000Z`,
        videoUrl: null, googleEventId: null, warning: 'No invitations were sent.',
      },
    });
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    const body = JSON.parse(textOf(res));
    expect(body.moved).toBe(false);
    expect(body.attention).toMatch(/was NOT cancelled/);
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it('says so when the old meeting could not be cancelled', async () => {
    cancelBooking.mockResolvedValue({ success: false, error: 'INTERNAL' });
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    const body = JSON.parse(textOf(res));
    expect(body).toMatchObject({ booked: true, moved: false, old_uid: MEETING_UID });
    expect(body.attention).toMatch(/could not be cancelled/);
  });

  it('a clash at the new time leaves the old meeting alone and offers free times', async () => {
    scheduleDirect.mockResolvedValue({ ok: false, error: { code: 'SLOT_TAKEN', message: 'Taken.' } });
    nextFreeTimes.mockResolvedValue([`${FUTURE_DATE}T13:30:00.000Z`]);
    const res = await readRpc(await call('move_meeting', { uid: MEETING_UID, start_local: `${FUTURE_DATE}T18:00` }));
    expect(textOf(res)).toBe(`Taken. Nothing was booked. Next free times (India time, use as start_local): ${FUTURE_DATE}T19:00.`);
    expect(cancelBooking).not.toHaveBeenCalled();
  });
});
