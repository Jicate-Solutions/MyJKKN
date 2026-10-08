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

// ── service-role client: key lookup, booking grant, invitee profiles ──────
let keyRow: Record<string, unknown> | null = null;
let grantRow: Record<string, unknown> | null = null;
const tablesRead: string[] = [];
function makeServiceClient() {
  return {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      tablesRead.push(table);
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
      if (table === 'profiles') {
        b.in = vi.fn(() => ({
          eq: vi.fn(async () => ({
            data: [{ id: KNOWN_PERSON, email: 'Viswanathan.S@jkkn.ac.in' }],
            error: null,
          })),
        }));
      }
      b.maybeSingle = vi.fn(async () => ({
        data: table === 'api_keys' ? keyRow : table === 'ai_personal_key_booking_grants' ? grantRow : null,
        error: null,
      }));
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
const FUTURE_LOCAL = '2099-10-08T15:30';
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
    expect(input.startIso).toBe('2099-10-08T10:00:00.000Z');
    expect(input.durationMin).toBe(10);
    expect(input.locationMode).toBe('online');
    // a MyJKKN person is linked by email, case-insensitively
    expect(input.attendees).toEqual([
      { email: 'viswanathan.s@jkkn.ac.in', name: 'Viswanathan S', profileId: KNOWN_PERSON },
    ]);
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
    expect(indiaLocalToIso(42)).toBeNull();
  });

  it('keeps optional text only when it says something', () => {
    const a = parseScheduleArgs({ ...GOOD_ARGS, note: '  ', location_text: ' Room 4 ' });
    expect(a.note).toBeNull();
    expect(a.locationText).toBe('Room 4');
  });
});
