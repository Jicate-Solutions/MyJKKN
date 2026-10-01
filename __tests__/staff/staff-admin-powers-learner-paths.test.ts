// The learner paths that write a profile with the service role (2026-10-03):
// a learner whose college email belongs to someone with admin powers would turn
// that person's profile into a student's (role, college, active). Super admin
// only; refused per row.
//
//   POST /api/learners/create-missing-profiles
//   BulkLearnerUploadService.processBulkUpload (POST /api/learners/bulk-upload-profiles)

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; payload: unknown; filters: Array<[string, unknown]> };

const m = vi.hoisted(() => ({
  rpc: {} as Record<string, unknown>,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  writes: [] as Call[],
  learners: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
  profileByIlike: null as Record<string, unknown> | null,
}));

const f = vi.hoisted(() => {
  function fakeClient(answer: (c: Call, mode: 'single' | 'many') => unknown) {
    return {
      from: (table: string) => {
        const c: Call = { table, op: 'select', payload: null, filters: [] };
        const done = (mode: 'single' | 'many') => {
          if (c.op !== 'select') m.writes.push(c);
          return Promise.resolve({ data: answer(c, mode) ?? null, error: null });
        };
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (k: string, v: unknown) => { c.filters.push([k, v]); return chain; },
          in: (k: string, v: unknown) => { c.filters.push([k, v]); return chain; },
          ilike: (k: string, v: unknown) => { c.filters.push([k, v]); return chain; },
          not: () => chain,
          limit: () => chain,
          insert: (p: unknown) => { c.op = 'insert'; c.payload = p; return chain; },
          update: (p: unknown) => { c.op = 'update'; c.payload = p; return chain; },
          single: () => done('single'),
          maybeSingle: () => done('single'),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => done('many').then(res, rej),
        };
        return chain;
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        m.rpcCalls.push({ fn, args });
        const v = fn in m.rpc ? m.rpc[fn] : null;
        return { data: typeof v === 'function' ? (v as (a: Record<string, unknown>) => unknown)(args) : v, error: null };
      },
      auth: {
        getUser: async () => ({ data: { user: { id: 'caller-1' } }, error: null }),
        admin: {
          createUser: async () => ({ data: { user: { id: 'new-auth' } }, error: null }),
          listUsers: async () => ({ data: { users: [] }, error: null }),
        },
      },
    };
  }
  const session = () =>
    fakeClient((c) => {
      if (c.table === 'profiles') return { id: 'caller-1', role: 'learner_admin', is_super_admin: false };
      if (c.table === 'custom_roles') return { permissions: { 'learners.profiles.sync': true } };
      return null;
    });
  const admin = () =>
    fakeClient((c, mode) => {
      if (c.table === 'learners_profiles' && mode === 'many') return m.learners;
      if (c.table === 'profiles' && c.op === 'select') {
        if (c.filters.some(([k]) => k === 'email')) return mode === 'many' ? [] : m.profileByIlike;
        return m.profiles;
      }
      return null;
    });
  return { fakeClient, session, admin };
});

vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => f.session() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => f.admin() }));
vi.mock('@/lib/services/learner-validation-service', () => ({
  LearnerValidationService: {
    findDuplicateEmails: () => new Map(),
    findDuplicatePhotoUrls: () => new Map(),
    findExistingPhotoOwners: async () => new Map(),
  },
}));

import { POST as syncLearnerProfiles } from '@/app/api/learners/create-missing-profiles/route';
import { BulkLearnerUploadService } from '@/lib/services/bulk-learner-upload-service';
import { ADMIN_ROLE_MESSAGE } from '@/lib/services/staff/staff-admin-powers';

const LEARNER = {
  id: 'learner-1', first_name: 'A', last_name: 'B', college_email: 'admin@jkkn.ac.in', student_mobile: '1',
  institution_id: 'inst-1', department_id: null, gender: 'male', lifecycle_status: 'active', is_profile_complete: true,
};
const ADMIN_PROFILE = {
  id: 'admin-profile', email: 'Admin@JKKN.ac.in', role: 'administrator', institution_id: 'inst-9',
  department_id: null, learner_id: null, full_name: 'AD MIN', phone_number: '1', gender: 'male', is_active: true,
};
const profileWrites = () => m.writes.filter((w) => w.table === 'profiles');

beforeEach(() => {
  m.rpc = { is_super_admin: false };
  m.rpcCalls = [];
  m.writes = [];
  m.learners = [LEARNER];
  m.profiles = [ADMIN_PROFILE];
  m.profileByIlike = null;
});

describe('POST /api/learners/create-missing-profiles', () => {
  const run = async () => {
    const res = await syncLearnerProfiles(new Request('http://localhost/x', { method: 'POST', body: '{}' }));
    return (await res.json()) as { results: { errors: Array<{ error: string }> } };
  };

  it('does not demote someone with admin powers to a learner account (refused for that row, nothing written)', async () => {
    m.rpc.fn_staff_link_has_admin_powers = true;
    const out = await run();
    expect(out.results.errors.map((e) => e.error)).toEqual([ADMIN_ROLE_MESSAGE]);
    expect(profileWrites()).toEqual([]);
    expect(m.rpcCalls).toContainEqual({
      fn: 'fn_staff_link_has_admin_powers',
      args: { p_profile_id: 'admin-profile', p_institution_email: null },
    });
  });

  it('…nor when the profile only turns up on the second look', async () => {
    m.profiles = [];
    m.profileByIlike = { ...ADMIN_PROFILE };
    m.rpc.fn_staff_link_has_admin_powers = true;
    const out = await run();
    expect(out.results.errors.map((e) => e.error)).toEqual([ADMIN_ROLE_MESSAGE]);
    expect(profileWrites()).toEqual([]);
  });

  it('an ordinary profile is still synced; a super admin may sync any', async () => {
    m.rpc.fn_staff_link_has_admin_powers = false;
    expect((await run()).results.errors).toEqual([]);
    expect(profileWrites()).toHaveLength(1);
    m.writes = [];
    m.rpc.fn_staff_link_has_admin_powers = true;
    m.rpc.is_super_admin = true;
    expect((await run()).results.errors).toEqual([]);
    expect(profileWrites()).toHaveLength(1);
  });
});

describe('BulkLearnerUploadService.processBulkUpload', () => {
  const row = { rowNumber: 2, data: { ...LEARNER }, validation: { isValid: true, errors: [] } };

  it('a row whose college email belongs to someone with admin powers is refused and nothing is written', async () => {
    m.rpc.fn_staff_link_has_admin_powers = true;
    const result = await BulkLearnerUploadService.processBulkUpload([row] as never, 'caller-1', f.session());
    expect(result.errors).toEqual([{ row: 2, email: 'admin@jkkn.ac.in', error: ADMIN_ROLE_MESSAGE }]);
    expect(m.writes.filter((w) => w.table === 'profiles' || w.table === 'learners_profiles')).toEqual([]);
    expect(m.rpcCalls).toContainEqual({
      fn: 'fn_staff_link_has_admin_powers',
      args: { p_profile_id: null, p_institution_email: 'admin@jkkn.ac.in' },
    });
  });

  it('a super admin\'s upload is checked too: only the row carrying an admin\'s email fails, the other rows go ahead', async () => {
    // The database's learner email sync refuses such a row for everyone; left
    // to it, one row would fail the whole insert batch.
    m.rpc.is_super_admin = true;
    m.rpc.fn_staff_link_has_admin_powers = (a: Record<string, unknown>) => a.p_institution_email === 'admin@jkkn.ac.in';
    const rows = [
      row,
      { rowNumber: 3, data: { ...LEARNER, id: 'learner-2', college_email: 'one@jkkn.ac.in' }, validation: { isValid: true, errors: [] } },
      { rowNumber: 4, data: { ...LEARNER, id: 'learner-3', college_email: 'two@jkkn.ac.in' }, validation: { isValid: true, errors: [] } },
    ];
    const result = await BulkLearnerUploadService.processBulkUpload(rows as never, 'caller-1', f.session());
    expect(result.errors.filter((e: { error: string }) => e.error === ADMIN_ROLE_MESSAGE))
      .toEqual([{ row: 2, email: 'admin@jkkn.ac.in', error: ADMIN_ROLE_MESSAGE }]);
    expect(result.upload_summary.learners_failed).toBe(1);
    const inserted = m.writes.filter((w) => w.table === 'learners_profiles' && w.op === 'insert')
      .flatMap((w) => (Array.isArray(w.payload) ? w.payload : [w.payload]) as Array<Record<string, unknown>>);
    expect(inserted.map((x) => x.college_email)).toEqual(['one@jkkn.ac.in', 'two@jkkn.ac.in']);
  });
});
