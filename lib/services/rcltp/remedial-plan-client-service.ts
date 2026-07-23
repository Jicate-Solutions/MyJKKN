/**
 * MyJKKN RCLTP — remedial-plan CLIENT service (browser)
 * ----------------------------------------------------------------------------
 * The Senior Learner's review console reads the plan rows and drives the two
 * write actions:
 *   • requestDraft  → POST /api/rcltp/remedial-plans/enqueue (server enqueues on
 *     the ₹0 Max lane after re-checking rcltp.review + institution).
 *   • approve       → fn_rcltp_remedial_plan_approve(plan_id, edited_content)
 *     called DIRECTLY on the browser client: the RPC self-checks rcltp.review +
 *     institution access under the caller's own session (RLS), so no API route is
 *     needed and a learner client has no other write path into the table.
 *
 * Reads use the session client (RLS: rcltp.review / rcltp.report.view_all /
 * rcltp.config.manage holders see their institution's rows). Follows the
 * results-service convention: static methods + the singleton browser client +
 * `(supabase as any)` for the rcltp_ tables absent from the generated type.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { rcltpPostJson } from './rcltp-helpers';
import type {
  RcltpAtRiskRow,
  RcltpRemedialPlan,
  RcltpRemedialPlanDraft,
} from '@/types/rcltp';

export interface RequestDraftResult {
  planId?: string;
  jobId?: string | null;
  inFlight?: boolean;
  status?: string;
}

export class RcltpRemedialPlanClientService {
  private static supabase = createClientSupabaseClient();

  /**
   * At-risk readers for the institution — via fn_rcltp_at_risk_learners, which
   * is gated on rcltp.review (NOT the principal dashboard's report.view_all), so
   * a reviewer who can act on plans can also see who needs one. Same shape/logic
   * as the principal dashboard's atRisk.
   */
  static async listAtRisk(institutionId: string): Promise<RcltpAtRiskRow[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_rcltp_at_risk_learners', {
      p_institution_id: institutionId,
    });
    if (error) throw error;
    return (data ?? []) as RcltpAtRiskRow[];
  }

  /** Every non-archived plan for the institution (queued / draft / approved). */
  static async listForInstitution(institutionId: string): Promise<RcltpRemedialPlan[]> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_remedial_plans')
      .select('*')
      .eq('institution_id', institutionId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as RcltpRemedialPlan[];
  }

  /** Ask the server to draft a plan for one at-risk learner (async Max lane). */
  static async requestDraft(learnerId: string): Promise<RequestDraftResult> {
    return rcltpPostJson<RequestDraftResult>('/api/rcltp/remedial-plans/enqueue', {
      learnerId,
    });
  }

  /**
   * Approve a plan, capturing the Senior Learner's edited version distinct from
   * the AI draft (the moat-loop edit signal). The RPC is the ONLY path to
   * status='approved' and enforces rcltp.review in-DB under the caller's session.
   */
  static async approve(
    planId: string,
    editedContent: RcltpRemedialPlanDraft,
  ): Promise<RcltpRemedialPlan> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_rcltp_remedial_plan_approve',
      { p_plan_id: planId, p_edited_content: editedContent },
    );
    if (error) throw error;
    return data as RcltpRemedialPlan;
  }
}
