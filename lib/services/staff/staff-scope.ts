import type { SupabaseClient } from '@supabase/supabase-js';

export type StaffScope =
  | 'all_institutions'
  | 'own_institution'
  | 'own_records'
  | 'none';

/**
 * Resolve which staff rows a user is allowed to see.
 * Mirrors get_user_module_scope('staff') on the SQL side
 * (defined in supabase/setup/02_functions.sql ~L6802, single-arg variant
 * that derives the caller from auth.uid() internally).
 *
 * Returns 'none' when the user has no staff scope at all (i.e. no role
 * grants staff.* and the user is not a super admin).
 *
 * IMPORTANT: pass a SupabaseClient created with the user's cookies (so
 * auth.uid() resolves to that user inside the SECURITY DEFINER RPC),
 * NOT the service-role admin client.
 */
export async function getStaffScope(
  supabase: SupabaseClient,
  userId: string
): Promise<StaffScope> {
  // Super-admin shortcut — matches the existing pattern in
  // app/api/staff/route.ts so we don't hit the RPC for the common
  // dashboard / super-admin path.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin, role')
    .eq('id', userId)
    .single();

  if (profile?.is_super_admin || profile?.role === 'super_admin') {
    return 'all_institutions';
  }

  // RPC parameter is named `module_key` in 02_functions.sql (NOT
  // p_module_key — verified via types/supabase.ts).
  const { data, error } = await supabase.rpc('get_user_module_scope', {
    module_key: 'staff',
  });

  if (error) {
    console.error('[getStaffScope] RPC error', error);
    return 'none';
  }

  const scope = data as string | null;
  if (
    scope === 'all_institutions' ||
    scope === 'own_institution' ||
    scope === 'own_records'
  ) {
    return scope;
  }
  return 'none';
}
