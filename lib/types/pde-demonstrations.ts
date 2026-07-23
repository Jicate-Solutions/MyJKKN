/**
 * PDE Demonstrations — type definitions for evidence captured against the
 * 7 PDE durable-value categories. Mirrors the schema introduced by migration
 * `supabase/migrations/20260518_pde_demonstrations_table.sql`.
 *
 * Distinct from `pde_submissions` (assessment-scoped). Demonstrations are
 * general-purpose evidence rows consumed by the scoring engine at runtime,
 * which reads `pde.scoring.*` and `pde.rubrics.*` platform_policies.
 */

export type PDECategoryKey =
  | 'judgment'
  | 'embodied'
  | 'problem_finding'
  | 'accountability'
  | 'social_leadership'
  | 'cultural_civic'
  | 'credential';

export type PDEDemonstrationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'validated'
  | 'scored'
  | 'rejected'
  | 'withdrawn';

export interface PDEDemonstrationEvidence {
  type?: string;
  url?: string;
  mime?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface PDEDemonstration {
  id: string;
  learner_id: string;
  institution_id: string | null;
  category_key: PDECategoryKey;
  rubric_policy_key: string | null;
  skill_name: string | null;
  evidence: PDEDemonstrationEvidence;
  evidence_type: string | null;
  status: PDEDemonstrationStatus;
  submitted_at: string | null;
  validator_ids: string[];
  validator_notes: Record<string, unknown>;
  raw_score: number | null;
  weighted_score: number | null;
  passed: boolean | null;
  scored_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Curriculum connector (migration 20260611230000_pde_bos_clo_connector):
  // BoS lane pins a syllabus VERSION at submission; VAC lane is course-level.
  bos_syllabus_id?: string | null;
  vac_course_id?: string | null;
  /** Learner-PROPOSED CLO numbers (capped by pde.obe.clo_tag_cap). */
  clo_refs?: number[] | null;
  /** Validator-CONFIRMED subset — attainment reads this only. */
  clo_refs_confirmed?: number[] | null;
}

export interface CreatePDEDemonstrationInput {
  learner_id: string;
  institution_id?: string;
  category_key: PDECategoryKey;
  rubric_policy_key?: string;
  skill_name?: string;
  evidence?: PDEDemonstrationEvidence;
  evidence_type?: string;
  bos_syllabus_id?: string | null;
  vac_course_id?: string | null;
  clo_refs?: number[] | null;
}

// ---------------------------------------------------------------------------
// Faculty review surface (Option A — durable-value taxonomy).
// Shapes returned/consumed by the fn_pde_review_queue + fn_pde_validate_
// demonstration RPCs (migration 20260615170000_pde_faculty_review_rpcs.sql).
// ---------------------------------------------------------------------------

/**
 * A row in the faculty review queue, enriched with the learner's display name.
 * Returned by the `fn_pde_review_queue` RPC (institution-scoped, SECURITY
 * DEFINER). `category_key` is always one of the 7 durable-value categories —
 * the faculty surface no longer speaks the legacy capability vocabulary.
 */
export interface PDEReviewQueueRow {
  id: string;
  learner_id: string;
  learner_name: string;
  institution_id: string | null;
  category_key: PDECategoryKey;
  skill_name: string | null;
  evidence: PDEDemonstrationEvidence;
  evidence_type: string | null;
  status: PDEDemonstrationStatus;
  submitted_at: string | null;
  raw_score: number | null;
  weighted_score: number | null;
  passed: boolean | null;
  scored_at: string | null;
  rubric_policy_key: string | null;
  validator_ids: string[];
  created_at: string;
}

/**
 * Faculty review decisions.
 *  - 'validated' / 'rejected' set the demonstration status to that value.
 *  - 'changes_requested' returns the demonstration to 'draft' so the owning
 *    learner can edit + resubmit; raw_score is left untouched. The validator
 *    note is persisted and surfaced to the learner as the reason to fix.
 */
export type PDEValidationDecision = 'validated' | 'rejected' | 'changes_requested';

export interface ValidateDemonstrationInput {
  demonstrationId: string;
  decision: PDEValidationDecision;
  /** Required when decision = 'validated'; ignored on 'rejected'/'changes_requested'. */
  rawScore?: number | null;
  /** Required on 'changes_requested' (the learner needs to know what to fix). */
  notes?: string | null;
}
