/**
 * HR Performance Reviews Service (T5.1)
 *
 * Static class — SupabaseClient passed as first argument (mirrors
 * ShiftService + RecruitmentJobsService). Surface:
 *
 *   Cycles (Director / admin):
 *     listCycles            — yearly windows, newest first
 *     getCycle              — single cycle by id
 *     createCycle           — admin only
 *     updateCycle           — admin only (status transitions live here too)
 *
 *   Reviews (state-machine):
 *     listReviews           — by cycle (admin / SEDC view)
 *     listMyReview          — staff's own (current cycle)
 *     listTeamReviews       — dept HoD view (staff in their department)
 *     upsertSelfAppraisal   — staff writes self_appraisal_jsonb (status → self_submitted)
 *     submitSupervisorReview — HoD writes supervisor_review_jsonb (status → supervisor_reviewed)
 *     submitSedcReview      — SEDC writes sedc_review_jsonb (status → sedc_reviewed)
 *     finalApprove          — Director stamps final_score + final_remarks (status → final_approved)
 *
 *   Policy reader:
 *     getPolicy             — reads hr.performance_review from platform_policies
 *                             via fn_get_policy_json. Single source of truth for
 *                             cycle dates + eligibility (min_service_months).
 *
 * Spec: specs/hr-module-decomposition-2026-05-09.md (T5.1)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types — kept local to the module. (No /types/hr-performance file yet; if
// this surface grows, lift these into types/hr-performance-reviews.ts.)
// ---------------------------------------------------------------------------

export type CycleStatus = 'draft' | 'open' | 'locked' | 'closed';
export type ReviewStatus =
  | 'draft'
  | 'self_submitted'
  | 'supervisor_reviewed'
  | 'sedc_reviewed'
  | 'final_approved';

export interface HRPerformanceReviewCycle {
  id: string;
  cycle_year: number;
  start_date: string; // ISO date
  end_date: string; // ISO date
  status: CycleStatus;
  description: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRPerformanceReviewCycleInsert {
  cycle_year: number;
  start_date: string;
  end_date: string;
  status?: CycleStatus;
  description?: string | null;
}

export interface HRPerformanceReviewCycleUpdate {
  cycle_year?: number;
  start_date?: string;
  end_date?: string;
  status?: CycleStatus;
  description?: string | null;
}

export interface HRPerformanceReview {
  id: string;
  cycle_id: string;
  staff_id: string;
  self_appraisal_jsonb: Record<string, unknown> | null;
  supervisor_review_jsonb: Record<string, unknown> | null;
  sedc_review_jsonb: Record<string, unknown> | null;
  final_score: number | null;
  final_remarks: string | null;
  status: ReviewStatus;
  self_submitted_at: string | null;
  supervisor_reviewed_at: string | null;
  sedc_reviewed_at: string | null;
  final_approved_at: string | null;
  final_approved_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Shape of the hr.performance_review platform_policies row.
 * Mirrors specs/hr-policy-jsonb-structures-2026-05-15.md §27.
 */
export interface HRPerformanceReviewPolicy {
  appraisal_form_distribution_month?: string;
  distribution_on_term_completion?: boolean;
  min_service_months_for_review?: number;
  period_start?: string; // "MM-DD"
  period_end?: string; // "MM-DD"
  self_appraisal_required?: boolean;
  review_committee?: string;
  final_approver?: string;
  facilitator_grading_doc_ref?: string;
}

// ---------------------------------------------------------------------------
// State-machine transition table — keep all allowed edges in one place so
// the service refuses to skip steps (e.g. staff cannot jump to sedc_reviewed).
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<ReviewStatus, ReadonlyArray<ReviewStatus>> = {
  draft: ['self_submitted'],
  self_submitted: ['supervisor_reviewed', 'draft'], // HoD can bounce back to draft
  supervisor_reviewed: ['sedc_reviewed', 'self_submitted'], // SEDC can bounce back to supervisor
  sedc_reviewed: ['final_approved', 'supervisor_reviewed'], // Director can bounce back
  final_approved: [], // terminal
};

function assertTransition(from: ReviewStatus, to: ReviewStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(
      `Invalid review status transition: ${from} → ${to}. ` +
        `Allowed from ${from}: ${ALLOWED_TRANSITIONS[from].join(', ') || '(terminal)'}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PerformanceReviewService {
  // -----------------------------------------------------------------------
  // Policy reader
  // -----------------------------------------------------------------------

  /**
   * Reads `hr.performance_review` from platform_policies via fn_get_policy_json.
   * Returns null when the policy row is not yet seeded (e.g. before M6a #900).
   */
  static async getPolicy(
    supabase: SupabaseClient,
  ): Promise<HRPerformanceReviewPolicy | null> {
    const { data, error } = await supabase.rpc('fn_get_policy_json', {
      p_key: 'hr.performance_review',
    });
    if (error) throw error;
    if (!data) return null;
    return data as HRPerformanceReviewPolicy;
  }

  // -----------------------------------------------------------------------
  // Cycles
  // -----------------------------------------------------------------------

  static async listCycles(
    supabase: SupabaseClient,
  ): Promise<HRPerformanceReviewCycle[]> {
    const { data, error } = await supabase
      .from('hr_performance_review_cycles')
      .select('*')
      .order('start_date', { ascending: false });
    if (error) throw error;
    return (data ?? []) as HRPerformanceReviewCycle[];
  }

  static async getCycle(
    supabase: SupabaseClient,
    id: string,
  ): Promise<HRPerformanceReviewCycle | null> {
    const { data, error } = await supabase
      .from('hr_performance_review_cycles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as HRPerformanceReviewCycle | null;
  }

  static async createCycle(
    supabase: SupabaseClient,
    payload: HRPerformanceReviewCycleInsert,
  ): Promise<HRPerformanceReviewCycle> {
    const { data, error } = await supabase
      .from('hr_performance_review_cycles')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return data as HRPerformanceReviewCycle;
  }

  static async updateCycle(
    supabase: SupabaseClient,
    id: string,
    patch: HRPerformanceReviewCycleUpdate,
  ): Promise<HRPerformanceReviewCycle> {
    const { data, error } = await supabase
      .from('hr_performance_review_cycles')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as HRPerformanceReviewCycle;
  }

  // -----------------------------------------------------------------------
  // Reviews — read paths
  // -----------------------------------------------------------------------

  /** Cycle-level view (admin / SEDC). RLS scopes who can see what. */
  static async listReviews(
    supabase: SupabaseClient,
    cycleId: string,
  ): Promise<HRPerformanceReview[]> {
    const { data, error } = await supabase
      .from('hr_performance_reviews')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as HRPerformanceReview[];
  }

  /**
   * Staff's own review for a cycle (returns null if no row yet — staff lands
   * on /hr/performance-reviews fresh, server upserts on first save).
   */
  static async getMyReview(
    supabase: SupabaseClient,
    cycleId: string,
    staffId: string,
  ): Promise<HRPerformanceReview | null> {
    const { data, error } = await supabase
      .from('hr_performance_reviews')
      .select('*')
      .eq('cycle_id', cycleId)
      .eq('staff_id', staffId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as HRPerformanceReview | null;
  }

  /**
   * HoD team view — RLS already filters to "rows for staff in my department",
   * so we just fetch all rows for the cycle and let the policy do the work.
   */
  static async listTeamReviews(
    supabase: SupabaseClient,
    cycleId: string,
  ): Promise<HRPerformanceReview[]> {
    return this.listReviews(supabase, cycleId);
  }

  // -----------------------------------------------------------------------
  // Reviews — write paths (state machine enforced via assertTransition)
  // -----------------------------------------------------------------------

  /**
   * Staff path. Upserts the row in `draft`, OR moves draft → self_submitted
   * when `submit=true`. Idempotent.
   */
  static async upsertSelfAppraisal(
    supabase: SupabaseClient,
    args: {
      cycleId: string;
      staffId: string;
      payload: Record<string, unknown>;
      submit: boolean;
    },
  ): Promise<HRPerformanceReview> {
    const existing = await this.getMyReview(
      supabase,
      args.cycleId,
      args.staffId,
    );

    const targetStatus: ReviewStatus = args.submit ? 'self_submitted' : 'draft';

    if (existing) {
      // Status transition guard (only when we're moving forward).
      if (args.submit && existing.status !== 'draft') {
        assertTransition(existing.status, 'self_submitted');
      }
      const { data, error } = await supabase
        .from('hr_performance_reviews')
        .update({
          self_appraisal_jsonb: args.payload,
          status: args.submit ? 'self_submitted' : existing.status,
          self_submitted_at: args.submit ? new Date().toISOString() : existing.self_submitted_at,
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as HRPerformanceReview;
    }

    const { data, error } = await supabase
      .from('hr_performance_reviews')
      .insert({
        cycle_id: args.cycleId,
        staff_id: args.staffId,
        self_appraisal_jsonb: args.payload,
        status: targetStatus,
        self_submitted_at: args.submit ? new Date().toISOString() : null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as HRPerformanceReview;
  }

  /** Supervisor (dept HoD) path. self_submitted → supervisor_reviewed. */
  static async submitSupervisorReview(
    supabase: SupabaseClient,
    reviewId: string,
    payload: Record<string, unknown>,
  ): Promise<HRPerformanceReview> {
    const current = await this.requireReview(supabase, reviewId);
    assertTransition(current.status, 'supervisor_reviewed');

    const { data, error } = await supabase
      .from('hr_performance_reviews')
      .update({
        supervisor_review_jsonb: payload,
        status: 'supervisor_reviewed',
        supervisor_reviewed_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .select('*')
      .single();
    if (error) throw error;
    return data as HRPerformanceReview;
  }

  /** SEDC committee path. supervisor_reviewed → sedc_reviewed. */
  static async submitSedcReview(
    supabase: SupabaseClient,
    reviewId: string,
    payload: Record<string, unknown>,
  ): Promise<HRPerformanceReview> {
    const current = await this.requireReview(supabase, reviewId);
    assertTransition(current.status, 'sedc_reviewed');

    const { data, error } = await supabase
      .from('hr_performance_reviews')
      .update({
        sedc_review_jsonb: payload,
        status: 'sedc_reviewed',
        sedc_reviewed_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .select('*')
      .single();
    if (error) throw error;
    return data as HRPerformanceReview;
  }

  /** Director path. sedc_reviewed → final_approved (terminal). */
  static async finalApprove(
    supabase: SupabaseClient,
    reviewId: string,
    args: { final_score: number; final_remarks: string; approver_profile_id: string },
  ): Promise<HRPerformanceReview> {
    const current = await this.requireReview(supabase, reviewId);
    assertTransition(current.status, 'final_approved');

    const { data, error } = await supabase
      .from('hr_performance_reviews')
      .update({
        final_score: args.final_score,
        final_remarks: args.final_remarks,
        status: 'final_approved',
        final_approved_at: new Date().toISOString(),
        final_approved_by: args.approver_profile_id,
      })
      .eq('id', reviewId)
      .select('*')
      .single();
    if (error) throw error;
    return data as HRPerformanceReview;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private static async requireReview(
    supabase: SupabaseClient,
    reviewId: string,
  ): Promise<HRPerformanceReview> {
    const { data, error } = await supabase
      .from('hr_performance_reviews')
      .select('*')
      .eq('id', reviewId)
      .single();
    if (error) throw error;
    if (!data) throw new Error(`Review ${reviewId} not found.`);
    return data as HRPerformanceReview;
  }
}
