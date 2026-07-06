// lib/services/cohort-core/feedforward-service.ts
// Cohort Core — M7.3 feed-forward proposer read/approve/apply service (THE MOAT).
//
// The ACTION half of the loop, with the M5 + M7 safety gates enforced in the DB:
//   • propose(cohortId)  → fn_propose_cohort_adjustments (SECURITY INVOKER). M5:
//     only a CLOSED cohort with a computed causal lift yields a PENDING proposal.
//   • approve / reject(id) → an RLS-governed status UPDATE (the human decision).
//   • apply(id)          → fn_apply_cohort_adjustment_proposal (SECURITY DEFINER,
//     internally authority-gated to the proposal's institution). M7: refuses
//     unless a human already moved the proposal to 'approved'. NOTHING auto-applies.
//
// CLIENT-ONLY — session-scoped browser Supabase client (RLS enforced). Do NOT
// import into a Server Component / route handler.
// Connected to:
//   supabase/migrations/20260731094000_cohort_feedforward.sql
//   hooks/cohort-core/useMoat.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  CohortAdjustmentProposal,
  ProposalStatus,
} from '@/lib/types/cohort-core';

export interface ProposalFilters {
  status?: ProposalStatus;
  target_id?: string;
  based_on_cohort_id?: string;
  institution_id?: string;
}

export class CohortFeedForwardService {
  private static supabase = createClientSupabaseClient();

  // ── Reads ────────────────────────────────────────────────────────────────────

  static async listProposals(
    filters: ProposalFilters = {}
  ): Promise<CohortAdjustmentProposal[]> {
    try {
      let query = (this.supabase as any)
        .from('cohort_adjustment_proposals')
        .select('*');
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.target_id) query = query.eq('target_id', filters.target_id);
      if (filters.based_on_cohort_id) query = query.eq('based_on_cohort_id', filters.based_on_cohort_id);
      if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('CohortFeedForwardService: listProposals error:', error);
      return [];
    }
  }

  // ── Propose (M5 gate lives in the DB fn) ─────────────────────────────────────

  /**
   * Emit a PENDING feed-forward proposal from a CLOSED cohort's causal lift.
   * Idempotent per source cohort (a partial unique index returns the existing
   * pending proposal instead of a duplicate). Throws if the M5 gate is unmet
   * (cohort not closed, or no causal lift computed).
   */
  static async propose(cohortId: string): Promise<CohortAdjustmentProposal> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_propose_cohort_adjustments',
        { p_cohort_id: cohortId }
      );
      if (error) throw error;
      toast.success('Adjustment proposal created');
      return data as CohortAdjustmentProposal;
    } catch (error) {
      console.error('CohortFeedForwardService: propose error:', error);
      throw error;
    }
  }

  // ── Human decision (M7 gate) ─────────────────────────────────────────────────

  /** Move a pending proposal to approved (RLS-governed). Does NOT apply it. */
  static async approve(proposalId: string, reviewerId: string): Promise<CohortAdjustmentProposal> {
    return this.setDecision(proposalId, 'approved', reviewerId);
  }

  /** Reject a pending proposal (RLS-governed). Terminal. */
  static async reject(proposalId: string, reviewerId: string): Promise<CohortAdjustmentProposal> {
    return this.setDecision(proposalId, 'rejected', reviewerId);
  }

  private static async setDecision(
    proposalId: string,
    status: Extract<ProposalStatus, 'approved' | 'rejected'>,
    reviewerId: string
  ): Promise<CohortAdjustmentProposal> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('cohort_adjustment_proposals')
        .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
        .eq('id', proposalId)
        .eq('status', 'pending') // only a pending proposal can be decided
        .select()
        .single();
      if (error) {
        if (error.code === '42501') {
          const denied = new Error('You do not have permission to review this proposal') as Error & { status?: number };
          denied.status = 403;
          throw denied;
        }
        throw error;
      }
      toast.success(status === 'approved' ? 'Proposal approved' : 'Proposal rejected');
      return data;
    } catch (error) {
      console.error('CohortFeedForwardService: setDecision error:', error);
      throw error;
    }
  }

  /**
   * Apply an APPROVED proposal to its target program (M7 gate enforced in the DB
   * fn — refuses anything not human-approved). Marks the proposal 'applied'.
   */
  static async apply(proposalId: string, actorId: string): Promise<CohortAdjustmentProposal> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_apply_cohort_adjustment_proposal',
        { p_proposal_id: proposalId, p_actor_id: actorId }
      );
      if (error) {
        if (error.code === '42501') {
          const denied = new Error('You do not have permission to apply this proposal') as Error & { status?: number };
          denied.status = 403;
          throw denied;
        }
        throw error;
      }
      toast.success('Proposal applied to the program');
      return data as CohortAdjustmentProposal;
    } catch (error) {
      console.error('CohortFeedForwardService: apply error:', error);
      throw error;
    }
  }
}
