'use server';

// "Sign out of all devices" — an admin acting on someone else's account.
// Director ruling 2026-10-01: the safety net for a lost or shared phone.
//
// The check of WHO may do this lives in the database function
// fn_revoke_user_sessions (super admin, or a role holding
// users.sessions.revoke; a non-super-admin cannot target a super admin). It is
// called through the caller's OWN session — never a service-role client — so
// auth.uid() is the real caller. This action only translates the result into
// a message the screen can show (rule #27: refusals are shown, never a silent
// redirect) and writes the activity record.

import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { recordAdminSignOutNotice } from '@/lib/auth/sign-out-notices';
import { logActivity } from '@/lib/utils/activity-logger';
import { RESOURCE_TYPES } from '@/types/activity';

export type RevokeUserSessionsResult =
  | { success: true; sessionsEnded: number }
  | { success: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refusalMessage(error: { code?: string; message?: string }): string {
  const message = error.message ?? '';
  if (message.includes('cannot_revoke_super_admin')) {
    return 'Only a super admin can sign a super admin out of their devices.';
  }
  if (message.includes('not_allowed') || message.includes('not_authenticated')) {
    return "You don't have access to sign people out of their devices. Ask a super admin to give your role 'Sign Anyone Out of All Their Devices' in Role Management.";
  }
  if (message.includes('revoke_unavailable') || message.includes('revoke_incomplete')) {
    // The database could not actually end the logins (its function may not
    // delete them, or cannot see them). Never report that as "nobody was
    // signed in" — say it failed.
    return 'Signing this person out did NOT work: the database could not end their logins. Nothing was changed. Please contact the MyJKKN team.';
  }
  if (message.includes('user_not_found')) {
    return 'This account could not be found. It may have been removed.';
  }
  if (error.code === 'PGRST202' || error.code === '42883') {
    return 'This action is not switched on yet — the database update for it has not been applied. Please contact the MyJKKN team.';
  }
  return 'Signing this person out failed. Please try again in a minute.';
}

export async function revokeUserSessions(
  targetUserId: string
): Promise<RevokeUserSessionsResult> {
  if (!targetUserId || !UUID_PATTERN.test(targetUserId)) {
    return { success: false, error: 'Invalid account. Please go back and try again.' };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Your login has ended. Please sign in again.' };
  }

  if (targetUserId === user.id) {
    return {
      success: false,
      error:
        'To sign yourself out of every device, open your account menu (your picture, top right) and choose "Sign out of all devices".'
    };
  }

  const { data, error } = await supabase.rpc('fn_revoke_user_sessions', {
    p_user_id: targetUserId
  });

  if (error) {
    console.error('[users/revoke-sessions] fn_revoke_user_sessions failed:', error);
    return { success: false, error: refusalMessage(error) };
  }

  const sessionsEnded = typeof data === 'number' ? data : Number(data ?? 0);

  // Director ruling 2026-10-02: the person sees "An admin signed you out of all
  // devices on <date>." the next time they sign in. Written with the service
  // role (signed-in users have no INSERT rule on sign_out_notices) and only
  // after the database function succeeded. A failed notice never turns the
  // completed sign-out into a failure.
  await recordAdminSignOutNotice(createServiceRoleClient(), { userId: targetUserId }, user.id);

  const { data: target } = await supabase
    .from('profiles')
    .select('full_name, email, role, institution_id')
    .eq('id', targetUserId)
    .maybeSingle();

  const targetName = target?.full_name || target?.email || targetUserId;

  await logActivity({
    userId: user.id,
    actionType: 'revoke',
    resourceType: RESOURCE_TYPES.USER,
    resourceId: targetUserId,
    resourceName: targetName,
    description: `${user.email ?? 'An admin'} signed ${targetName} out of all devices`,
    metadata: {
      target_user_id: targetUserId,
      target_email: target?.email ?? null,
      target_role: target?.role ?? null,
      sessions_ended: sessionsEnded,
      scope: 'global',
      requested_by: 'admin'
    },
    institutionId: target?.institution_id ?? undefined
  });

  return { success: true, sessionsEnded };
}
