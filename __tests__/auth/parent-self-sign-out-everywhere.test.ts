/**
 * "Sign out of all devices" — a PARENT on their own account (Settings screen).
 * Director ruling 2026-10-01. The route must:
 *  - act only for a verified parent_session, and only on the token's own account;
 *  - report "not switched on" (409) while pp_parent_accounts.sessions_revoked_at
 *    (#4168) is missing, and GET must then say available:false so the button hides;
 *  - treat an update that touched no row as a failure, never success;
 *  - on success clear this browser's parent cookies.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifyParentSession = vi.fn();
const insert = vi.fn();

type Result = { data: unknown; error: { code?: string; message?: string } | null };
const state: { probe: Result; update: Result; updates: Array<{ values: unknown; id: unknown }> } = {
  probe: { data: [], error: null },
  update: { data: [], error: null },
  updates: [],
};

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ limit: async () => state.probe }),
      insert: (row: unknown) => insert(row),
      update: (values: unknown) => ({
        eq: (_c: string, id: unknown) => ({
          select: async () => {
            state.updates.push({ values, id });
            return state.update;
          },
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/auth/parent-jwt', () => ({
  PARENT_SESSION_COOKIE: 'parent_session',
  PARENT_ACTIVE_LEARNER_COOKIE: 'pp_active_learner',
  verifyParentSession: (t: unknown) => verifyParentSession(t),
}));

import { GET, POST } from '@/app/api/parent/auth/sign-out-everywhere/route';

const ACCOUNT = '00000000-0000-4000-8000-0000000000e5';

function req(method: 'GET' | 'POST', body?: unknown) {
  return new NextRequest('http://localhost/api/parent/auth/sign-out-everywhere', {
    method,
    headers: { 'content-type': 'application/json', cookie: 'parent_session=tok' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  verifyParentSession.mockResolvedValue({ sub: ACCOUNT, learnerProfileId: 'l-1' });
  state.probe = { data: [], error: null };
  state.update = { data: [{ id: ACCOUNT }], error: null };
  state.updates = [];
});

describe('POST /api/parent/auth/sign-out-everywhere', () => {
  it('sets sessions_revoked_at on the caller’s OWN account (from the token) and clears the cookies', async () => {
    const res = await POST(req('POST', { accountId: 'someone-else' }));
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].id).toBe(ACCOUNT);
    expect(Object.keys(state.updates[0].values as object)).toEqual(['sessions_revoked_at']);
    const cleared = res.headers.getSetCookie().join(';');
    expect(cleared).toMatch(/parent_session=;/);
    expect(cleared).toMatch(/pp_active_learner=;/);
    // Signing YOURSELF out leaves no "an admin signed you out" notice.
    expect(insert).not.toHaveBeenCalled();
  });

  it('a caller with no valid parent session is refused and nothing is written', async () => {
    verifyParentSession.mockResolvedValue(null);
    const res = await POST(req('POST', {}));
    expect(res.status).toBe(401);
    expect(state.updates).toHaveLength(0);
  });

  it('says "not switched on yet" (409) while the column is missing', async () => {
    state.update = { data: null, error: { code: 'PGRST204', message: 'column not found' } };
    const res = await POST(req('POST', {}));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not switched on yet/);
  });

  it('an update that touched no row is a failure, not success, and keeps the cookies', async () => {
    state.update = { data: [], error: null };
    const res = await POST(req('POST', {}));
    expect(res.status).toBe(500);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});

describe('GET (is the button switched on?)', () => {
  it('available once the column exists', async () => {
    expect(await (await GET(req('GET'))).json()).toEqual({ available: true });
  });

  it('NOT available while the column is missing — the Settings screen hides the button', async () => {
    state.probe = { data: null, error: { code: '42703', message: 'column does not exist' } };
    expect(await (await GET(req('GET'))).json()).toEqual({ available: false });
  });

  it('refuses a caller with no parent session', async () => {
    verifyParentSession.mockResolvedValue(null);
    expect((await GET(req('GET'))).status).toBe(401);
  });
});
