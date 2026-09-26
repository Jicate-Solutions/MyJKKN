/**
 * The outside-AI door for PERSONAL keys (lib/mcp/personal-door.ts).
 *
 * What these prove, end to end through a real MCP JSON-RPC request:
 *   - tools come from the catalog menu, and a write tool is never offered or run
 *     (even if the menu wrongly carried one, or a caller names it directly);
 *   - a tool runs through the KEY OWNER's session client — the service-role
 *     client is used only to look the key up, and never has .rpc called on it;
 *   - p_user_id is always the owner, whatever the caller sends;
 *   - every call is audit-logged without its arguments or data;
 *   - bad keys get 401, a busy key gets 429;
 *   - repair round 1: p_limit is capped at 500 (500 when left out), and a
 *     p_institution_id the owner cannot access is refused BEFORE the tool
 *     runs — checked AS the owner through role_has_institution_access.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const OWNER = '0b3b1b8e-1111-4111-8111-000000000001';
const FORGED = '0b3b1b8e-9999-4999-8999-000000000009';
const KEY = 'jkkn_pk_' + 'a'.repeat(48);
const KEY_ID = 'key-1';

// ── service-role client: only ever used to look the key up ────────────────
const serviceRpc = vi.fn();
let keyRow: Record<string, unknown> | null = null;
const lookupCalls: Array<[string, unknown]> = [];
function makeServiceClient() {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((col: string, val: unknown) => {
    lookupCalls.push([col, val]);
    return builder;
  });
  builder.maybeSingle = vi.fn(async () => ({ data: keyRow, error: null }));
  builder.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  return { from: vi.fn(() => builder), rpc: serviceRpc };
}
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: vi.fn(() => makeServiceClient()),
}));

// ── the owner's own session client ─────────────────────────────────────────
const MENU = [
  {
    name: 'learner_list',
    kind: 'rpc',
    target: 'ai_rpc_students',
    description: 'Learners list',
    params: {
      type: 'object',
      properties: { p_status: { type: 'string' }, p_limit: { type: 'integer' } },
      additionalProperties: false,
      'x-self-arg': 'p_user_id',
    },
    is_write: false,
  },
  {
    name: 'college_summary',
    kind: 'rpc',
    target: 'ai_rpc_students_summary',
    description: 'Learner summary for a college',
    params: {
      type: 'object',
      properties: { p_institution_id: { type: 'string', format: 'uuid' } },
      additionalProperties: false,
      'x-self-arg': 'p_user_id',
    },
    is_write: false,
  },
  {
    // must never reach an outside AI even if the menu carried it
    name: 'send_notification',
    kind: 'rpc',
    target: 'ai_rpc_send_notification',
    description: 'Sends',
    params: { type: 'object', properties: {} },
    is_write: true,
  },
  {
    name: 'some_http_tool',
    kind: 'http',
    target: '/api/x',
    description: 'http',
    params: { type: 'object', properties: {} },
    is_write: false,
  },
];
let ownerMaySee: (id: unknown) => boolean = () => true;
const userRpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
  if (fn === 'fn_ai_tool_menu') return { data: MENU, error: null };
  if (fn === 'role_has_institution_access') return { data: ownerMaySee(args?.check_institution_id), error: null };
  return { data: { rows: [{ id: 1 }] }, error: null };
});
const getUserSessionClient = vi.fn(async (_userId: string) => ({ rpc: userRpc }));
const { AccountOffError } = vi.hoisted(() => {
  class AccountOffError extends Error {
    constructor() {
      super('Account is not active');
      this.name = 'AccountOffError';
    }
  }
  return { AccountOffError };
});
vi.mock('@/lib/ai-tools/run-as-user', () => ({
  getUserSessionClient: (userId: string) => getUserSessionClient(userId),
  AccountOffError,
}));

// ── audit logger ───────────────────────────────────────────────────────────
const logApiUsage = vi.fn();
vi.mock('@/lib/api-keys/audit-logger', () => ({
  logApiUsage: (entry: unknown) => logApiUsage(entry),
}));

import { handlePersonalKeyRequest, isPersonalKeyToken, doorTools } from '@/lib/mcp/personal-door';
import { _resetForTesting as resetRateLimiter } from '@/lib/api-keys/rate-limiter';
import type { CatalogTool } from '@/lib/ai-tools/catalog';

function rpcRequest(body: unknown): Request {
  return new Request('http://localhost/api/mcp/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${KEY}`,
      'user-agent': 'vitest-ai',
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

function liveKey(overrides: Record<string, unknown> = {}) {
  return {
    id: KEY_ID,
    name: 'Claude on my laptop',
    user_id: OWNER,
    institution_id: 'inst-1',
    is_active: true,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    key_kind: 'personal',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lookupCalls.length = 0;
  keyRow = liveKey();
  ownerMaySee = () => true;
  resetRateLimiter();
});

function callTool(name: string, args: Record<string, unknown>) {
  return handlePersonalKeyRequest(
    rpcRequest({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }),
    KEY
  );
}

describe('personal key recognition', () => {
  it('only jkkn_pk_ tokens take the personal path', () => {
    expect(isPersonalKeyToken(KEY)).toBe(true);
    expect(isPersonalKeyToken('jkkn_' + 'b'.repeat(32))).toBe(false);
    expect(isPersonalKeyToken(undefined)).toBe(false);
  });

  it('looks the key up by its SHA-256 hash and only among personal keys', async () => {
    await handlePersonalKeyRequest(rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), KEY);
    const hash = createHash('sha256').update(KEY).digest('hex');
    expect(lookupCalls).toContainEqual(['key_value', hash]);
    expect(lookupCalls).toContainEqual(['key_kind', 'personal']);
    expect(lookupCalls).toContainEqual(['is_active', true]);
  });
});

describe('the door menu', () => {
  it('doorTools drops write tools and non-rpc tools', () => {
    const names = doorTools(MENU as CatalogTool[]).map((t) => t.name);
    expect(names).toEqual(['learner_list', 'college_summary']);
  });

  it('tools/list offers catalog tools only, never a write, never p_user_id or vendor keywords', async () => {
    const res = await handlePersonalKeyRequest(rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), KEY);
    expect(res.status).toBe(200);
    const body = await readRpc(res);
    const tools = body.result.tools as Array<{ name: string; inputSchema: Record<string, any> }>;
    expect(tools.map((t) => t.name)).toEqual(['learner_list', 'college_summary']);
    const schema = tools[0].inputSchema;
    expect(schema.properties).not.toHaveProperty('p_user_id');
    expect(schema).not.toHaveProperty('x-self-arg');
    expect(userRpc).toHaveBeenCalledWith('fn_ai_tool_menu', { p_audience: 'door' });
  });
});

describe('running a tool', () => {
  it('runs AS THE OWNER through their own session client — never the service role', async () => {
    const res = await handlePersonalKeyRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'learner_list', arguments: { p_status: 'active', p_user_id: FORGED, p_evil: 1 } },
      }),
      KEY
    );
    const body = await readRpc(res);
    expect(body.result.isError).toBeFalsy();

    expect(getUserSessionClient).toHaveBeenCalledWith(OWNER);
    expect(serviceRpc).not.toHaveBeenCalled();

    const call = userRpc.mock.calls.find(([fn]) => fn === 'ai_rpc_students');
    expect(call).toBeDefined();
    // the forged id is replaced by the owner's; undeclared arguments are
    // dropped; p_limit is filled with the door's cap when left out
    expect(call![1]).toEqual({ p_status: 'active', p_limit: 500, p_user_id: OWNER });
  });

  it('refuses a write tool named directly, and does not run it', async () => {
    const res = await handlePersonalKeyRequest(
      rpcRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'send_notification', arguments: {} } }),
      KEY
    );
    const body = await readRpc(res);
    expect(body.result.isError).toBe(true);
    expect(userRpc.mock.calls.some(([fn]) => fn === 'ai_rpc_send_notification')).toBe(false);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it('audit-logs who/which tool/when/outcome — never the arguments or the data', async () => {
    const res = await handlePersonalKeyRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'learner_list', arguments: { p_status: 'secret-filter' } },
      }),
      KEY
    );
    await readRpc(res); // the tool runs while the response streams
    expect(logApiUsage).toHaveBeenCalledTimes(1);
    const entry = logApiUsage.mock.calls[0][0] as Record<string, unknown>;
    expect(entry).toMatchObject({
      apiKeyId: KEY_ID,
      endpoint: 'mcp:learner_list',
      module: 'ai',
      statusCode: 200,
      userAgent: 'vitest-ai',
    });
    const flat = JSON.stringify(entry);
    expect(flat).not.toContain('secret-filter');
    expect(flat).not.toContain('rows');
  });
});

describe('row limit (repair round 1)', () => {
  it('caps a large p_limit at 500 and keeps a small one', async () => {
    await readRpc(await callTool('learner_list', { p_limit: 10000 }));
    await readRpc(await callTool('learner_list', { p_limit: 20 }));
    const limits = userRpc.mock.calls.filter(([fn]) => fn === 'ai_rpc_students').map(([, a]) => a!.p_limit);
    expect(limits).toEqual([500, 20]);
  });

  it('adds no p_limit to a tool that does not take one', async () => {
    await readRpc(await callTool('college_summary', {}));
    const call = userRpc.mock.calls.find(([fn]) => fn === 'ai_rpc_students_summary');
    expect(call![1]).toEqual({ p_user_id: OWNER });
  });
});

describe('college guard (repair round 1)', () => {
  const OTHER_COLLEGE = '9a9a9a9a-0000-4000-8000-00000000000a';
  const OWN_COLLEGE = '1b1b1b1b-0000-4000-8000-00000000000b';

  it('refuses a college the owner cannot access, before the tool runs, asked AS the owner', async () => {
    ownerMaySee = (id) => id === OWN_COLLEGE;
    const body = await readRpc(await callTool('college_summary', { p_institution_id: OTHER_COLLEGE }));
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/do not have access to that college/);
    expect(userRpc).toHaveBeenCalledWith('role_has_institution_access', { check_institution_id: OTHER_COLLEGE });
    expect(userRpc.mock.calls.some(([fn]) => fn === 'ai_rpc_students_summary')).toBe(false);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(logApiUsage.mock.calls[0][0]).toMatchObject({ endpoint: 'mcp:college_summary', statusCode: 403 });
  });

  it('runs for a college the owner can access', async () => {
    ownerMaySee = (id) => id === OWN_COLLEGE;
    const body = await readRpc(await callTool('college_summary', { p_institution_id: OWN_COLLEGE }));
    expect(body.result.isError).toBeFalsy();
    const call = userRpc.mock.calls.find(([fn]) => fn === 'ai_rpc_students_summary');
    expect(call![1]).toEqual({ p_institution_id: OWN_COLLEGE, p_user_id: OWNER });
  });

  it('refuses when the access check itself fails', async () => {
    userRpc.mockImplementationOnce(async (fn: string) =>
      fn === 'fn_ai_tool_menu' ? { data: MENU, error: null } : { data: null, error: null }
    );
    userRpc.mockImplementationOnce(async () => ({ data: null, error: { message: 'boom' } }) as never);
    const body = await readRpc(await callTool('college_summary', { p_institution_id: OWN_COLLEGE }));
    expect(body.result.isError).toBe(true);
    expect(userRpc.mock.calls.some(([fn]) => fn === 'ai_rpc_students_summary')).toBe(false);
  });

  it('an empty p_institution_id is not checked and not sent (the tool falls back to the own college)', async () => {
    const body = await readRpc(await callTool('college_summary', { p_institution_id: '' }));
    expect(body.result.isError).toBeFalsy();
    expect(userRpc.mock.calls.some(([fn]) => fn === 'role_has_institution_access')).toBe(false);
    const call = userRpc.mock.calls.find(([fn]) => fn === 'ai_rpc_students_summary');
    expect(call![1]).toEqual({ p_user_id: OWNER });
  });
});

describe('refusals', () => {
  it('401 for an unknown key, and no session is minted', async () => {
    keyRow = null;
    const res = await handlePersonalKeyRequest(rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), KEY);
    expect(res.status).toBe(401);
    expect(getUserSessionClient).not.toHaveBeenCalled();
  });

  it('401 for an expired key', async () => {
    keyRow = liveKey({ expires_at: new Date(Date.now() - 1000).toISOString() });
    const res = await handlePersonalKeyRequest(rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), KEY);
    expect(res.status).toBe(401);
    expect(getUserSessionClient).not.toHaveBeenCalled();
  });

  it('401 for an admin (non-personal) row that somehow matched', async () => {
    keyRow = liveKey({ key_kind: 'admin' });
    const res = await handlePersonalKeyRequest(rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), KEY);
    expect(res.status).toBe(401);
  });

  it('401 when the owner cannot be signed in (account gone or blocked)', async () => {
    getUserSessionClient.mockRejectedValueOnce(new Error('Account not found'));
    const res = await handlePersonalKeyRequest(rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), KEY);
    expect(res.status).toBe(401);
    expect(serviceRpc).not.toHaveBeenCalled();
  });

  it('a switched-off owner gets EXACTLY the turned-off-key answer (the reason is not revealed)', async () => {
    keyRow = null;
    const revoked = await handlePersonalKeyRequest(rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), KEY);
    const revokedBody = await revoked.json();

    keyRow = liveKey();
    getUserSessionClient.mockRejectedValueOnce(new AccountOffError());
    const res = await handlePersonalKeyRequest(rpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), KEY);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(revokedBody);
    expect(userRpc).not.toHaveBeenCalled();
  });

  it('429 once the key passes 60 requests in a minute', async () => {
    let last: Response | null = null;
    for (let i = 0; i < 61; i++) {
      last = await handlePersonalKeyRequest(rpcRequest({ jsonrpc: '2.0', id: i, method: 'tools/list' }), KEY);
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
  });
});
