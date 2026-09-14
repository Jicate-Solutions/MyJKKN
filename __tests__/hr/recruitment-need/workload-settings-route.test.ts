/**
 * /api/hr/workload/settings — the route behind /hr/workload/settings.
 *
 * The route's own decisions are the subject: who gets 401, who gets an
 * EXPLICIT 403 (never a silent redirect), that reads use the session client
 * and writes the service-role client only after the role check, and that a
 * bad body is a 400 before anything is written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, any>;
const state: {
  user: { id: string } | null;
  profile: Row | null;
  roleKeys: string[];
  institutions: Row[];
  policyRows: Row[];
} = { user: null, profile: null, roleKeys: [], institutions: [], policyRows: [] };

const adminWrites: Array<{ op: 'update' | 'insert'; payload: Row; filters?: Row }> = [];

function sessionClient() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user }, error: state.user ? null : { message: 'no session' } }) },
    from(table: string) {
      const result =
        table === 'profiles' ? { data: state.profile, error: null }
        : table === 'user_roles' ? { data: state.roleKeys.map((k) => ({ custom_roles: { role_key: k } })), error: null }
        : table === 'institutions' ? { data: state.institutions, error: null }
        : table === 'platform_policies' ? { data: state.policyRows, error: null }
        : { data: null, error: { message: `unexpected table ${table}` } };
      const self: any = { _filters: {} as Row };
      for (const m of ['select', 'in', 'order']) self[m] = () => self;
      self.eq = (col: string, val: unknown) => { self._filters[col] = val; return self; };
      self.maybeSingle = () => {
        if (table === 'institutions') {
          const hit = state.institutions.find((i) => i.id === self._filters.id) ?? null;
          return Promise.resolve({ data: hit, error: null });
        }
        return Promise.resolve(result);
      };
      self.then = (res: any, rej?: any) => Promise.resolve(result).then(res, rej);
      return self;
    },
  };
}

function adminClient() {
  return {
    from(_table: string) {
      const self: any = { _filters: {} as Row };
      self.update = (payload: Row) => { self._payload = payload; return self; };
      self.eq = (col: string, val: unknown) => { self._filters[col] = val; return self; };
      self.select = () => self;
      self.insert = (payload: Row) => { adminWrites.push({ op: 'insert', payload }); return Promise.resolve({ error: null }); };
      self.then = (res: any, rej?: any) => {
        adminWrites.push({ op: 'update', payload: self._payload, filters: self._filters });
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      };
      return self;
    },
  };
}

const createServiceRoleClient = vi.fn(() => adminClient());
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => sessionClient(),
  createServiceRoleClient: () => createServiceRoleClient(),
}));

import { GET, PUT } from '@/app/api/hr/workload/settings/route';

const INST_A = '11111111-1111-1111-1111-111111111111';

function put(body: unknown) {
  return new NextRequest('http://localhost/api/hr/workload/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.user = { id: 'u1' };
  state.profile = { role: 'staff', is_super_admin: false };
  state.roleKeys = ['hr_admin'];
  state.institutions = [{ id: INST_A, name: 'Dental' }];
  state.policyRows = [];
  adminWrites.length = 0;
  createServiceRoleClient.mockClear();
});

describe('GET /api/hr/workload/settings', () => {
  it('401 when signed out', async () => {
    state.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('403 with a plain-English message for a role that is not HR Admin / Super Admin', async () => {
    state.roleKeys = ['hr_manager'];
    state.profile = { role: 'administrator', is_super_admin: false };
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message).toMatch(/don't have access/i);
  });

  it('200 with one row per institution for an hr_admin held via user_roles', async () => {
    state.policyRows = [
      { policy_key: 'hr_recruitment.workload_norm_hours', scope_type: 'institution', scope_id: INST_A, value: 18, is_active: true, updated_at: null },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([
      { institution_id: INST_A, institution_name: 'Dental', expected_weekly_hours: 18, amber_pct: null, red_pct: null, updated_at: null },
    ]);
  });

  it('200 for a super admin with no HR role at all', async () => {
    state.roleKeys = [];
    state.profile = { role: 'super_admin', is_super_admin: true };
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/hr/workload/settings', () => {
  it('403 and writes nothing for a denied role', async () => {
    state.roleKeys = ['principal'];
    const res = await PUT(put({ institution_id: INST_A, expected_weekly_hours: 16, amber_pct: 100, red_pct: 120 }));
    expect(res.status).toBe(403);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(adminWrites).toHaveLength(0);
  });

  it('400 on an invalid body (red not above amber) and writes nothing', async () => {
    const res = await PUT(put({ institution_id: INST_A, expected_weekly_hours: 16, amber_pct: 120, red_pct: 100 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message ?? json.error).toMatch(/red/i);
    expect(adminWrites).toHaveLength(0);
  });

  it('400 when institution_id is missing', async () => {
    const res = await PUT(put({ expected_weekly_hours: 16, amber_pct: 100, red_pct: 120 }));
    expect(res.status).toBe(400);
  });

  it('404 for an institution that does not exist', async () => {
    const res = await PUT(put({ institution_id: '99999999-9999-9999-9999-999999999999', expected_weekly_hours: 16, amber_pct: 100, red_pct: 120 }));
    expect(res.status).toBe(404);
    expect(adminWrites).toHaveLength(0);
  });

  it('saves the three institution-scoped rows via the service-role client and echoes the saved values', async () => {
    const res = await PUT(put({ institution_id: INST_A, expected_weekly_hours: '18.5', amber_pct: 100, red_pct: 120 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ institution_id: INST_A, expected_weekly_hours: 18.5, amber_pct: 100, red_pct: 120 });

    expect(createServiceRoleClient).toHaveBeenCalledTimes(1);
    const inserted = adminWrites.filter((w) => w.op === 'insert').map((w) => w.payload);
    expect(inserted.map((p) => p.policy_key).sort()).toEqual([
      'hr_recruitment.threshold_amber_workload',
      'hr_recruitment.threshold_red_workload',
      'hr_recruitment.workload_norm_hours',
    ]);
    for (const p of inserted) expect(p).toMatchObject({ scope_type: 'institution', scope_id: INST_A, updated_by: 'u1' });
    expect(inserted.find((p) => p.policy_key === 'hr_recruitment.workload_norm_hours')?.value).toBe(18.5);
  });
});
