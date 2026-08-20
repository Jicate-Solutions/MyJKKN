/**
 * Procurement API authorization.
 *
 * The procurement routes used to gate on `requireStaff()` from parent-admin-auth,
 * which is the PARENT PORTAL gate: it admits super_admin, holders of
 * 'academic.parent_portal.manage', or the legacy role names faculty/hod/staff.
 * A procurement user who is none of those — e.g. someone whose procurement roles
 * live only in user_roles while profiles.role still says 'student' — was refused
 * with a flat 403 on every upload and AI-extract button.
 *
 * Gating is permission-only (plus super_admin). The keys below are the ones the
 * two-level procurement roles actually grant, and they are the same keys the DB
 * enforces, so a route and its tables agree about who may act.
 *
 * The role/permission resolver is shared with parent-admin-auth rather than
 * duplicated — it already unions profiles.role with user_roles → custom_roles and
 * merges permissions across every role, read with the service role so RLS cannot
 * hide a user's own roles. Node runtime only.
 */
import { currentUser, type PPAuthUser } from './parent-admin-auth';

/** Permission keys granted by the procurement roles (see custom_roles). */
export const PROC_VIEW = 'procurement.view';
export const PROC_QUOTATION_MANAGE = 'procurement.quotation_manage';
export const PROC_GRN_CREATE = 'procurement.grn_create';

/**
 * Resolve the signed-in user, or null when they lack `permission`.
 *
 * Callers return 403 on null. Deliberately has NO legacy role-name fallback: the
 * procurement permission keys are explicit and already assigned, so a role-name
 * escape hatch would only re-open the mismatch this module is fixing.
 */
export async function requireProcurement(permission: string): Promise<PPAuthUser | null> {
  const u = await currentUser();
  if (!u) return null;
  return u.isSuperAdmin || u.permissions[permission] === true ? u : null;
}
