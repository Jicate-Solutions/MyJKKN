/**
 * PR #4168 repair round (1 Oct 2026). Three review findings, each proven here:
 *
 *   1. Deploy order: the code must work whether or not migration
 *      20270705094100 (pp_parent_accounts.sessions_revoked_at) is applied.
 *      Pre-migration, the lookup retries WITHOUT the column (never select('*')),
 *      so /api/parent/* does not 500 and the page gate still renews / still
 *      clears a disabled account.
 *   2. Both password-reset paths set sessions_revoked_at = now(), so old phones
 *      are signed out after a reset; a missing column never fails the reset.
 *   3. A live login whose learners_profiles row is missing gets a clear
 *      "not linked" answer (401 + code not_linked) instead of a silent 401.
 *
 * Runs the real proxy(), real route handlers and real jose signing; only the
 * service-role client and a few side-effect modules are faked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';

const SECRET = 'test-parent-jwt-secret-0123456789';
const DAY = 60 * 60 * 24;
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const LEARNER_ID = '22222222-2222-2222-2222-222222222222';

// ---------------------------------------------------------------------------
// Service-role client double: records every call, answers via `db.respond`.
// ---------------------------------------------------------------------------
interface Call {
  table: string;
  op: 'select' | 'update';
  columns?: string;
  patch?: Record<string, unknown>;
  filters: Array<[string, string, unknown]>;
}
type Answer = { data: unknown; error: { code?: string; message: string } | null };

const db = {
  calls: [] as Call[],
  respond: (_call: Call): Answer => ({ data: null, error: null }),
};

function fakeServiceRoleClient() {
  return {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] };
      const settle = async () => {
        db.calls.push(call);
        return db.respond(call);
      };
      const chain = {
        select(columns: string) {
          call.op = 'select';
          call.columns = columns;
          return chain;
        },
        update(patch: Record<string, unknown>) {
          call.op = 'update';
          call.patch = patch;
          return chain;
        },
        eq(col: string, val: unknown) {
          call.filters.push(['eq', col, val]);
          return chain;
        },
        in(col: string, val: unknown) {
          call.filters.push(['in', col, val]);
          return chain;
        },
        maybeSingle: settle,
        then(resolve: (v: Answer) => unknown, reject?: (e: unknown) => unknown) {
          return settle().then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => fakeServiceRoleClient(),
  createClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/services/auth/student-validation-service', () => ({
  StudentValidationService: {},
}));

const sideEffects = vi.hoisted(() => ({
  findLearnersByMobile: vi.fn(async () => [] as Array<{ id: string; institution_id: string }>),
  verifyOtp: vi.fn(async () => ({ ok: true })),
  requireParentUserDataAdmin: vi.fn(async () => ({ id: 'admin-1', isSuperAdmin: true })),
}));
vi.mock('@/lib/utils/parent-identifier', () => ({
  normalizeMobile: (m: unknown) => (typeof m === 'string' ? m.replace(/\D/g, '').slice(-10) : ''),
  findLearnersByMobile: sideEffects.findLearnersByMobile,
}));
vi.mock('@/lib/services/auth/parent-otp-service', () => ({ verifyOtp: sideEffects.verifyOtp }));
vi.mock('@/lib/utils/parent-admin-auth', () => ({
  requireParentUserDataAdmin: sideEffects.requireParentUserDataAdmin,
}));
vi.mock('@/lib/auth/parent-password', () => ({
  hashPassword: async (p: string) => `hashed:${p}`,
}));

process.env.PARENT_JWT_SECRET = SECRET;
const secretKey = new TextEncoder().encode(SECRET);
const now = () => Math.floor(Date.now() / 1000);

async function tokenIssuedAt(iatSeconds: number) {
  return new SignJWT({ learnerProfileId: LEARNER_ID })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(ACCOUNT_ID)
    .setIssuedAt(iatSeconds)
    .setExpirationTime(iatSeconds + 400 * DAY)
    .sign(secretKey);
}

const MISSING_COLUMN_SELECT = {
  code: '42703',
  message: 'column pp_parent_accounts.sessions_revoked_at does not exist',
};
const MISSING_COLUMN_WRITE = {
  code: 'PGRST204',
  message: "Could not find the 'sessions_revoked_at' column of 'pp_parent_accounts' in the schema cache",
};

/** A database where migration 20270705094100 has NOT been applied. */
function preMigrationDb(account: Record<string, unknown> | null, learner: unknown = { id: LEARNER_ID }) {
  db.respond = (call) => {
    if (call.table === 'pp_parent_accounts' && call.op === 'select') {
      if (call.columns?.includes('sessions_revoked_at')) return { data: null, error: MISSING_COLUMN_SELECT };
      return { data: account, error: null };
    }
    if (call.table === 'pp_parent_accounts' && call.op === 'update') {
      if (call.patch && 'sessions_revoked_at' in call.patch) return { data: null, error: MISSING_COLUMN_WRITE };
      return { data: null, error: null };
    }
    if (call.table === 'learners_profiles') {
      return {
        data: learner
          ? { institution_id: 'inst-1', father_name: 'F', mother_name: null, father_mobile: null, mother_mobile: null, ...(learner as object) }
          : null,
        error: null,
      };
    }
    return { data: null, error: null };
  };
}

/** A database where the migration IS applied. */
function postMigrationDb(account: Record<string, unknown> | null, learner: unknown = { id: LEARNER_ID }) {
  db.respond = (call) => {
    if (call.table === 'pp_parent_accounts' && call.op === 'select') return { data: account, error: null };
    if (call.table === 'pp_parent_accounts' && call.op === 'update') return { data: null, error: null };
    if (call.table === 'learners_profiles') {
      return {
        data: learner
          ? { institution_id: 'inst-1', father_name: 'F', mother_name: null, father_mobile: null, mother_mobile: null, ...(learner as object) }
          : null,
        error: null,
      };
    }
    return { data: null, error: null };
  };
}

function accountSelects() {
  return db.calls.filter((c) => c.table === 'pp_parent_accounts' && c.op === 'select');
}

async function runProxy(path: string, token: string) {
  const { proxy } = await import('@/proxy');
  const req = new NextRequest(new URL(path, 'https://www.jkkn.ai'));
  req.cookies.set('parent_session', token);
  return proxy(req);
}

function parentCookie(res: unknown) {
  return (res as { cookies: { get(n: string): { value: string; maxAge?: number } | undefined } }).cookies.get(
    'parent_session'
  );
}

function apiRequest(path: string, token?: string, body?: unknown) {
  const req = new NextRequest(new URL(path, 'https://www.jkkn.ai'), {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'content-type': 'application/json' } : undefined,
  });
  if (token) req.cookies.set('parent_session', token);
  return req;
}

beforeEach(() => {
  db.calls = [];
  postMigrationDb({ id: ACCOUNT_ID, is_active: true, sessions_revoked_at: null });
  sideEffects.findLearnersByMobile.mockReset();
  sideEffects.findLearnersByMobile.mockResolvedValue([]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
});

// ---------------------------------------------------------------------------
// 1. Deploy order
// ---------------------------------------------------------------------------
describe('works before migration 20270705094100 is applied', () => {
  const claims = () => ({ sub: ACCOUNT_ID, learnerProfileId: LEARNER_ID, iat: now() - 100 });

  it('retries without the column (never select *) and keeps a live account alive', async () => {
    preMigrationDb({ id: ACCOUNT_ID, is_active: true });
    const { getParentAccountState } = await import('@/lib/auth/parent-session-state');
    const state = await getParentAccountState(fakeServiceRoleClient() as never, claims());
    expect(state).toBe('alive');
    const selects = accountSelects();
    expect(selects).toHaveLength(2);
    expect(selects[0].columns).toContain('sessions_revoked_at');
    expect(selects[1].columns).not.toContain('sessions_revoked_at');
    expect(selects[1].columns).not.toContain('*');
    expect(selects[1].columns).not.toContain('password');
  });

  it('still catches a disabled account and a removed account pre-migration', async () => {
    const { getParentAccountState } = await import('@/lib/auth/parent-session-state');
    preMigrationDb({ id: ACCOUNT_ID, is_active: false });
    expect(await getParentAccountState(fakeServiceRoleClient() as never, claims())).toBe('dead');
    preMigrationDb(null);
    expect(await getParentAccountState(fakeServiceRoleClient() as never, claims())).toBe('dead');
  });

  it('also falls back on PostgREST PGRST204', async () => {
    db.respond = (call) =>
      call.columns?.includes('sessions_revoked_at')
        ? { data: null, error: MISSING_COLUMN_WRITE }
        : { data: { id: ACCOUNT_ID, is_active: true }, error: null };
    const { getParentAccountState } = await import('@/lib/auth/parent-session-state');
    expect(await getParentAccountState(fakeServiceRoleClient() as never, claims())).toBe('alive');
  });

  it('any other database error is still "error", with no retry', async () => {
    db.respond = () => ({ data: null, error: { code: '08006', message: 'connection failure' } });
    const { getParentAccountState } = await import('@/lib/auth/parent-session-state');
    expect(await getParentAccountState(fakeServiceRoleClient() as never, claims())).toBe('error');
    expect(accountSelects()).toHaveLength(1);
  });

  it('API gate: /api/parent/* returns a scope, not 500, pre-migration', async () => {
    preMigrationDb({ id: ACCOUNT_ID, is_active: true });
    const { resolveParentScope } = await import('@/lib/utils/parent-access');
    const scope = await resolveParentScope(apiRequest('/api/parent/children', await tokenIssuedAt(now() - 100)));
    expect(scope?.loggedInLearnerId).toBe(LEARNER_ID);
    expect(scope?.parentAccountId).toBe(ACCOUNT_ID);
  });

  it('API gate: a disabled account pre-migration is 401 (null), not 500', async () => {
    preMigrationDb({ id: ACCOUNT_ID, is_active: false });
    const { resolveParentScope } = await import('@/lib/utils/parent-access');
    expect(await resolveParentScope(apiRequest('/api/parent/children', await tokenIssuedAt(now() - 100)))).toBeNull();
  });

  it('page gate: an old token is still renewed pre-migration', async () => {
    preMigrationDb({ id: ACCOUNT_ID, is_active: true });
    const res = await runProxy('/parent/dashboard', await tokenIssuedAt(now() - 5 * DAY));
    expect(res.status).toBe(200);
    const cookie = parentCookie(res);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.maxAge).toBe(400 * DAY);
  });

  it('page gate: a disabled account is still signed out pre-migration', async () => {
    preMigrationDb({ id: ACCOUNT_ID, is_active: false });
    const res = await runProxy('/parent/dashboard', await tokenIssuedAt(now() - 5 * DAY));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/parent/login');
    expect(parentCookie(res)?.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 2. Password resets sign out old phones
// ---------------------------------------------------------------------------
describe('password reset signs out every old login', () => {
  it('revokeParentSessions: ok / no-column / error / throw', async () => {
    const { revokeParentSessions } = await import('@/lib/auth/parent-session-state');
    expect(await revokeParentSessions(async () => ({ error: null }))).toBe('ok');
    expect(await revokeParentSessions(async () => ({ error: MISSING_COLUMN_WRITE }))).toBe('no-column');
    expect(await revokeParentSessions(async () => ({ error: { code: '42703', message: 'x' } }))).toBe('no-column');
    expect(await revokeParentSessions(async () => ({ error: { code: '23505', message: 'dup' } }))).toBe('error');
    expect(
      await revokeParentSessions(async () => {
        throw new Error('network');
      })
    ).toBe('error');
  });

  it('parent "forgot password" writes sessions_revoked_at = now() for the whole family', async () => {
    sideEffects.findLearnersByMobile.mockResolvedValue([{ id: LEARNER_ID, institution_id: 'inst-1' }]);
    const before = Date.now();
    const { POST } = await import('@/app/api/parent/auth/forgot/route');
    const res = await POST(apiRequest('/api/parent/auth/forgot', undefined, { mobile: '9876543210', otp: '123456', password: 'newpassword1' }));
    expect(res.status).toBe(200);
    const revoke = db.calls.find((c) => c.op === 'update' && c.patch && 'sessions_revoked_at' in c.patch);
    expect(revoke).toBeDefined();
    expect(revoke!.filters).toEqual([['in', 'learner_profile_id', [LEARNER_ID]]]);
    const at = Date.parse(revoke!.patch!.sessions_revoked_at as string);
    expect(at).toBeGreaterThanOrEqual(before - 1);
    expect(at).toBeLessThanOrEqual(Date.now() + 1);
    // The password itself was still changed, in its own write.
    expect(db.calls.some((c) => c.op === 'update' && c.patch?.password_hash === 'hashed:newpassword1')).toBe(true);
  });

  it('parent "forgot password" still succeeds when the column is missing', async () => {
    preMigrationDb({ id: ACCOUNT_ID, is_active: true });
    sideEffects.findLearnersByMobile.mockResolvedValue([{ id: LEARNER_ID, institution_id: 'inst-1' }]);
    const { POST } = await import('@/app/api/parent/auth/forgot/route');
    const res = await POST(apiRequest('/api/parent/auth/forgot', undefined, { mobile: '9876543210', otp: '123456', password: 'newpassword1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('admin reset writes sessions_revoked_at = now() for that account, keeping the plaintext export', async () => {
    postMigrationDb({ id: ACCOUNT_ID, learner_profile_id: LEARNER_ID });
    const { POST } = await import('@/app/api/academic/parent-portal/users/reset-password/route');
    const res = await POST(apiRequest('/api/academic/parent-portal/users/reset-password', undefined, { accountId: ACCOUNT_ID, password: 'newpassword1' }));
    expect(res.status).toBe(200);
    const updates = db.calls.filter((c) => c.op === 'update');
    expect(updates[0].patch).toMatchObject({ password_hash: 'hashed:newpassword1', reset_password: 'newpassword1' });
    const revoke = updates.find((c) => c.patch && 'sessions_revoked_at' in c.patch);
    expect(revoke?.filters).toEqual([['eq', 'id', ACCOUNT_ID]]);
    expect(revoke?.patch?.sessions_revoked_at).toBe(updates[0].patch?.updated_at);
  });

  it('admin reset still succeeds, plaintext export intact, when the column is missing', async () => {
    preMigrationDb({ id: ACCOUNT_ID, learner_profile_id: LEARNER_ID });
    const { POST } = await import('@/app/api/academic/parent-portal/users/reset-password/route');
    const res = await POST(apiRequest('/api/academic/parent-portal/users/reset-password', undefined, { accountId: ACCOUNT_ID, password: 'newpassword1' }));
    expect(res.status).toBe(200);
    const updates = db.calls.filter((c) => c.op === 'update');
    expect(updates[0].patch).toMatchObject({ reset_password: 'newpassword1' });
  });

  it('after a reset, the old phone is signed out on its next page and API request', async () => {
    const oldToken = await tokenIssuedAt(now() - 3 * DAY);
    postMigrationDb({ id: ACCOUNT_ID, is_active: true, sessions_revoked_at: new Date().toISOString() });
    const page = await runProxy('/parent/dashboard', oldToken);
    expect(page.headers.get('location')).toContain('/parent/login');
    expect(parentCookie(page)?.value).toBe('');
    const { resolveParentScope } = await import('@/lib/utils/parent-access');
    expect(await resolveParentScope(apiRequest('/api/parent/children', oldToken))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Live login, missing learner link → clear answer, not a silent loop
// ---------------------------------------------------------------------------
describe('account not linked to a learner', () => {
  it('resolveParentScopeWithReason says not_linked (and resolveParentScope stays null)', async () => {
    postMigrationDb({ id: ACCOUNT_ID, is_active: true, sessions_revoked_at: null }, null);
    const token = await tokenIssuedAt(now() - 100);
    const { resolveParentScopeWithReason, resolveParentScope } = await import('@/lib/utils/parent-access');
    expect(await resolveParentScopeWithReason(apiRequest('/api/parent/children', token))).toEqual({
      scope: null,
      reason: 'not_linked',
    });
    expect(await resolveParentScope(apiRequest('/api/parent/children', token))).toBeNull();
  });

  it('/api/parent/children answers 401 with code not_linked and the office message', async () => {
    postMigrationDb({ id: ACCOUNT_ID, is_active: true, sessions_revoked_at: null }, null);
    const { GET } = await import('@/app/api/parent/children/route');
    const res = await GET(apiRequest('/api/parent/children', await tokenIssuedAt(now() - 100)));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('not_linked');
    expect(body.error).toMatch(/isn't linked to a learner yet/);
    expect(body.error).toMatch(/college office/);
  });

  it('a signed-out / disabled request to /api/parent/children is a plain 401 without the code', async () => {
    postMigrationDb({ id: ACCOUNT_ID, is_active: false, sessions_revoked_at: null });
    const { GET } = await import('@/app/api/parent/children/route');
    const res = await GET(apiRequest('/api/parent/children', await tokenIssuedAt(now() - 100)));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBeUndefined();
  });
});
