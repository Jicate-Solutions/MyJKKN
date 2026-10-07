// POST /api/courses/enrollments/[id]/resend-credentials, the email backfill
// (round 9 of the admin-powers lane). fn_course_backfill_participant_email now
// checks who is asking, so the route must call it through the signed-in
// client, and a refusal must stop the route before any password changes: the
// typed address must not receive this participant's credentials.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  userRpc: [] as Array<{ fn: string; args: unknown }>,
  adminRpc: [] as Array<{ fn: string; args: unknown }>,
  rpcError: null as null | { code: string; message: string },
  passwordResets: 0,
  emailsSent: [] as unknown[],
}));

const enrollment = {
  id: 'en-1', enrollment_number: 'E1', profile_id: 'p-ext', total_payable: 0,
  participant_type: 'external', course: { title: 'C' }, package: { name: 'P' }, bills: [],
};

// Answers every select chain with one row.
const chainOf = (row: unknown) => {
  const chain: Record<string, unknown> = {
    select: () => chain, eq: () => chain,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return chain;
};

const userClient = {
  from: () => chainOf(enrollment),
  rpc: async (fn: string, args: unknown) => { m.userRpc.push({ fn, args }); return { data: null, error: m.rpcError }; },
};

vi.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: (req: Request, auth: unknown, ctx: unknown) => Promise<Response>) =>
    (req: Request, ctx: unknown) => handler(req, { supabase: userClient, user: { id: 'decider' } }, ctx),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => chainOf(table === 'profiles'
      ? { id: 'p-ext', full_name: 'Ext', email: null, is_external_participant: true, is_active: true }
      : { jkkn_id: 'JK1' }),
    rpc: async (fn: string, args: unknown) => { m.adminRpc.push({ fn, args }); return { data: null, error: null }; },
    auth: { admin: { updateUserById: async () => { m.passwordResets += 1; return { error: null }; } } },
  }),
}));

vi.mock('@/lib/utils/temporary-password', () => ({ generateTemporaryPassword: () => 'Temp-1234' }));
vi.mock('@/lib/services/email/course-welcome-email-service', () => ({
  CourseWelcomeEmailService: {
    sendApprovedEmail: async (x: unknown) => { m.emailsSent.push(x); return { success: true }; },
  },
}));

import { POST } from '@/app/api/courses/enrollments/[id]/resend-credentials/route';

const call = (email: string) =>
  (POST as unknown as (r: Request, c: unknown) => Promise<Response>)(
    new Request('http://x/api', { method: 'POST', body: JSON.stringify({ email }) }),
    { params: Promise.resolve({ id: 'en-1' }) },
  );

beforeEach(() => {
  m.userRpc = []; m.adminRpc = []; m.rpcError = null; m.passwordResets = 0; m.emailsSent = [];
});

describe('resend-credentials email backfill', () => {
  it('asks the database through the signed-in client, never the service role', async () => {
    const res = await call('ext.person@gmail.com');
    expect(res.status).toBe(200);
    expect(m.userRpc).toEqual([{ fn: 'fn_course_backfill_participant_email', args: { p_profile_id: 'p-ext', p_email: 'ext.person@gmail.com' } }]);
    expect(m.adminRpc).toEqual([]);
    expect(m.passwordResets).toBe(1);
  });

  it('a refused address stops the route before the password changes or any email goes out', async () => {
    m.rpcError = { code: 'P0001', message: 'That email belongs to a team-member record. Only a super admin can give it to an account.' };
    const res = await call('plain@jkkn.ac.in');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/team-member record/);
    expect(m.passwordResets).toBe(0);
    expect(m.emailsSent).toEqual([]);
  });

  it('a caller the database does not allow gets 403, nothing changes', async () => {
    m.rpcError = { code: '42501', message: 'Only someone who may decide course applications can add a participant\'s email.' };
    const res = await call('ext.person@gmail.com');
    expect(res.status).toBe(403);
    expect(m.passwordResets).toBe(0);
  });

  it('any other failure stays non-fatal, as before', async () => {
    m.rpcError = { code: '08006', message: 'connection lost' };
    const res = await call('ext.person@gmail.com');
    expect(res.status).toBe(200);
    expect(m.passwordResets).toBe(1);
  });
});
