import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

/**
 * Admin PDE rubrics landing — redirects to the default sub-page configured in
 * platform_policies (key `nav.admin.pde.rubrics.default_landing`).
 *
 * /admin/pde/rubrics previously 404'd because no page.tsx existed here. The
 * directory has three child rubric namespaces (embodied, social-leadership,
 * cultural-civic) but no implicit entry point. Hardcoded fallback is the
 * embodied rubric editor — the largest namespace with 5 disciplines.
 *
 * Part of the PDE hub-page-404 sweep (follow-up to #1206).
 */
export default async function AdminPdeRubricsIndex() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('fn_get_policy_text', {
    p_key: POLICY_KEYS.NAV_ADMIN_PDE_RUBRICS_DEFAULT_LANDING,
    p_default: '/admin/pde/rubrics/embodied',
    p_scope_id: null,
  });
  redirect(data ?? '/admin/pde/rubrics/embodied');
}
