// PATCH / DELETE /api/staff/[id] — the record of someone with admin powers is
// super admin only, and PATCH writes only the staff form's fields (2026-10-01).
//
// The route writes with the service-role client, which skips the database
// guard (trg_staff_guard_role_key), so the same rule has to hold here. The
// "has admin powers" answer comes from fn_staff_record_has_admin_powers; here
// it is mocked, and the route's branching is the subject. The database side is
// proven in staff-admin-records-super-admin-only.pg.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  caller: { is_super_admin: false, role: 'hr_head', institution_id: 'inst-1', email: 'hr@jkkn.ac.in' },
  staff: {
    id: 'staff-1', profile_id: 'person-1', institution_id: 'inst-1',
    institution_email: 'person@jkkn.ac.in', role_key: 'faculty',
    first_name: 'ASHA', phone: '9000000000', date_of_birth: '1990-05-01', blood_group: null,
    is_active: true, tags: ['a', 'b'],
  } as Record<string, unknown>,
  hasAdminPowers: false as boolean,
  linksToAdmin: false as boolean,
  identity: null as string | null,
  callerEmail: 'hr@jkkn.ac.in' as string | undefined,
  isCallers: false as boolean,
  identityError: null as unknown,
  reach: true as boolean,
  targetRolePrivileged: false as boolean,
  adminPowersError: null as unknown,
  // permission keys, built so the key prefix reads as an identifier
  permissions: new Set<string>(['edit', 'delete', 'role.change'].map((a) => ['staff', a].join('.'))),
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  staffUpdates: [] as Array<Record<string, unknown>>,
  profileUpdates: [] as Array<Record<string, unknown>>,
  staffDeletes: 0,
}));

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock('@/lib/services/staff/staff-scope', () => ({
  getStaffScope: async () => 'all_institutions',
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'caller-1', email: m.callerEmail } } }, error: null }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      m.rpcCalls.push({ fn, args });
      if (fn === 'fn_staff_record_has_admin_powers') {
        return { data: m.adminPowersError ? null : m.hasAdminPowers, error: m.adminPowersError };
      }
      if (fn === 'fn_staff_link_has_admin_powers') return { data: m.linksToAdmin, error: null };
      if (fn === 'fn_staff_role_key_is_privileged') return { data: m.targetRolePrivileged, error: null };
      if (fn === 'fn_staff_record_is_callers') return { data: m.isCallers, error: null };
      if (fn === 'fn_staff_identity_change_refusal') {
        return { data: m.identityError ? null : m.identity, error: m.identityError };
      }
      if (fn === 'user_has_permission') {
        return { data: m.permissions.has(String(args.permission_name)), error: null };
      }
      if (fn === 'role_has_institution_access') return { data: m.reach, error: null };
      return { data: null, error: null };
    },
  }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      let op: 'select' | 'update' | 'delete' = 'select';
      let payload: Record<string, unknown> | null = null;
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (k: string, v: unknown) => {
        if (op === 'delete' && table === 'staff') {
          m.staffDeletes += 1;
          return Promise.resolve({ error: null });
        }
        if (op === 'update' && table === 'profiles') {
          m.profileUpdates.push({ ...payload!, [`where ${k}`]: v });
          return Promise.resolve({ error: null });
        }
        return chain;
      };
      chain.update = (p: Record<string, unknown>) => {
        op = 'update';
        payload = p;
        return chain;
      };
      chain.delete = () => {
        op = 'delete';
        return chain;
      };
      chain.maybeSingle = async () =>
        table === 'custom_roles' ? { data: { id: 'role-x' }, error: null } : { data: null, error: null };
      chain.single = async () => {
        if (table === 'profiles') return { data: m.caller, error: null };
        if (table === 'staff' && op === 'update') {
          m.staffUpdates.push(payload!);
          return { data: { ...m.staff, ...payload }, error: null };
        }
        if (table === 'staff') return { data: m.staff, error: null };
        return { data: null, error: null };
      };
      return chain;
    },
  }),
}));

import { PATCH, DELETE } from '@/app/api/staff/[id]/route';
import {
  ADMIN_RECORD_MESSAGE,
  adminRecordMessageFor,
  IDENTITY_SALARY_MESSAGE,
  SELF_ROLE_MESSAGE,
  OWN_COLLEGE_MESSAGE,
  IDENTITY_SELF_MESSAGE
} from '@/lib/services/staff/staff-admin-powers';

const params = { params: Promise.resolve({ id: 'staff-1' }) };
const patch = (body: Record<string, unknown>) =>
  PATCH(
    new Request('http://localhost/api/staff/staff-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }) as never,
    params
  );
const del = () => DELETE(new Request('http://localhost/api/staff/staff-1', { method: 'DELETE' }) as never, params);

beforeEach(() => {
  m.caller = { is_super_admin: false, role: 'hr_head', institution_id: 'inst-1', email: 'hr@jkkn.ac.in' };
  m.hasAdminPowers = false;
  m.linksToAdmin = false;
  m.identity = null;
  m.callerEmail = 'hr@jkkn.ac.in';
  m.isCallers = false;
  m.identityError = null;
  m.reach = true;
  m.targetRolePrivileged = false;
  m.adminPowersError = null;
  m.rpcCalls = [];
  m.staffUpdates = [];
  m.profileUpdates = [];
  m.staffDeletes = 0;
});

describe('the record of someone with admin powers', () => {
  it('HR Head PATCH (any change, e.g. marking as left) → 403 with the message, nothing written', async () => {
    m.hasAdminPowers = true;
    const res = await patch({ is_active: false });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(adminRecordMessageFor(['is_active']));
    expect(m.staffUpdates).toHaveLength(0);
    expect(m.rpcCalls).toContainEqual({ fn: 'fn_staff_record_has_admin_powers', args: { p_staff_id: 'staff-1' } });
  });

  it('HR Head PATCH demoting the role → 403, nothing written', async () => {
    m.hasAdminPowers = true;
    m.staff = { ...m.staff, role_key: 'administrator' };
    const res = await patch({ role_key: 'faculty' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(adminRecordMessageFor(['role_key']));
    expect(m.staffUpdates).toHaveLength(0);
    m.staff = { ...m.staff, role_key: 'faculty' };
  });

  it('HR Head DELETE → 403 with the message, nothing deleted', async () => {
    m.hasAdminPowers = true;
    const res = await del();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(ADMIN_RECORD_MESSAGE);
    expect(m.staffDeletes).toBe(0);
  });

  it('fails closed when the check itself errors', async () => {
    m.adminPowersError = { message: 'boom' };
    expect((await patch({ first_name: 'OTHER' })).status).toBe(500);
    expect((await del()).status).toBe(500);
    expect(m.staffUpdates).toHaveLength(0);
    expect(m.staffDeletes).toBe(0);
  });

  it('a super admin may change and delete it', async () => {
    m.caller = { ...m.caller, is_super_admin: true, role: 'super_admin' };
    m.hasAdminPowers = true;
    expect((await patch({ is_active: false })).status).toBe(200);
    expect(m.staffUpdates[0]).toMatchObject({ is_active: false });
    expect((await del()).status).toBe(200);
    expect(m.staffDeletes).toBe(1);
  });
});

describe('the small fields (second ruling): photo, phone numbers, attendance machine code', () => {
  it('HR Head may change them on the record of someone with admin powers', async () => {
    m.hasAdminPowers = true;
    const res = await patch({
      profile_picture: 'https://x/p.jpg', phone: '9111111111', emergency_contact_phone: '9222222222',
      biometric_id: '42', biometric_institution_id: 'inst-1',
    });
    expect(res.status).toBe(200);
    expect(m.staffUpdates[0]).toMatchObject({ phone: '9111111111', biometric_id: '42' });
  });

  it('the whole form sent back unchanged plus a new phone is still only a phone change', async () => {
    m.hasAdminPowers = true;
    const res = await patch({
      first_name: 'ASHA', date_of_birth: '1990-05-01T00:00:00.000Z', blood_group: '', is_active: true,
      tags: ['a', 'b'], role_key: 'faculty', institution_id: 'inst-1', phone: '9111111111',
    });
    expect(res.status).toBe(200);
  });

  it('a small field together with anything else → 403, nothing written', async () => {
    m.hasAdminPowers = true;
    const res = await patch({ phone: '9111111111', first_name: 'OTHER', gender: 'female' });
    expect(res.status).toBe(403);
    // names what else the edit changes (the form sends every field)
    expect((await res.json()).error).toBe(
      'Only a super admin can change the record of someone with admin powers. Others may change only the photo, phone numbers and attendance machine code; this edit also changes: first_name, gender.'
    );
    expect(m.staffUpdates).toHaveLength(0);
  });
});

describe('super admin is the is_super_admin flag only', () => {
  it('role super_admin without the flag is treated as anyone else', async () => {
    m.caller = { ...m.caller, is_super_admin: false, role: 'super_admin' };
    m.hasAdminPowers = true;
    expect((await patch({ is_active: false })).status).toBe(403);
    expect((await del()).status).toBe(403);
    expect(m.staffUpdates).toHaveLength(0);
    expect(m.staffDeletes).toBe(0);
  });
});

describe('an ordinary record that would GET admin powers', () => {
  it('HR Head PATCH promoting to a privileged role → 403, nothing written', async () => {
    m.targetRolePrivileged = true;
    const res = await patch({ role_key: 'administrator' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Only a super administrator can assign the role "administrator".');
    expect(m.staffUpdates).toHaveLength(0);
  });

  it('HR Head PATCH re-pointing the institution email at someone with admin powers → 403, nothing written', async () => {
    m.linksToAdmin = true;
    const res = await patch({ institution_email: 'ceo@jkkn.ac.in' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(ADMIN_RECORD_MESSAGE);
    expect(m.staffUpdates).toHaveLength(0);
    expect(m.rpcCalls).toContainEqual({
      fn: 'fn_staff_link_has_admin_powers',
      args: { p_profile_id: 'person-1', p_institution_email: 'ceo@jkkn.ac.in' },
    });
  });

  it('an unchanged institution email is not re-checked; a super admin may re-point', async () => {
    m.linksToAdmin = true;
    expect((await patch({ institution_email: 'person@jkkn.ac.in', phone: '1' })).status).toBe(200);
    m.caller = { ...m.caller, is_super_admin: true, role: 'super_admin' };
    expect((await patch({ institution_email: 'ceo@jkkn.ac.in' })).status).toBe(200);
  });
});

describe('HR Head on ordinary team members', () => {
  it('PATCH still works, and DELETE still works', async () => {
    expect((await patch({ phone: '9999999999', is_active: false })).status).toBe(200);
    expect(m.staffUpdates[0]).toMatchObject({ phone: '9999999999', is_active: false });
    expect((await del()).status).toBe(200);
    expect(m.staffDeletes).toBe(1);
  });
});

describe('PATCH writes only the fields the form edits', () => {
  it('drops profile_id, created_by and unknown columns for HR Head', async () => {
    const res = await patch({
      first_name: 'ASHA',
      institution_id: 'inst-1', // unchanged — the form always sends it
      profile_id: 'someone-else',
      created_by: 'someone-else',
      is_super_admin: true,
      id: 'other-row',
    });
    expect(res.status).toBe(200);
    const written = m.staffUpdates[0];
    expect(written.first_name).toBe('ASHA');
    for (const k of ['profile_id', 'created_by', 'is_super_admin', 'id']) {
      expect(written).not.toHaveProperty(k);
    }
    expect(written.updated_by).toBe('caller-1');
  });

  it('HR Head may move an ORDINARY team member to another institution they can reach', async () => {
    expect((await patch({ institution_id: 'inst-2' })).status).toBe(200);
    expect(m.staffUpdates[0]).toMatchObject({ institution_id: 'inst-2' });
    expect(m.rpcCalls).toContainEqual({ fn: 'role_has_institution_access', args: { check_institution_id: 'inst-2' } });
  });

  it('…but not to an institution they cannot reach (403, nothing written)', async () => {
    m.reach = false;
    expect((await patch({ institution_id: 'inst-9' })).status).toBe(403);
    expect(m.staffUpdates).toHaveLength(0);
  });

  it('…and not someone with admin powers: that is super admin only (403, nothing written)', async () => {
    m.hasAdminPowers = true;
    const res = await patch({ institution_id: 'inst-2' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(adminRecordMessageFor(['institution_id']));
    expect(m.staffUpdates).toHaveLength(0);
  });

  it('a super admin may still change institution_id (the form uses it); profile_id is never written', async () => {
    m.caller = { ...m.caller, is_super_admin: true, role: 'super_admin' };
    expect((await patch({ institution_id: 'inst-2', profile_id: 'someone-else' })).status).toBe(200);
    expect(m.staffUpdates[0]).toMatchObject({ institution_id: 'inst-2' });
    expect(m.staffUpdates[0]).not.toHaveProperty('profile_id');
  });
});

describe('who the record belongs to (2026-10-03): checked for every caller, super admins included', () => {
  it('a super admin re-pointing their own record at a decoy → 403, nothing written', async () => {
    m.caller = { ...m.caller, is_super_admin: true, role: 'super_admin' };
    m.identity = 'self_or_director';
    const res = await patch({ institution_email: 'decoy@jkkn.ac.in' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(IDENTITY_SELF_MESSAGE);
    expect(m.staffUpdates).toHaveLength(0);
    expect(m.rpcCalls).toContainEqual({
      fn: 'fn_staff_identity_change_refusal',
      args: { p_staff_id: 'staff-1', p_profile_id: 'person-1', p_email: null, p_institution_email: 'decoy@jkkn.ac.in' },
    });
  });

  it('a Director-list member\'s record re-pointed by HR Head → 403', async () => {
    m.identity = 'self_or_director';
    expect((await patch({ email: 'someone@gmail.com' })).status).toBe(403);
    expect(m.staffUpdates).toHaveLength(0);
  });

  it('while a salary revision is waiting or approved → 409', async () => {
    m.identity = 'salary_request';
    const res = await patch({ institution_email: 'new@jkkn.ac.in' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(IDENTITY_SALARY_MESSAGE);
    expect(m.staffUpdates).toHaveLength(0);
  });

  it('fails closed when the identity check itself errors (500, nothing written)', async () => {
    m.identityError = { message: 'boom' };
    expect((await patch({ phone: '9111111111' })).status).toBe(500);
    expect(m.staffUpdates).toHaveLength(0);
  });

  it('an ordinary edit (the check answers nothing) still saves', async () => {
    expect((await patch({ email: 'asha.new@gmail.com' })).status).toBe(200);
    expect(m.staffUpdates[0]).toMatchObject({ email: 'asha.new@gmail.com' });
  });
});

describe('the profile\'s college follows only a real move (2026-10-03)', () => {
  it('a phone-only edit sent with the whole form (same college) writes no profile', async () => {
    m.hasAdminPowers = true; // e.g. HR Head fixing an administrator's phone
    const res = await patch({ first_name: 'ASHA', institution_id: 'inst-1', phone: '9111111111' });
    expect(res.status).toBe(200);
    expect(m.profileUpdates).toEqual([]);
  });

  it('a real move of an ordinary member updates their profile\'s college', async () => {
    expect((await patch({ institution_id: 'inst-2' })).status).toBe(200);
    // the profile linked by profile_id, not every profile carrying the email
    expect(m.profileUpdates).toEqual([{ institution_id: 'inst-2', 'where id': 'person-1' }]);
  });
});

describe('nobody but a super admin changes the role on their OWN record (2026-10-03)', () => {
  it('HR Head changing the role on a record the database says is theirs → 403, nothing written', async () => {
    m.isCallers = true;
    const res = await patch({ role_key: 'hod' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(SELF_ROLE_MESSAGE);
    expect(m.staffUpdates).toHaveLength(0);
    // the database's own test: profile link, and any account or profile by its emails
    expect(m.rpcCalls).toContainEqual({
      fn: 'fn_staff_record_is_callers',
      args: { p_profile_id: 'person-1', p_email: null, p_institution_email: 'person@jkkn.ac.in' },
    });
  });

  it('someone else\'s ordinary record may still have its role changed by HR Head', async () => {
    expect((await patch({ role_key: 'hod' })).status).toBe(200);
  });
});

describe('nobody but a super admin moves their OWN record to another college (2026-10-07)', () => {
  it('HR Head moving a record the database says is theirs → 403, nothing written, no profile touched', async () => {
    m.isCallers = true;
    const res = await patch({ institution_id: 'inst-2' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(OWN_COLLEGE_MESSAGE);
    expect(m.staffUpdates).toHaveLength(0);
    expect(m.profileUpdates).toEqual([]);
  });

  it('a super admin may move their own record', async () => {
    m.isCallers = true;
    m.caller = { ...m.caller, is_super_admin: true };
    expect((await patch({ institution_id: 'inst-2' })).status).toBe(200);
  });
});

