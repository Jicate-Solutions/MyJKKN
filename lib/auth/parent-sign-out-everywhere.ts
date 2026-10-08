/**
 * "Sign out of all devices" for a PARENT account — the shared write.
 *
 * Parents carry a signed parent_session JWT, not a Supabase session. The kill
 * switch is pp_parent_accounts.sessions_revoked_at (draft PR #4168): every
 * parent token issued at or before that moment is refused on its next request.
 * Until that column exists the action is "not switched on", and callers hide
 * the button.
 *
 * Used by the staff route (Academic › Parent Portal › Parent User Data) and by
 * the parent's own Settings screen. Node runtime only (service-role client).
 */

import type { createServiceRoleClient } from '@/lib/supabase/server';

type DbError = { code?: string; message?: string } | null | undefined;

/** 42703 = Postgres "column does not exist"; PGRST204 = PostgREST "column not in schema cache". */
export function isMissingSessionsRevokedAtColumn(error: DbError): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

type ParentAccountsDb = ReturnType<typeof createServiceRoleClient>;

/** True once pp_parent_accounts.sessions_revoked_at exists. */
export async function parentSignOutEverywhereAvailable(db: ParentAccountsDb): Promise<boolean> {
  const { error } = await db.from('pp_parent_accounts').select('sessions_revoked_at').limit(1);
  if (error && !isMissingSessionsRevokedAtColumn(error)) {
    console.error('[parent sign-out-everywhere] availability probe failed:', error);
  }
  return !error;
}

export type RevokeParentSessionsResult =
  | { status: 'ok'; revokedAt: string }
  | { status: 'no-column' }
  | { status: 'not-found' }
  | { status: 'error'; error: DbError };

/**
 * Set sessions_revoked_at = now on ONE parent account. A write that touched no
 * row is reported as 'not-found', never as success.
 */
export async function revokeParentSessions(
  db: ParentAccountsDb,
  accountId: string
): Promise<RevokeParentSessionsResult> {
  const revokedAt = new Date().toISOString();
  const { data, error } = await db
    .from('pp_parent_accounts')
    .update({ sessions_revoked_at: revokedAt })
    .eq('id', accountId)
    .select('id');

  if (error) {
    if (isMissingSessionsRevokedAtColumn(error)) return { status: 'no-column' };
    return { status: 'error', error };
  }
  if (!data || data.length === 0) return { status: 'not-found' };
  return { status: 'ok', revokedAt };
}
