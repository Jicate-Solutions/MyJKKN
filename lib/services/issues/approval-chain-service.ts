// lib/services/issues/approval-chain-service.ts
// ============================================================================
// InstaSolver — ApprovalChainService (purchase lane, I5).
//
// A purchase raised through InstaSolver clears a tiered approval before it
// becomes a Procurement purchase request. This service builds that chain and
// advances it. Snapshot-at-build-time semantics, cloned from
// `lib/services/hr/leave-service.ts buildApprovalChain` — a later threshold
// edit does not disturb a chain already in flight.
//
// Seed budget bands (super_admin-editable rows in
// procurement_approval_thresholds):
//   - HOD          ≤ ₹10,000
//   - Principal    ₹10,000.01 – ₹50,000   (paise-exact: the bands are contiguous)
//   - super_admin  > ₹50,000
//
// REWRITTEN 2026-09-14 (specs/instasolver-2026-09-14.md). Two changes:
//
//   1. The tier table is now `procurement_approval_thresholds`, not
//      `requirement_approval_thresholds`. Identical columns; only the module
//      it belongs to changed (I3/I5 send purchases to Procurement).
//
//   2. advanceChain / getCurrentApprover / isChainComplete no longer read and
//      write a row themselves. They used to SELECT and UPDATE
//      `requirement_requests.approval_chain` — a table this rewrite drops and
//      that was never created in production. `procurement_purchase_requests`
//      has no approval_chain column to point them at instead, and adding one
//      to a live Procurement table is not this lane's to make. So the three
//      are now pure functions over the chain array: the Procurement caller
//      reads the chain, passes it in, and persists what comes back, in
//      whichever column that module decides to hold it. Same names, same
//      order of operations, no hidden I/O.
//
// Spec:      specs/instasolver-2026-09-14.md
// Migration: supabase/migrations/20261213100000_instasolver_substrate_v2.sql
// Pattern source: lib/services/hr/leave-service.ts (buildApprovalChain)
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ApprovalChainStep,
  BuildChainInput,
} from '@/lib/types/issues';

export class ApprovalChainService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Build (snapshot at request create-time)
  // --------------------------------------------------------------------------

  /**
   * Build the chain by reading `procurement_approval_thresholds` rows for the
   * given institution + budget band. Returns the chain ordered by step_order.
   * Per-institution rows take precedence; falls back to platform-wide
   * (institution_id IS NULL) rows.
   *
   * Every threshold band whose (min_amount, max_amount) range covers the
   * budget becomes a step. With the seeded bands that is a single step for
   * typical amounts (HOD only at ≤ ₹10k), because the bands do not overlap.
   */
  static async buildApprovalChain(
    input: BuildChainInput
  ): Promise<ApprovalChainStep[]> {
    const budget = Math.max(0, input.estimated_budget ?? 0);

    // Per-institution rows preferred; fall back to platform-wide
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: instRows, error: instErr } = await (this.supabase as any)
      .from('procurement_approval_thresholds')
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
        .from('procurement_approval_thresholds')
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

    // NO BAND MATCHED IS AN ERROR, NEVER AN EMPTY CHAIN.
    //
    // Returning [] here used to mean "approved by nobody": getCurrentApprover([])
    // is null, so isChainComplete([]) was true and a purchase with no approver
    // read as fully approved. The bands are seeded contiguous to the paise, so
    // reaching this line means the configuration is broken (a tier deleted, an
    // institution override with a hole in it, or a negative budget) — and a
    // broken spending policy must stop the request, not wave it through.
    if (matched.length === 0) {
      throw new Error(
        `No approval tier covers ₹${budget} (institution ${input.institution_id}). ` +
          `procurement_approval_thresholds must cover every amount with no gap. ` +
          `Refusing to build an empty approval chain — an empty chain would read as fully approved.`
      );
    }

    return matched.map((r, i) => ({
      step_order: i + 1,
      approver_role: r.approval_authority,
      approver_user_id: null, // resolved at decide time by role lookup
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
   * Mark the current pending step as approved/rejected and return the updated
   * chain. The caller persists it.
   *
   * If 'approve' AND another pending step exists, the request stays in its
   * current status (the next-step approver picks it up). If 'approve' AND this
   * was the final step, the caller transitions the request to approved. If
   * 'reject', the caller transitions it to rejected and every later pending
   * step is marked 'skipped' here for audit clarity.
   *
   * Returns the input unchanged when the chain is already fully decided.
   * The input array is never mutated.
   */
  static advanceChain(
    chain: ApprovalChainStep[],
    actorUserId: string,
    action: 'approve' | 'reject',
    comment?: string
  ): ApprovalChainStep[] {
    const next = (chain ?? []).slice();
    const idx = next.findIndex((s) => s.status === 'pending');
    if (idx === -1) {
      // No pending step — chain already terminal. No-op.
      return next;
    }

    const now = new Date().toISOString();
    next[idx] = {
      ...next[idx],
      status: action === 'approve' ? 'approved' : 'rejected',
      decided_at: now,
      decided_by: actorUserId,
      comment: comment ?? null,
    };

    // On reject, mark all later pending steps as 'skipped' for clarity
    if (action === 'reject') {
      for (let i = idx + 1; i < next.length; i++) {
        if (next[i].status === 'pending') {
          next[i] = { ...next[i], status: 'skipped' };
        }
      }
    }

    return next;
  }

  // --------------------------------------------------------------------------
  // Read helpers
  // --------------------------------------------------------------------------

  /**
   * Return the current pending step (with approver_role + step_order), or
   * null if the chain is fully decided. Used by the UI to surface "awaiting
   * approval from <role>" badges.
   */
  static getCurrentApprover(
    chain: ApprovalChainStep[]
  ): { step_order: number; approver_role: string; approver_user_id: string | null } | null {
    const pending = (chain ?? []).find((s) => s.status === 'pending');
    if (!pending) return null;

    return {
      step_order: pending.step_order,
      approver_role: pending.approver_role,
      approver_user_id: pending.approver_user_id,
    };
  }

  /**
   * True when the chain has at least one step and every step has a non-pending
   * status (the chain is fully decided one way or another).
   *
   * AN EMPTY CHAIN IS NOT COMPLETE. `getCurrentApprover([])` is null because
   * there is nothing pending, and reading that alone as "complete" turned a
   * purchase nobody approved into a purchase fully approved. A chain of zero
   * steps means no approval was ever sought, which is the opposite of decided.
   * buildApprovalChain now refuses to produce one, and this is the second lock
   * on the same door: a chain that arrives empty from anywhere — a stored row
   * written before that fix, a caller that constructs its own array — still
   * cannot clear the gate.
   */
  static isChainComplete(chain: ApprovalChainStep[]): boolean {
    if (!chain || chain.length === 0) return false;
    return this.getCurrentApprover(chain) === null;
  }
}
