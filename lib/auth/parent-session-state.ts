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
 *
 * Deploy-order safety: sessions_revoked_at arrives with migration
 * 20270705094100. Until it is applied, PostgREST answers a select or write that
 * names it with 42703 / PGRST204. The lookup then retries without the column
 * (no "sign out everywhere" yet, but disabled / removed accounts are still
 * caught), so the parent portal keeps working whichever lands first.
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
  sessions_revoked_at?: string | null;
}

/**
 * True when a PostgREST error means pp_parent_accounts.sessions_revoked_at does
 * not exist yet (migration 20270705094100 not applied). 42703 = Postgres
 * undefined_column (a select); PGRST204 = PostgREST "column not found in the
 * schema cache" (a write).
 */
export function isMissingSessionsRevokedAtColumn(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code === '42703' || err.code === 'PGRST204') return true;
  const message = err.message ?? '';
  return (
    /sessions_revoked_at/i.test(message) &&
    /(column|schema cache|does not exist)/i.test(message)
  );
}

/**
 * Sign every device of the matched parent account(s) out on its next request
 * (used after a password reset). Returns 'ok', 'no-column' (migration not
 * applied yet; nothing to do) or 'error'. Never throws.
 */
export async function revokeParentSessions(
  run: (patch: { sessions_revoked_at: string }) => PromiseLike<{ error: unknown }>,
  nowIso: string = new Date().toISOString()
): Promise<'ok' | 'no-column' | 'error'> {
  try {
    const { error } = await run({ sessions_revoked_at: nowIso });
    if (!error) return 'ok';
    if (isMissingSessionsRevokedAtColumn(error)) return 'no-column';
    return 'error';
  } catch {
    return 'error';
  }
}

export async function getParentAccountState(
  db: Pick<SupabaseClient, 'from'>,
  claims: ParentJwtClaims
): Promise<ParentAccountState> {
  try {
    let { data, error } = await db
      .from('pp_parent_accounts')
      .select('id, is_active, sessions_revoked_at')
      .eq('id', claims.sub)
      .maybeSingle();
    if (error && isMissingSessionsRevokedAtColumn(error)) {
      // Pre-migration database: same check without the revoke marker. Never
      // select('*') here — that would pull password_hash into the proxy path.
      ({ data, error } = await db
        .from('pp_parent_accounts')
        .select('id, is_active')
        .eq('id', claims.sub)
        .maybeSingle());
    }
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
