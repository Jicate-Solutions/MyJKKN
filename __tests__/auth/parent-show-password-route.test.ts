/**
 * "Show password" for a parent account — Director rulings 2 Oct 2026.
 *  A. super admins only (profiles.is_super_admin), checked on the server;
 *  B. every view is recorded, and no value is returned if the record fails;
 *  C. once the parent changed their own password: "Changed by parent" only.
 *
 * Hashes are made with the parent login's own hasher (lib/auth/parent-password),
 * so the check here is the same one the parent login runs.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashPassword } from '@/lib/auth/parent-password';

type Result = { data: unknown; error: { code?: string; message?: string } | null };

const getUser = vi.fn();
const state: {
  profile: Result;
  account: Result;
  insertError: { message: string } | null;
  reads: string[];
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
} = { profile: { data: null, error: null }, account: { data: null, error: null }, insertError: null, reads: [], inserts: [] };

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
  createServiceRoleClient: () => ({
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              state.reads.push(table);
              if (table === 'profiles') return state.profile;
              if (table === 'pp_parent_accounts') return state.account;
              throw new Error(`unexpected read ${table}`);
            },
          }),
        }),
        insert: async (row: Record<string, unknown>) => {
          state.inserts.push({ table, row });
          return { error: state.insertError };
        },
      };
    },
  }),
}));

import { POST } from '@/app/api/academic/parent-portal/users/show-password/route';

const VIEWER = '00000000-0000-4000-8000-0000000000a1';
const ACCOUNT = '00000000-0000-4000-8000-0000000000c3';

let seedHash: string;
let resetHash: string;
let changedHash: string;

beforeAll(async () => {
  seedHash = await hashPassword('JKKN@100');
  resetHash = await hashPassword('Kavya@2026');
  changedHash = await hashPassword('ParentsOwn#1');
});

function post(body: unknown) {
  return new NextRequest('http://localhost/api/academic/parent-portal/users/show-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getUser.mockResolvedValue({ data: { user: { id: VIEWER } } });
  state.profile = { data: { is_super_admin: true }, error: null };
  state.account = { data: { id: ACCOUNT, password_hash: seedHash, reset_password: null }, error: null };
  state.insertError = null;
  state.reads = [];
  state.inserts = [];
});

describe('who may see a password', () => {
  it('a signed-out caller is refused (401)', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(res.status).toBe(401);
    expect(state.inserts).toHaveLength(0);
  });

  it('a non-super-admin (admin, principal) gets 403: nothing read, nothing logged, no value', async () => {
    for (const flag of [false, null, undefined]) {
      state.profile = { data: { is_super_admin: flag }, error: null };
      state.reads = [];
      const res = await POST(post({ accountId: ACCOUNT }));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.password).toBeUndefined();
      expect(body.error).toMatch(/Only a super admin/);
      expect(state.reads).toEqual(['profiles']);
    }
    expect(state.inserts).toHaveLength(0);
  });

  it('a missing profile row is not a super admin', async () => {
    state.profile = { data: null, error: null };
    expect((await POST(post({ accountId: ACCOUNT }))).status).toBe(403);
  });
});

describe('what a super admin sees', () => {
  it('never-reset account still on the seed default → the default is shown, and the view is logged', async () => {
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ password: 'JKKN@100' });
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
    expect(state.inserts).toEqual([
      { table: 'pp_parent_password_views', row: { account_id: ACCOUNT, viewed_by: VIEWER, result: 'shown' } },
    ]);
  });

  it('admin-reset account still on that value → the reset value is shown and logged', async () => {
    state.account = { data: { id: ACCOUNT, password_hash: resetHash, reset_password: 'Kavya@2026' }, error: null };
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(await res.json()).toEqual({ password: 'Kavya@2026' });
    expect(state.inserts[0].row.result).toBe('shown');
  });

  it('the parent changed their own password → "changed by parent" only, and that is logged', async () => {
    for (const reset of [null, 'Kavya@2026']) {
      state.inserts = [];
      state.account = { data: { id: ACCOUNT, password_hash: changedHash, reset_password: reset }, error: null };
      const res = await POST(post({ accountId: ACCOUNT }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ changedByParent: true });
      expect(JSON.stringify(body)).not.toMatch(/JKKN@100|Kavya@2026|ParentsOwn/);
      expect(state.inserts).toEqual([
        {
          table: 'pp_parent_password_views',
          row: { account_id: ACCOUNT, viewed_by: VIEWER, result: 'changed_by_parent' },
        },
      ]);
    }
  });

  it('if the view cannot be recorded, no password is returned', async () => {
    state.insertError = { message: 'relation does not exist' };
    const res = await POST(post({ accountId: ACCOUNT }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.password).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/JKKN@100/);
  });

  it('a malformed id is refused and an unknown account is 404, with nothing logged', async () => {
    expect((await POST(post({ accountId: 'nope' }))).status).toBe(400);
    state.account = { data: null, error: null };
    expect((await POST(post({ accountId: ACCOUNT }))).status).toBe(404);
    expect(state.inserts).toHaveLength(0);
  });
});
