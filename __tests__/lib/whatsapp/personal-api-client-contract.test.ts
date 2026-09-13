// __tests__/lib/whatsapp/personal-api-client-contract.test.ts
//
// The three invariants of the campus-bridge transport that, when broken, fail
// SILENTLY and completely:
//
//   1. `to_phone` wire format. Three incompatible spellings used to reach one
//      column and go to the bridge verbatim.
//   2. The kill switch. It read through a client-only policy reader on a server
//      path, resolved to its `true` default every time, and could never turn
//      anything off.
//   3. The outbox `type` contract. A value the CHECK constraint did not allow
//      failed 100% of media sends behind a generic "could not queue" string.
//
// Plus the history-anchor scope rule: a log row must never be written under a
// department the caller has no access to.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Test doubles. The module builds its own supabase-js client from env, so the
// factory is mocked and each test hands back the client shape it needs.
// ---------------------------------------------------------------------------

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock('@sentry/nextjs', () => ({
  startSpan: (_opts: unknown, fn: () => unknown) => fn(),
}));

const getConnectionMock = vi.fn();
const getAllConnectionsMock = vi.fn();

vi.mock('@/lib/services/whatsapp/whatsapp-personal-connection-service', () => ({
  WhatsAppPersonalConnectionService: {
    getConnection: (...a: unknown[]) => getConnectionMock(...a),
    getAllConnections: (...a: unknown[]) => getAllConnectionsMock(...a),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  },
}));

/**
 * A supabase double covering exactly what the module touches:
 *   - rpc('fn_get_policy_bool')            → the kill switch
 *   - from('wa_bridge_status').…maybeSingle → bridge health
 *   - from('wa_bridge_outbox').insert().select() → the enqueue
 *   - from('profiles').…maybeSingle         → caller department lookup
 */
function makeDb(opts: {
  policy?: { data: unknown; error: { message: string } | null };
  insert?: { data: unknown; error: unknown };
  profileDepartment?: string | null;
}) {
  const inserted: unknown[] = [];

  const client = {
    rpc: vi.fn().mockResolvedValue(opts.policy ?? { data: true, error: null }),
    from: vi.fn((table: string) => {
      if (table === 'wa_bridge_outbox') {
        return {
          insert: (rows: unknown[]) => {
            inserted.push(...rows);
            return {
              select: vi.fn().mockResolvedValue(
                opts.insert ?? {
                  data: rows.map((_, i) => ({ id: `outbox-${i}` })),
                  error: null,
                }
              ),
            };
          },
        };
      }
      if (table === 'wa_bridge_status') {
        return {
          select: () => ({
            limit: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  connected: true,
                  logged_in: true,
                  phone_number: '919999999999',
                  version: '1.0',
                  last_heartbeat_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { department_id: opts.profileDepartment ?? null },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };

  return { client, inserted };
}

async function loadModule() {
  vi.resetModules();
  return import('@/lib/whatsapp/personal-api-client');
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// 1. to_phone — the three input shapes
// ---------------------------------------------------------------------------

describe('normalizeToE164 — one wire format for three input shapes', () => {
  const cases: [string, string, string][] = [
    ['whatsapp-web.js JID (the admission lead page)', '919876543210@c.us', '919876543210'],
    ['whatsmeow JID', '919876543210@s.whatsapp.net', '919876543210'],
    ["'+'-prefixed E.164", '+919876543210', '919876543210'],
    ['raw 10-digit Indian mobile', '9876543210', '919876543210'],
    ['leading-zero trunk number', '09876543210', '919876543210'],
    ['formatted with spaces and dashes', '+91 98765-43210', '919876543210'],
    ['already canonical', '919876543210', '919876543210'],
    ['non-Indian country code is left alone', '+14155552671', '14155552671'],
  ];

  for (const [label, input, expected] of cases) {
    it(`${label}: ${input} → ${expected}`, async () => {
      const { normalizeToE164 } = await loadModule();
      expect(normalizeToE164(input)).toBe(expected);
    });
  }

  it('refuses an empty number rather than queueing a blank recipient', async () => {
    const { normalizeToE164, BridgeRecipientError } = await loadModule();
    expect(() => normalizeToE164('')).toThrow(BridgeRecipientError);
  });

  it('refuses letters rather than sending them to the bridge verbatim', async () => {
    const { normalizeToE164, BridgeRecipientError } = await loadModule();
    expect(() => normalizeToE164('not-a-number')).toThrow(BridgeRecipientError);
  });

  it('normalises on the INSERT path, so no caller can bypass it', async () => {
    const { client, inserted } = makeDb({});
    createClientMock.mockReturnValue(client);

    const { personalSendMessageAPI } = await loadModule();
    await personalSendMessageAPI('919876543210@c.us', 'hello');

    expect(inserted).toHaveLength(1);
    expect((inserted[0] as { to_phone: string }).to_phone).toBe('919876543210');
  });
});

// ---------------------------------------------------------------------------
// 2. Kill switch — FAIL CLOSED
// ---------------------------------------------------------------------------

describe('BYOW kill switch fails CLOSED', () => {
  it('does not send when the policy RPC errors', async () => {
    const { client, inserted } = makeDb({
      policy: { data: null, error: { message: 'permission denied' } },
    });
    createClientMock.mockReturnValue(client);

    const { personalSendMessageAPI, ByowPolicyUnreadableError } = await loadModule();

    await expect(personalSendMessageAPI('919876543210', 'hi')).rejects.toBeInstanceOf(
      ByowPolicyUnreadableError
    );
    expect(inserted).toHaveLength(0);
  });

  it('does not send when the policy RPC returns a non-boolean', async () => {
    const { client, inserted } = makeDb({ policy: { data: null, error: null } });
    createClientMock.mockReturnValue(client);

    const { personalSendMessageAPI, ByowPolicyUnreadableError } = await loadModule();

    await expect(personalSendMessageAPI('919876543210', 'hi')).rejects.toBeInstanceOf(
      ByowPolicyUnreadableError
    );
    expect(inserted).toHaveLength(0);
  });

  it('does not send when there are no service credentials to read the policy with', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    createClientMock.mockImplementation(() => {
      throw new Error('should never be constructed without a key');
    });

    const { personalSendMessageAPI, ByowPolicyUnreadableError } = await loadModule();

    await expect(personalSendMessageAPI('919876543210', 'hi')).rejects.toBeInstanceOf(
      ByowPolicyUnreadableError
    );
  });

  it('does not send when the switch is explicitly off', async () => {
    const { client, inserted } = makeDb({ policy: { data: false, error: null } });
    createClientMock.mockReturnValue(client);

    const { personalSendMessageAPI, ByowDisabledError } = await loadModule();

    await expect(personalSendMessageAPI('919876543210', 'hi')).rejects.toBeInstanceOf(
      ByowDisabledError
    );
    expect(inserted).toHaveLength(0);
  });

  it('sends when the switch reads true', async () => {
    const { client, inserted } = makeDb({ policy: { data: true, error: null } });
    createClientMock.mockReturnValue(client);

    const { personalSendMessageAPI } = await loadModule();
    const res = await personalSendMessageAPI('919876543210', 'hi');

    expect(res.queued).toBe(true);
    expect(inserted).toHaveLength(1);
  });

  it('reads the switch through a SERVER-resolvable path (fn_get_policy_bool RPC)', async () => {
    const { client } = makeDb({});
    createClientMock.mockReturnValue(client);

    const { personalSendMessageAPI } = await loadModule();
    await personalSendMessageAPI('919876543210', 'hi');

    expect(client.rpc).toHaveBeenCalledWith(
      'fn_get_policy_bool',
      expect.objectContaining({ p_key: 'wa_byow.is_enabled' })
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Outbox `type` contract — a constraint change must never be silent
// ---------------------------------------------------------------------------

describe('wa_bridge_outbox type contract', () => {
  it('declares exactly the two types MyJKKN writes', async () => {
    const { BRIDGE_OUTBOX_TYPES } = await loadModule();
    expect([...BRIDGE_OUTBOX_TYPES]).toEqual(['text', 'media']);
  });

  it("writes type 'media' for a media send", async () => {
    const { client, inserted } = makeDb({});
    createClientMock.mockReturnValue(client);

    const { personalSendMediaAPI } = await loadModule();
    await personalSendMediaAPI('919876543210', 'https://x/y.pdf', 'caption');

    expect((inserted[0] as { type: string }).type).toBe('media');
    expect((inserted[0] as { media_url: string }).media_url).toBe('https://x/y.pdf');
  });

  it("writes type 'text' for a text send", async () => {
    const { client, inserted } = makeDb({});
    createClientMock.mockReturnValue(client);

    const { personalSendMessageAPI } = await loadModule();
    await personalSendMessageAPI('919876543210', 'hi');

    expect((inserted[0] as { type: string }).type).toBe('text');
  });

  it('turns a CHECK-constraint rejection on `type` into a NAMED, diagnosable error', async () => {
    const { client } = makeDb({
      insert: {
        data: null,
        error: {
          code: '23514',
          message: 'new row violates check constraint "wa_bridge_outbox_type_chk"',
          details: 'Failing row contains (…, media, …).',
        },
      },
    });
    createClientMock.mockReturnValue(client);

    const { personalSendMediaAPI, BridgeOutboxTypeRejectedError } = await loadModule();

    // Previously this surfaced as "Could not queue WhatsApp message: …" — the
    // same string every other queue failure produces — so 100% of media sends
    // failing looked like ordinary flakiness.
    const err = await personalSendMediaAPI('919876543210', 'https://x/y.pdf', undefined).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(BridgeOutboxTypeRejectedError);
    expect(err.message).toContain('text, media');
    expect(err.message).toContain('wa_bridge_outbox_type_chk');
  });
});

// ---------------------------------------------------------------------------
// 4. History anchor — never a department the caller cannot access
// ---------------------------------------------------------------------------

describe('resolveHistoryAnchor never crosses a department boundary', () => {
  it('uses the department the caller was gated against', async () => {
    const { client } = makeDb({});
    createClientMock.mockReturnValue(client);
    getConnectionMock.mockResolvedValue({ id: 'conn-a', department_id: 'dept-a' });

    const { resolveHistoryAnchor } = await loadModule();
    const anchor = await resolveHistoryAnchor('dept-a', 'user-1');

    expect(anchor).toEqual({ id: 'conn-a', department_id: 'dept-a' });
    expect(getConnectionMock).toHaveBeenCalledWith('dept-a');
  });

  it("falls back to the CALLER'S OWN department, not an arbitrary one", async () => {
    const { client } = makeDb({ profileDepartment: 'dept-mine' });
    createClientMock.mockReturnValue(client);
    getConnectionMock.mockResolvedValue({ id: 'conn-mine', department_id: 'dept-mine' });

    const { resolveHistoryAnchor } = await loadModule();
    const anchor = await resolveHistoryAnchor(null, 'user-1');

    expect(anchor).toEqual({ id: 'conn-mine', department_id: 'dept-mine' });
    expect(getConnectionMock).toHaveBeenCalledWith('dept-mine');
  });

  it('returns NO anchor rather than a foreign department when the caller has none', async () => {
    const { client } = makeDb({ profileDepartment: null });
    createClientMock.mockReturnValue(client);
    // Foreign connections exist and would have been picked by the old fallback.
    getAllConnectionsMock.mockResolvedValue([
      { id: 'conn-someone-else', department_id: 'dept-not-mine' },
    ]);

    const { resolveHistoryAnchor } = await loadModule();
    const anchor = await resolveHistoryAnchor(null, 'user-1');

    expect(anchor).toBeNull();
    // The old code called getAllConnections() and took [0]. Never again: that
    // wrote message bodies and recipient phone numbers into a department the
    // caller was never authorised for.
    expect(getAllConnectionsMock).not.toHaveBeenCalled();
  });

  it('gives a system sender with no department no anchor at all', async () => {
    const { client } = makeDb({});
    createClientMock.mockReturnValue(client);

    const { resolveHistoryAnchor } = await loadModule();
    expect(await resolveHistoryAnchor(null, null)).toBeNull();
    expect(getAllConnectionsMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. Bulk fan-out cap + self-consistent counters
// ---------------------------------------------------------------------------

describe('bulk send is capped and reports consistent counts', () => {
  it('refuses a batch larger than the cap before anything is queued', async () => {
    const { client, inserted } = makeDb({});
    createClientMock.mockReturnValue(client);

    const { personalSendBulkAPI, BRIDGE_BULK_MAX_RECIPIENTS, ByowBulkLimitError } =
      await loadModule();

    const tooMany = Array.from({ length: BRIDGE_BULK_MAX_RECIPIENTS + 1 }, (_, i) => ({
      phone: `98765432${String(i).padStart(2, '0')}`,
      message: 'hi',
    }));

    await expect(personalSendBulkAPI(tooMany)).rejects.toBeInstanceOf(ByowBulkLimitError);
    expect(inserted).toHaveLength(0);
  });

  it('counters agree with each other (they used to contradict)', async () => {
    const { client } = makeDb({});
    createClientMock.mockReturnValue(client);

    const { personalSendBulkAPI } = await loadModule();
    const res = await personalSendBulkAPI([
      { phone: '9876543210', message: 'a' },
      { phone: '+919876543211', message: 'b' },
    ]);

    expect(res.queuedCount).toBe(2);
    expect(res.successCount).toBe(2);
    expect(res.totalSent).toBe(2);
    expect(res.failCount).toBe(0);
    expect(res.results.every((r) => r.success)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Bridge health never throws, and says WHY it is unhealthy
// ---------------------------------------------------------------------------

describe('getBridgeHealth is safe for route handlers', () => {
  it("reports 'not_configured' instead of throwing when the service key is unset", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { getBridgeHealth } = await loadModule();

    const health = await getBridgeHealth();
    expect(health.connected).toBe(false);
    expect(health.reason).toBe('not_configured');
  });

  it("distinguishes a missing table ('query_error') from a quiet bridge", async () => {
    const client = {
      rpc: vi.fn(),
      from: vi.fn(() => ({
        select: () => ({
          limit: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'relation "wa_bridge_status" does not exist' },
            }),
          }),
        }),
      })),
    };
    createClientMock.mockReturnValue(client);

    const { getBridgeHealth } = await loadModule();
    const health = await getBridgeHealth();

    expect(health.reason).toBe('query_error');
    expect(health.error).toContain('does not exist');
  });
});
