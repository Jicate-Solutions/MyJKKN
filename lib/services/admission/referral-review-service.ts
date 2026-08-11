// lib/services/admission/referral-review-service.ts
// Read-only worklist behind /admission/consultants/review-worklist.
//
// Wraps ONE RPC, fn_referral_review_worklist, and does nothing else. There is no
// write method on this class on purpose: the three populations it lists are
// findings awaiting a human decision, and the decisions (linking an agency,
// verifying a credit, setting a rate) already have their own screens and their
// own permissions. Session (browser) client — the RPC gates on
// admission.leads.view, or admin.

import { createClientSupabaseClient } from '@/lib/supabase/client';

/** One row of the worklist. Shape is identical across all three buckets so the
 *  page renders them with a single table; fields that cannot exist for a bucket
 *  come back null (e.g. an unlinked referral has no credit to verify). */
export interface ReferralReviewRow {
  attribution_id: string | null;
  learner_profile_id: string | null;
  admission_lead_id: string | null;
  learner_name: string | null;
  programme: string | null;
  institution: string | null;
  /** Bucket B has no linked agency — this is the free-text name that was typed,
   *  when one was. Null means not even a name survives. */
  agency_name: string | null;
  credit_created_at: string | null;
  is_verified: boolean | null;
  verified_by_name: string | null;
  /** admission_leads.source, where an enquiry exists at all. */
  enquiry_source: string | null;
  enquiry_created_at: string | null;
  referral_source: string | null;
  /** Bucket A only. 0 = the agency was on the enquiry the day it was created. */
  days_after_enquiry: number | null;
}

export interface ReferralReviewWorklist {
  academic_year: number;
  generated_at: string;
  walkin_credited: ReferralReviewRow[];
  unlinked: ReferralReviewRow[];
  no_enquiry_trail: ReferralReviewRow[];
  counts: {
    walkin_credited: number;
    unlinked: number;
    no_enquiry_trail: number;
  };
  /** Read live, not asserted, so the "nothing is payable yet" banner cannot go
   *  stale the moment someone sets a rate. */
  money_position: {
    active_rate_count: number;
    commission_row_count: number;
  };
}

export class ReferralReviewService {
  static async getWorklist(academicYear: number): Promise<ReferralReviewWorklist> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_referral_review_worklist', {
      p_year: academicYear,
    });
    if (error) throw new Error(error.message);
    return data as ReferralReviewWorklist;
  }
}
