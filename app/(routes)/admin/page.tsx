import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Admin landing — redirects to the default page configured in platform_policies.
 *
 * /admin previously 404'd because no page.tsx existed at the module root.
 * Added as part of the nav-landing-pages sweep (follow-up to #348).
 *
 * 2026-04-29: hardcoded redirect target replaced with platform_policies lookup
 * (key `nav.admin.default_landing`) per Director's standing rule — every policy
 * decision is a config row super_admins can edit via /admin/landing-pages UI
 * with zero deploy. The hardcoded fallback `/admin/bug-reports` is preserved
 * (passed as p_default AND used post-RPC) so behavior is identical at deploy
 * and the page never breaks if the policy row is missing or the RPC errors.
 */
export default async function AdminIndex() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('fn_get_policy_text', {
    p_key: 'nav.admin.default_landing',
    p_default: '/admin/bug-reports',
    p_scope_id: null,
  });
  redirect(data ?? '/admin/bug-reports');
}
