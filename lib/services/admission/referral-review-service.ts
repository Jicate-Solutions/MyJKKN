// lib/services/admission/referral-review-service.ts
// The worklist behind /admission/consultants/review-worklist.
//
// This class was read-only by design until 2026-08-17: the three populations it
// lists were findings, and every decision about them (link an agency, verify a
// credit, set a rate) already had its own screen and its own permission.
//
// It now carries exactly ONE write, and only because the Director's ruling created
// a decision that had nowhere else to live: a walk-in agency credit stays out of
// the payment run until a human confirms it is genuine. That confirmation is made
// while reading this list — sending someone to a different screen to record what
// they just decided here is how 304 rows never get checked. Everything else on the
// class stays read-only, and the release itself moves no money.
//
// Session (browser) client. The read gates on admission.leads.view or admin; the
// release gates on admission.leads.edit or admin.

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
  /** Bucket A only. Null = HELD: this credit cannot enter a payment run, whatever
   *  is_verified says. Distinct from is_verified, which records only that someone
   *  looked at it — the Director ruled all 304 are re-checked before release. */
  payout_cleared_at: string | null;
  payout_cleared_by_name: string | null;
  payout_cleared_note: string | null;
  /** Bucket D only — where the learner stands in the admission lifecycle. */
  lifecycle_status?: string | null;
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
    attendance_held: number;
  };
  /** How much of the checking job is left, counted the same way the generator
   *  counts it — so the progress on screen and the money that would move can
   *  never disagree. */
  hold: {
    held: number;
    cleared: number;
    total: number;
  };
  /** Enrolled referrals whose sessions ARE marked and who have never been recorded
   *  present. Listed only where a register exists — an unmarked session says
   *  nothing about the learner, so those are never held and never shown. */
  attendance_held: ReferralReviewRow[];
  /** Read live, not asserted, so the "nothing is payable yet" banner cannot go
   *  stale the moment someone sets a rate. */
  money_position: {
    active_rate_count: number;
    commission_row_count: number;
  };
}

/** Result of releasing one credit. Write-once, like the referral linker: a second
 *  attempt reports already_cleared rather than re-stamping who owns the decision. */
export interface ClearWalkinCreditResult {
  ok: boolean;
  reason?: 'not_found' | 'already_cleared';
  attribution_id?: string;
  cleared_at?: string;
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

  /**
   * Release ONE referral held because session attendance has never recorded its
   * learner. Records who and when. Writes no money row and pays nobody.
   */
  static async clearAttendanceHold(
    learnerProfileId: string,
    academicYear: number,
    note?: string,
  ): Promise<ClearWalkinCreditResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_clear_referral_attendance_hold', {
      p_learner_profile_id: learnerProfileId,
      p_year: academicYear,
      p_note: note?.trim() ? note.trim() : null,
    });
    if (error) throw new Error(error.message);
    return data as ClearWalkinCreditResult;
  }

  /**
   * Release ONE walk-in agency credit into the payment run, after a human has
   * confirmed it is genuine. Records who and when. Writes no money row and pays
   * nobody — generation and payout stay behind their own admin gates.
   */
  static async clearWalkinCredit(
    attributionId: string,
    note?: string,
  ): Promise<ClearWalkinCreditResult> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_clear_walkin_credit_for_payout', {
      p_attribution_id: attributionId,
      p_note: note?.trim() ? note.trim() : null,
    });
    if (error) throw new Error(error.message);
    return data as ClearWalkinCreditResult;
  }
}
