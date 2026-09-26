// ============================================
// LEARNER BULK EDIT — INSTITUTION SCOPE
// ============================================
// The Bulk Edit Active / ID Card Data routes used to pin every non-super-admin
// to profiles.institution_id. Roles that span several institutions (Admission)
// then got "No active learners found" on export and "different institution"
// on upload. get_user_accessible_institutions() honours
// custom_roles.institution_scope, so this returns what the role actually grants.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js';

export async function getLearnerBulkEditInstitutionIds(
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  profileInstitutionId: string | null
): Promise<string[]> {
  const { data, error } = await (supabase as any).rpc('get_user_accessible_institutions', {
    target_user_id: userId
  });
  if (error) {
    console.error('[learner-bulk-edit-scope] get_user_accessible_institutions failed:', error.message);
  }

  const ids: string[] = ((data as any[]) ?? [])
    .map((r) => r.institution_id)
    .filter(Boolean);
  if (profileInstitutionId && !ids.includes(profileInstitutionId)) {
    ids.push(profileInstitutionId);
  }
  return ids;
}
