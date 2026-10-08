/**
 * POST /api/users/roles/assign is for super admins only (Director, 8 Oct 2026:
 * "Admins need not give any role. We have enough super admins.").
 *
 *   - Super admin = the is_super_admin flag, asked as the caller's session.
 *     No role key opens the route: administrator, payment_audit_admin and
 *     guest callers are refused, whatever their roles grant.
 *   - Nobody gives a role to themselves, super admins included.
 *   - Any check that cannot run refuses with 500 and assigns nothing.
 *
 * Auth, the caller's session and the service-role reads/writes are faked; only
 * the route's gate is under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const CALLER = 'caller-1';
const TARGET = 'target-1';

// The caller's own session.
let callerRole: string | null = 'administrator';
let callerIsSuperFlag: unknown = false;
// What the caller's primary role grants. The route must never read it.
const ROLE_PERMS: Record<string, Record<string, unknown>> = {
  administrator: { 'roles.assign': true, 'users.edit': true },
  payment_audit_admin: { 'roles.assign': true },
  guest: { 'roles.assign': true, assign_roles: true },
  super_admin: { 'roles.assign': true }
};
// Service-role view.
const ROLES: Record<string, { id: string; role_key: string; role_name: string }> = {
  ['faculty']: { id: 'r-faculty', role_key: 'faculty', role_name: 'Faculty' }
};
let failing: Set<string> = new Set();
const inserted: { table: string; row: unknown }[] = [];

const ERR = { message: 'boom' };

function query(table: string, read: (filter: unknown) => unknown) {
  const q: any = {};
  let filter: unknown = null;
  q.select = () => q;
  q.in = () => q;
  q.order = () => q;
  q.eq = (_c: string, v: unknown) => {
    filter = v;
    return q;
  };
  const result = () =>
    failing.has(table) ? { data: null, error: ERR } : { data: read(filter), error: null };
  q.single = () => {
    const r = result();
    return Promise.resolve(r.error || r.data ? r : { data: null, error: { message: 'no rows' } });
  };
  q.maybeSingle = () => Promise.resolve(result());
  q.then = (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
  q.insert = (row: unknown) => {
    inserted.push({ table, row });
    const p: any = Promise.resolve({ data: null, error: null });
    p.select = () => ({ single: () => Promise.resolve({ data: { id: 'notif-1' }, error: null }) });
    return p;
  };
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: CALLER } }, error: null }) },
      rpc: (fn: string, args?: { permission_name?: string }) => {
        if (failing.has(`rpc:${fn}`)) return Promise.resolve({ data: null, error: ERR });
        if (fn === 'is_super_admin') return Promise.resolve({ data: callerIsSuperFlag, error: null });
        // If the route ever asks by permission key again, answer as the roles would.
        if (fn === 'user_has_permission')
          return Promise.resolve({ data: ROLE_PERMS[callerRole ?? '']?.[args?.permission_name ?? ''] === true, error: null });
        return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
      },
      from: (table: string) =>
        query(`caller:${table}`, () => {
          if (table === 'profiles') return { role: callerRole, full_name: 'Caller', is_super_admin: callerIsSuperFlag };
          if (table === 'custom_roles') return { permissions: ROLE_PERMS[callerRole ?? ''] ?? {} };
          return null;
        })
    }),
  createServiceRoleClient: () => ({
    from: (table: string) =>
      query(table, (filter) => {
        if (table === 'custom_roles') return ROLES[filter as string] ?? null;
        if (table === 'profiles') return filter === TARGET ? { id: TARGET, full_name: 'Target', email: 't@x' } : null;
        return null;
      })
  })
}));

vi.mock('@/lib/usage/record', () => ({
  recordFeatureUse: () => Promise.resolve(),
  FEATURE_KEYS: { USERS_ASSIGN_ROLE: 'users.assign_role' }
}));
vi.mock('@/lib/push/opt-out', () => ({ isPushOptedOut: () => Promise.resolve(true) }));
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: () => Promise.resolve() } }));

import { POST } from '@/app/api/users/roles/assign/route';

function post(roleKey: string, userId = TARGET) {
  return POST(
    new Request('http://x/api/users/roles/assign', {
      method: 'POST',
      body: JSON.stringify({ userId, roleKey })
    }) as any
  );
}

const assigned = () => inserted.filter((i) => i.table === 'user_roles');

function asSuperAdmin() {
  callerRole = 'super_admin';
  callerIsSuperFlag = true;
}

beforeEach(() => {
  callerRole = 'administrator';
  callerIsSuperFlag = false;
  failing = new Set();
  inserted.length = 0;
});

describe('super admins only', () => {
  it.each([['administrator'], ['payment_audit_admin'], ['guest']])(
    'refuses a %s caller, whose role grants roles.assign',
    async (role) => {
      callerRole = role;
      const res = await post('faculty');
      expect(res.status).toBe(403);
      expect(assigned()).toHaveLength(0);
    }
  );

  it('refuses a caller whose legacy role says super_admin but who lacks the flag', async () => {
    callerRole = 'super_admin';
    callerIsSuperFlag = false;
    const res = await post('faculty');
    expect(res.status).toBe(403);
    expect(assigned()).toHaveLength(0);
  });

  it("a super admin assigns the 'faculty' role", async () => {
    asSuperAdmin();
    const res = await post('faculty');
    expect(res.status).toBe(200);
    expect(assigned()).toEqual([
      { table: 'user_roles', row: { user_id: TARGET, role_id: 'r-faculty', is_primary: false, assigned_by: CALLER } }
    ]);
  });

  it.each([['true'], [1], [null]])('treats an is_super_admin answer of %j as no', async (answer) => {
    callerRole = 'super_admin';
    callerIsSuperFlag = answer;
    const res = await post('faculty');
    expect(res.status).toBe(403);
    expect(assigned()).toHaveLength(0);
  });
});

describe('self-assignment', () => {
  it('refuses a super admin giving a role to themselves', async () => {
    asSuperAdmin();
    const res = await post('faculty', CALLER);
    expect(res.status).toBe(403);
    expect(assigned()).toHaveLength(0);
  });
});

describe('fail closed', () => {
  it.each([['rpc:is_super_admin'], ['custom_roles'], ['profiles']])(
    'returns 500 and assigns nothing when %s errors',
    async (which) => {
      asSuperAdmin();
      failing.add(which);
      const res = await post('faculty');
      expect(res.status).toBe(500);
      expect(assigned()).toHaveLength(0);
    }
  );
});
