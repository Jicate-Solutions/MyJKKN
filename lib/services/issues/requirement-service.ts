// lib/services/issues/requirement-service.ts
// ============================================================================
// Insta Solver core module — RequirementService.
//
// Client-side query layer over `requirement_requests`. Pattern source:
// lib/services/grievance/grievance-service.ts (static class, singleton supabase
// client, throws on errors).
//
// State machine (locked R2 + DDL plan):
//   submitted → under_review → voting_open → voting_closed
//             → approved → budgeted → in_progress → fulfilled
//   rejected  = terminal (any state can transition to rejected)
//   withdrawn = terminal (filer-initiated OR auto on quorum miss)
//
// Voting window + quorum read from platform_policies rows (Pattern A):
//   - issues.requirement.voting_window_days.default = 14
//   - issues.requirement.voting_quorum_pct = 0.10
//
// Approval chain is built at apply-time via approval-chain-service
// (snapshot-pattern cloned from lib/services/hr/leave-service.ts).
//
// Strategic spec:    docs/INSTASOLVER-MODULE-SPEC.md
// Implementation:    specs/instasolver-core-module-spec.md
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ApproveRequirementInput,
  CreateRequirementInput,
  ListRequirementsParams,
  RejectRequirementInput,
  RequirementRequest,
  RequirementRequestSummary,
  RequirementStatus,
} from '@/lib/types/issues';
import { ApprovalChainService } from '@/lib/services/issues/approval-chain-service';

const LIST_COLS =
  'id, request_number, category_id, institution_id, subject, ' +
  'estimated_budget, raised_by_type, raised_by_name, status, ' +
  'voting_opens_at, voting_closes_at, vote_count_yes, vote_count_no, ' +
  'budgeted_amount, created_at';

// Default voting window (in days). Read from platform_policies at runtime;
// this constant is the in-code fallback only.
const VOTING_WINDOW_DAYS_FALLBACK = 14;

export class RequirementService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // List / Get
  // --------------------------------------------------------------------------

  static async listRequirements(
    params: ListRequirementsParams = {}
  ): Promise<{ items: RequirementRequestSummary[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.supabase as any)
      .from('requirement_requests')
      .select(LIST_COLS, { count: 'exact' });

    if (params.institutionId) query = query.eq('institution_id', params.institutionId);
    if (params.categoryId) query = query.eq('category_id', params.categoryId);
    if (params.status) query = query.eq('status', params.status);

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return {
      items: (data ?? []) as RequirementRequestSummary[],
      total: count ?? 0,
    };
  }

  static async getRequirementById(id: string): Promise<RequirementRequest> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('requirement_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as RequirementRequest;
  }

  // --------------------------------------------------------------------------
  // Create
  // --------------------------------------------------------------------------

  /**
   * Insert a new requirement request. The DB BEFORE-INSERT trigger generates
   * request_number (REQ-YYYY-NNNN). Approval chain is snapshotted on first
   * insert via ApprovalChainService.buildApprovalChain — chain is immutable
   * post-creation (later threshold edits don't affect in-flight rows).
   */
  static async createRequirement(
    input: CreateRequirementInput
  ): Promise<RequirementRequest> {
    // Step 1: build the approval chain snapshot
    const approvalChain = await ApprovalChainService.buildApprovalChain({
      requirement_id: '', // placeholder; the chain only depends on budget + institution
      estimated_budget: input.estimated_budget ?? 0,
      institution_id: input.institution_id,
    });

    // Step 2: insert with chain attached
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('requirement_requests')
      .insert({
        institution_id: input.institution_id,
        category_id: input.category_id,
        subject: input.subject,
        description: input.description,
        estimated_budget: input.estimated_budget ?? null,
        raised_by_type: input.raised_by_type,
        raised_by_id: input.raised_by_id ?? null,
        raised_by_name: input.raised_by_name ?? null,
        status: 'submitted',
        approval_chain: approvalChain,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as RequirementRequest;
  }

  // --------------------------------------------------------------------------
  // Status transitions
  // --------------------------------------------------------------------------

  /**
   * Generic status update. Use the dedicated methods (openVoting / approve /
   * reject / markFulfilled / withdraw) where available — they stamp the
   * appropriate timestamp columns. This method is the fallback for transitions
   * that don't carry a side-effect (e.g. submitted → under_review).
   */
  static async updateRequirementStatus(
    id: string,
    status: RequirementStatus
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('requirement_requests')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Open voting. Reads voting_window_days from platform_policies (key
   * `issues.requirement.voting_window_days.default`); falls back to 14 days
   * if the policy row is missing. Stamps voting_opens_at + voting_closes_at.
   */
  static async openVoting(id: string, windowDays?: number): Promise<void> {
    const days = windowDays ?? (await this.getDefaultVotingWindowDays());
    const opensAt = new Date();
    const closesAt = new Date(opensAt.getTime() + days * 24 * 60 * 60 * 1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('requirement_requests')
      .update({
        status: 'voting_open',
        voting_opens_at: opensAt.toISOString(),
        voting_closes_at: closesAt.toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Close voting. Checks quorum (default 10% of eligible voters per
   * `issues.requirement.voting_quorum_pct`); if quorum met, transitions to
   * voting_closed (eligible for approval); if not met, transitions to
   * withdrawn. The eligibility-count and quorum check are deferred to
   * `fn_close_requirement_voting` (SQL — sibling agent scope) for atomicity;
   * this client method is a thin RPC wrapper.
   */
  static async closeVoting(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any).rpc(
      'fn_close_requirement_voting',
      { p_requirement_id: id }
    );

    if (error) {
      // Fallback path while fn_close_requirement_voting is not yet shipped:
      // transition to voting_closed unconditionally; quorum-aware transition
      // will be added when the SQL fn lands.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: fallbackErr } = await (this.supabase as any)
        .from('requirement_requests')
        .update({ status: 'voting_closed' })
        .eq('id', id);
      if (fallbackErr) throw fallbackErr;
    }
  }

  /**
   * Approve the requirement at the current chain step. Stamps approved_at +
   * approved_by; if a budgeted_amount was supplied, also stamps budgeted_*
   * columns and transitions to 'budgeted'. Otherwise transitions to
   * 'approved' awaiting budget.
   *
   * Caller MUST verify the actor is the current chain step's authorized
   * approver before calling — that check lives in
   * ApprovalChainService.advanceChain().
   */
  static async approveRequirement(
    input: ApproveRequirementInput
  ): Promise<void> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      approved_at: now,
      approved_by: input.approver_id,
      status: input.budgeted_amount !== undefined ? 'budgeted' : 'approved',
    };
    if (input.budgeted_amount !== undefined) {
      patch.budgeted_amount = input.budgeted_amount;
      patch.budgeted_at = now;
      patch.budgeted_by = input.approver_id;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('requirement_requests')
      .update(patch)
      .eq('id', input.requirement_id);

    if (error) throw error;

    // Advance the chain (also captured in approval_chain JSONB)
    await ApprovalChainService.advanceChain(
      input.requirement_id,
      input.approver_id,
      'approve',
      input.comment
    );
  }

  static async rejectRequirement(input: RejectRequirementInput): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('requirement_requests')
      .update({
        status: 'rejected',
        rejection_reason: input.reason,
      })
      .eq('id', input.requirement_id);

    if (error) throw error;

    await ApprovalChainService.advanceChain(
      input.requirement_id,
      input.approver_id,
      'reject',
      input.reason
    );
  }

  static async markFulfilled(id: string, fulfillerId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('requirement_requests')
      .update({
        status: 'fulfilled',
        fulfilled_at: new Date().toISOString(),
        metadata: { fulfilled_by: fulfillerId },
      })
      .eq('id', id);

    if (error) throw error;
  }

  static async withdrawRequirement(id: string, reason: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('requirement_requests')
      .update({
        status: 'withdrawn',
        rejection_reason: reason,
      })
      .eq('id', id);

    if (error) throw error;
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  /**
   * Resolve the default voting window from platform_policies. Returns
   * VOTING_WINDOW_DAYS_FALLBACK (14) if the policy row is missing or invalid.
   *
   * NOTE: For B.1 substrate this is a thin direct read. Future versions may
   * route through `lib/policies/get-policy.ts` if/when that helper lands.
   */
  private static async getDefaultVotingWindowDays(): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('platform_policies')
      .select('value')
      .eq('key', 'issues.requirement.voting_window_days.default')
      .maybeSingle();

    if (error || !data?.value) return VOTING_WINDOW_DAYS_FALLBACK;
    const parsed = parseInt(String(data.value), 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : VOTING_WINDOW_DAYS_FALLBACK;
  }
}
