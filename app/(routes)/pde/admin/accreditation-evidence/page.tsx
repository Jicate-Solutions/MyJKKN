import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

/**
 * Admin accreditation-evidence landing — redirects to the default body
 * configured in platform_policies (key
 * `nav.admin.pde.accreditation_evidence.default_landing`).
 *
 * /pde/admin/accreditation-evidence previously 404'd because no page.tsx
 * existed here. The directory has only [body]/page.tsx (dynamic). Hardcoded
 * fallback is NAAC — the most-used accreditation body in current rollout.
 *
 * Part of the PDE hub-page-404 sweep (follow-up to #1206).
 */
export default async function AdminPdeAccreditationEvidenceIndex() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('fn_get_policy_text', {
    p_key: POLICY_KEYS.NAV_ADMIN_PDE_ACCREDITATION_EVIDENCE_DEFAULT_LANDING,
    p_default: '/pde/admin/accreditation-evidence/NAAC',
    p_scope_id: null,
  });
  redirect(data ?? '/pde/admin/accreditation-evidence/NAAC');
}
