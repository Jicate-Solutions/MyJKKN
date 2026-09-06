/**
 * PDE Reciprocal Credit Types
 * ============================================================================
 *
 * Pure types for `pde_reciprocal_credits` (migration
 * `20260519_pde_reciprocal_credits.sql`) and `PDEReciprocalCreditService`
 * (`lib/services/pde-reciprocal-credit-service.ts`).
 *
 * No server-only imports — safe for client component use.
 *
 * Phase: PDE Tier 3 — T3.3 — 2026-05-19.
 */

/**
 * Kinds of credit grants tracked in `pde_reciprocal_credits.credit_type`.
 * Mirrors the CHECK constraint on the column.
 */
export type CreditType = 'quest_completion' | 'validator_grant' | 'peer_attestation';

/**
 * Row shape of `pde_reciprocal_credits` — matches the migration column-for-column.
 */
export interface PdeReciprocalCredit {
  id: string;
  learner_id: string;
  quest_id: string | null;
  credit_type: CreditType;
  credit_value: number;
  granted_at: string;
  granted_by: string | null;
  institution_id: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * Aggregate shape returned by `getLearnerCredits()` — sum + per-type breakdown.
 */
export interface LearnerCreditTotals {
  learner_id: string;
  total: number;
  by_type: Record<CreditType, number>;
  row_count: number;
}

/**
 * Outcome of a grant attempt. `granted: false` means the policy is disabled
 * (e.g. compensation_model = 'voluntary_recognition'); the service returns
 * gracefully rather than throwing.
 */
export interface GrantResult {
  granted: boolean;
  credit_id?: string;
  reason?: string;
}
