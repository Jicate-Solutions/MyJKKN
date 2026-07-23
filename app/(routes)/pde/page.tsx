import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

/**
 * PDE Module landing — redirects to the role-appropriate sub-page.
 *
 * Reads `nav.pde.default_landing` from platform_policies (default:
 * /pde/learn/demonstrations, the most common entry point for learners).
 * Hardcoded fallback preserved so the page never breaks if the policy row
 * is missing or the RPC errors. Editable via /admin/landing-pages with
 * zero deploy.
 *
 * Pattern mirrors /pde/admin/page.tsx (the original — now at
 * /pde/admin/page.tsx after the module extraction PR).
 */
export default async function PdeIndex() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('fn_get_policy_text', {
    p_key: POLICY_KEYS.NAV_PDE_DEFAULT_LANDING,
    p_default: '/pde/learn/demonstrations',
    p_scope_id: null,
  });
  redirect(data ?? '/pde/learn/demonstrations');
}
