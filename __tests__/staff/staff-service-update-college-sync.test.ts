// StaffService.updateStaff (browser) copies a college change onto the person's
// profile. The staff form always sends a college, so it must compare with the
// record as it was: a phone-only edit must not write the profile. On someone
// with admin powers the profiles guard would refuse that write and show a false
// error after a successful save (2026-10-03).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  current: { institution_email: 'admin@jkkn.ac.in', institution_id: 'inst-1', role_key: 'administrator' } as
    | Record<string, unknown>
    | null,
  profileUpdates: [] as Array<Record<string, unknown>>,
  profileFilters: [] as Array<[string, unknown]>,
  toastErrors: [] as string[],
}));

const f = vi.hoisted(() => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'hr-1' } }, error: null }) },
    from: (table: string) => {
      let op = 'select';
      let payload: Record<string, unknown> | null = null;
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (p: Record<string, unknown>) => { op = 'update'; payload = p; return chain; },
        eq: (k: string, v: unknown) => {
          if (table === 'profiles' && op === 'update') {
            m.profileUpdates.push(payload!);
            m.profileFilters.push([k, v]);
            return Promise.resolve({ error: null });
          }
          return chain;
        },
        single: async () => {
          if (table === 'staff' && op === 'select') {
            return m.current ? { data: m.current, error: null } : { data: null, error: { message: 'rls' } };
          }
          if (table === 'staff' && op === 'update') {
            return { data: { id: 'staff-1', profile_id: 'p1', ...(m.current ?? {}), ...payload }, error: null };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
  return { client };
});

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => f.client,
  createAdminClient: () => f.client,
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(() => {}, { error: (msg: string) => m.toastErrors.push(msg), success: () => {} }),
}));

import { StaffService } from '@/lib/services/staff/staff-service';

beforeEach(() => {
  m.current = { institution_email: 'admin@jkkn.ac.in', institution_id: 'inst-1', role_key: 'administrator', profile_id: 'p-admin' };
  m.profileUpdates = [];
  m.profileFilters = [];
  m.toastErrors = [];
});

describe('StaffService.updateStaff and the profile college', () => {
  it('a phone-only edit sent with the whole form (same college) writes no profile and shows no error', async () => {
    await StaffService.updateStaff('staff-1', { institution_id: 'inst-1', phone: '9111111111', role_key: 'administrator' } as never);
    expect(m.profileUpdates).toEqual([]);
    expect(m.toastErrors).toEqual([]);
  });

  it('a real move updates the profile college', async () => {
    m.current = { institution_email: 'plain@jkkn.ac.in', institution_id: 'inst-1', role_key: 'faculty', profile_id: 'p-plain' };
    await StaffService.updateStaff('staff-1', { institution_id: 'inst-2', role_key: 'faculty' } as never);
    expect(m.profileUpdates).toEqual([{ institution_id: 'inst-2' }]);
    // the linked profile, never every profile that carries the institution email
    expect(m.profileFilters).toEqual([['id', 'p-plain']]);
  });

  it('a move on an unlinked record writes no profile by email; the database sync handles it', async () => {
    m.current = { institution_email: 'admin@jkkn.ac.in', institution_id: 'inst-1', role_key: 'faculty', profile_id: null };
    await StaffService.updateStaff('staff-1', { institution_id: 'inst-2', role_key: 'faculty' } as never);
    expect(m.profileUpdates).toEqual([]);
  });

  it('when the old record cannot be read, it leaves the profile to the database sync', async () => {
    m.current = null;
    await StaffService.updateStaff('staff-1', { institution_id: 'inst-2' } as never).catch(() => {});
    expect(m.profileUpdates).toEqual([]);
  });
});
