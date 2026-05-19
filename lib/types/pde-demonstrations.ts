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
}

export interface CreatePDEDemonstrationInput {
  learner_id: string;
  institution_id?: string;
  category_key: PDECategoryKey;
  rubric_policy_key?: string;
  skill_name?: string;
  evidence?: PDEDemonstrationEvidence;
  evidence_type?: string;
}
