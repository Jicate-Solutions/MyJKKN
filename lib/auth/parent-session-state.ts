/**
 * Parent Portal — server-side kill switch for a (cryptographically valid)
 * parent_session JWT.
 *
 * A verified JWT only proves the token was issued by us and has not expired.
 * Because sessions now slide for up to 400 days (see lib/auth/parent-jwt.ts),
 * the account row must be re-checked on every request, otherwise a disabled or
 * removed parent account would stay signed in for ever. A session is DEAD when:
 *   - its pp_parent_accounts row no longer exists (account removed), or
 *   - the row has is_active = false (account disabled; NULL counts as active,
 *     matching the column default and the admin users panel), or
 *   - the row's sessions_revoked_at is at or after the token's `iat`
 *     ("sign out everywhere").
 *
 * Used by proxy.ts (page requests: clears the cookie) and
 * lib/utils/parent-access.ts (API requests: 401). Node runtime (service role).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isParentSessionRevoked,
  shouldRenewParentSession,
  type ParentJwtClaims,
} from '@/lib/auth/parent-jwt';

export type ParentAccountState = 'alive' | 'dead' | 'error';

interface ParentAccountRow {
  id: string;
  is_active: boolean | null;
  sessions_revoked_at: string | null;
}

export async function getParentAccountState(
  db: Pick<SupabaseClient, 'from'>,
  claims: ParentJwtClaims
): Promise<ParentAccountState> {
  try {
    const { data, error } = await db
      .from('pp_parent_accounts')
      .select('id, is_active, sessions_revoked_at')
      .eq('id', claims.sub)
      .maybeSingle();
    if (error) return 'error';
    const row = data as unknown as ParentAccountRow | null;
    if (!row) return 'dead';
    if (row.is_active === false) return 'dead';
    if (isParentSessionRevoked(claims, row.sessions_revoked_at)) return 'dead';
    return 'alive';
  } catch {
    return 'error';
  }
}

export type ParentSessionAction = 'keep' | 'renew' | 'clear';

/**
 * What the page gate should do with a VERIFIED session, given the account state.
 * - dead  → clear the cookie (the parent is sent to login).
 * - error → keep it as is: a database blip must never log a parent out, and the
 *           API gate (resolveParentScope) still fails closed on its own lookup.
 * - alive → renew when older than a day, else keep.
 */
export function decideParentSessionAction(
  claims: ParentJwtClaims,
  state: ParentAccountState,
  nowSeconds?: number
): ParentSessionAction {
  if (state === 'dead') return 'clear';
  if (state === 'error') return 'keep';
  return shouldRenewParentSession(claims, nowSeconds) ? 'renew' : 'keep';
}
