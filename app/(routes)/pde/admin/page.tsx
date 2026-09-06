import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

/**
 * Admin PDE landing — redirects to the default sub-page configured in
 * platform_policies (key `nav.admin.pde.default_landing`).
 *
 * /pde/admin previously 404'd because no page.tsx existed here. admin/pde has
 * no dashboard child, so it was originally hardcoded to redirect to
 * /pde/admin/assessments as the primary admin PDE workflow (part of the
 * nav-landing sweep, follow-up to #348).
 *
 * 2026-04-29: hardcoded redirect target replaced with platform_policies lookup
 * per Director's standing rule — every policy decision is a config row that
 * super_admins can edit via /admin/landing-pages UI with zero deploy. The
 * hardcoded fallback `/pde/admin/assessments` is preserved (passed as p_default
 * AND used post-RPC) so behavior is identical at deploy and the page never
 * breaks if the policy row is missing or the RPC errors.
 */
export default async function AdminPdeIndex() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('fn_get_policy_text', {
    p_key: POLICY_KEYS.NAV_ADMIN_PDE_DEFAULT_LANDING,
    p_default: '/pde/admin/assessments',
    p_scope_id: null,
  });
  redirect(data ?? '/pde/admin/assessments');
}
