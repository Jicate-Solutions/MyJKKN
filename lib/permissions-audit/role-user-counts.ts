import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * How many distinct users actually hold each role.
 *
 * WHY IT IS A UNION AND NOT JUST `user_roles`
 *   `user_has_permission()` in supabase/setup/02_functions.sql falls back to
 *   `profiles.role` when a user has no `user_roles` rows at all. Counting only
 *   `user_roles` therefore understated the real population — faculty by 38,
 *   hod by 3, admission by 1, and so on — and an audit dashboard that
 *   understates how many people hold a permission is worse than no dashboard.
 *   So both sources are unioned and de-duplicated by user id, which also stops
 *   a user who has BOTH a `user_roles` row and a matching `profiles.role` from
 *   being counted twice.
 *
 *   Legacy `profiles.role` strings are only counted when they match a real
 *   `custom_roles.role_key`; that keeps typos and orphaned role names out of
 *   the totals.
 *
 * Extracted from app/api/users/permissions-audit/matrix/route.ts so the matrix
 * endpoint and the page-access endpoint cannot drift into reporting different
 * user counts for the same role — they are shown side by side in one tab.
 *
 * Errors are logged, not thrown: a failure here costs accurate counts, and
 * returning zeroes with a warning is better than a 500 that hides the whole
 * permission picture.
 */
export async function getRoleUserCounts(
  supabase: SupabaseClient,
  knownRoleKeys: Set<string>
): Promise<Record<string, number>> {
  const usersByRole: Record<string, Set<string>> = {};

  const { data: userRoleRows, error: userRolesError } = await supabase
    .from('user_roles')
    .select('user_id, custom_roles(role_key)');

  if (userRolesError) {
    console.error('[permissions-audit] user_roles count failed:', userRolesError);
  }

  for (const ur of (userRoleRows ?? []) as unknown as Array<{
    user_id: string;
    custom_roles: { role_key: string } | null;
  }>) {
    const roleKey = ur.custom_roles?.role_key;
    if (!roleKey || !ur.user_id) continue;
    (usersByRole[roleKey] ??= new Set()).add(ur.user_id);
  }

  const { data: legacyRows, error: legacyError } = await supabase
    .from('profiles')
    .select('id, role')
    .not('role', 'is', null);

  if (legacyError) {
    console.error('[permissions-audit] legacy profiles.role count failed:', legacyError);
  }

  for (const p of (legacyRows ?? []) as Array<{ id: string; role: string | null }>) {
    if (!p.role || !knownRoleKeys.has(p.role)) continue;
    (usersByRole[p.role] ??= new Set()).add(p.id);
  }

  const counts: Record<string, number> = {};
  for (const [roleKey, users] of Object.entries(usersByRole)) {
    counts[roleKey] = users.size;
  }
  return counts;
}

/**
 * Read one permission key out of a role's `custom_roles.permissions` JSONB.
 *
 * Real data has BOTH shapes and always has: flat dotted keys
 * (`{ "id_cards.jobs.manage": true }`) and nested objects
 * (`{ id_cards: { jobs: { manage: true } } }`). The flat form must be checked
 * FIRST — without it a role that flat-stores a key was reported as NOT holding
 * it (the nested walk looks for `obj.id_cards` and finds undefined), so the
 * audit claimed "only super admins have this" while Registrar and Admission
 * Officer actually did. Fixed 2026-07-26; extracted here 2026-09-12.
 *
 * Compares by VALUE, never by key presence. `permissions ? 'key'` is a false
 * positive: a revoked permission is stored as `false`, not removed, so 63 roles
 * CONTAIN `hr.leave.approve` while only 5 hold it.
 */
export function getPermissionValue(
  permissions: Record<string, unknown> | null,
  dotKey: string
): boolean {
  if (!permissions) return false;
  if (permissions[dotKey] === true) return true;

  let current: unknown = permissions;
  for (const part of dotKey.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return false;
    current = (current as Record<string, unknown>)[part];
  }
  return current === true;
}

/**
 * Flatten every permission key present in a role's JSONB into dotted form.
 * Handles the same dual shape as `getPermissionValue`.
 */
export function collectPermissionKeys(
  obj: Record<string, unknown>,
  prefix: string,
  keys: Set<string>
): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'boolean') {
      keys.add(fullKey);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      collectPermissionKeys(value as Record<string, unknown>, fullKey, keys);
    }
  }
}
