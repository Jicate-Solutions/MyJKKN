/**
 * "Sign out of all devices" — the two server actions (Director ruling 1 Oct 2026).
 *
 *  - self:  the caller's OWN sessions end with supabase.auth.signOut({ scope: 'global' }),
 *           and the activity row is written BEFORE the sign-out (afterwards the
 *           session that authorises the insert no longer exists).
 *  - admin: the database function is called through the caller's session; a
 *           refusal comes back as { success: false, error } (never a redirect),
 *           and the activity row (who, whom, how many logins) is written only
 *           after the function succeeded.
 *
 * Who may revoke whom is decided by fn_revoke_user_sessions itself — proved in
 * revoke-user-sessions.pg.test.ts against the real migration file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const getUser = vi.fn();
const signOut = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();
const logActivity = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser, signOut },
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

vi.mock('@/lib/utils/activity-logger', () => ({
  logActivity: (...args: unknown[]) => logActivity(...args),
}));

import { signOutEverywhere } from '@/app/(routes)/profile/_actions/sign-out-everywhere';
import { revokeUserSessions } from '@/app/(routes)/users/[id]/_actions/revoke-user-sessions';

const ME = '00000000-0000-4000-8000-0000000000a1';
const THEM = '00000000-0000-4000-8000-0000000000b2';

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getUser.mockResolvedValue({ data: { user: { id: ME, email: 'me@jkkn.ac.in' } }, error: null });
  signOut.mockImplementation(async (opts: unknown) => {
    calls.push(`signOut:${JSON.stringify(opts)}`);
    return { error: null };
  });
  logActivity.mockImplementation(async () => {
    calls.push('logActivity');
  });
  rpc.mockImplementation(async () => {
    calls.push('rpc');
    return { data: 3, error: null };
  });
  maybeSingle.mockResolvedValue({
    data: { full_name: 'Priya', email: 'priya@jkkn.ac.in', role: 'faculty', institution_id: null },
    error: null,
  });
});

describe('signOutEverywhere (own account)', () => {
  it('ends every session with scope global, after writing the activity row', async () => {
    const result = await signOutEverywhere();
    expect(result).toEqual({ success: true });
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(calls).toEqual(['logActivity', 'signOut:{"scope":"global"}']);
    expect(logActivity.mock.calls[0][0]).toMatchObject({
      userId: ME,
      actionType: 'logout',
      metadata: { logout_method: 'all_devices', scope: 'global', requested_by: 'self' },
    });
  });

  it('a signed-out caller gets a message, and nothing is signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth session missing' } });
    const result = await signOutEverywhere();
    expect(result.success).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('a failed sign-out is reported, not shown as success', async () => {
    signOut.mockResolvedValue({ error: { message: 'network' } });
    const result = await signOutEverywhere();
    expect(result.success).toBe(false);
  });

  it('a failed sign-out also writes a FAILED activity row, so the audit never shows it as done', async () => {
    signOut.mockResolvedValue({ error: { message: 'network' } });
    await signOutEverywhere();
    expect(logActivity).toHaveBeenCalledTimes(2);
    expect(logActivity.mock.calls[1][0]).toMatchObject({
      metadata: { logout_method: 'all_devices', outcome: 'failed', error: 'network' },
    });
  });
});

describe('revokeUserSessions (admin, someone else’s account)', () => {
  it('calls the database function for that person, then writes who / whom / how many', async () => {
    const result = await revokeUserSessions(THEM);
    expect(result).toEqual({ success: true, sessionsEnded: 3 });
    expect(rpc).toHaveBeenCalledWith('fn_revoke_user_sessions', { p_user_id: THEM });
    expect(calls).toEqual(['rpc', 'logActivity']);
    expect(logActivity.mock.calls[0][0]).toMatchObject({
      userId: ME,
      actionType: 'revoke',
      resourceType: 'user',
      resourceId: THEM,
      metadata: { target_user_id: THEM, sessions_ended: 3, scope: 'global', requested_by: 'admin' },
    });
    // The admin path never ends the CALLER's own sessions.
    expect(signOut).not.toHaveBeenCalled();
  });

  it('a person without the permission is refused with a message, and no activity row is written', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not_allowed' } });
    const result = await revokeUserSessions(THEM);
    expect(result.success).toBe(false);
    if (result.success === false) expect(result.error).toMatch(/don't have access/);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('a key holder aiming at a super admin is told only a super admin can do that', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'cannot_revoke_super_admin' } });
    const result = await revokeUserSessions(THEM);
    if (result.success === false) expect(result.error).toMatch(/Only a super admin/);
    expect(result.success).toBe(false);
  });

  it('says plainly when the database update is not applied yet', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    const result = await revokeUserSessions(THEM);
    if (result.success === false) expect(result.error).toMatch(/not switched on yet/);
  });

  it('when the database could not actually end the logins, it is a failure — never "no active logins"', async () => {
    for (const message of [
      'revoke_unavailable: row security hides auth sessions from role postgres',
      'revoke_unavailable: role postgres may not delete auth sessions',
      'revoke_incomplete',
    ]) {
      rpc.mockResolvedValue({ data: null, error: { code: '55000', message } });
      const result = await revokeUserSessions(THEM);
      expect(result.success).toBe(false);
      if (result.success === false) expect(result.error).toMatch(/did NOT work/);
    }
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('refuses the caller’s own account and points to the account menu instead', async () => {
    const result = await revokeUserSessions(ME);
    expect(result.success).toBe(false);
    if (result.success === false) expect(result.error).toMatch(/account menu/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a malformed id without touching the database', async () => {
    const result = await revokeUserSessions('not-a-uuid');
    expect(result.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a signed-out caller is refused', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth session missing' } });
    const result = await revokeUserSessions(THEM);
    expect(result.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
