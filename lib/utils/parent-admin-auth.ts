/**
 * Parent Portal staff-admin authorization.
 *
 * Access is PERMISSION-DRIVEN (matches the Role Management toggles): a user is
 * allowed if they are super_admin, OR their merged role permissions include the
 * relevant key. A legacy role-name set is kept as a fallback so existing roles
 * keep working even before the permission is granted.
 *
 * Roles + permissions are read from BOTH the legacy `profiles.role` AND the
 * multi-role `user_roles → custom_roles` table, because super_admin/principal is
 * often assigned only via user_roles while profiles.role holds a staff value.
 * Node runtime only.
 */
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// Legacy role-name fallbacks (used when the permission grant hasn't been applied).
export const PP_ADMIN_ROLES = new Set(['super_admin', 'faculty', 'hod', 'staff']);
export const PP_USER_DATA_ROLES = new Set(['super_admin', 'principal', 'school_principal']);

export const PP_CONTENT_PERM = 'academic.parent_portal.manage';
export const PP_USER_DATA_PERM = 'academic.parent_portal.user_data.manage';

export interface PPAuthUser {
  id: string;
  role: string; // legacy profiles.role (kept for callers/display)
  roleKeys: Set<string>; // union of profiles.role + user_roles role_keys
  permissions: Record<string, boolean>; // merged across all the user's roles
  isSuperAdmin: boolean;
}

/** Resolve the signed-in user with the UNION of role sources + merged perms. */
async function currentUser(): Promise<PPAuthUser | null> {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  // Service-role for role/permission lookups so RLS never hides a user's roles.
  const db = createServiceRoleClient();
  const roleKeys = new Set<string>();
  const permissions: Record<string, boolean> = {};

  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const legacy = (profile?.role as string) || '';
  if (legacy) roleKeys.add(legacy);

  const { data: ur } = await db
    .from('user_roles')
    .select('custom_roles(role_key, permissions)')
    .eq('user_id', user.id);
  for (const row of (ur ?? []) as Array<{
    custom_roles?: { role_key?: string; permissions?: Record<string, boolean> } | null;
  }>) {
    const cr = row.custom_roles;
    if (cr?.role_key) roleKeys.add(cr.role_key);
    if (cr?.permissions) Object.assign(permissions, cr.permissions);
  }

  // Also merge the legacy profiles.role's custom_role permissions, if any.
  if (legacy) {
    const { data: lr } = await db.from('custom_roles').select('permissions').eq('role_key', legacy).maybeSingle();
    if (lr?.permissions) Object.assign(permissions, lr.permissions as Record<string, boolean>);
  }

  return {
    id: user.id,
    role: legacy,
    roleKeys,
    permissions,
    isSuperAdmin: roleKeys.has('super_admin'),
  };
}

export async function requireStaff(): Promise<PPAuthUser | null> {
  const u = await currentUser();
  if (!u) return null;
  const ok =
    u.isSuperAdmin ||
    u.permissions[PP_CONTENT_PERM] === true ||
    [...u.roleKeys].some((r) => PP_ADMIN_ROLES.has(r));
  return ok ? u : null;
}

/** Gate for the Parent User Data subtab (permission-driven). */
export async function requireParentUserDataAdmin(): Promise<PPAuthUser | null> {
  const u = await currentUser();
  if (!u) return null;
  const ok =
    u.isSuperAdmin ||
    u.permissions[PP_USER_DATA_PERM] === true ||
    [...u.roleKeys].some((r) => PP_USER_DATA_ROLES.has(r));
  return ok ? u : null;
}
