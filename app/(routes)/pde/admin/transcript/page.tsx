import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

/**
 * Admin PDE transcript landing — redirects to the default sub-page configured
 * in platform_policies (key `nav.admin.pde.transcript.default_landing`).
 *
 * /pde/admin/transcript previously 404'd because no page.tsx existed here.
 * The directory has only [learnerId]/page.tsx — admin must reach this route
 * with a specific learner. Hardcoded fallback is the admin PDE hub (where a
 * learner picker can eventually live); no list-learners UI exists today.
 *
 * Part of the PDE hub-page-404 sweep (follow-up to #1206).
 */
export default async function AdminPdeTranscriptIndex() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('fn_get_policy_text', {
    p_key: POLICY_KEYS.NAV_ADMIN_PDE_TRANSCRIPT_DEFAULT_LANDING,
    p_default: '/pde/admin',
    p_scope_id: null,
  });
  redirect(data ?? '/pde/admin');
}
