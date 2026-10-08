/**
 * schedule_meeting at the personal-key door (lib/mcp/personal-door.ts, 8 Oct 2026).
 *
 * What these prove, through a real MCP JSON-RPC request:
 *   - the tool exists only for a key whose owner switched booking on;
 *   - it always books for the KEY OWNER — nothing the caller sends can name a
 *     different host;
 *   - India wall-clock time becomes the right instant;
 *   - an owner without Meetings access is refused and nothing is booked;
 *   - bad arguments and a taken slot are refused in plain words;
 *   - the audit log records the call without its arguments.
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
const serviceRpc = vi.fn(async (fn: string, _args?: Record<string, unknown>) => {
  if (fn === 'fn_ai_booking_reserve') {
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
      b.maybeSingle = vi.fn(async () => ({
        data:
          table === 'api_keys'
            ? keyRow
            : table === 'ai_personal_key_booking_grants'
              ? grantRow
              : table === 'profiles'
                ? ownerProfile
                : null,
        error: null,
      }));
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

import { handlePersonalKeyRequest, indiaLocalToIso, parseScheduleArgs } from '@/lib/mcp/personal-door';
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

describe('who sees the tool', () => {
  it('is not offered, and cannot be run, when the owner never switched booking on', async () => {
    grantRow = null;
    const list = await readRpc(await listTools());
    expect(list.result.tools.map((t: { name: string }) => t.name)).not.toContain('schedule_meeting');

    const res = await readRpc(await book(GOOD_ARGS));
    expect(res.result.isError).toBe(true);
    expect(scheduleDirect).not.toHaveBeenCalled();
  });

  it('is not offered when booking was switched off again', async () => {
    grantRow = { active: false };
    const list = await readRpc(await listTools());
    expect(list.result.tools.map((t: { name: string }) => t.name)).not.toContain('schedule_meeting');
  });

  it('is offered for a key the owner allowed to book', async () => {
    const list = await readRpc(await listTools());
    expect(list.result.tools.map((t: { name: string }) => t.name)).toContain('schedule_meeting');
    expect(tablesRead).toContain('ai_personal_key_booking_grants');
  });
});

describe('booking', () => {
  it('books for the key OWNER at the right instant, whatever host the caller names', async () => {
    const res = await readRpc(
      await book({ ...GOOD_ARGS, host_profile_id: FORGED, hostProfileId: FORGED, owner: FORGED })
    );
    expect(res.result.isError).toBeFalsy();
    expect(scheduleDirect).toHaveBeenCalledTimes(1);
    const input = scheduleDirect.mock.calls[0][1];
    expect(input.hostProfileId).toBe(OWNER);
    // 15:30 India time = 10:00 UTC
    expect(input.startIso).toBe(`${FUTURE_DATE}T10:00:00.000Z`);
    expect(input.durationMin).toBe(10);
    expect(input.locationMode).toBe('online');
    // a MyJKKN person is linked by email, case-insensitively
    expect(input.attendees).toEqual([
      { email: 'viswanathan.s@jkkn.ac.in', name: 'Viswanathan S', profileId: KNOWN_PERSON },
    ]);
    // matched case-insensitively, within the owner's own college
    expect(profileQueries[0]).toEqual({ ilike: 'viswanathan.s@jkkn.ac.in', institution: 'inst-1' });
    const text = JSON.parse(res.result.content[0].text);
    expect(text).toMatchObject({ booked: true, uid: 'u1', meet_link: 'https://meet.google.com/x', warning: null });
  });

  it('refuses an owner who no longer has Meetings access, and books nothing', async () => {
    ownerHasMeetings = false;
    const res = await readRpc(await book(GOOD_ARGS));
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/no longer has access to Meetings/);
    expect(scheduleDirect).not.toHaveBeenCalled();
  });

  it('a super admin owner may book without the Meetings permission', async () => {
    ownerHasMeetings = false;
    ownerIsSuper = true;
    const res = await readRpc(await book(GOOD_ARGS));
    expect(res.result.isError).toBeFalsy();
    expect(scheduleDirect).toHaveBeenCalledTimes(1);
  });

  it('reports a taken slot in plain words', async () => {
    scheduleDirect.mockResolvedValue({ ok: false, error: { code: 'SLOT_TAKEN', message: 'You already have a meeting then.' } });
    const res = await readRpc(await book(GOOD_ARGS));
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/You already have a meeting then./);
  });

  it('passes on a partial-success warning instead of hiding it', async () => {
    scheduleDirect.mockResolvedValue({
      ok: true,
      data: { uid: 'u2', bookingId: 'b2', startIso: 's', endIso: 'e', videoUrl: null, googleEventId: null, warning: 'Invitations were not sent.' },
    });
    const res = await readRpc(await book(GOOD_ARGS));
    expect(JSON.parse(res.result.content[0].text).warning).toBe('Invitations were not sent.');
  });

  it('audit-logs the call without its arguments', async () => {
    await readRpc(await book(GOOD_ARGS));
    expect(logApiUsage).toHaveBeenCalledTimes(1);
    const entry = logApiUsage.mock.calls[0][0];
    expect(entry).toMatchObject({ apiKeyId: KEY_ID, endpoint: 'mcp:schedule_meeting', statusCode: 200 });
    expect(JSON.stringify(entry)).not.toContain('viswanathan');
  });
});

describe('arguments', () => {
  it.each([
    [{ title: '' }, /title/],
    [{ start_local: '8 Oct 3:30pm' }, /YYYY-MM-DDTHH:MM/],
    [{ start_local: '2020-01-01T10:00' }, /already passed/],
    [{ start_local: '2099-02-31T10:00' }, /YYYY-MM-DDTHH:MM/],
    [{ duration_min: 0 }, /duration_min/],
    [{ duration_min: 9999 }, /duration_min/],
    [{ location_mode: 'zoom' }, /location_mode/],
    [{ attendees: [] }, /attendees/],
  ])('refuses %j and books nothing', async (bad, msg) => {
    const res = await readRpc(await book({ ...GOOD_ARGS, ...bad }));
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(msg);
    expect(scheduleDirect).not.toHaveBeenCalled();
  });

  it('reads India wall-clock time', () => {
    expect(indiaLocalToIso('2026-10-08T15:30')).toBe('2026-10-08T10:00:00.000Z');
    expect(indiaLocalToIso('2026-10-08T00:10')).toBe('2026-10-07T18:40:00.000Z');
    expect(indiaLocalToIso('2026-13-08T15:30')).toBeNull();
    // impossible days are refused, never rolled into the next month
    expect(indiaLocalToIso('2026-02-31T15:30')).toBeNull();
    expect(indiaLocalToIso('2026-04-31T10:00')).toBeNull();
    expect(indiaLocalToIso('2027-02-29T10:00')).toBeNull();
    expect(indiaLocalToIso('2028-02-29T10:00')).toBe('2028-02-29T04:30:00.000Z');
    expect(indiaLocalToIso('2026-10-31T23:59')).toBe('2026-10-31T18:29:00.000Z');
    expect(indiaLocalToIso(42)).toBeNull();
  });

  it('keeps optional text only when it says something', () => {
    const a = parseScheduleArgs({ ...GOOD_ARGS, note: '  ', location_text: ' Room 4 ' });
    expect(a.note).toBeNull();
    expect(a.locationText).toBe('Room 4');
  });
});

describe('deep review fixes (8 Oct)', () => {
  it('reserves a slot in the database BEFORE booking, with the limits', async () => {
    await readRpc(await book(GOOD_ARGS));
    const reserve = serviceRpc.mock.calls.find(([fn]) => fn === 'fn_ai_booking_reserve');
    expect(reserve![1]).toEqual({
      p_key_id: KEY_ID,
      p_owner_id: OWNER,
      p_invitees: 1,
      p_per_hour: 20,
      p_per_day: 60,
      p_invitees_per_day: 150,
    });
    const reserveOrder = serviceRpc.mock.invocationCallOrder[serviceRpc.mock.calls.indexOf(reserve!)];
    expect(reserveOrder).toBeLessThan(scheduleDirect.mock.invocationCallOrder[0]);
    // a successful booking keeps its reservation
    expect(released()).toEqual([]);
  });

  it.each([
    ['per_hour', 20, /20 meetings in the last hour/],
    ['per_day', 60, /60 meetings in the last 24 hours/],
    ['invitees_per_day', 150, /past 150 invitations/],
    ['not_allowed', null, /not allowed to book meetings right now/],
    ['attempts', 60, /tried to book 60 times in the last hour/],
  ])('a refused reservation (%s) books nothing', async (reason, limit, msg) => {
    reserveAnswer = { data: { ok: false, reason, limit }, error: null };
    const res = await readRpc(await book(GOOD_ARGS));
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(msg);
    expect(scheduleDirect).not.toHaveBeenCalled();
  });

  it('fails CLOSED when the reservation cannot be made', async () => {
    reserveAnswer = { data: null, error: { message: 'db down' } };
    const res = await readRpc(await book(GOOD_ARGS));
    expect(res.result.content[0].text).toMatch(/could not check the booking limits/);
    expect(scheduleDirect).not.toHaveBeenCalled();
  });

  it('gives the slot back only when booking definitely wrote nothing', async () => {
    scheduleDirect.mockResolvedValueOnce({ ok: false, error: { code: 'SLOT_TAKEN', message: 'taken' } });
    await readRpc(await book(GOOD_ARGS));
    expect(released()).toEqual([{ p_reservation_id: 'res-1' }]);

    serviceRpc.mockClear();
    scheduleDirect.mockResolvedValueOnce({ ok: false, error: { code: 'UNKNOWN', message: 'boom' } });
    const res = await readRpc(await book(GOOD_ARGS));
    expect(res.result.isError).toBe(true);
    // an unknown outcome may have written: the slot stays counted
    expect(released()).toEqual([]);
  });

  it('stops waiting after the deadline and says to check the inbox, keeping the slot', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      scheduleDirect.mockImplementationOnce(() => new Promise(() => {}));
      const pending = book(GOOD_ARGS).then(readRpc);
      await vi.advanceTimersByTimeAsync(25_001);
      const res = await pending;
      expect(res.result.isError).toBe(true);
      expect(res.result.content[0].text).toMatch(/did not confirm the booking in time.*Meetings inbox/);
      expect(released()).toEqual([]);
      expect(logApiUsage.mock.calls.at(-1)![0]).toMatchObject({ statusCode: 504 });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [{ title: 'x'.repeat(201) }, /title can be at most 200/],
    [{ note: 'x'.repeat(2001) }, /note can be at most 2000/],
    [{ start_local: '2099-10-08T15:30' }, /more than a year away/],
    [{ attendees: [{ email: 'a*@jkkn.ac.in' }] }, /valid email address/],
  ])('refuses %j', async (bad, msg) => {
    const res = await readRpc(await book({ ...GOOD_ARGS, ...bad }));
    expect(res.result.content[0].text).toMatch(msg);
    expect(scheduleDirect).not.toHaveBeenCalled();
  });

  it('cuts a long name by letters as people see them, never splitting a syllable or emoji', async () => {
    // 'கு' is one letter made of two code points; '👍🏽' is one emoji made of two
    const name = 'கு'.repeat(119) + '👍🏽' + '👍🏽';
    await readRpc(await book({ ...GOOD_ARGS, attendees: [{ email: 'a@jkkn.ac.in', name }] }));
    const cut = scheduleDirect.mock.calls[0][1].attendees[0].name as string;
    expect(cut).toBe('கு'.repeat(119) + '👍🏽');
  });

  it.each([
    ['booking is switched off', () => (grantRow = { active: false })],
    ['the key is turned off', () => (keyRow = { ...keyRow!, is_active: false })],
    ['the key expires', () => (keyRow = { ...keyRow!, expires_at: new Date(Date.now() - 1000).toISOString() })],
  ])('if %s after the slot is reserved, nothing is booked and the slot is given back', async (_what, change) => {
    afterReserve = change;
    const res = await readRpc(await book(GOOD_ARGS));
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/switched off for this key, so nothing was booked/);
    expect(scheduleDirect).not.toHaveBeenCalled();
    expect(released()).toEqual([{ p_reservation_id: 'res-1' }]);
  });

  it('cuts a very long attendee name rather than refusing', async () => {
    await readRpc(await book({ ...GOOD_ARGS, attendees: [{ email: 'a@jkkn.ac.in', name: 'n'.repeat(500) }] }));
    expect(scheduleDirect.mock.calls[0][1].attendees[0].name).toHaveLength(120);
  });

  it('refuses people outside JKKN unless allow_outside is true, and caps them at 5', async () => {
    const outsider = { email: 'guest@gmail.com', name: 'Guest' };
    let res = await readRpc(await book({ ...GOOD_ARGS, attendees: [outsider] }));
    expect(res.result.content[0].text).toMatch(/outside JKKN.*allow_outside: true/);
    expect(scheduleDirect).not.toHaveBeenCalled();

    res = await readRpc(await book({ ...GOOD_ARGS, attendees: [outsider], allow_outside: true }));
    expect(res.result.isError).toBeFalsy();
    expect(JSON.parse(res.result.content[0].text).outside_invitees).toEqual(['guest@gmail.com']);

    const six = Array.from({ length: 6 }, (_, i) => ({ email: `g${i}@gmail.com` }));
    res = await readRpc(await book({ ...GOOD_ARGS, attendees: six, allow_outside: true }));
    expect(res.result.content[0].text).toMatch(/At most 5 people outside JKKN/);
  });

  it('a sub-domain of jkkn.ac.in is not outside', async () => {
    const res = await readRpc(await book({ ...GOOD_ARGS, attendees: [{ email: 'a@pharmacy.jkkn.ac.in' }] }));
    expect(res.result.isError).toBeFalsy();
  });

  it('refuses a missing or bad email, and keeps a repeated address once', async () => {
    let res = await readRpc(await book({ ...GOOD_ARGS, attendees: [{ name: 'No email' }] }));
    expect(res.result.content[0].text).toMatch(/valid email address/);
    res = await readRpc(await book({ ...GOOD_ARGS, attendees: [{ email: 'not-an-email' }] }));
    expect(res.result.content[0].text).toMatch(/valid email address/);
    expect(scheduleDirect).not.toHaveBeenCalled();

    res = await readRpc(
      await book({
        ...GOOD_ARGS,
        attendees: [{ email: 'viswanathan.s@jkkn.ac.in' }, { email: 'VISWANATHAN.S@jkkn.ac.in' }],
      })
    );
    expect(res.result.isError).toBeFalsy();
    expect(scheduleDirect.mock.calls[0][1].attendees).toHaveLength(1);
  });

  it('caps a meeting at 20 invitees', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ email: `p${i}@jkkn.ac.in` }));
    const res = await readRpc(await book({ ...GOOD_ARGS, attendees: many }));
    expect(res.result.content[0].text).toMatch(/1 to 20 people/);
  });

  it('links nobody when two MyJKKN people share the address case-insensitively', async () => {
    people = [
      { id: KNOWN_PERSON, email: 'Viswanathan.S@jkkn.ac.in', institution_id: 'inst-1' },
      { id: FORGED, email: 'viswanathan.s@JKKN.ac.in', institution_id: 'inst-1' },
    ];
    await readRpc(await book(GOOD_ARGS));
    expect(scheduleDirect.mock.calls[0][1].attendees[0].profileId).toBeNull();
  });

  it("does not link a person from another college for an owner limited to their own", async () => {
    people = [{ id: KNOWN_PERSON, email: 'viswanathan.s@jkkn.ac.in', institution_id: 'inst-OTHER' }];
    await readRpc(await book(GOOD_ARGS));
    expect(scheduleDirect.mock.calls[0][1].attendees[0].profileId).toBeNull();
  });

  it('a super admin owner links across colleges', async () => {
    ownerProfile = { institution_id: 'inst-1', is_super_admin: true };
    people = [{ id: KNOWN_PERSON, email: 'viswanathan.s@jkkn.ac.in', institution_id: 'inst-OTHER' }];
    await readRpc(await book(GOOD_ARGS));
    expect(profileQueries[0].institution).toBeUndefined();
    expect(scheduleDirect.mock.calls[0][1].attendees[0].profileId).toBe(KNOWN_PERSON);
  });

  it('LIKE wildcards in an address are matched literally', async () => {
    await readRpc(await book({ ...GOOD_ARGS, attendees: [{ email: 'a_b%c@jkkn.ac.in' }] }));
    expect(profileQueries[0].ilike).toBe('a\\_b\\%c@jkkn.ac.in');
  });
});
