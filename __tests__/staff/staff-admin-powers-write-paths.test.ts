// Every OTHER server path that writes staff rows with the service-role client
// (so skips the database guard) applies the 2026-10-01 rule too: the record of
// someone with admin powers — or a new staff row pointing at them — is super
// admin only (staff-id-route-admin-records.test.ts covers PATCH/DELETE
// /api/staff/[id]; the database guard is in the .pg.test.ts).
//
//   POST /api/staff                                       — create one team member
//   POST /api/hr/recruitment/candidates/[id]/onboard-to-staff
//   PATCH /api/users/[id]                                 — role, roles, status
//   DELETE /api/users/[id]                                — deletes their staff rows first
//   POST /api/staff/create-missing-profiles               — resyncs profile roles
//   bulk edit (preview + apply)                           — refuseAdminRecordWrites
// "Super admin" is the is_super_admin flag only.
//
// The database answers are mocked; the routes' branching is the subject.

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; payload: unknown; filters: Array<[string, unknown]> };

const m = vi.hoisted(() => ({
  callerId: 'caller-1',
  caller: { role: 'hr_head', is_super_admin: false, institution_id: 'inst-1', full_name: 'HR' } as Record<string, unknown>,
  rpc: {} as Record<string, unknown>,
  rpcError: null as unknown,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  writes: [] as Call[],
  target: {} as Record<string, unknown>,
  staffRows: [] as Array<Record<string, unknown>>,
  profilesByEmail: {} as Record<string, Record<string, unknown>>,
  batches: [] as unknown[][],
  authListed: 0,
  // when set, fn_staff_link_has_admin_powers answers yes only for this profile id
  // (as the database does when the profile's email differs in case)
  adminProfileId: null as string | null,
  adminEmail: null as string | null,
}));

const f = vi.hoisted(() => {
  // A chainable stand-in for a Supabase client. `answer` decides what a query
  // resolves to; every insert / update / delete is recorded in m.writes.
  function fakeClient(answer: (c: Call, mode: 'single' | 'many') => unknown) {
    const from = (table: string) => {
      const c: Call = { table, op: 'select', payload: null, filters: [] };
      const done = (mode: 'single' | 'many') => {
        if (c.op !== 'select') m.writes.push(c);
        return Promise.resolve({ data: answer(c, mode) ?? null, error: null });
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (k: string, v: unknown) => { c.filters.push([k, v]); return chain; },
        in: (k: string, v: unknown) => { c.filters.push([k, v]); return chain; },
        not: () => chain,
        range: () => chain,
        order: () => chain,
        limit: () => chain,
        insert: (p: unknown) => { c.op = 'insert'; c.payload = p; return chain; },
        update: (p: unknown) => { c.op = 'update'; c.payload = p; return chain; },
        delete: () => { c.op = 'delete'; return chain; },
        single: () => done('single'),
        maybeSingle: () => done('single'),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => done('many').then(res, rej),
      };
      return chain;
    };
    return {
      from,
      rpc: async (fn: string, args: Record<string, unknown>) => {
        m.rpcCalls.push({ fn, args });
        if (fn.startsWith('fn_staff_') && m.rpcError) return { data: null, error: m.rpcError };
        if (fn === 'fn_staff_link_has_admin_powers' && (m.adminProfileId || m.adminEmail)) {
          return {
            data: (!!m.adminProfileId && args.p_profile_id === m.adminProfileId)
              || (!!m.adminEmail && args.p_institution_email === m.adminEmail),
            error: null,
          };
        }
        return { data: fn in m.rpc ? m.rpc[fn] : null, error: null };
      },
      auth: {
        getSession: async () => ({ data: { session: { user: { id: m.callerId } } }, error: null }),
        getUser: async () => ({ data: { user: { id: m.callerId } }, error: null }),
        admin: {
          deleteUser: async () => ({ error: null }),
          listUsers: async () => {
            m.authListed += 1;
            return { data: { users: [{ id: 'target-1', email: 'admin@jkkn.ac.in', user_metadata: {} }] }, error: null };
          },
          updateUserById: async () => {
            m.writes.push({ table: 'auth.users', op: 'update', payload: null, filters: [] });
            return { error: null };
          },
        },
      },
    };
  }

  // Session (cookie) client: the caller's own profile and the deleted user's.
  const sessionClient = () =>
    fakeClient((c, mode) => {
      if (c.table === 'profiles') {
        if (mode === 'many') return [{ ...m.target, id: 'target-1' }];
        const id = c.filters.find(([k]) => k === 'id')?.[1];
        return id === m.callerId ? m.caller : m.target;
      }
      if (c.table === 'custom_roles') {
        const key = c.filters.find(([k]) => k === 'role_key')?.[1];
        return { id: `role-${key}`, role_key: key, permissions: { 'roles.assign': true } };
      }
      return null;
    });
  // Service-role client.
  const adminClient = () =>
    fakeClient((c, mode) => {
      if (c.table === 'custom_roles') return { id: 'role-1', is_privileged: false };
      if (c.table === 'employment_categories') return { id: 'cat-1', is_teaching: false };
      if (c.table === 'profiles' && c.op === 'select') {
        const email = c.filters.find(([k]) => k === 'email')?.[1] as string | undefined;
        return email !== undefined ? m.profilesByEmail[email] ?? null : { email: 'admin@jkkn.ac.in' };
      }
      if (c.table === 'staff' && c.op === 'insert') return { id: 'new-staff', ...(c.payload as object[] | object) };
      if (c.table === 'staff' && c.op === 'select') {
        // users DELETE looks staff rows up by the profile's email
        return mode === 'many' ? m.staffRows : null;
      }
      if (c.table === 'hr_recruitment_candidates') return { id: 'cand-1', status: 'joined' };
      return null;
    });
  return { fakeClient, sessionClient, adminClient };
});

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => f.sessionClient() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => f.adminClient() }));
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => f.adminClient(),
  createServerSupabaseClient: async () => f.sessionClient(),
  createClient: async () => f.sessionClient(),
}));
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => {} } }));
vi.mock('@/lib/push/opt-out', () => ({ isPushOptedOut: async () => true }));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));
vi.mock('@/lib/services/staff/staff-scope', () => ({ getStaffScope: async () => 'all_institutions' }));
vi.mock('@/lib/utils/activity-logger', () => ({
  logActivity: async () => {},
  ActivityTemplates: new Proxy({}, { get: () => () => ({ actionType: 'x', resourceType: 'x', description: 'x' }) }),
}));
vi.mock('@/lib/usage/record', () => ({ recordFeatureUse: async () => {}, FEATURE_KEYS: {} }));
vi.mock('@/lib/utils/supabase-batched-in', () => ({
  selectInBatches: async () => ({ data: m.batches.shift() ?? [], error: null }),
}));
vi.mock('@/lib/services/hr/recruitment-service', () => ({
  RecruitmentService: {
    getCandidate: async () => ({
      id: 'cand-1',
      status: 'approved',
      role_specific_details: { onboarding_steps: [{ completed: true }] },
    }),
  },
}));

import { POST as createStaff } from '@/app/api/staff/route';
import { POST as onboardToStaff } from '@/lib/api/hr/recruitment/candidates/handlers/onboard-to-staff';
import { DELETE as deleteUser, PATCH as patchUser } from '@/app/api/users/[id]/route';
import { POST as createMissingProfiles } from '@/app/api/staff/create-missing-profiles/route';
import { POST as createUser } from '@/app/api/users/route';
import {
  POST as setRoles,
  DELETE as removeRole,
  PATCH as setPrimaryRole
} from '@/app/api/users/[id]/roles/route';
import { PATCH as setRole } from '@/app/api/users/[id]/role/route';
import { PATCH as bulkRoleUpdate } from '@/app/api/users/bulk-role-update/route';
import { POST as assignRole } from '@/app/api/users/roles/assign/route';
import { PATCH as toggleStatus } from '@/app/api/users/[id]/toggle-status/route';
import { PATCH as manageAuth } from '@/app/api/users/manage-auth/route';
import {
  BulkStaffEditService,
  refuseAdminRecordWrites,
  type BulkEditRow
} from '@/lib/services/staff/bulk-staff-edit-service';
import {
  ADMIN_RECORD_MESSAGE,
  ADMIN_ROLE_MESSAGE,
  SELF_ROLE_MESSAGE,
  SELF_EMAIL_MESSAGE,
  STAFF_EMAIL_MESSAGE,
  EMAIL_TAKEN_MESSAGE,
  IDENTITY_SALARY_MESSAGE,
  IDENTITY_SELF_MESSAGE
} from '@/lib/services/staff/staff-admin-powers';

const json = (url: string, body: unknown, method = 'POST') =>
  new Request(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) as never;
const staffInserts = () => m.writes.filter((w) => w.table === 'staff' && w.op === 'insert');
const staffDeletes = () => m.writes.filter((w) => w.table === 'staff' && w.op === 'delete');

const HR_HEAD = { role: 'hr_head', is_super_admin: false, institution_id: 'inst-1', full_name: 'HR' };
const SUPER = { role: 'super_admin', is_super_admin: true, institution_id: 'inst-1', full_name: 'SA' };
const ADMINISTRATOR = { role: 'administrator', is_super_admin: false, institution_id: 'inst-1', full_name: 'AD' };
const permitted = { user_has_permission: true, is_super_admin: false, role_has_institution_access: true };
const profileUpdates = () => m.writes.filter((w) => w.table === 'profiles' && w.op !== 'select');
const userRoleWrites = () => m.writes.filter((w) => w.table === 'user_roles');

beforeEach(() => {
  m.caller = { ...HR_HEAD };
  m.rpc = { ...permitted };
  m.rpcError = null;
  m.rpcCalls = [];
  m.writes = [];
  m.target = { role: 'faculty', full_name: 'P', email: 'person@jkkn.ac.in', is_active: true, is_super_admin: false };
  m.staffRows = [{ id: 'staff-admin', institution_email: 'admin@jkkn.ac.in' }];
  m.profilesByEmail = {};
  m.batches = [];
  m.authListed = 0;
  m.adminProfileId = null;
  m.adminEmail = null;
});

describe('POST /api/staff (create one team member)', () => {
  const body = {
    first_name: 'NEW', last_name: 'PERSON', email: 'new@gmail.com',
    institution_email: 'admin@jkkn.ac.in', role_key: 'faculty', profile_id: 'someone-else',
  };

  it('HR Head creating a row that points at someone with admin powers → 403, nothing inserted', async () => {
    m.rpc.fn_staff_link_has_admin_powers = true;
    const res = await createStaff(json('http://localhost/api/staff', body));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(ADMIN_RECORD_MESSAGE);
    expect(staffInserts()).toHaveLength(0);
    expect(m.rpcCalls).toContainEqual({
      fn: 'fn_staff_link_has_admin_powers',
      args: { p_profile_id: null, p_institution_email: 'admin@jkkn.ac.in' },
    });
  });

  it('fails closed when the check errors', async () => {
    m.rpcError = { message: 'boom' };
    expect((await createStaff(json('http://localhost/api/staff', body))).status).toBe(500);
    expect(staffInserts()).toHaveLength(0);
  });

  it('HR Head creating an ordinary person still works, and cannot choose profile_id', async () => {
    m.rpc.fn_staff_link_has_admin_powers = false;
    const res = await createStaff(json('http://localhost/api/staff', { ...body, institution_email: 'new@jkkn.ac.in' }));
    expect(res.status).toBe(200);
    expect(staffInserts()).toHaveLength(1);
    expect((staffInserts()[0].payload as Array<Record<string, unknown>>)[0]).not.toHaveProperty('profile_id');
  });

  it('a super admin linking a new record to their own account (or the Director\'s) → 403, nothing inserted', async () => {
    m.caller = { ...SUPER };
    m.rpc.fn_staff_identity_change_refusal = 'self_or_director';
    const res = await createStaff(json('http://localhost/api/staff', body));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(IDENTITY_SELF_MESSAGE);
    expect(staffInserts()).toHaveLength(0);
    expect(m.rpcCalls).toContainEqual({
      fn: 'fn_staff_identity_change_refusal',
      args: { p_staff_id: null, p_profile_id: 'someone-else', p_email: 'new@gmail.com', p_institution_email: 'admin@jkkn.ac.in' },
    });
  });

  it('HR Head creating a record with a privileged role → 403, nothing inserted', async () => {
    m.rpc.fn_staff_role_key_is_privileged = true;
    m.rpc.fn_staff_link_has_admin_powers = false;
    const res = await createStaff(json('http://localhost/api/staff', { ...body, institution_email: 'new@jkkn.ac.in', role_key: 'ceo' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Only a super administrator can assign the role "ceo".');
    expect(staffInserts()).toHaveLength(0);
  });

  it('a super admin may, profile_id included', async () => {
    m.caller = { ...SUPER };
    m.rpc.fn_staff_link_has_admin_powers = true;
    const res = await createStaff(json('http://localhost/api/staff', body));
    expect(res.status).toBe(200);
    expect((staffInserts()[0].payload as Array<Record<string, unknown>>)[0]).toMatchObject({ profile_id: 'someone-else' });
  });
});

describe('POST /api/staff writes only the form\'s fields', () => {
  const body = {
    first_name: 'NEW', last_name: 'PERSON', email: 'new@gmail.com', institution_id: 'inst-2',
    institution_email: 'new@jkkn.ac.in', role_key: 'faculty', profile_id: 'someone-else',
    created_by: 'someone-else', is_super_admin: true, id: 'other-row',
  };
  const inserted = () => (staffInserts()[0].payload as Array<Record<string, unknown>>)[0];

  it('drops profile_id and every column the form does not send; keeps institution_id', async () => {
    const res = await createStaff(json('http://localhost/api/staff', body));
    expect(res.status).toBe(200);
    for (const k of ['profile_id', 'is_super_admin', 'id']) expect(inserted()).not.toHaveProperty(k);
    expect(inserted()).toMatchObject({ institution_id: 'inst-2', created_by: 'caller-1', first_name: 'NEW' });
  });

  it('an institution the caller cannot reach → 403, nothing inserted', async () => {
    m.rpc.role_has_institution_access = false;
    const res = await createStaff(json('http://localhost/api/staff', body));
    expect(res.status).toBe(403);
    expect(staffInserts()).toHaveLength(0);
    expect(m.rpcCalls).toContainEqual({ fn: 'role_has_institution_access', args: { check_institution_id: 'inst-2' } });
  });

  it('role super_admin without the flag is not a super admin', async () => {
    m.caller = { ...SUPER, is_super_admin: false };
    m.rpc.fn_staff_link_has_admin_powers = false;
    expect((await createStaff(json('http://localhost/api/staff', body))).status).toBe(200);
    expect(inserted()).not.toHaveProperty('profile_id');
  });
});

describe('POST onboard-to-staff (recruitment)', () => {
  const body = {
    first_name: 'NEW', last_name: 'PERSON', gender: 'female', date_of_birth: '1990-01-01',
    marital_status: 'single', email: 'new@gmail.com', phone: '9999999999', date_of_joining: '2026-10-01',
    designation: 'Clerk', category_id: 'cat-1', institution_id: 'inst-1', institution_email: 'admin@jkkn.ac.in',
  };
  const params = { params: Promise.resolve({ id: 'cand-1' }) };

  it('HR Head onboarding onto the institution email of someone with admin powers → 403, nothing inserted', async () => {
    m.rpc.fn_staff_link_has_admin_powers = true;
    const res = await onboardToStaff(json('http://localhost/x', body), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(ADMIN_RECORD_MESSAGE);
    expect(staffInserts()).toHaveLength(0);
  });

  it('nobody, super admins included, may onboard a record linked to their own account or the Director\'s', async () => {
    m.caller = { ...SUPER };
    m.rpc.is_super_admin = true;
    m.rpc.fn_staff_identity_change_refusal = 'self_or_director';
    const res = await onboardToStaff(json('http://localhost/x', body), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(IDENTITY_SELF_MESSAGE);
    expect(staffInserts()).toHaveLength(0);
    expect(m.rpcCalls).toContainEqual({
      fn: 'fn_staff_identity_change_refusal',
      args: { p_staff_id: null, p_profile_id: null, p_email: 'new@gmail.com', p_institution_email: 'admin@jkkn.ac.in' },
    });
  });

  it('a non-super-admin onboards only into a college they can reach', async () => {
    m.rpc.role_has_institution_access = false;
    const res = await onboardToStaff(json('http://localhost/x', { ...body, institution_email: 'new@jkkn.ac.in' }), params);
    expect(res.status).toBe(403);
    expect(staffInserts()).toHaveLength(0);
    expect(m.rpcCalls).toContainEqual({ fn: 'role_has_institution_access', args: { check_institution_id: 'inst-1' } });
  });

  it('an ordinary institution email still onboards', async () => {
    m.rpc.fn_staff_link_has_admin_powers = false;
    const res = await onboardToStaff(json('http://localhost/x', body), params);
    expect(res.status).toBe(200);
    expect(staffInserts()).toHaveLength(1);
  });
});

describe('DELETE /api/users/[id] (deletes the person\'s team-member records first)', () => {
  const params = { params: Promise.resolve({ id: 'target-1' }) };
  const del = () => deleteUser(new Request('http://localhost/api/users/target-1', { method: 'DELETE' }) as never, params);

  it('an administrator (not a super admin) deleting someone with admin powers → 403, no team-member record deleted', async () => {
    m.caller = { role: 'administrator', is_super_admin: false, institution_id: 'inst-1', full_name: 'AD' };
    m.rpc.fn_staff_record_has_admin_powers = true;
    const res = await del();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(ADMIN_RECORD_MESSAGE);
    expect(staffDeletes()).toHaveLength(0);
  });

  it('a super admin may', async () => {
    m.caller = { ...SUPER };
    m.rpc.fn_staff_record_has_admin_powers = true;
    const res = await del();
    expect(res.status).toBe(200);
    expect(staffDeletes()).toHaveLength(1);
  });

  it('powers held only in user_roles (no team-member record has them) → refused before anything', async () => {
    m.caller = { ...ADMINISTRATOR };
    m.rpc.fn_staff_link_has_admin_powers = true;
    m.rpc.fn_staff_record_has_admin_powers = false;
    m.staffRows = [];
    const res = await del();
    expect(res.status).toBe(403);
    expect(staffDeletes()).toHaveLength(0);
    expect(m.rpcCalls).toContainEqual({
      fn: 'fn_staff_link_has_admin_powers',
      args: { p_profile_id: 'target-1', p_institution_email: 'person@jkkn.ac.in' },
    });
  });

  it('role super_admin without the flag cannot delete anyone', async () => {
    m.caller = { ...SUPER, is_super_admin: false };
    expect((await del()).status).toBe(403);
    expect(staffDeletes()).toHaveLength(0);
  });
});

describe('PATCH /api/users/[id]: role, roles and status of people with admin powers', () => {
  const patchU = (body: Record<string, unknown>, id = 'target-1') =>
    patchUser(json(`http://localhost/api/users/${id}`, body, 'PATCH'), { params: Promise.resolve({ id }) });
  const refused = async (body: Record<string, unknown>, id?: string) => {
    const res = await patchU(body, id);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(ADMIN_ROLE_MESSAGE);
    expect(profileUpdates()).toHaveLength(0);
    expect(userRoleWrites()).toHaveLength(0);
  };

  beforeEach(() => {
    m.caller = { ...ADMINISTRATOR };
  });

  it('an administrator (not super admin) cannot change the role or status of someone with admin powers', async () => {
    m.target = { ...m.target, role: 'administrator' };
    m.rpc.fn_staff_link_has_admin_powers = true;
    await refused({ role: 'faculty' });
    await refused({ is_active: false });
    await refused({ role_ids: ['role-hod'] });
  });

  it('nor change their email or college', async () => {
    m.target = { ...m.target, role: 'administrator', institution_id: 'inst-1' };
    m.rpc.fn_staff_link_has_admin_powers = true;
    await refused({ email: 'other@jkkn.ac.in' });
    await refused({ institution_id: 'inst-2' });
  });

  it('nor give anyone a privileged role, by role or by role_ids', async () => {
    m.rpc.fn_staff_role_key_is_privileged = true;
    await refused({ role: 'administrator' });
    m.rpc.fn_staff_role_key_is_privileged = false;
    m.rpc.fn_custom_role_is_privileged = true;
    await refused({ role_ids: ['role-ceo'] });
  });

  it('a person cannot make themselves an administrator', async () => {
    m.caller = { role: 'faculty', is_super_admin: false, institution_id: 'inst-1', full_name: 'ME' };
    m.target = { ...m.caller, email: 'me@jkkn.ac.in', is_active: true };
    m.rpc.fn_staff_role_key_is_privileged = true;
    const res = await patchU({ role: 'administrator' }, 'caller-1');
    expect(res.status).toBe(403);
    expect(profileUpdates()).toHaveLength(0);
  });

  it('nobody but a super admin changes their own email', async () => {
    m.caller = { role: 'faculty', is_super_admin: false, institution_id: 'inst-1', full_name: 'ME' };
    m.target = { ...m.caller, email: 'me@jkkn.ac.in', is_active: true };
    const res = await patchU({ email: 'me.new@jkkn.ac.in' }, 'caller-1');
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(SELF_EMAIL_MESSAGE);
    expect(profileUpdates()).toHaveLength(0);
  });

  it('nor gives another person an email that belongs to someone with admin powers or to a team-member record', async () => {
    m.adminEmail = 'orphan.admin@jkkn.ac.in';
    let res = await patchU({ email: 'orphan.admin@jkkn.ac.in' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(EMAIL_TAKEN_MESSAGE);
    m.rpc.fn_email_on_staff_record = true;
    res = await patchU({ email: 'someone.staff@jkkn.ac.in' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(STAFF_EMAIL_MESSAGE);
    expect(profileUpdates()).toHaveLength(0);
    m.rpc.fn_email_on_staff_record = false;
    expect((await patchU({ email: 'person.new@jkkn.ac.in' })).status).toBe(200);
  });

  it('nor give themselves any role or role list, however ordinary (403, nothing written)', async () => {
    m.target = { ...m.caller, email: 'me@jkkn.ac.in', is_active: true };
    for (const body of [{ role: 'hr_head' }, { role_ids: ['role-hr_head'] }]) {
      const res = await patchU(body, 'caller-1');
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe(SELF_ROLE_MESSAGE);
    }
    expect(profileUpdates()).toHaveLength(0);
    expect(userRoleWrites()).toHaveLength(0);
    // a super admin may
    m.caller = { ...SUPER };
    m.target = { ...SUPER, email: 'sa@jkkn.ac.in', is_active: true };
    expect((await patchU({ role: 'hr_head' }, 'caller-1')).status).toBe(200);
  });

  it('ordinary changes still work, and an unchanged role or status sent back is no change', async () => {
    expect((await patchU({ phone_number: '9000000000', role: 'hod' })).status).toBe(200);
    expect(profileUpdates()).toHaveLength(1);
    expect(userRoleWrites().length).toBeGreaterThan(0);
    m.writes = [];
    m.target = { ...m.target, role: 'administrator' };
    m.rpc.fn_staff_link_has_admin_powers = true;
    expect((await patchU({ phone_number: '9000000001', role: 'administrator', is_active: true })).status).toBe(200);
  });

  it('a super admin may; role super_admin without the flag may not', async () => {
    m.target = { ...m.target, role: 'administrator' };
    m.rpc.fn_staff_link_has_admin_powers = true;
    m.caller = { ...SUPER };
    expect((await patchU({ role: 'faculty', is_active: false })).status).toBe(200);
    m.writes = [];
    m.caller = { ...SUPER, is_super_admin: false };
    expect((await patchU({ role: 'faculty' })).status).toBe(403);
    expect(profileUpdates()).toHaveLength(0);
  });
});

describe('POST /api/staff/create-missing-profiles', () => {
  const run = async () => {
    const res = await createMissingProfiles(json('http://localhost/x', {}));
    return (await res.json()) as { results: { errors: Array<{ error: string }>; updated_count: number; created_count: number } };
  };
  const staff = (email: string, roleKey: string) => ({
    id: 's1', first_name: 'A', last_name: 'B', institution_email: email, phone: '1',
    institution_id: 'inst-1', department_id: null, gender: 'male', designation: 'X', role_key: roleKey,
  });
  const profile = (email: string, role: string) => ({
    email, id: 'p1', role, institution_id: 'inst-1', department_id: null, gender: 'male', phone_number: '1', designation: 'X',
  });

  beforeEach(() => {
    m.caller = { ...ADMINISTRATOR };
  });

  it('an administrator cannot resync the role of someone with admin powers', async () => {
    m.staffRows = [staff('admin@jkkn.ac.in', 'faculty')];
    m.batches = [[profile('admin@jkkn.ac.in', 'administrator')], []];
    m.rpc.fn_staff_link_has_admin_powers = true;
    const out = await run();
    expect(out.results.errors.map((e) => e.error)).toEqual([ADMIN_ROLE_MESSAGE]);
    expect(userRoleWrites()).toHaveLength(0);
    expect(profileUpdates()).toHaveLength(0);
  });

  it('nor resync it when the profile only turns up on the second look', async () => {
    m.staffRows = [staff('admin@jkkn.ac.in', 'faculty')];
    m.batches = [[]];
    m.profilesByEmail = { 'admin@jkkn.ac.in': profile('admin@jkkn.ac.in', 'administrator') };
    m.rpc.fn_staff_link_has_admin_powers = true;
    const out = await run();
    expect(out.results.errors.map((e) => e.error)).toEqual([ADMIN_ROLE_MESSAGE]);
    expect(userRoleWrites()).toHaveLength(0);
    expect(profileUpdates()).toHaveLength(0);
  });

  it('nor move someone with admin powers to another college', async () => {
    m.staffRows = [{ ...staff('admin@jkkn.ac.in', 'administrator'), institution_id: 'inst-2' }];
    m.batches = [[profile('admin@jkkn.ac.in', 'administrator')], []];
    m.rpc.fn_staff_link_has_admin_powers = true;
    const out = await run();
    expect(out.results.errors.map((e) => e.error)).toEqual([ADMIN_ROLE_MESSAGE]);
    expect(profileUpdates()).toHaveLength(0);
  });

  it('nobody, super admins included, may link a record to their own account or the Director\'s', async () => {
    m.caller = { ...SUPER };
    m.staffRows = [staff('admin@jkkn.ac.in', 'faculty')];
    m.batches = [[profile('admin@jkkn.ac.in', 'administrator')], []];
    m.rpc.fn_staff_identity_change_refusal = 'self_or_director';
    const out = await run();
    expect(out.results.errors.map((e) => e.error)).toEqual([IDENTITY_SELF_MESSAGE]);
    expect(userRoleWrites()).toHaveLength(0);
    expect(profileUpdates()).toHaveLength(0);
  });

  it('…also when the profile only turns up on the second look', async () => {
    m.caller = { ...SUPER };
    m.staffRows = [staff('admin@jkkn.ac.in', 'faculty')];
    m.batches = [[]];
    m.profilesByEmail = { 'admin@jkkn.ac.in': profile('admin@jkkn.ac.in', 'administrator') };
    m.rpc.fn_staff_identity_change_refusal = 'self_or_director';
    const out = await run();
    expect(out.results.errors.map((e) => e.error)).toEqual([IDENTITY_SELF_MESSAGE]);
    expect(userRoleWrites()).toHaveLength(0);
    expect(profileUpdates()).toHaveLength(0);
  });

  it('a brand-new profile is also checked: refused while a salary revision is open', async () => {
    m.caller = { ...SUPER };
    m.staffRows = [staff('new@jkkn.ac.in', 'faculty')];
    m.batches = [[]];
    m.rpc.fn_staff_identity_change_refusal = 'salary_request';
    const out = await run();
    expect(out.results.errors.map((e) => e.error)).toEqual([IDENTITY_SALARY_MESSAGE]);
    expect(profileUpdates()).toHaveLength(0);
  });

  it('nor create a profile with a privileged role', async () => {
    m.staffRows = [staff('new@jkkn.ac.in', 'administrator')];
    m.batches = [[]];
    m.rpc.fn_staff_role_key_is_privileged = true;
    const out = await run();
    expect(out.results.errors.map((e) => e.error)).toEqual([ADMIN_ROLE_MESSAGE]);
    expect(profileUpdates()).toHaveLength(0);
    expect(userRoleWrites()).toHaveLength(0);
  });

  it('a super admin may', async () => {
    m.caller = { ...SUPER };
    m.staffRows = [staff('admin@jkkn.ac.in', 'faculty')];
    m.batches = [[profile('admin@jkkn.ac.in', 'administrator')], []];
    m.rpc.fn_staff_link_has_admin_powers = true;
    const out = await run();
    expect(out.results.errors).toEqual([]);
    expect(out.results.updated_count).toBe(1);
    expect(userRoleWrites().length).toBeGreaterThan(0);
  });
});

describe('bulk edit: refuseAdminRecordWrites', () => {
  const row = (n: number): BulkEditRow => ({
    rowNumber: n, institutionEmail: `p${n}@jkkn.ac.in`, name: `P${n}`, status: 'change',
    changes: [{ field: 'Phone', from: '1', to: '2' }], issues: [],
  });
  const setup = () => {
    const rows = new Map<string, BulkEditRow>([['staff-admin', row(2)], ['staff-plain', row(3)]]);
    const writes = new Map<string, Record<string, unknown>>([
      ['staff-admin', { designation: 'Dean' }], ['staff-plain', { designation: 'Dean' }],
    ]);
    return { rows, writes };
  };
  const client = (powers: Record<string, boolean | 'error'>, superAdmin = false) => ({
    rpc: async (fn: string, args: { p_staff_id?: string }) => {
      if (fn === 'is_super_admin') return { data: superAdmin, error: null };
      const v = powers[args.p_staff_id!];
      return v === 'error' ? { data: null, error: { message: 'boom' } } : { data: v, error: null };
    },
  });

  it('a non-super-admin: the admin row becomes an error row and is not written; the ordinary row is', async () => {
    const { rows, writes } = setup();
    await refuseAdminRecordWrites(client({ 'staff-admin': true, 'staff-plain': false }), writes, rows);
    expect([...writes.keys()]).toEqual(['staff-plain']);
    expect(rows.get('staff-admin')).toMatchObject({ status: 'error', changes: [] });
    expect(rows.get('staff-admin')!.issues[0].message).toBe(ADMIN_RECORD_MESSAGE);
    // the column the row tried to change, not the match key
    expect(rows.get('staff-admin')!.issues[0].field).toBe('Designation');
    expect(rows.get('staff-plain')!.status).toBe('change');
  });

  it('fails closed: a row whose check errors is not written', async () => {
    const { rows, writes } = setup();
    await refuseAdminRecordWrites(client({ 'staff-admin': 'error', 'staff-plain': false }), writes, rows);
    expect([...writes.keys()]).toEqual(['staff-plain']);
    expect(rows.get('staff-admin')!.status).toBe('error');
  });

  it('phone and attendance machine code alone are not refused, and are not even checked', async () => {
    const rows = new Map<string, BulkEditRow>([['staff-admin', row(2)]]);
    const writes = new Map<string, Record<string, unknown>>([
      ['staff-admin', { phone: '2', biometric_id: '7', biometric_institution_id: 'inst-1' }],
    ]);
    const calls: string[] = [];
    await refuseAdminRecordWrites(
      { rpc: async (fn: string) => { calls.push(fn); return { data: true, error: null }; } },
      writes, rows
    );
    expect(writes.size).toBe(1);
    expect(calls).toEqual([]);
  });

  it('a super admin: nothing is refused', async () => {
    const { rows, writes } = setup();
    await refuseAdminRecordWrites(client({ 'staff-admin': true }, true), writes, rows);
    expect(writes.size).toBe(2);
  });
});

describe('bulk edit: evaluate() (what preview and apply both run) refuses the row', () => {
  const sheetRow = { rowNumber: 2, institutionEmail: 'admin@jkkn.ac.in', cells: { Designation: 'Dean' } };
  const db = () =>
    f.fakeClient((c, mode) =>
      c.table === 'staff' && mode === 'many' && c.filters.some(([k]) => k === 'institution_email')
        ? [{ id: 'staff-admin', institution_id: 'inst-1', institution_email: 'admin@jkkn.ac.in',
             first_name: 'AD', last_name: 'MIN', designation: 'Registrar' }]
        : []
    );

  it('a non-super-admin: error row with the message, nothing to write', async () => {
    m.rpc = { is_super_admin: false, fn_staff_record_has_admin_powers: true };
    const { report, writes } = await BulkStaffEditService.runWithClient(db(), () =>
      BulkStaffEditService.evaluate([sheetRow], [])
    );
    expect(report.rows[0].status).toBe('error');
    expect(report.rows[0].issues[0].message).toBe(ADMIN_RECORD_MESSAGE);
    expect(writes.size).toBe(0);
  });

  it('a super admin: the change goes through', async () => {
    m.rpc = { is_super_admin: true, fn_staff_record_has_admin_powers: true };
    const { report, writes } = await BulkStaffEditService.runWithClient(db(), () =>
      BulkStaffEditService.evaluate([sheetRow], [])
    );
    expect(report.rows[0].status).toBe('change');
    expect(writes.size).toBe(1);
  });
});

describe('every other route that changes roles or status refuses an administrator (not super admin)', () => {
  const U = 'http://localhost/api/users';
  const params = { params: Promise.resolve({ id: 'target-1' }) };
  const TARGET_UUID = '00000000-0000-4000-8000-000000000001';
  const noRoleWrites = () => {
    expect(m.writes.filter((w) => w.table === 'user_roles' || w.table === 'profiles' || w.table === 'auth.users')).toEqual([]);
  };
  const expectRefused = async (res: Response) => {
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(ADMIN_ROLE_MESSAGE);
    noRoleWrites();
  };

  beforeEach(() => {
    m.caller = { ...ADMINISTRATOR };
    m.target = { ...m.target, role: 'administrator', is_active: true };
  });

  it('POST /api/users/[id]/roles (replace roles): admin-power target, or a privileged role', async () => {
    m.rpc.fn_staff_link_has_admin_powers = true;
    await expectRefused(await setRoles(json(`${U}/target-1/roles`, { role_ids: ['role-hod'] }), params));
    m.rpc.fn_staff_link_has_admin_powers = false;
    m.rpc.fn_custom_role_is_privileged = true;
    await expectRefused(await setRoles(json(`${U}/target-1/roles`, { role_ids: ['role-ceo'] }), params));
  });

  it('DELETE and PATCH /api/users/[id]/roles: admin-power target', async () => {
    m.rpc.fn_staff_link_has_admin_powers = true;
    await expectRefused(await removeRole(new Request(`${U}/target-1/roles?role_id=role-1`, { method: 'DELETE' }) as never, params));
    await expectRefused(await setPrimaryRole(json(`${U}/target-1/roles`, { primary_role_id: 'role-1' }, 'PATCH'), params));
  });

  it('…ordinary target and role still work; a super admin may', async () => {
    expect((await setRoles(json(`${U}/target-1/roles`, { role_ids: ['role-hod'] }), params)).status).toBe(200);
    expect(userRoleWrites().length).toBeGreaterThan(0);
    m.writes = [];
    m.rpc.fn_staff_link_has_admin_powers = true;
    m.rpc.is_super_admin = true;
    expect((await setRoles(json(`${U}/target-1/roles`, { role_ids: ['role-hod'] }), params)).status).toBe(200);
  });

  it('PATCH /api/users/[id]/role: admin-power target, or a privileged role', async () => {
    m.rpc.fn_staff_link_has_admin_powers = true;
    await expectRefused(await setRole(json(`${U}/target-1/role`, { role: 'faculty' }, 'PATCH'), params));
    m.rpc.fn_staff_link_has_admin_powers = false;
    m.target = { ...m.target, role: 'faculty' };
    m.rpc.fn_staff_role_key_is_privileged = true;
    await expectRefused(await setRole(json(`${U}/target-1/role`, { role: 'ceo' }, 'PATCH'), params));
  });

  it('PATCH /api/users/bulk-role-update: a privileged role refuses the batch; an admin-power target fails its row', async () => {
    m.rpc.fn_staff_role_key_is_privileged = true;
    await expectRefused(await bulkRoleUpdate(json(`${U}/bulk-role-update`, { userIds: [TARGET_UUID], role: 'ceo' }, 'PATCH')));
    m.rpc.fn_staff_role_key_is_privileged = false;
    m.rpc.fn_staff_link_has_admin_powers = true;
    const res = await bulkRoleUpdate(json(`${U}/bulk-role-update`, { userIds: [TARGET_UUID], role: 'faculty' }, 'PATCH'));
    const out = (await res.json()) as { success: string[]; failed: Array<{ error: string }> };
    expect(out.success).toEqual([]);
    expect(out.failed.map((x) => x.error)).toEqual([ADMIN_ROLE_MESSAGE]);
    noRoleWrites();
  });

  it('POST /api/users/roles/assign: admin-power target, or a privileged role', async () => {
    m.rpc.fn_staff_link_has_admin_powers = true;
    await expectRefused(await assignRole(json(`${U}/roles/assign`, { userId: 'target-1', roleKey: 'hod' })));
    m.rpc.fn_staff_link_has_admin_powers = false;
    m.rpc.fn_custom_role_is_privileged = true;
    await expectRefused(await assignRole(json(`${U}/roles/assign`, { userId: 'target-1', roleKey: 'ceo' })));
  });

  it('POST /api/users (create): a privileged role, by role or role_ids, is refused before the profile is made', async () => {
    const body = { email: 'new@jkkn.ac.in', full_name: 'NEW', role: 'administrator', institution_id: 'inst-1' };
    m.rpc.fn_staff_role_key_is_privileged = true;
    await expectRefused(await createUser(json(U, body)));
    m.rpc.fn_staff_role_key_is_privileged = false;
    m.rpc.fn_custom_role_is_privileged = true;
    await expectRefused(await createUser(json(U, { ...body, role: 'faculty', role_ids: ['role-ceo'] })));
    expect(m.rpcCalls.some((c) => c.fn === 'create_preregistered_profile')).toBe(false);
    m.rpc.fn_custom_role_is_privileged = false;
    expect((await createUser(json(U, { ...body, role: 'faculty' }))).status).toBe(200);
    expect(m.rpcCalls.some((c) => c.fn === 'create_preregistered_profile')).toBe(true);
  });

  it('POST /api/users (create): an email that belongs to someone with admin powers is refused before the profile is made', async () => {
    m.adminEmail = 'Orphan.Admin@jkkn.ac.in';
    const res = await createUser(json(U, { email: 'Orphan.Admin@jkkn.ac.in', full_name: 'NEW', role: 'faculty', institution_id: 'inst-1' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(EMAIL_TAKEN_MESSAGE);
    expect(m.rpcCalls.some((c) => c.fn === 'create_preregistered_profile')).toBe(false);
  });

  it('POST /api/users (create): an email a team-member record carries is refused before the profile is made', async () => {
    m.rpc.fn_email_on_staff_record = true;
    const res = await createUser(json(U, { email: 'plain.personal@gmail.com', full_name: 'NEW', role: 'faculty', institution_id: 'inst-1' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(STAFF_EMAIL_MESSAGE);
    expect(m.rpcCalls).toContainEqual({ fn: 'fn_email_on_staff_record', args: { p_email: 'plain.personal@gmail.com' } });
    expect(m.rpcCalls.some((c) => c.fn === 'create_preregistered_profile')).toBe(false);
  });

  it('no role route lets an administrator change their OWN roles', async () => {
    const own = { params: Promise.resolve({ id: 'caller-1' }) };
    const expectSelf = async (res: Response) => {
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe(SELF_ROLE_MESSAGE);
      noRoleWrites();
    };
    await expectSelf(await setRoles(json(`${U}/caller-1/roles`, { role_ids: ['role-hod'] }), own));
    await expectSelf(await removeRole(new Request(`${U}/caller-1/roles?role_id=role-1`, { method: 'DELETE' }) as never, own));
    await expectSelf(await setPrimaryRole(json(`${U}/caller-1/roles`, { primary_role_id: 'role-1' }, 'PATCH'), own));
    await expectSelf(await setRole(json(`${U}/caller-1/role`, { role: 'hod' }, 'PATCH'), own));
    await expectSelf(await assignRole(json(`${U}/roles/assign`, { userId: 'caller-1', roleKey: 'hod' })));
  });

  it('bulk-role-update fails the row that is the caller themselves', async () => {
    m.callerId = 'target-1'; // the row the update finds is the caller's own
    const res = await bulkRoleUpdate(json(`${U}/bulk-role-update`, { userIds: [TARGET_UUID], role: 'hod' }, 'PATCH'));
    const out = (await res.json()) as { success: string[]; failed: Array<{ userId: string; error: string }> };
    m.callerId = 'caller-1';
    expect(out.failed).toEqual([{ userId: 'target-1', error: SELF_ROLE_MESSAGE }]);
    noRoleWrites();
  });

  it('PATCH /api/users/[id]/toggle-status: admin-power target', async () => {
    m.rpc.fn_staff_link_has_admin_powers = true;
    await expectRefused(await toggleStatus(json(`${U}/target-1/toggle-status`, {}, 'PATCH'), params));
  });

  it('a super admin by the flag alone (no administrator role) may use every one of these routes, on someone with admin powers too', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
    m.caller = { role: null, is_super_admin: true, institution_id: 'inst-1', full_name: 'SA' };
    m.rpc.is_super_admin = true;
    m.rpc.fn_staff_link_has_admin_powers = true;
    const calls: Array<[string, Promise<Response>]> = [
      ['setRoles', setRoles(json(`${U}/target-1/roles`, { role_ids: ['role-hod'] }), params)],
      ['removeRole', removeRole(new Request(`${U}/target-1/roles?role_id=role-1`, { method: 'DELETE' }) as never, params)],
      ['setPrimaryRole', setPrimaryRole(json(`${U}/target-1/roles`, { primary_role_id: 'role-1' }, 'PATCH'), params)],
      ['setRole', setRole(json(`${U}/target-1/role`, { role: 'faculty' }, 'PATCH'), params)],
      ['bulkRoleUpdate', bulkRoleUpdate(json(`${U}/bulk-role-update`, { userIds: [TARGET_UUID], role: 'faculty' }, 'PATCH'))],
      ['assignRole', assignRole(json(`${U}/roles/assign`, { userId: 'target-1', roleKey: 'hod' }))],
      ['toggleStatus', toggleStatus(json(`${U}/target-1/toggle-status`, {}, 'PATCH'), params)],
      ['manageAuth', manageAuth(json(`${U}/manage-auth`, { action: 'disable', email: 'admin@jkkn.ac.in' }, 'PATCH'))],
    ];
    for (const [name, call] of calls) {
      const res = await call;
      expect(res.status, name).not.toBe(403);
    }
    // POST /api/users still gates on legacy role names first (unchanged here),
    // so its super admin is an administrator who also holds the flag.
    m.caller = { ...ADMINISTRATOR, is_super_admin: true };
    m.adminEmail = 'Orphan.Admin@jkkn.ac.in';
    const created = await createUser(json(U, { email: 'Orphan.Admin@jkkn.ac.in', full_name: 'NEW', role: 'faculty', institution_id: 'inst-1' }));
    expect(created.status).not.toBe(403);
    vi.unstubAllEnvs();
  });

  it('PATCH /api/users/manage-auth: checks the very account it would change (by id), so a mixed-case profile email cannot hide it', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
    m.adminProfileId = 'target-1'; // found only by id: the profile's email is Admin@JKKN.ac.in
    await expectRefused(await manageAuth(json(`${U}/manage-auth`, { action: 'disable', email: 'admin@jkkn.ac.in' }, 'PATCH')));
    expect(m.rpcCalls).toContainEqual({
      fn: 'fn_staff_link_has_admin_powers',
      args: { p_profile_id: 'target-1', p_institution_email: 'admin@jkkn.ac.in' },
    });
    m.adminProfileId = 'someone-else';
    expect((await manageAuth(json(`${U}/manage-auth`, { action: 'disable', email: 'admin@jkkn.ac.in' }, 'PATCH'))).status).toBe(200);
    vi.unstubAllEnvs();
  });
});
