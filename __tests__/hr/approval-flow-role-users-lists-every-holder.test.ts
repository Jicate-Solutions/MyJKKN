/**
 * BUG-004395 (COO, 8 Jul): recruitment approval flows — "only a few HODs are in
 * the drop down. ALL department HODs should be made available."
 *
 * GET /api/hr/recruitment/approval-flows/role-users capped EVERY answer at 20
 * rows. Picking the HOD role without typing a name listed 20 of the 99 active
 * HODs, alphabetically, so most department heads could never be chosen by
 * browsing. It also listed deactivated accounts — and a step pinned to one
 * strands every request routed to it (the leave/on-duty outage, #4062).
 *
 * Runs the REAL route against an in-memory stand-in for the service client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, any>;
let tables: Record<string, Row[]> = {};

function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  let cap = Infinity;
  const q: any = {
    select: () => q,
    order: (col: string) => { rows.sort((a, b) => String(a[col]).localeCompare(String(b[col]))); return q; },
    limit: (n: number) => { cap = n; return q; },
    eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return q; },
    in: (col: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[col])); return q; },
    ilike: (col: string, v: string) => { rows = rows.filter((r) => String(r[col]).toLowerCase() === v.toLowerCase()); return q; },
    or: (expr: string) => {
      const term = (expr.match(/ilike\.%(.*?)%/)?.[1] ?? '').toLowerCase();
      rows = rows.filter((r) => `${r.full_name} ${r.email}`.toLowerCase().includes(term));
      return q;
    },
    then: (res: (v: { data: Row[]; error: null }) => unknown) => {
      let out = rows.slice(0, cap);
      if (table === 'user_roles' && out.some((r) => r.role_key)) {
        out = out.map((r) => ({ ...r, custom_roles: { role_key: r.role_key } }));
      }
      return Promise.resolve({ data: out, error: null }).then(res);
    },
  };
  return q;
}

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: query }) }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'coo' } }, error: null }) },
    rpc: async (fn: string) => ({ data: fn === 'is_super_admin' ? true : false, error: null }),
  }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), connection: async () => {} }));

import { GET } from '@/app/api/hr/recruitment/approval-flows/role-users/route';

const HOD_ROLE = 'role-hod';

beforeEach(() => {
  const profiles: Row[] = [];
  const userRoles: Row[] = [];
  for (let i = 1; i <= 30; i++) {
    const id = `hod-${String(i).padStart(2, '0')}`;
    // hod-01, hod-02 deactivated; hod-03 active but login-disabled.
    profiles.push({ id, full_name: `HOD ${String(i).padStart(2, '0')}`, email: `${id}@jkkn.ac.in`, is_super_admin: false, is_active: i > 2, is_login_disabled: i === 3 });
    userRoles.push({ user_id: id, role_id: HOD_ROLE, role_key: 'hod' });
  }
  tables = { custom_roles: [{ id: HOD_ROLE, role_key: 'hod' }], user_roles: userRoles, profiles };
});

async function list(params: Record<string, string>) {
  const res = await GET(new NextRequest(`http://localhost/api/hr/recruitment/approval-flows/role-users?${new URLSearchParams(params)}`));
  expect(res.status).toBe(200);
  return ((await res.json()).data as Array<{ id: string }>).map((r) => r.id);
}

describe('approval-flow person picker: choosing a role lists its holders', () => {
  it('lists EVERY eligible HOD, not the first 20', async () => {
    const ids = await list({ role_key: 'hod' });
    expect(ids).toHaveLength(27);
  });

  it('never offers a deactivated account as an approver', async () => {
    const ids = await list({ role_key: 'hod' });
    expect(ids).not.toContain('hod-01');
    expect(ids).not.toContain('hod-02');
  });

  it('never offers a login-disabled account either (same eligibility as #4062)', async () => {
    expect(await list({ role_key: 'hod' })).not.toContain('hod-03');
  });

  it('a name search across all roles stays short (it is a type-ahead)', async () => {
    const ids = await list({ role_key: 'all', search: 'HOD' });
    expect(ids.length).toBeLessThanOrEqual(20);
  });
});
