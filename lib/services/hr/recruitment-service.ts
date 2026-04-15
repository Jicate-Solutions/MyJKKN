/**
 * HR Recruitment Service (Phase 1A)
 *
 * Static class — SupabaseClient passed as first argument (mirrors LeaveService pattern).
 * Spec: specs/hr-recruitment-module-spec.md
 * Pattern: lib/services/hr/leave-service.ts
 *
 * Methods:
 *   listCandidates     — paginated list with filters
 *   getCandidate       — single record by id
 *   submitCandidate    — create + build frozen approval_chain snapshot
 *   approveCandidate   — advance current_step; finalise on last step
 *   rejectCandidate    — terminal rejection with reason
 *   withdrawCandidate  — R2.1 soft-status change
 *   markNoShow         — R2.4
 *   updateStatus       — joined / offer_rescinded / offer_issued transitions
 *   buildApprovalChain — reads hr_approval_flows, freezes snapshot
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeaveApprovalStep } from '@/types/hr';
import type {
  HRRecruitmentCandidate,
  HRRecruitmentCandidateInsert,
  HRRecruitmentCandidateUpdate,
  CandidateFilters as BaseCandidateFilters,
  CandidateListResponse,
  CandidateStatus,
  RoleCategory,
  CTCBand,
} from '@/types/hr-recruitment';

// =====================================================================================
// Extended list filters (Phase 1A follow-up)
// Server-side filters that remove the need for client-side filtering in the inbox UI.
// =====================================================================================

export interface CandidateFilters extends BaseCandidateFilters {
  /** Filter by the user who submitted the candidate (profiles.id UUID). */
  submitted_by?: string;
  /**
   * Approver-inbox mode. When true, only returns rows where:
   *   status IN ('submitted','pending_approval')
   *   AND approval_chain -> current_step ->> 'approver_user_id' = approver_id
   * Requires `approver_id` to be set — `listCandidates` throws otherwise.
   */
  pending_for_me?: boolean;
  /** UUID of the approver whose inbox we're computing. Required when `pending_for_me=true`. */
  approver_id?: string;
}

// =====================================================================================
// Recruitment Service
// =====================================================================================

export class RecruitmentService {
  // ----- List / Get -----

  static async listCandidates(
    supabase: SupabaseClient,
    filters: CandidateFilters = {}
  ): Promise<CandidateListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from('hr_recruitment_candidates')
      .select('*', { count: 'exact' })
      .order('submitted_at', { ascending: false })
      .range(from, to);

    if (filters.hr_organization_id) {
      q = q.eq('hr_organization_id', filters.hr_organization_id);
    }
    if (filters.institution_id) {
      q = q.eq('institution_id', filters.institution_id);
    }
    if (filters.role_category) {
      q = q.eq('role_category', filters.role_category);
    }
    if (filters.is_emergency !== undefined) {
      q = q.eq('is_emergency', filters.is_emergency);
    }
    if (filters.source) {
      q = q.eq('source', filters.source);
    }
    if (filters.submitted_by) {
      q = q.eq('submitted_by', filters.submitted_by);
    }

    // pending_for_me: approver inbox view.
    // Must be combined with `approver_id` — the service enforces this contract
    // so the route layer can return a clean 400 on missing approver_id.
    if (filters.pending_for_me) {
      if (!filters.approver_id) {
        throw new Error('approver_id is required when pending_for_me=true');
      }
      // When pending_for_me is set, status defaults to the open-approval statuses.
      // An explicit `status` filter passed alongside is ignored in favour of this one
      // to preserve the inbox semantics.
      q = q.in('status', ['submitted', 'pending_approval']);
      // jsonb path: approval_chain is an array; current_step is the index of the
      // row's own current step (server-side). We cannot dereference array[current_step]
      // in PostgREST without a SQL function, so we compare the `approver_user_id`
      // of the "first pending step" using jsonb_path_query / filter — PostgREST
      // supports this via the `cs` (contains) operator on the array shape.
      // The approval_chain entries that are still pending + match the approver:
      //   approval_chain @> '[{"status":"pending","approver_user_id":"<id>"}]'
      q = q.contains('approval_chain', [
        { status: 'pending', approver_user_id: filters.approver_id },
      ]);
    } else if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in('status', statuses);
    }
    if (filters.search) {
      q = q.or(
        `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,role_title.ilike.%${filters.search}%`
      );
    }

    const { data, count, error } = await q;
    if (error) throw error;

    return {
      data: (data ?? []) as HRRecruitmentCandidate[],
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    };
  }

  static async getCandidate(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRRecruitmentCandidate | null> {
    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as HRRecruitmentCandidate | null;
  }

  // ----- Submit -----

  /**
   * Build the approval_chain snapshot from hr_approval_flows at submit-time.
   * Frozen-snapshot pattern (R1.4) — if HR later edits the flow,
   * in-flight candidates keep their original approval rules.
   *
   * Matching logic: conditions jsonb is matched against roleCategory + ctcBand.
   * Most-specific match wins (role_category + ctc_band > role_category only).
   */
  static async buildApprovalChain(
    supabase: SupabaseClient,
    hrOrgId: string,
    roleCategory: RoleCategory,
    ctcBand: CTCBand | null
  ): Promise<LeaveApprovalStep[]> {
    const { data: flows, error } = await supabase
      .from('hr_approval_flows')
      .select('*')
      .eq('hr_organization_id', hrOrgId)
      .eq('flow_for', 'recruitment_approval')
      .eq('is_active', true);

    if (error) throw error;
    if (!flows || flows.length === 0) {
      throw new Error(
        'No recruitment approval flows configured for this organisation. ' +
        'HR Admin must seed flows at /hr/policies/hr_approval_flows first.'
      );
    }

    // Parse conditions jsonb and find best match
    // Priority: role_category + ctc_band match > role_category-only match
    type ApprovalFlowRow = {
      conditions: Record<string, string> | null;
      steps: LeaveApprovalStep[] | null;
    };

    const exactMatches = (flows as ApprovalFlowRow[]).filter((f) => {
      const cond = f.conditions ?? {};
      return (
        cond.role_category === roleCategory &&
        cond.ctc_band === (ctcBand ?? '')
      );
    });

    const categoryMatches = (flows as ApprovalFlowRow[]).filter((f) => {
      const cond = f.conditions ?? {};
      return (
        cond.role_category === roleCategory &&
        !cond.ctc_band
      );
    });

    const chosen = exactMatches.length > 0
      ? exactMatches[0]
      : categoryMatches.length > 0
        ? categoryMatches[0]
        : null;

    if (!chosen) {
      throw new Error(
        `No approval flow found for role_category='${roleCategory}' ctc_band='${ctcBand ?? 'none'}'. ` +
        'HR Admin must configure a matching flow at /hr/policies.'
      );
    }

    // steps is stored as a jsonb array in the flow; map to LeaveApprovalStep shape
    const steps = (chosen.steps ?? []) as Array<{
      chain_order?: number;
      approver_role: string;
      escalate_after_hours?: number;
    }>;

    return steps.map((s, idx) => ({
      step_order: s.chain_order ?? idx + 1,
      approver_role: s.approver_role,
      approver_user_id: null,         // resolved at approve-time by role lookup
      status: 'pending' as const,
      escalate_after_hours: s.escalate_after_hours ?? 72, // R3.3: 3-day default
    }));
  }

  /**
   * Submit a new candidate. Validates required fields, builds approval chain snapshot,
   * inserts the row with status='pending_approval'.
   */
  static async submitCandidate(
    supabase: SupabaseClient,
    payload: HRRecruitmentCandidateInsert
  ): Promise<HRRecruitmentCandidate> {
    if (!payload.cvviz_url) {
      throw new Error('CV link (cvviz_url) is mandatory per R3.4.');
    }
    if (!payload.name || !payload.email) {
      throw new Error('Candidate name and email are required.');
    }

    // Build frozen approval chain from hr_approval_flows
    const approval_chain = await this.buildApprovalChain(
      supabase,
      payload.hr_organization_id,
      payload.role_category,
      payload.proposed_ctc_band ?? null
    );

    const insertPayload: Record<string, unknown> = {
      hr_organization_id: payload.hr_organization_id,
      institution_id: payload.institution_id ?? null,
      name: payload.name,
      email: payload.email,
      phone: payload.phone ?? null,
      cvviz_url: payload.cvviz_url,
      role_category: payload.role_category,
      role_title: payload.role_title,
      proposed_ctc_band: payload.proposed_ctc_band ?? null,
      role_specific_details: payload.role_specific_details ?? {},
      status: payload.status ?? 'pending_approval',
      is_emergency: payload.is_emergency ?? false,
      is_internal_transfer: payload.is_internal_transfer ?? false,
      source_staff_id: payload.source_staff_id ?? null,
      source: payload.source ?? 'hr_submission',
      approval_chain,
      current_step: 0,
      expected_joining_date: payload.expected_joining_date ?? null,
      submitted_by: payload.submitted_by,
      submitted_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  // ----- Approve / Reject -----

  static async approveCandidate(
    supabase: SupabaseClient,
    id: string,
    approverId: string,
    comment?: string
  ): Promise<HRRecruitmentCandidate> {
    const candidate = await this.getCandidate(supabase, id);
    if (!candidate) throw new Error('Candidate not found');
    if (!['pending_approval', 'submitted'].includes(candidate.status)) {
      throw new Error(`Cannot approve candidate in status '${candidate.status}'`);
    }

    const chain = [...(candidate.approval_chain ?? [])];
    const step = chain[candidate.current_step];
    if (!step) throw new Error('Approval chain exhausted — no pending step found');

    step.status = 'approved';
    step.decided_at = new Date().toISOString();
    step.decided_by = approverId;
    step.comment = comment ?? null;
    step.approver_user_id = approverId;

    const nextStep = candidate.current_step + 1;
    const isFinal = nextStep >= chain.length;

    const update: HRRecruitmentCandidateUpdate & Record<string, unknown> = {
      approval_chain: chain,
      current_step: nextStep,
    };
    if (isFinal) {
      update.status = 'approved';
      update.final_approver_id = approverId;
      update.final_decided_at = new Date().toISOString();
    } else {
      update.status = 'pending_approval';
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  static async rejectCandidate(
    supabase: SupabaseClient,
    id: string,
    approverId: string,
    reason: string
  ): Promise<HRRecruitmentCandidate> {
    const candidate = await this.getCandidate(supabase, id);
    if (!candidate) throw new Error('Candidate not found');
    if (!['pending_approval', 'submitted'].includes(candidate.status)) {
      throw new Error(`Cannot reject candidate in status '${candidate.status}'`);
    }

    const chain = [...(candidate.approval_chain ?? [])];
    const step = chain[candidate.current_step];
    if (step) {
      step.status = 'rejected';
      step.decided_at = new Date().toISOString();
      step.decided_by = approverId;
      step.comment = reason;
      step.approver_user_id = approverId;
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .update({
        status: 'rejected',
        approval_chain: chain,
        rejection_reason: reason,
        final_approver_id: approverId,
        final_decided_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  // ----- Withdraw (R2.1 — soft-status, pre-offer only) -----

  static async withdrawCandidate(
    supabase: SupabaseClient,
    id: string,
    reason: string
  ): Promise<HRRecruitmentCandidate> {
    const candidate = await this.getCandidate(supabase, id);
    if (!candidate) throw new Error('Candidate not found');

    const withdrawableStatuses: CandidateStatus[] = [
      'submitted',
      'pending_approval',
      'approved',
    ];
    if (!withdrawableStatuses.includes(candidate.status)) {
      throw new Error(
        `Cannot withdraw candidate in status '${candidate.status}'. ` +
        'Withdrawal is only allowed before offer is issued.'
      );
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .update({
        status: 'withdrawn',
        cancellation_reason: reason,
        final_decided_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  // ----- No-show (R2.4) -----

  static async markNoShow(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRRecruitmentCandidate> {
    const candidate = await this.getCandidate(supabase, id);
    if (!candidate) throw new Error('Candidate not found');

    const noShowEligible: CandidateStatus[] = ['offer_issued', 'approved', 'package_fixed'];
    if (!noShowEligible.includes(candidate.status)) {
      throw new Error(
        `Cannot mark no-show for candidate in status '${candidate.status}'.`
      );
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .update({
        status: 'no_show',
        cancellation_reason: 'Candidate did not join on expected date',
        final_decided_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  // ----- Status transitions (joined / offer_rescinded / offer_issued) -----

  static async updateStatus(
    supabase: SupabaseClient,
    id: string,
    newStatus: CandidateStatus
  ): Promise<HRRecruitmentCandidate> {
    const candidate = await this.getCandidate(supabase, id);
    if (!candidate) throw new Error('Candidate not found');

    // Define valid forward transitions only
    const validTransitions: Partial<Record<CandidateStatus, CandidateStatus[]>> = {
      approved:       ['package_fixed', 'offer_issued'],
      package_fixed:  ['offer_issued'],
      offer_issued:   ['joined', 'no_show', 'offer_rescinded'],
    };

    const allowed = validTransitions[candidate.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Transition '${candidate.status}' → '${newStatus}' is not allowed. ` +
        `Allowed: [${allowed.join(', ')}]`
      );
    }

    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'joined') {
      updatePayload.actual_joining_date = new Date().toISOString().split('T')[0];
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }
}
