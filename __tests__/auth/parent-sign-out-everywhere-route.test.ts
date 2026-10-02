/**
 * "Sign out of all devices" for a PARENT account — the admin route.
 *
 * Parents carry a signed parent_session JWT, not a Supabase session; the kill
 * switch is pp_parent_accounts.sessions_revoked_at (draft PR #4168). The route
 * must:
 *  - refuse anyone who may not manage parent user data (403, nothing written);
 *  - refuse a principal acting on another institution's parent (403);
 *  - say "not switched on yet" (409) while the column does not exist, and the
 *    availability probe must then report available:false so the button hides;
 *  - on success set sessions_revoked_at and write the activity row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireParentUserDataAdmin = vi.fn();
const logActivity = vi.fn();

type Result = { data: unknown; error: { code?: string; message?: string } | null };

const state: {
  account: Result;
  learner: Result;
  profile: Result;
  probe: Result;
  update: Result;
  updates: Array<{ table: string; values: Record<string, unknown>; id: unknown }>;
} = {
  account: { data: null, error: null },
  learner: { data: null, error: null },
  profile: { data: null, error: null },
  probe: { data: [], error: null },
  update: { data: null, error: null },
  updates: [],
};

function fakeDb() {
  return {
    from(table: string) {
      return {
        select(cols: string) {
          return {
            limit: async () => state.probe,
            eq: () => ({
              maybeSingle: async () => {
                if (table === 'pp_parent_accounts') return state.account;
                if (table === 'learners_profiles') return state.learner;
                if (table === 'profiles') return state.profile;
                throw new Error(`unexpected read ${table} ${cols}`);
              },
            }),
          };
        },
        update(values: Record<string, unknown>) {
          return {
            eq: (_col: string, id: unknown) => ({
              select: async () => {
                state.updates.push({ table, values, id });
                return state.update;
              },
            }),
          };
        },
      };
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => fakeDb(),
}));
vi.mock('@/lib/utils/parent-admin-auth', () => ({
  requireParentUserDataAdmin: () => requireParentUserDataAdmin(),
}));
vi.mock('@/lib/utils/activity-logger', () => ({
  logActivity: (...args: unknown[]) => logActivity(...args),
}));

import { GET, POST } from '@/app/api/academic/parent-portal/users/sign-out-everywhere/route';

const ACCOUNT = '00000000-0000-4000-8000-0000000000c3';
const LEARNER = '00000000-0000-4000-8000-0000000000d4';
const INST_A = '00000000-0000-4000-8000-00000000000a';
const INST_B = '00000000-0000-4000-8000-00000000000b';

function post(body: unknown) {
  return new NextRequest('http://localhost/api/academic/parent-portal/users/sign-out-everywhere', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.account = { data: { id: ACCOUNT, learner_profile_id: LEARNER }, error: null };
  state.learner = {
    data: { institution_id: INST_A, first_name: 'Kavya', last_name: 'R' },
    error: null,
  };
  state.profile = { data: { institution_id: INST_A }, error: null };
  state.probe = { data: [], error: null };
  state.update = { data: [{ id: ACCOUNT }], error: null };
  state.updates = [];
  requireParentUserDataAdmin.mockResolvedValue({ id: 'admin-1', isSuperAdmin: true });
  logActivity.mockResolvedValue(undefined);
});

describe('POST /api/academic/parent-portal/users/sign-out-everywhere', () => {
  it('refuses a caller who may not manage parent user data, and writes nothing', async () => {
    requireParentUserDataAdmin.mockResolvedValue(null);
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/don't have access/);
    expect(state.updates).toHaveLength(0);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("refuses a principal acting on another institution's parent", async () => {
    requireParentUserDataAdmin.mockResolvedValue({ id: 'principal-1', isSuperAdmin: false });
    state.profile = { data: { institution_id: INST_B }, error: null };
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(res.status).toBe(403);
    expect(state.updates).toHaveLength(0);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('lets a principal sign out a parent in their own institution', async () => {
    requireParentUserDataAdmin.mockResolvedValue({ id: 'principal-1', isSuperAdmin: false });
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
  });

  it('rejects a missing or malformed account id', async () => {
    expect((await POST(post({}))).status).toBe(400);
    expect((await POST(post({ accountId: 'not-a-uuid' }))).status).toBe(400);
    expect(state.updates).toHaveLength(0);
  });

  it('says the account was not found', async () => {
    state.account = { data: null, error: null };
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(res.status).toBe(404);
    expect(state.updates).toHaveLength(0);
  });

  it('sets sessions_revoked_at on that one account and writes the activity row', async () => {
    const before = Date.now();
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(res.status).toBe(200);

    expect(state.updates).toHaveLength(1);
    const [u] = state.updates;
    expect(u.table).toBe('pp_parent_accounts');
    expect(u.id).toBe(ACCOUNT);
    expect(Object.keys(u.values)).toEqual(['sessions_revoked_at']);
    const at = Date.parse(String(u.values.sessions_revoked_at));
    expect(at).toBeGreaterThanOrEqual(before - 1000);

    expect(logActivity).toHaveBeenCalledTimes(1);
    const row = logActivity.mock.calls[0][0] as Record<string, any>;
    expect(row.userId).toBe('admin-1');
    expect(row.actionType).toBe('revoke');
    expect(row.resourceType).toBe('parent_account');
    expect(row.resourceId).toBe(ACCOUNT);
    expect(row.institutionId).toBe(INST_A);
    expect(row.metadata.sessions_revoked_at).toBe(u.values.sessions_revoked_at);
    expect(row.metadata.requested_by).toBe('admin');
  });

  it('answers "not switched on yet" (409) while the column does not exist, and logs nothing', async () => {
    state.update = { data: null, error: { code: 'PGRST204', message: 'column not found' } };
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not switched on yet/);
    expect(logActivity).not.toHaveBeenCalled();

    state.update = { data: null, error: { code: '42703', message: 'column does not exist' } };
    expect((await POST(post({ accountId: ACCOUNT }))).status).toBe(409);
  });

  it('an update that touched no row is a failure, not success', async () => {
    state.update = { data: [], error: null };
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(res.status).toBe(500);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('reports any other database failure as a failure, not success', async () => {
    state.update = { data: null, error: { code: '57014', message: 'timeout' } };
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(res.status).toBe(500);
    expect(logActivity).not.toHaveBeenCalled();
  });
});

describe('GET (is the parent button switched on?)', () => {
  it('is available once the column exists', async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ available: true });
  });

  it('is NOT available while the column is missing — the panel hides the button', async () => {
    state.probe = { data: null, error: { code: '42703', message: 'column does not exist' } };
    expect(await (await GET()).json()).toEqual({ available: false });
    state.probe = { data: null, error: { code: 'PGRST204', message: 'not in schema cache' } };
    expect(await (await GET()).json()).toEqual({ available: false });
  });

  it('refuses a caller who may not manage parent user data', async () => {
    requireParentUserDataAdmin.mockResolvedValue(null);
    expect((await GET()).status).toBe(403);
  });
});
