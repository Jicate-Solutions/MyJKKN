/**
 * Parent User Data list — GET /api/academic/parent-portal/users.
 * Director rulings 2 Oct 2026: the list NEVER carries a password (a super admin
 * sees one at a time through the show-password route, which logs each view);
 * it only says whether the viewer is a super admin, so the screen knows whether
 * to offer the per-row "Show password" button.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireParentUserDataAdmin = vi.fn();

const INST = '00000000-0000-4000-8000-00000000000a';
const ACCOUNT = '00000000-0000-4000-8000-0000000000c3';
const LEARNER = '00000000-0000-4000-8000-0000000000d4';

const data: Record<string, unknown> = {};

/** A chainable, awaitable stand-in for a PostgREST query on one table. */
function query(table: string) {
  const result = () => {
    if (table === 'profiles') return { data: data.profile, error: null };
    return { data: data[table], error: null };
  };
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) q[m] = () => q;
  q.maybeSingle = async () => result();
  q.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => query(t) }),
}));
vi.mock('@/lib/utils/parent-admin-auth', () => ({
  requireParentUserDataAdmin: () => requireParentUserDataAdmin(),
}));

import { GET } from '@/app/api/academic/parent-portal/users/route';

function get() {
  return new NextRequest(`http://localhost/api/academic/parent-portal/users?institutionId=${INST}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  requireParentUserDataAdmin.mockResolvedValue({ id: 'viewer-1', isSuperAdmin: true });
  data.profile = { is_super_admin: true, institution_id: INST };
  data.institutions = [{ id: INST, name: 'JKKN College', entity_type: 'college' }];
  data.learners_profiles = [
    {
      id: LEARNER,
      first_name: 'Kavya',
      last_name: 'R',
      application_id: null,
      roll_number: '24UBA001',
      register_number: null,
      father_mobile: '9000000001',
      mother_mobile: '',
    },
  ];
  data.pp_parent_accounts = [
    { id: ACCOUNT, learner_profile_id: LEARNER, mobile: '9000000001', is_active: true, reset_password: 'Secret@123' },
  ];
});

describe('GET parent users', () => {
  it('never sends a password, even for an admin-reset account viewed by a super admin', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0]).not.toHaveProperty('password');
    expect(body.users[0]).not.toHaveProperty('reset_password');
    expect(body.users[0].isAdminReset).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/Secret@123|JKKN@100/);
  });

  it('tells the screen the viewer is a super admin only when profiles.is_super_admin is true', async () => {
    expect((await (await GET(get())).json()).viewerIsSuperAdmin).toBe(true);

    // A principal (or an admin holding the super_admin role key but not the
    // profile flag) is not offered the button.
    requireParentUserDataAdmin.mockResolvedValue({ id: 'principal-1', isSuperAdmin: false });
    data.profile = { is_super_admin: false, institution_id: INST };
    expect((await (await GET(get())).json()).viewerIsSuperAdmin).toBe(false);

    data.profile = { is_super_admin: null, institution_id: INST };
    expect((await (await GET(get())).json()).viewerIsSuperAdmin).toBe(false);
  });

  it('refuses a caller who may not manage parent user data', async () => {
    requireParentUserDataAdmin.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(403);
  });
});
