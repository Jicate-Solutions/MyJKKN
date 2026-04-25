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
