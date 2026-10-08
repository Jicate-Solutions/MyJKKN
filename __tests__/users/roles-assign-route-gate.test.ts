/**
 * POST /api/users/roles/assign asks the database who may assign roles, across
 * every role the caller holds, and keeps roles with admin powers for super
 * admins (Director, 8 Oct 2026).
 *
 * Before: the route read custom_roles for the caller's PRIMARY role only, so a
 * secondary role was ignored, and a primary role granting roles.assign could
 * hand anyone any role, super_admin included, through the service-role client.
 *
 * Auth, the two permission RPCs and the service-role writes are faked; only
 * the route's gate is under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const CALLER = 'caller-1';
const TARGET = 'target-1';

// What the caller's own session answers.
let callerProfileRole: string | null = 'counselor';
let rpcAnswers: Record<string, boolean> = {};
// Primary-role permissions, as the old gate read them from custom_roles.
let primaryRolePermissions: Record<string, boolean> = {};

// What the service-role client sees.
let roles: Record<string, { id: string; role_key: string; role_name: string; is_privileged: boolean | null }> = {};
const inserted: { table: string; row: unknown }[] = [];

function chain(rowsFor: () => unknown[], table: string) {
  const q: any = {};
  let filterValue: unknown = null;
  for (const m of ['select', 'order', 'in']) q[m] = () => q;
  q.eq = (_col: string, v: unknown) => {
    filterValue = v;
    return q;
  };
  q.single = () => {
    const rows = rowsFor() as any[];
    const row = rows.find((r) => r.__key === undefined || r.__key === filterValue) ?? null;
    return Promise.resolve({ data: row, error: row ? null : { message: 'not found' } });
  };
  q.insert = (row: unknown) => {
    inserted.push({ table, row });
    const res: any = Promise.resolve({ data: null, error: null });
    res.select = () => ({ single: () => Promise.resolve({ data: { id: 'notif-1' }, error: null }) });
    return res;
  };
  q.then = (res: any, rej: any) => Promise.resolve({ data: rowsFor(), error: null }).then(res, rej);
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: CALLER } }, error: null }) },
      rpc: (fn: string, args?: { permission_name?: string }) => {
        const key = fn === 'user_has_permission' ? `${fn}:${args?.permission_name}` : fn;
        return Promise.resolve({ data: rpcAnswers[key] ?? false, error: null });
      },
      from: (table: string) =>
        chain(() => {
          if (table === 'profiles') return [{ role: callerProfileRole, full_name: 'Caller' }];
          if (table === 'custom_roles') return [{ permissions: primaryRolePermissions }];
          return [];
        }, table)
    }),
  createServiceRoleClient: () => ({
    from: (table: string) =>
      chain(() => {
        if (table === 'custom_roles') return Object.values(roles).map((r) => ({ ...r, __key: r.role_key }));
        if (table === 'profiles') return [{ id: TARGET, full_name: 'Target', email: 't@x' }];
        return [];
      }, table)
  })
}));

vi.mock('@/lib/usage/record', () => ({
  recordFeatureUse: () => Promise.resolve(),
  FEATURE_KEYS: { USERS_ASSIGN_ROLE: 'users.assign_role' }
}));
vi.mock('@/lib/push/opt-out', () => ({ isPushOptedOut: () => Promise.resolve(true) }));
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: () => Promise.resolve() } }));

import { POST } from '@/app/api/users/roles/assign/route';

function post(roleKey: string) {
  return POST(
    new Request('http://x/api/users/roles/assign', {
      method: 'POST',
      body: JSON.stringify({ userId: TARGET, roleKey })
    }) as any
  );
}

function userRoleInserts() {
  return inserted.filter((i) => i.table === 'user_roles');
}

beforeEach(() => {
  callerProfileRole = 'counselor';
  rpcAnswers = {};
  primaryRolePermissions = {};
  inserted.length = 0;
  roles = {
    counselor: { id: 'r-counselor', role_key: 'counselor', role_name: 'Counselor', is_privileged: false },
    super_admin: { id: 'r-super', role_key: 'super_admin', role_name: 'Super Admin', is_privileged: true },
    unflagged: { id: 'r-unflagged', role_key: 'unflagged', role_name: 'Unflagged', is_privileged: null }
  };
});

describe('POST /api/users/roles/assign gate', () => {
  it('refuses a caller whose roles do not grant roles.assign, even when the primary role row says it does', async () => {
    // The old gate trusted the primary role's custom_roles row; the database
    // (all roles merged) says no.
    primaryRolePermissions = { 'roles.assign': true };
    rpcAnswers = { is_super_admin: false, 'user_has_permission:roles.assign': false };
    const res = await post('counselor');
    expect(res.status).toBe(403);
    expect(userRoleInserts()).toHaveLength(0);
  });

  it('a guest-only caller (no roles.assign once the guest grant is gone) gets 403', async () => {
    callerProfileRole = null;
    rpcAnswers = { is_super_admin: false, 'user_has_permission:roles.assign': false };
    const res = await post('counselor');
    expect(res.status).toBe(403);
    expect(userRoleInserts()).toHaveLength(0);
  });

  it('a super admin can assign a privileged role', async () => {
    callerProfileRole = 'administrator';
    rpcAnswers = { is_super_admin: true, 'user_has_permission:roles.assign': true };
    const res = await post('super_admin');
    expect(res.status).toBe(200);
    expect(userRoleInserts()).toHaveLength(1);
  });

  it('a non-super-admin with roles.assign can assign an ordinary role', async () => {
    rpcAnswers = { is_super_admin: false, 'user_has_permission:roles.assign': true };
    const res = await post('counselor');
    expect(res.status).toBe(200);
    expect(userRoleInserts()).toHaveLength(1);
  });

  it('a non-super-admin with roles.assign cannot assign a privileged role', async () => {
    primaryRolePermissions = { 'roles.assign': true };
    rpcAnswers = { is_super_admin: false, 'user_has_permission:roles.assign': true };
    const res = await post('super_admin');
    expect(res.status).toBe(403);
    expect(userRoleInserts()).toHaveLength(0);
  });

  it('a role with no privileged flag counts as privileged (fails closed)', async () => {
    rpcAnswers = { is_super_admin: false, 'user_has_permission:roles.assign': true };
    const res = await post('unflagged');
    expect(res.status).toBe(403);
    expect(userRoleInserts()).toHaveLength(0);
  });
});
