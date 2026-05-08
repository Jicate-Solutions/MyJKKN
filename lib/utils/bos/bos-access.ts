import { createClient } from '@/lib/supabase/server';

export interface BosAccessScope {
  isSuperAdmin: boolean;
  institutionsId: string | null;
  role: string | null;
}

export async function resolveBosAccess(userId: string): Promise<BosAccessScope> {
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, is_super_admin, institution_id')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return { isSuperAdmin: false, institutionsId: null, role: null };
  }

  const isSuperAdmin =
    profile.is_super_admin === true || profile.role === 'super_admin';

  if (isSuperAdmin) {
    return { isSuperAdmin: true, institutionsId: null, role: profile.role };
  }

  return {
    isSuperAdmin: false,
    institutionsId: profile.institution_id ?? null,
    role: profile.role,
  };
}

export function guardInstitutionWrite(
  scope: BosAccessScope,
  targetInstitutionsId: string | undefined | null
): string | null {
  if (scope.isSuperAdmin) return null;
  if (!targetInstitutionsId) return null;
  if (scope.institutionsId && scope.institutionsId !== targetInstitutionsId) {
    return 'Forbidden: you can only manage BoS records for your own institution';
  }
  return null;
}

export function applyInstitutionScope(
  scope: BosAccessScope,
  clientInstitutionsId: string | null | undefined
): string | null {
  if (scope.isSuperAdmin) return clientInstitutionsId ?? null;
  return scope.institutionsId;
}

// ── Module/action-style RBAC for new BoS tabs (Courses, Course Scheme) ────────
// The legacy helpers above (resolveBosAccess, guardInstitutionWrite,
// applyInstitutionScope) operate on institution-scoping. The helper below
// adds explicit module+action checks used by /api/bos/courses-master and
// /api/bos/course-mapping proxy routes.

// Module strings match the runtime convention used elsewhere in this codebase
// (see BOS_MODULES in lib/services/bos/bos-role-permissions.ts).
export type BosModule = 'academic.bos-courses' | 'academic.bos-scheme';
export type BosAction = 'view' | 'create' | 'edit' | 'delete' | 'import';

/**
 * Server-side permission check for BoS modules.
 * Mirrors the client-side usePermissions().canAccess() but runs in API routes.
 * Super-admin short-circuits to true via profiles.is_super_admin.
 */
export async function canAccessBos(
  userId: string,
  module: BosModule,
  action: BosAction
): Promise<boolean> {
  const supabase = await createClient();

  // Super-admin bypass — same path resolveBosAccess uses.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin, role')
    .eq('id', userId)
    .single();

  if (profile?.is_super_admin === true || profile?.role === 'super_admin') {
    return true;
  }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId);

  const roleIds = (roles ?? []).map((r: { role_id: string }) => r.role_id);
  if (roleIds.length === 0) return false;

  const { data: perms } = await supabase
    .from('role_permissions')
    .select('module, action')
    .in('role_id', roleIds)
    .eq('module', module)
    .eq('action', action)
    .limit(1);

  return (perms ?? []).length > 0;
}

/**
 * Re-export — COE institution mapping is shared with Internal Marks.
 */
export { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
