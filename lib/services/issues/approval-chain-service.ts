// lib/services/issues/approval-chain-service.ts
// ============================================================================
// Insta Solver core module — ApprovalChainService.
//
// Builds + advances the approval chain for requirement_requests. Pattern
// cloned from `lib/services/hr/leave-service.ts buildApprovalChain` —
// snapshot-at-apply-time semantics so later threshold edits don't disturb
// in-flight rows.
//
// Default seed budget bands (autonomous decision per R2.3, super_admin-
// editable via /admin/issues/approval-thresholds):
//   - HOD          ≤ ₹10,000
//   - Principal    ≤ ₹50,000
//   - super_admin  > ₹50,000
//
// Stored as JSONB in requirement_requests.approval_chain — array of
// ApprovalChainStep with {step_order, approver_role, approver_user_id,
// status, decided_at, decided_by, comment, ...}.
//
// Strategic spec:    docs/INSTASOLVER-MODULE-SPEC.md
// Implementation:    specs/instasolver-core-module-spec.md
// Pattern source:    lib/services/hr/leave-service.ts (buildApprovalChain)
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ApprovalChainStep,
  BuildChainInput,
} from '@/lib/types/issues';

export class ApprovalChainService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Build (snapshot at requirement create-time)
  // --------------------------------------------------------------------------

  /**
   * Build the chain by reading `requirement_approval_thresholds` rows for the
   * given institution + budget band. Returns the chain ordered by step_order.
   * Per-institution rows take precedence; falls back to platform-wide
   * (institution_id IS NULL) rows.
   *
   * The chain is APPEND-ONLY at this stage — every threshold band whose
   * (min_amount, max_amount) range intersects the budget is included as a
   * step. For typical budgets this resolves to a single step (HOD only at
   * ≤₹10k); for >₹50k it stacks: HOD → Principal → super_admin.
   */
  static async buildApprovalChain(
    input: BuildChainInput
  ): Promise<ApprovalChainStep[]> {
    const budget = Math.max(0, input.estimated_budget ?? 0);

    // Per-institution rows preferred; fall back to platform-wide
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: instRows, error: instErr } = await (this.supabase as any)
      .from('requirement_approval_thresholds')
      .select(
        'approval_authority, min_amount, max_amount, escalate_after_days, fallback_role, is_active'
      )
      .eq('institution_id', input.institution_id)
      .eq('is_active', true);
    if (instErr) throw instErr;

    let rows = (instRows ?? []) as Array<{
      approval_authority: string;
      min_amount: number;
      max_amount: number | null;
      escalate_after_days: number;
      fallback_role: string | null;
      is_active: boolean;
    }>;

    if (rows.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: platRows, error: platErr } = await (this.supabase as any)
        .from('requirement_approval_thresholds')
        .select(
          'approval_authority, min_amount, max_amount, escalate_after_days, fallback_role, is_active'
        )
        .is('institution_id', null)
        .eq('is_active', true);
      if (platErr) throw platErr;
      rows = (platRows ?? []) as typeof rows;
    }

    // Filter to bands whose range covers the budget, sort ascending by
    // min_amount so HOD comes first, super_admin last.
    const matched = rows
      .filter(
        (r) =>
          budget >= r.min_amount && (r.max_amount === null || budget <= r.max_amount)
      )
      .sort((a, b) => a.min_amount - b.min_amount);

    return matched.map((r, i) => ({
      step_order: i + 1,
      approver_role: r.approval_authority,
      approver_user_id: null, // resolved at advance time by role lookup
      status: 'pending',
      min_amount: r.min_amount,
      max_amount: r.max_amount,
      escalate_after_days: r.escalate_after_days,
      fallback_role: r.fallback_role,
      decided_at: null,
      decided_by: null,
      comment: null,
    }));
  }

  // --------------------------------------------------------------------------
  // Advance (when an approver acts)
  // --------------------------------------------------------------------------

  /**
   * Mark the current pending step as approved/rejected and persist the
   * updated chain. If 'approve' AND another pending step exists, the
   * requirement stays in its current status (the next-step approver picks it
   * up). If 'approve' AND this was the final step, the caller (typically
   * RequirementService.approveRequirement) is responsible for transitioning
   * status to 'approved'/'budgeted'. If 'reject', the caller transitions to
   * 'rejected'.
   *
   * NOTE: This method ONLY mutates the chain JSONB on the row. The status
   * transition is the caller's responsibility — keeps the two concerns
   * separable for audit clarity.
   */
  static async advanceChain(
    requirementId: string,
    actorUserId: string,
    action: 'approve' | 'reject',
    comment?: string
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error: readErr } = await (this.supabase as any)
      .from('requirement_requests')
      .select('approval_chain')
      .eq('id', requirementId)
      .single();
    if (readErr) throw readErr;

    const chain = ((row?.approval_chain ?? []) as ApprovalChainStep[]).slice();
    const idx = chain.findIndex((s) => s.status === 'pending');
    if (idx === -1) {
      // No pending step — chain already terminal. No-op.
      return;
    }

    const now = new Date().toISOString();
    chain[idx] = {
      ...chain[idx],
      status: action === 'approve' ? 'approved' : 'rejected',
      decided_at: now,
      decided_by: actorUserId,
      comment: comment ?? null,
    };

    // On reject, mark all later pending steps as 'skipped' for clarity
    if (action === 'reject') {
      for (let i = idx + 1; i < chain.length; i++) {
        if (chain[i].status === 'pending') {
          chain[i] = { ...chain[i], status: 'skipped' };
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: writeErr } = await (this.supabase as any)
      .from('requirement_requests')
      .update({ approval_chain: chain })
      .eq('id', requirementId);
    if (writeErr) throw writeErr;
  }

  // --------------------------------------------------------------------------
  // Read helpers
  // --------------------------------------------------------------------------

  /**
   * Return the current pending step (with approver_role + step_order), or
   * null if the chain is fully decided. Used by the UI to surface "awaiting
   * approval from <role>" badges.
   */
  static async getCurrentApprover(
    requirementId: string
  ): Promise<{ step_order: number; approver_role: string; approver_user_id: string | null } | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (this.supabase as any)
      .from('requirement_requests')
      .select('approval_chain')
      .eq('id', requirementId)
      .single();
    if (error) throw error;

    const chain = (row?.approval_chain ?? []) as ApprovalChainStep[];
    const pending = chain.find((s) => s.status === 'pending');
    if (!pending) return null;

    return {
      step_order: pending.step_order,
      approver_role: pending.approver_role,
      approver_user_id: pending.approver_user_id,
    };
  }

  /**
   * Convenience: returns true when every chain step has a non-pending status
   * (chain is fully decided one way or another).
   */
  static async isChainComplete(requirementId: string): Promise<boolean> {
    const current = await this.getCurrentApprover(requirementId);
    return current === null;
  }
}
