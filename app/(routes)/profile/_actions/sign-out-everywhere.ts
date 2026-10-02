'use server';

// "Sign out of all devices" — the person's own account.
// Director ruling 2026-10-01: logins last forever on the installed app; the
// safety net for a lost or shared phone is this button.
//
// supabase.auth.signOut({ scope: 'global' }) ends EVERY session the caller has
// (every phone, every computer, this one included) and clears this browser's
// auth cookies. The activity row is written FIRST, while the session that
// authorises the insert still exists.

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/utils/activity-logger';
import { ACTIVITY_TYPES, RESOURCE_TYPES } from '@/types/activity';

export type SignOutEverywhereResult =
  | { success: true }
  | { success: false; error: string };

export async function signOutEverywhere(): Promise<SignOutEverywhereResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: 'You are not signed in, so there is nothing to sign out of.'
    };
  }

  await logActivity({
    userId: user.id,
    actionType: ACTIVITY_TYPES.LOGOUT,
    resourceType: RESOURCE_TYPES.AUTH,
    resourceId: user.id,
    resourceName: user.email ?? undefined,
    description: `${user.email ?? 'A user'} signed out of all devices`,
    metadata: {
      logout_method: 'all_devices',
      scope: 'global',
      requested_by: 'self'
    }
  });

  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) {
    console.error('[auth/sign-out-everywhere] global sign-out failed:', error);
    // The row above says it was asked for; record that it did NOT happen, so
    // the audit trail never shows a sign-out that failed as a success.
    await logActivity({
      userId: user.id,
      actionType: ACTIVITY_TYPES.LOGOUT,
      resourceType: RESOURCE_TYPES.AUTH,
      resourceId: user.id,
      resourceName: user.email ?? undefined,
      description: `${user.email ?? 'A user'} tried to sign out of all devices — it FAILED`,
      metadata: {
        logout_method: 'all_devices',
        scope: 'global',
        requested_by: 'self',
        outcome: 'failed',
        error: error.message ?? null
      }
    });
    return {
      success: false,
      error:
        'We could not sign you out of your other devices. Please try again in a minute.'
    };
  }

  return { success: true };
}
