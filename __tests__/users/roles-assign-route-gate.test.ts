/**
 * POST /api/users/roles/assign — who may assign which role to whom (Director, 8 Oct 2026).
 *
 * The caller check stays on the PRIMARY role (plus the is_super_admin flag)
 * until migration 20271008121730 takes roles.assign off guest; widening it
 * first would let guest holders through. On top of that, refusals that hold
 * whoever the caller is:
 *   (a) nobody assigns a role to themselves;
 *   (b) only a super admin changes the roles of someone with admin powers;
 *   (c) only a super admin gives a privileged-like role (flag, every-college
 *       scope, role/user/settings keys, payroll approve/manage).
 * Any check that cannot run refuses with 500.
 *
 * Auth, the caller's reads and the service-role reads/writes are faked; only
 * the route's gate is under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const CALLER = 'caller-1';
const TARGET = 'target-1';

type Role = {
  id: string;
  role_key: string;
  role_name: string;
  is_privileged: boolean | null;
  institution_scope: string;
  permissions: unknown;
};

// The caller's own session.
let callerRole: string | null = 'counselor';
let callerIsSuperFlag = false;
let rolePermsByKey: Record<string, Record<string, boolean>> = {};
// Service-role view.
let roles: Record<string, Role> = {};
let target: Record<string, unknown> | null = null;
let targetRoleKeys: string[] = [];
// Fault injection: table/rpc name → error.
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
      rpc: (fn: string) =>
        Promise.resolve(
          failing.has(`rpc:${fn}`)
            ? { data: null, error: ERR }
            : { data: fn === 'is_super_admin' ? callerIsSuperFlag : false, error: null }
        ),
      from: (table: string) =>
        query(`caller:${table}`, (filter) => {
          if (table === 'profiles') return { role: callerRole, full_name: 'Caller' };
          if (table === 'custom_roles') {
            const p = rolePermsByKey[filter as string];
            return p ? { permissions: p } : null;
          }
          return null;
        })
    }),
  createServiceRoleClient: () => ({
    from: (table: string) =>
      query(table, (filter) => {
        if (table === 'custom_roles') return roles[filter as string] ?? null;
        if (table === 'profiles') return filter === TARGET ? target : null;
        if (table === 'user_roles') return targetRoleKeys.map((k) => ({ custom_roles: roles[k] ?? null }));
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

function role(key: string, over: Partial<Role> = {}): Role {
  return {
    id: `r-${key}`,
    role_key: key,
    role_name: key,
    is_privileged: false,
    institution_scope: 'own',
    permissions: { 'calendar.view': true },
    ...over
  };
}

beforeEach(() => {
  callerRole = 'counselor';
  callerIsSuperFlag = false;
  rolePermsByKey = { counselor: { 'roles.assign': true } };
  failing = new Set();
  inserted.length = 0;
  target = { id: TARGET, full_name: 'Target', email: 't@x', role: 'driver', is_super_admin: false };
  targetRoleKeys = ['driver'];
  roles = {
    driver: role('driver'),
    librarian: role('librarian'),
    super_admin: role('super_admin', { is_privileged: true, institution_scope: 'all' }),
    hr_admin: role('hr_admin', { is_privileged: true }),
    unflagged: role('unflagged', { is_privileged: null }),
    all_colleges: role('all_colleges', { institution_scope: 'all' }),
    nested_users: role('nested_users', { permissions: { users: { view: true } } }),
    payroll_approver: role('payroll_approver', { permissions: { 'hr.payroll.salary.approve': true } }),
    settings_editor: role('settings_editor', { permissions: ['settings.general.edit'] })
  };
});

describe('allowed paths', () => {
  it('a primary role granting roles.assign gives an ordinary role to an ordinary person', async () => {
    const res = await post('librarian');
    expect(res.status).toBe(200);
    expect(assigned()).toHaveLength(1);
  });

  it('a super admin gives a privileged role to an ordinary person', async () => {
    callerRole = 'super_admin';
    callerIsSuperFlag = true;
    const res = await post('hr_admin');
    expect(res.status).toBe(200);
    expect(assigned()).toHaveLength(1);
  });
});

describe('caller check stays primary-role only', () => {
  it('regression guard: a caller whose primary role lacks roles.assign (e.g. guest held as a second role) is refused', async () => {
    callerRole = 'driver';
    const res = await post('librarian');
    expect(res.status).toBe(403);
    expect(assigned()).toHaveLength(0);
  });
});

describe('(a) self-assignment', () => {
  it('refuses assigning a role to yourself, even for a super admin', async () => {
    callerRole = 'super_admin';
    callerIsSuperFlag = true;
    const res = await post('librarian', CALLER);
    expect(res.status).toBe(403);
    expect(assigned()).toHaveLength(0);
  });
});

describe('(b) a target with admin powers', () => {
  it('refuses a non-super-admin when the target has the super admin flag', async () => {
    target = { ...target!, is_super_admin: true };
    const res = await post('librarian');
    expect(res.status).toBe(403);
    expect(assigned()).toHaveLength(0);
  });

  it.each([
    ['the super admin flag', () => { target = { ...target!, is_super_admin: true }; }],
    ['a privileged second role', () => { targetRoleKeys = ['driver', 'hr_admin']; }],
    ['the legacy administrator role', () => { target = { ...target!, role: 'administrator' }; }]
  ])('lets a super admin change the roles of a target with %s', async (_label, arrange) => {
    arrange();
    callerRole = 'super_admin';
    callerIsSuperFlag = true;
    const res = await post('librarian');
    expect(res.status).toBe(200);
    expect(assigned()).toHaveLength(1);
  });

  it('refuses when the target holds a privileged role as a second role', async () => {
    targetRoleKeys = ['driver', 'hr_admin'];
    const res = await post('librarian');
    expect(res.status).toBe(403);
    expect(assigned()).toHaveLength(0);
  });

  it("refuses when the target's legacy role is administrator", async () => {
    target = { ...target!, role: 'administrator' };
    const res = await post('librarian');
    expect(res.status).toBe(403);
    expect(assigned()).toHaveLength(0);
  });
});

describe('(c) privileged-like roles need a super admin', () => {
  it.each([
    ['hr_admin', 'flagged privileged'],
    ['super_admin', 'flagged and every college'],
    ['unflagged', 'no flag (fails closed)'],
    ['all_colleges', "unflagged but scope 'all'"],
    ['nested_users', 'unflagged but grants users.view (nested shape)'],
    ['payroll_approver', 'unflagged but approves payroll'],
    ['settings_editor', 'unflagged but grants settings.* (array shape)']
  ])('refuses %s for a non-super-admin (%s)', async (key) => {
    const res = await post(key);
    expect(res.status).toBe(403);
    expect(assigned()).toHaveLength(0);
  });
});

describe('fail closed', () => {
  it.each([
    ['rpc:is_super_admin'],
    ['caller:profiles'],
    ['caller:custom_roles'],
    ['custom_roles'],
    ['profiles'],
    ['user_roles']
  ])('returns 500 and assigns nothing when %s errors', async (which) => {
    failing.add(which);
    const res = await post('librarian');
    expect(res.status).toBe(500);
    expect(assigned()).toHaveLength(0);
  });
});
