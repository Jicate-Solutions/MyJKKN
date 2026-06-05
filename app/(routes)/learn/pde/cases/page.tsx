import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

/**
 * Learner cases landing — redirects to the default sub-page configured in
 * platform_policies (key `nav.learn.pde.cases.default_landing`).
 *
 * /learn/pde/cases previously 404'd because no page.tsx existed here. The
 * directory only contains [caseSlug]/page.tsx — there's no list-cases UI yet,
 * so the parent route was unreachable. Hardcoded fallback is the primary
 * learner action (demonstrations).
 *
 * Part of the PDE hub-page-404 sweep (follow-up to #1206).
 */
export default async function LearnPdeCasesIndex() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('fn_get_policy_text', {
    p_key: POLICY_KEYS.NAV_LEARN_PDE_CASES_DEFAULT_LANDING,
    p_default: '/learn/pde/demonstrations',
    p_scope_id: null,
  });
  redirect(data ?? '/learn/pde/demonstrations');
}
