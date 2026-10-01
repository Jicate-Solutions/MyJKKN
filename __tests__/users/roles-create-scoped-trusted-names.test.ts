// POST /api/users/roles/create-scoped writes custom_roles with the service-role
// key, so the database guard on custom_roles never sees it. A role key the
// platform trusts by name ('admin', 'administrator', 'super_admin') carries
// admin powers whatever its flags say: only a super admin may create one
// (2026-10-07).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const TRUSTED = ['admin', 'administrator', 'super_admin'];

const m = vi.hoisted(() => ({
  superAdmin: false,
  existing: new Set<string>(),
  inserts: [] as Array<Record<string, unknown>>,
}));

// One chain that answers the calls this route makes.
function chain(table: string) {
  let eqKey = '';
  let eqVal: unknown = null;
  let insert: Record<string, unknown> | null = null;
  const c: Record<string, unknown> = {
    select: () => c,
    insert: (row: Record<string, unknown>) => { insert = row; return c; },
    eq: (k: string, v: unknown) => { eqKey = k; eqVal = v; return c; },
    single: async () => {
      if (insert) { m.inserts.push(insert); return { data: insert, error: null }; }
      if (table === 'profiles') return { data: { role: 'hr_head' }, error: null };
      if (table === 'custom_roles') return { data: { permissions: { 'roles.create': true } }, error: null };
      return { data: null, error: null };
    },
    maybeSingle: async () => ({ data: eqKey === 'role_key' && m.existing.has(String(eqVal)) ? { id: 'x' } : null, error: null }),
  };
  return c;
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'hr-1' } }, error: null }) },
  from: (t: string) => chain(t),
  rpc: async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'is_super_admin') return { data: m.superAdmin, error: null };
    if (fn === 'fn_staff_role_key_is_privileged') return { data: TRUSTED.includes(String(args.p_role_key)), error: null };
    return { data: null, error: { message: `unexpected ${fn}` } };
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => client,
  createServiceRoleClient: () => client,
}));

import { POST } from '@/app/api/users/roles/create-scoped/route';

const create = (roleName: string) =>
  POST(new Request('http://x/api', { method: 'POST', body: JSON.stringify({ roleName, permKeys: ['id_cards.jobs.manage'] }) }) as never);

beforeEach(() => { m.superAdmin = false; m.existing = new Set(); m.inserts = []; });

describe('create-scoped and role names trusted as admin', () => {
  for (const name of ['Admin', 'Administrator', 'Super Admin']) {
    it(`"${name}" by someone who may create roles but is not a super admin is refused, nothing created`, async () => {
      const res = await create(name);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/Only a super admin/);
      expect(m.inserts).toEqual([]);
    });
  }

  it('a super admin may create one', async () => {
    m.superAdmin = true;
    const res = await create('Admin');
    expect(res.status).toBe(200);
    expect(m.inserts.map((r) => r.role_key)).toEqual(['admin']);
  });

  it('an ordinary scoped role still works, and a name that only starts like one (admin_1) is not trusted', async () => {
    expect((await create('ID Card Manager')).status).toBe(200);
    m.existing = new Set(['admin']);
    expect((await create('Admin')).status).toBe(200);
    expect(m.inserts.map((r) => r.role_key)).toEqual(['id_card_manager', 'admin_1']);
  });
});
