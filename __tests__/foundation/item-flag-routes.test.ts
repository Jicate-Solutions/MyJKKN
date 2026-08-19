/**
 * Foundation — /api/foundation/item-flags route handlers.
 *
 * Drives the real handlers over a mocked Supabase session client. What these
 * prove that the SQL-contract tests cannot: the HTTP surface itself refuses the
 * unauthenticated caller, refuses the signed-in caller without
 * foundation.items.manage, and never lets the client choose whose name a report
 * is filed under.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before the handlers are imported (vitest hoists vi.mock).
// ---------------------------------------------------------------------------

let currentUser: { id: string } | null = { id: 'user-learner' };
let permissionResult: boolean = false;
let insertResult: { data: unknown; error: unknown } = { data: null, error: null };
let updateResult: { data: unknown; error: unknown } = { data: null, error: null };

/** What the handler actually sent to .insert()/.update(). */
let lastInsert: Record<string, unknown> | null = null;
let lastUpdate: Record<string, unknown> | null = null;

function insertBuilder() {
  const b: any = {
    insert: vi.fn((payload: Record<string, unknown>) => {
      lastInsert = payload;
      return b;
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      lastUpdate = payload;
      return b;
    }),
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    order: vi.fn(() => b),
    limit: vi.fn(() => b),
    single: vi.fn(() => Promise.resolve(insertResult)),
    maybeSingle: vi.fn(() => Promise.resolve(updateResult)),
  };
  return b;
}

const rpcMock = vi.fn(() => Promise.resolve({ data: permissionResult, error: null }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
      from: () => insertBuilder(),
      rpc: (...args: unknown[]) => rpcMock(...(args as [])),
    }),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// SUT imported AFTER the mocks.
import { POST } from '@/app/api/foundation/item-flags/route';
import { PATCH } from '@/app/api/foundation/item-flags/[id]/route';

const ITEM_ID = '11111111-2222-4333-8444-555555555555';
const FLAG_ID = '99999999-8888-4777-8666-555555555555';

function postRequest(body: unknown) {
  return new Request('https://jkkn.ai/api/foundation/item-flags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

function patchRequest(body: unknown) {
  return new Request(`https://jkkn.ai/api/foundation/item-flags/${FLAG_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  currentUser = { id: 'user-learner' };
  permissionResult = false;
  insertResult = { data: { id: FLAG_ID, status: 'open' }, error: null };
  updateResult = { data: { id: FLAG_ID, status: 'dismissed' }, error: null };
  lastInsert = null;
  lastUpdate = null;
  rpcMock.mockClear();
});

// ---------------------------------------------------------------------------

describe('POST /api/foundation/item-flags — raising a report', () => {
  it('refuses an unauthenticated caller with 401', async () => {
    currentUser = null;
    const res = await POST(postRequest({ item_id: ITEM_ID }));
    expect(res.status).toBe(401);
  });

  it('accepts any signed-in caller — raising is not permission-gated', async () => {
    permissionResult = false; // no foundation permission at all
    const res = await POST(postRequest({ item_id: ITEM_ID, reason: 'two right answers' }));
    expect(res.status).toBe(201);
    // and it never asked for a permission, because raising does not need one
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('files the report under the caller, never under a client-supplied id', async () => {
    await POST(
      postRequest({
        item_id: ITEM_ID,
        reason: 'wrong key',
        flagged_by: 'someone-else',
        status: 'dismissed',
        resolved_by: 'someone-else',
      }),
    );
    expect(lastInsert).toMatchObject({
      item_id: ITEM_ID,
      flagged_by: 'user-learner',
      status: 'open',
    });
    // The client's attempt to pre-resolve its own report is simply not carried.
    expect(lastInsert).not.toHaveProperty('resolved_by');
    expect((lastInsert as any).status).toBe('open');
  });

  it('rejects a missing or non-uuid item_id with 400', async () => {
    expect((await POST(postRequest({}))).status).toBe(400);
    expect((await POST(postRequest({ item_id: 'not-a-uuid' }))).status).toBe(400);
  });

  it('turns the duplicate-report index violation into a readable 409', async () => {
    insertResult = { data: null, error: { code: '23505', message: 'duplicate key' } };
    const res = await POST(postRequest({ item_id: ITEM_ID }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already reported/i);
  });

  it('turns an RLS refusal into 403 rather than a bare 400', async () => {
    insertResult = { data: null, error: { code: '42501', message: 'rls' } };
    const res = await POST(postRequest({ item_id: ITEM_ID }));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/foundation/item-flags/[id] — closing a report', () => {
  const params = Promise.resolve({ id: FLAG_ID });

  it('refuses an unauthenticated caller with 401', async () => {
    currentUser = null;
    const res = await PATCH(patchRequest({ status: 'dismissed' }), { params });
    expect(res.status).toBe(401);
  });

  it('refuses the learner who raised it — 403, with the missing key named', async () => {
    // The core of the review model: the author of a report cannot close it.
    permissionResult = false;
    const res = await PATCH(patchRequest({ status: 'dismissed' }), { params });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.requiredPermission).toBe('foundation.items.manage');
    expect(body.error).toMatch(/do not have access/i);
    expect(lastUpdate).toBeNull(); // nothing was written
  });

  it('checks the permission by key, not by role name — and through the one-arg overload', async () => {
    permissionResult = true;
    await PATCH(patchRequest({ status: 'fixed' }), { params });
    // The argument NAME is the security assertion here, not a spelling detail.
    // user_has_permission has two overloads. The one-arg (permission_name text)
    // form resolves auth.uid() itself, so a cookie-scoped client can only ever
    // ask about its own caller. The two-arg (user_id uuid, permission_key text)
    // form takes a caller-supplied uuid and never compares it to auth.uid(), so
    // any signed-in user could ask "does <anyone> hold <any key>" and read the
    // whole role map back — which is why EXECUTE on it was revoked from
    // `authenticated` and it survives for service-role callers only.
    //
    // This test used to demand { user_id, permission_key }. Making the route
    // agree with it would have reintroduced a call to the revoked overload:
    // from a cookie-scoped client that returns 42501, the check reads falsy, and
    // every legitimate holder of the key is told 403 — the exact production
    // failure documented at app/api/admission/bridge/convert/route.ts.
    //
    // toHaveBeenCalledWith deep-equals the payload, so this also fails if a
    // user_id argument is ever added back alongside the correct one.
    expect(rpcMock).toHaveBeenCalledWith('user_has_permission', {
      permission_name: 'foundation.items.manage',
    });
  });

  it('lets a holder of foundation.items.manage close it, stamping who and when', async () => {
    permissionResult = true;
    const res = await PATCH(patchRequest({ status: 'dismissed' }), { params });
    expect(res.status).toBe(200);
    expect(lastUpdate).toMatchObject({
      status: 'dismissed',
      resolved_by: 'user-learner',
    });
    expect(typeof (lastUpdate as any).resolved_at).toBe('string');
  });

  it('will not reopen a report through this route', async () => {
    permissionResult = true;
    const res = await PATCH(patchRequest({ status: 'open' }), { params });
    expect(res.status).toBe(400);
    expect(lastUpdate).toBeNull();
  });

  it('rejects an unknown status with 400', async () => {
    permissionResult = true;
    expect((await PATCH(patchRequest({ status: 'deleted' }), { params })).status).toBe(400);
    expect((await PATCH(patchRequest({}), { params })).status).toBe(400);
  });

  it('reports 404 when RLS filtered the row away, not a false success', async () => {
    permissionResult = true;
    updateResult = { data: null, error: null };
    const res = await PATCH(patchRequest({ status: 'fixed' }), { params });
    expect(res.status).toBe(404);
  });
});
