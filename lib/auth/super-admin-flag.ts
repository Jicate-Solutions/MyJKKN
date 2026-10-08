/**
 * The super-admin flag exactly as the database's is_super_admin() reads it:
 * profiles.is_super_admin = true. Used where a Director ruling says "super
 * admins only" (e.g. seeing a parent's saved password, 2026-10-02), which is a
 * narrower test than holding the super_admin role key.
 *
 * Pass a service-role client so row security never hides the caller's own row.
 * Server-only.
 */
import type { createServiceRoleClient } from '@/lib/supabase/server';

type ServiceDb = ReturnType<typeof createServiceRoleClient>;

export async function hasSuperAdminFlag(db: ServiceDb, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from('profiles')
    .select('is_super_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error) return false;
  return (data as { is_super_admin?: boolean | null } | null)?.is_super_admin === true;
}
