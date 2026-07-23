import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

/**
 * Learner PDE landing — redirects to the default sub-page configured in
 * platform_policies (key `nav.learn.pde.default_landing`).
 *
 * /pde/learn previously 404'd because no page.tsx existed here. /pde/learn has
 * four child surfaces (cases, cohort, demonstrations, transcript) but none
 * served as the implicit entry point, so direct navigation to /pde/learn
 * returned 404 (Director-reported 2026-06-02).
 *
 * Following the same config-driven landing pattern as /pde/admin/page.tsx —
 * every policy decision is a config row that super_admins can edit via
 * /admin/landing-pages UI with zero deploy. Hardcoded fallback
 * `/pde/learn/demonstrations` is preserved (passed as p_default AND used
 * post-RPC) so behavior is identical at deploy and the page never breaks if
 * the policy row is missing or the RPC errors.
 */
export default async function LearnPdeIndex() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('fn_get_policy_text', {
    p_key: POLICY_KEYS.NAV_LEARN_PDE_DEFAULT_LANDING,
    p_default: '/pde/learn/demonstrations',
    p_scope_id: null,
  });
  redirect(data ?? '/pde/learn/demonstrations');
}
