// POST /api/learners/complete-onboarding makes a sign-in account and a
// profile with role student for a learner, with the service role (2026-10-07):
// - a college email that belongs to someone with admin powers, a team-member
//   record or a non-learner account is refused before anything is created;
// - the "sign-in account already exists" branch reuses only an ORPHANED
//   account (no profile): the upsert would otherwise overwrite that person's
//   profile (role, learner link, college).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  admin: false,
  taken: null as string | null,
  checkFails: false,
  authExists: false,
  profileForExistingAuth: null as Record<string, unknown> | null,
  created: 0,
  upserts: [] as unknown[],
  deleted: [] as string[],
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (fn: string) => {
      if (m.checkFails) return { data: null, error: { message: 'boom' } };
      if (fn === 'fn_staff_link_has_admin_powers') return { data: m.admin, error: null };
      if (fn === 'fn_learner_email_taken') return { data: m.taken, error: null };
      return { data: null, error: { message: `unexpected ${fn}` } };
    },
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (k: string, v: unknown) => { filters.push([k, v]); return chain; },
        single: async () => ({
          data: table === 'learners_profiles'
            ? { id: 'learner-1', first_name: 'A', last_name: 'B', college_email: 'colleague.signin@gmail.com',
                student_mobile: '1', gender: 'Male', institution_id: 'inst-1', department_id: null,
                is_profile_complete: true, lifecycle_status: 'active' }
            : null,
          error: null,
        }),
        maybeSingle: async () => {
          // profiles by email: none (exact match misses); by id: the existing account's profile
          const byId = filters.find(([k]) => k === 'id');
          return { data: byId ? m.profileForExistingAuth : null, error: null };
        },
        upsert: async (row: unknown) => { m.upserts.push(row); return { error: null }; },
      };
      return chain;
    },
    auth: {
      admin: {
        createUser: async () => {
          m.created += 1;
          return m.authExists
            ? { data: { user: null }, error: { message: 'A user with this email address has already been registered: already exists' } }
            : { data: { user: { id: 'new-auth' } }, error: null };
        },
        listUsers: async () => ({ data: { users: [{ id: 'colleague-auth', email: 'colleague.signin@gmail.com' }] }, error: null }),
        deleteUser: async (id: string) => { m.deleted.push(id); return { error: null }; },
      },
    },
  }),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/lib/utils/activity-logger', () => ({
  logActivity: async () => {},
  ActivityTemplates: { userCreated: () => ({}) },
}));

import { POST } from '@/app/api/learners/complete-onboarding/route';

const call = () => POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ learner_id: 'learner-1' }) }) as never);

beforeEach(() => {
  m.admin = false;
  m.taken = null;
  m.checkFails = false;
  m.authExists = false;
  m.profileForExistingAuth = null;
  m.created = 0;
  m.upserts = [];
  m.deleted = [];
});

describe('complete-onboarding and someone else\'s account', () => {
  it('a team member\'s or non-learner account\'s email → 409 before any account is made', async () => {
    m.taken = 'team_member';
    const res = await call();
    expect(res.status).toBe(409);
    expect(m.created).toBe(0);
    expect(m.upserts).toEqual([]);
  });

  it('fails closed when the check errors: 500, nothing made', async () => {
    m.checkFails = true;
    expect((await call()).status).toBe(500);
    expect(m.created).toBe(0);
  });

  it('an admin-powers email (e.g. a sign-in email) → 409 before any account is made', async () => {
    m.admin = true;
    expect((await call()).status).toBe(409);
    expect(m.created).toBe(0);
  });

  it('an existing sign-in account that already has a profile is never reused: 409, no profile written', async () => {
    m.authExists = true;
    m.profileForExistingAuth = { id: 'colleague-auth' };
    const res = await call();
    expect(res.status).toBe(409);
    expect(m.upserts).toEqual([]);
  });

  it('an orphaned sign-in account (no profile) is still reused, as before; a fresh email still works', async () => {
    m.authExists = true;
    expect((await call()).status).toBe(200);
    expect(m.upserts).toHaveLength(1);
    m.authExists = false;
    m.upserts = [];
    expect((await call()).status).toBe(200);
    expect(m.upserts).toHaveLength(1);
  });
});
