/**
 * /api/whatsapp-bridge/* — the bridge-facing contract.
 *
 * These pin the four things an adversarial read of the first draft found, each
 * of which is invisible from the outside once shipped:
 *
 *   1. A Tamil message was silently REJECTED. The body cap was 4096 BYTES,
 *      justified by WhatsApp's 4096-CHARACTER limit. A Tamil character is three
 *      bytes in UTF-8, so a parent writing in Tamil was refused at roughly 1,300
 *      characters — a third of what an English writer gets, with no explanation
 *      reaching anyone. JKKN's families write in Tamil.
 *
 *   2. A literal `null` JSON body reached a destructure that sat OUTSIDE the
 *      try block, so a malformed request was answered 500 ("we are broken")
 *      instead of 400 ("your request was malformed").
 *
 *   3. `pending` claimed messages over GET. GET is defined as safe; a retrying
 *      client or a proxy that prefetches one would claim a second batch and
 *      strand it in `sending`, delivering nothing and raising nothing.
 *
 *   4. `status` had no permission check. RLS would hand a denied user zero rows
 *      and the endpoint would render that as "the bridge is dead, queue empty"
 *      — a confident false statement someone would act on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const BRIDGE_SECRET = 'test-bridge-secret-value';

// ---------------------------------------------------------------------------
// Mocks — declared before the handlers are imported (vitest hoists vi.mock).
// ---------------------------------------------------------------------------

const recordInbound = vi.fn();
const claimPending = vi.fn();
const recordHeartbeat = vi.fn();
const ack = vi.fn();
const getStatus = vi.fn();

vi.mock('@/lib/services/whatsapp/bridge-outbox-service', () => ({
  BridgeOutboxService: {
    recordInbound: (...a: unknown[]) => recordInbound(...a),
    claimPending: (...a: unknown[]) => claimPending(...a),
    recordHeartbeat: (...a: unknown[]) => recordHeartbeat(...a),
    ack: (...a: unknown[]) => ack(...a),
    getStatus: (...a: unknown[]) => getStatus(...a),
  },
  MAX_SEND_ATTEMPTS: 3,
}));

let currentUser: { id: string } | null = { id: 'user-1' };
const rpcResults: Record<string, { data: unknown; error: unknown }> = {};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser }, error: null }) },
      rpc: (name: string) =>
        Promise.resolve(rpcResults[name] ?? { data: false, error: null }),
    }),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// SUTs imported AFTER the mocks.
import { POST as inboundPost } from '@/app/api/whatsapp-bridge/inbound/route';
import { POST as ackPost } from '@/app/api/whatsapp-bridge/ack/route';
import { POST as heartbeatPost } from '@/app/api/whatsapp-bridge/heartbeat/route';
import { POST as pendingPost, GET as pendingGet } from '@/app/api/whatsapp-bridge/pending/route';
import { GET as statusGet } from '@/app/api/whatsapp-bridge/status/route';
import { MAX_ENVELOPE_BYTES, MAX_MESSAGE_CHARS } from '@/app/api/whatsapp-bridge/_lib/bridge-auth';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------

/**
 * A real Tamil sentence, repeated. Not a made-up string of one repeated glyph:
 * the point is that ordinary Tamil prose is ~2.8 bytes per character, so a
 * perfectly normal message blows a byte cap that an English one never reaches.
 */
const TAMIL_SENTENCE = 'வணக்கம், என் மகளின் சேர்க்கை குறித்து விவரம் தேவை. ';

function bridgeRequest(
  path: string,
  body: unknown,
  { secret = BRIDGE_SECRET, raw }: { secret?: string | null; raw?: string } = {}
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret !== null) headers['x-bridge-secret'] = secret;
  // A real NextRequest, not a plain Request: `pending` reads
  // `request.nextUrl.searchParams`, which a plain Request does not carry, and a
  // test that stubbed that away would stop exercising the route's own parsing.
  const req = new NextRequest(`https://jkkn.ai/api/whatsapp-bridge/${path}`, {
    method: 'POST',
    headers,
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
  return req as never;
}

beforeEach(() => {
  process.env.WHATSAPP_BRIDGE_SECRET = BRIDGE_SECRET;
  currentUser = { id: 'user-1' };
  for (const k of Object.keys(rpcResults)) delete rpcResults[k];
  recordInbound.mockReset();
  claimPending.mockReset();
  recordHeartbeat.mockReset();
  ack.mockReset();
  getStatus.mockReset();
  recordInbound.mockResolvedValue({
    id: 'inbound-1',
    leadId: null,
    matchStatus: 'unmatched',
    matchCandidateCount: 0,
    duplicate: false,
  });
  claimPending.mockResolvedValue([]);
  recordHeartbeat.mockResolvedValue(undefined);
  getStatus.mockResolvedValue({ connected: true, pending_count: 0 });
});

afterEach(() => {
  delete process.env.WHATSAPP_BRIDGE_SECRET;
});

// ===========================================================================
// 1. Tamil
// ===========================================================================
describe('inbound — a long Tamil message is accepted', () => {
  it('accepts Tamil prose far over the old 4096-BYTE cap', async () => {
    const body = TAMIL_SENTENCE.repeat(40);

    // The assertion that makes this test mean something: the sample must
    // actually be over the old byte cap and under WhatsApp's character cap,
    // or it is not exercising the defect at all.
    expect(Buffer.byteLength(body, 'utf8')).toBeGreaterThan(4096);
    expect([...body].length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);

    const res = await inboundPost(
      bridgeRequest('inbound', {
        from: '919876543210',
        wa_message_id: 'wamid.tamil',
        body,
      })
    );

    expect(res.status).toBe(200);
    expect(recordInbound).toHaveBeenCalledTimes(1);
    expect(recordInbound.mock.calls[0][0].body).toBe(body);
  });

  it('still refuses a body genuinely over WhatsApp’s own character limit', async () => {
    const res = await inboundPost(
      bridgeRequest('inbound', {
        from: '919876543210',
        wa_message_id: 'wamid.toolong',
        body: 'அ'.repeat(MAX_MESSAGE_CHARS + 1),
      })
    );

    expect(res.status).toBe(413);
    expect(recordInbound).not.toHaveBeenCalled();
  });

  it('counts an emoji once, not twice — the cap is code points, not code units', async () => {
    // '👨‍👩‍👧' and friends are astral; String.length would double-count them and
    // refuse a message WhatsApp would carry.
    const body = '🎓'.repeat(MAX_MESSAGE_CHARS);
    expect(body.length).toBe(MAX_MESSAGE_CHARS * 2); // UTF-16 code units
    expect([...body].length).toBe(MAX_MESSAGE_CHARS); // code points

    const res = await inboundPost(
      bridgeRequest('inbound', { from: '919876543210', wa_message_id: 'wamid.emoji', body })
    );
    expect(res.status).toBe(200);
  });

  it('the envelope byte cap is generous enough for a multi-byte script', () => {
    // 64 KiB — a 4096-character Tamil message is ~12 KB, so the envelope never
    // becomes the thing that refuses it.
    expect(MAX_ENVELOPE_BYTES).toBeGreaterThanOrEqual(64 * 1024);
    expect(Buffer.byteLength('அ'.repeat(MAX_MESSAGE_CHARS), 'utf8')).toBeLessThan(
      MAX_ENVELOPE_BYTES
    );
  });
});

// ===========================================================================
// 2. A literal null body is 400, not 500
// ===========================================================================
describe('a literal `null` JSON body is 400, never 500', () => {
  const cases: Array<[string, (r: never) => Promise<Response>]> = [
    ['inbound', inboundPost as never],
    ['ack', ackPost as never],
    ['heartbeat', heartbeatPost as never],
  ];

  for (const [name, handler] of cases) {
    it(`${name} answers 400 for a literal null body`, async () => {
      const res = await handler(bridgeRequest(name, undefined, { raw: 'null' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/JSON object/i);
    });

    it(`${name} answers 400 for a bare array body`, async () => {
      const res = await handler(bridgeRequest(name, undefined, { raw: '[1,2,3]' }));
      expect(res.status).toBe(400);
    });

    it(`${name} answers 400 for a bare scalar body`, async () => {
      const res = await handler(bridgeRequest(name, undefined, { raw: '42' }));
      expect(res.status).toBe(400);
    });
  }
});

// ===========================================================================
// 3. Authentication
// ===========================================================================
describe('the shared secret is the only way in', () => {
  it('refuses a missing secret with 401', async () => {
    const res = await inboundPost(
      bridgeRequest('inbound', { from: '91987', wa_message_id: 'x' }, { secret: null })
    );
    expect(res.status).toBe(401);
    expect(recordInbound).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret with 401', async () => {
    const res = await inboundPost(
      bridgeRequest('inbound', { from: '91987', wa_message_id: 'x' }, { secret: 'not-it' })
    );
    expect(res.status).toBe(401);
  });

  it('refuses a secret of the same length but different bytes', async () => {
    const wrong = 'x'.repeat(BRIDGE_SECRET.length);
    const res = await inboundPost(
      bridgeRequest('inbound', { from: '91987', wa_message_id: 'x' }, { secret: wrong })
    );
    expect(res.status).toBe(401);
  });

  it('answers 503 — not 401 — when the server has no secret configured', async () => {
    delete process.env.WHATSAPP_BRIDGE_SECRET;
    const res = await inboundPost(
      bridgeRequest('inbound', { from: '91987', wa_message_id: 'x' })
    );
    // 401 would send an operator hunting for a wrong value on the Windows box.
    expect(res.status).toBe(503);
  });

  it('never lets an unauthenticated caller claim the queue', async () => {
    const res = await pendingPost(
      bridgeRequest('pending', {}, { secret: null })
    );
    expect(res.status).toBe(401);
    expect(claimPending).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. pending is POST, because it mutates
// ===========================================================================
describe('pending claims over POST only', () => {
  it('claims on POST', async () => {
    claimPending.mockResolvedValue([{ id: 'm1', to: '919876543210', body: 'hi', type: 'text', media_url: null }]);
    const res = await pendingPost(bridgeRequest('pending', {}));
    expect(res.status).toBe(200);
    expect(claimPending).toHaveBeenCalledTimes(1);
  });

  it('refuses GET with 405 and claims NOTHING', async () => {
    const res = await pendingGet();
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
    // The whole point: a prefetching proxy or a retrying client cannot take
    // messages out of the queue and strand them in `sending`.
    expect(claimPending).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 5. status refuses a user who lacks the permission
// ===========================================================================
describe('status checks the permission itself', () => {
  it('answers 403 for a signed-in user without the key', async () => {
    rpcResults.is_super_admin = { data: false, error: null };
    rpcResults.is_admin = { data: false, error: null };
    rpcResults.user_has_permission = { data: false, error: null };

    const req = new Request('https://jkkn.ai/api/whatsapp-bridge/status') as never;
    const res = await statusGet(req);

    expect(res.status).toBe(403);
    // NOT an all-zero snapshot. "connected: false, pending_count: 0" would read
    // as a dead bridge and send someone to restart a Windows box.
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('answers the snapshot for a user who holds the key', async () => {
    rpcResults.is_super_admin = { data: false, error: null };
    rpcResults.is_admin = { data: false, error: null };
    rpcResults.user_has_permission = { data: true, error: null };

    const res = await statusGet(new Request('https://jkkn.ai/api/whatsapp-bridge/status') as never);
    expect(res.status).toBe(200);
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it('answers 500 — and not the word Forbidden — when the check itself cannot run', async () => {
    const boom = { message: 'permission denied for function user_has_permission' };
    rpcResults.is_super_admin = { data: null, error: boom };
    rpcResults.is_admin = { data: null, error: boom };
    rpcResults.user_has_permission = { data: null, error: boom };

    const res = await statusGet(new Request('https://jkkn.ai/api/whatsapp-bridge/status') as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).not.toMatch(/forbidden/i);
  });

  it('refuses the bridge secret outright, even with a valid session', async () => {
    rpcResults.user_has_permission = { data: true, error: null };
    const req = new Request('https://jkkn.ai/api/whatsapp-bridge/status', {
      headers: { 'x-bridge-secret': BRIDGE_SECRET },
    }) as never;
    const res = await statusGet(req);
    expect(res.status).toBe(401);
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('answers 401 for no session at all', async () => {
    currentUser = null;
    const res = await statusGet(new Request('https://jkkn.ai/api/whatsapp-bridge/status') as never);
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 6. inbound reports an ambiguous match rather than hiding it
// ===========================================================================
describe('inbound surfaces an ambiguous match', () => {
  it('returns match_status and the candidate count', async () => {
    recordInbound.mockResolvedValue({
      id: 'inbound-9',
      leadId: null,
      matchStatus: 'ambiguous',
      matchCandidateCount: 2,
      duplicate: false,
    });

    const res = await inboundPost(
      bridgeRequest('inbound', { from: '919876543210', wa_message_id: 'wamid.sib', body: 'ok' })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.lead_id).toBeNull();
    expect(json.match_status).toBe('ambiguous');
    expect(json.match_candidate_count).toBe(2);
  });
});
