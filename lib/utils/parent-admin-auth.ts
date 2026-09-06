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
  permissions: Record<string, boolean>; // UNION across the user's roles: any role granting a key wins
  isSuperAdmin: boolean;
}

/**
 * Resolve the signed-in user with the UNION of role sources + merged perms.
 *
 * Despite this file's name the resolver itself is module-agnostic — it just
 * answers "who is this and what may they do". Exported so other modules' gates
 * (see lib/utils/procurement-auth.ts) can reuse it instead of re-deriving the
 * profiles.role + user_roles union.
 */
export async function currentUser(): Promise<PPAuthUser | null> {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  // Service-role for role/permission lookups so RLS never hides a user's roles.
  const db = createServiceRoleClient();
  const roleKeys = new Set<string>();
  const permissions: Record<string, boolean> = {};

  /**
   * Merge one role's permissions into the union — a GRANT anywhere wins.
   *
   * Roles are additive: holding one more role may only ever widen what a user
   * can do. Object.assign got this wrong, because custom_roles.permissions
   * stores a non-grant as the PRESENT key `false`, not as an absent one, so
   * last-write-wins let a role that grants nothing overwrite a role that
   * grants. A procurement_manager whose profiles.role was 'cao' (which carries
   * procurement.quotation_manage:false) had the grant erased and got a flat 403
   * on every AI-extract and upload button; super_admin was unaffected only
   * because it bypasses this map via isSuperAdmin. Order-dependence bit twice —
   * the legacy role is merged last, and rows within user_roles arrive in no
   * guaranteed order.
   */
  const grant = (perms: Record<string, boolean> | undefined | null) => {
    if (!perms) return;
    for (const [key, value] of Object.entries(perms)) {
      if (value === true) permissions[key] = true;
      else if (!(key in permissions)) permissions[key] = false;
    }
  };

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
    grant(cr?.permissions);
  }

  // Also merge the legacy profiles.role's custom_role permissions, if any. This
  // runs last but can no longer take a permission away — only add one.
  if (legacy) {
    const { data: lr } = await db.from('custom_roles').select('permissions').eq('role_key', legacy).maybeSingle();
    grant(lr?.permissions as Record<string, boolean> | undefined);
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
