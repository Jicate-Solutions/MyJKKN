import { createClientSupabaseClient } from '@/lib/supabase/client';

// Referral-linking service — powers the admission "Unlinked Referrals" cleanup
// screen. 39 of the 2026-27 consultant-type referrals have referral_type =
// 'consultant' but referred_by_id IS NULL, so fn_generate_referral_commissions
// silently skips them (nobody is paid). These two RPCs let an admission admin
// attach the correct education_consultant WRITE-ONCE and list the unlinked rows
// with any pre-existing lead-sync attribution surfaced so the UI can warn on a
// conflict before committing.
//
// The RPCs are new (not yet in the generated Database types), so the calls are
// cast `(supabase as any).rpc(...)` — the same pattern the rest of the admission
// services use for post-generation functions. consultant-service.ts is NOT
// touched here (a separate PR edits it); the active-consultant picker reads
// education_consultants directly, matching that module's fallback pattern.

export interface UnlinkedConsultantReferral {
  learner_profile_id: string;
  learner_name: string | null;
  referred_by_name: string | null;
  program_id: string | null;
  program_name: string | null;
  institution_id: string | null;
  institution_name: string | null;
  existing_attribution_consultant_id: string | null;
  existing_attribution_consultant_name: string | null;
  // Who can answer "which agency sent you?". 20 of the 39 carry a typed agency
  // name and none of them matches an agency record, so the answer is not in the
  // row — it is with one of these people. reference_contact first: when present
  // it is the referrer's own number and answers directly.
  reference_contact: string | null;
  student_mobile: string | null;
  parent_mobile: string | null;
  /** Who typed the learner record in. When nobody else knows, they might. */
  recorded_by_name: string | null;
  recorded_at: string | null;
}

export interface LinkReferrerResult {
  success: boolean;
  error?: string;
  learner_profile_id?: string;
  consultant_id?: string;
  had_conflicting_attribution?: boolean;
  conflicting_consultant_id?: string | null;
  referred_by_id?: string | null;
}

export interface ActiveConsultantOption {
  id: string;
  name: string;
}

export class ReferralLinkingService {
  /**
   * List the unlinked consultant-type referrals for an admission year.
   * Backed by fn_list_unlinked_consultant_referrals, which returns a JSON array.
   */
  static async listUnlinkedConsultantReferrals(
    year: number,
  ): Promise<UnlinkedConsultantReferral[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc(
      'fn_list_unlinked_consultant_referrals',
      { p_year: year },
    );
    if (error) throw new Error(error.message);
    return (data as UnlinkedConsultantReferral[]) ?? [];
  }

  /**
   * Link a single unlinked referral to an active education_consultant, WRITE-ONCE.
   * Backed by fn_link_referral_referrer. Returns { success, error?, ... }; never
   * throws for a domain refusal (already_linked, conflict, etc.) — those come
   * back as success:false with an error string for the UI to surface.
   */
  static async linkReferrer(
    learnerProfileId: string,
    consultantId: string,
  ): Promise<LinkReferrerResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_link_referral_referrer', {
      p_learner_profile_id: learnerProfileId,
      p_consultant_id: consultantId,
    });
    if (error) throw new Error(error.message);
    return data as LinkReferrerResult;
  }

  /**
   * Active consultants for the picker. education_consultants has no
   * institution_id column (it is global), so this is a flat active list ordered
   * by name — the same shape ConsultantService.getConsultantsForDropdown uses,
   * but filtered to status = 'active' because fn_link_referral_referrer refuses
   * an inactive consultant.
   */
  static async listActiveConsultants(): Promise<ActiveConsultantOption[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('education_consultants')
      .select('id, name')
      .eq('status', 'active')
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return (data as ActiveConsultantOption[]) ?? [];
  }
}
