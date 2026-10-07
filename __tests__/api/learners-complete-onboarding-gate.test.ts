/**
 * Learners — POST /api/learners/complete-onboarding access gate.
 *
 * The route creates a login (auth user + profile) for a learner using the
 * service role, so it bypasses RLS entirely. Before this gate it had no
 * authentication at all: anyone on the internet could post a learner id.
 *
 * The bar is the predicate in learners_profiles_update_policy, the same one
 * fn_activate_learner_from_onboarding re-applies:
 *   is_super_admin() OR is_admin()
 *   OR (role_has_institution_access(institution_id)
 *       AND any of learners.admissions.edit / learners.profiles.edit / learners.edit)
 *
 * There is no learner-self path: a learner without a login cannot be signed in,
 * and a signed-in learner already has a profile. A signed-in learner without
 * edit authority is refused whether the id is their own or someone else's.
 *
 * Every test that passes the gate stops at "profile is not complete" (400),
 * which proves the request reached the learner checks and nothing further.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before the handler is imported (vitest hoists vi.mock).
// ---------------------------------------------------------------------------

type RpcResult = { data: unknown; error: unknown };

let currentUser: { id: string } | null = { id: 'team-member-1' };
let rpcResults: Record<string, RpcResult> = {};
let permissionGrants: Record<string, boolean> = {};
let learnerRow: Record<string, unknown> | null = null;

const rpcMock = vi.fn((fn: string, args?: { permission_name?: string }) => {
  if (fn === 'user_has_permission') {
    if (rpcResults.user_has_permission) return Promise.resolve(rpcResults.user_has_permission);
    return Promise.resolve({ data: permissionGrants[args?.permission_name ?? ''] === true, error: null });
  }
  return Promise.resolve(rpcResults[fn] ?? { data: false, error: null });
});

const adminFrom = vi.fn();

function adminBuilder() {
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    single: vi.fn(() =>
      Promise.resolve(
        learnerRow ? { data: learnerRow, error: null } : { data: null, error: { message: 'no rows' } }
      )
    ),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => {
      adminFrom(...args);
      return adminBuilder();
    },
    auth: { admin: {} },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser }, error: null }) },
      rpc: (fn: string, args?: { permission_name?: string }) => rpcMock(fn, args),
    }),
}));

vi.mock('@/lib/utils/activity-logger', () => ({
  logActivity: vi.fn(),
  ActivityTemplates: { userCreated: vi.fn(() => ({})) },
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// SUT imported AFTER the mocks.
import { POST } from '@/app/api/learners/complete-onboarding/route';

const OWN_LEARNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_LEARNER_ID = '22222222-2222-4222-8222-222222222222';
const INSTITUTION_ID = 'b962527f-97ce-4238-89ce-7b532d7c2bc6';

function onboardRequest(body: unknown = { learner_id: OTHER_LEARNER_ID }) {
  return new Request('https://jkkn.ai/api/learners/complete-onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  currentUser = { id: 'team-member-1' };
  rpcResults = {
    is_super_admin: { data: false, error: null },
    is_admin: { data: false, error: null },
    role_has_institution_access: { data: true, error: null },
  };
  permissionGrants = {};
  learnerRow = {
    id: OTHER_LEARNER_ID,
    institution_id: INSTITUTION_ID,
    is_profile_complete: false,
    lifecycle_status: 'active',
    college_email: 'learner@jkkn.ac.in',
  };
  rpcMock.mockClear();
  adminFrom.mockClear();
});

// ---------------------------------------------------------------------------

describe('POST /api/learners/complete-onboarding — access gate', () => {
  it('refuses an unauthenticated caller with 401 and never touches learner data', async () => {
    currentUser = null;
    const res = await POST(onboardRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'Unauthorized' });
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it('refuses a signed-in learner without edit authority on their OWN record with 403', async () => {
    currentUser = { id: 'learner-user' };
    const res = await POST(onboardRequest({ learner_id: OWN_LEARNER_ID }));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it('refuses a signed-in learner targeting ANOTHER learner with 403', async () => {
    currentUser = { id: 'learner-user' };
    const res = await POST(onboardRequest({ learner_id: OTHER_LEARNER_ID }));
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it('refuses a team member with the permission but no access to the learner institution with 403', async () => {
    permissionGrants = { 'learners.profiles.edit': true };
    rpcResults.role_has_institution_access = { data: false, error: null };
    const res = await POST(onboardRequest());
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(rpcMock).toHaveBeenCalledWith('role_has_institution_access', {
      check_institution_id: INSTITUTION_ID,
    });
  });

  it.each(['learners.admissions.edit', 'learners.profiles.edit', 'learners.edit'])(
    'lets a team member with %s at the learner institution through',
    async (key) => {
      permissionGrants = { [key]: true };
      const res = await POST(onboardRequest());
      // 400 "profile is not complete" = the gate passed and the learner checks ran.
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/not complete/);
      expect(adminFrom).toHaveBeenCalledWith('learners_profiles');
    }
  );

  it('lets an admin through without an institution check', async () => {
    rpcResults.is_admin = { data: true, error: null };
    rpcResults.role_has_institution_access = { data: false, error: null };
    const res = await POST(onboardRequest());
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalledWith('role_has_institution_access', expect.anything());
  });

  it('lets a super admin through', async () => {
    rpcResults.is_super_admin = { data: true, error: null };
    const res = await POST(onboardRequest());
    expect(res.status).toBe(400);
  });

  it('answers 500, not 403, when the permission check itself fails', async () => {
    rpcResults.user_has_permission = { data: null, error: { code: '42501', message: 'permission denied' } };
    const res = await POST(onboardRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/permission/i);
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it('answers 500, not 403, when the institution check itself fails', async () => {
    permissionGrants = { 'learners.edit': true };
    rpcResults.role_has_institution_access = { data: null, error: { message: 'boom' } };
    const res = await POST(onboardRequest());
    expect(res.status).toBe(500);
  });

  it('checks access before reading the body, so a malformed body from an outsider is still 401', async () => {
    currentUser = null;
    const req = new Request('https://jkkn.ai/api/learners/complete-onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    }) as any;
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
