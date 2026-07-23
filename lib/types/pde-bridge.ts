/**
 * PDE Tier 4 — T4.1 Bridge types
 * =============================================================================
 *
 * Maps legacy learner-earned PDE artifacts to the new `pde_demonstrations`
 * substrate. Director strategy lock (2026-05-20): (c) Bridge old → new
 * categories. Old tables stay intact; one row per source row per run_id.
 *
 * Sister module: `lib/services/pde-bridge-service.ts`
 * Storage:       `supabase/migrations/20260520_pde_bridge_audit.sql`
 */

import type { PDECategoryKey, PDEDemonstrationStatus } from '@/lib/types/pde-demonstrations';

export type BridgeSourceTable =
  | 'pde_learner_capabilities'
  | 'pde_certificates'
  | 'pde_quest_enrollments';

export type BridgeStatus = 'dry_run' | 'applied' | 'failed' | 'reversed';

export interface BridgeMapping {
  source_table: BridgeSourceTable;
  source_row_id: string;
  learner_id: string;
  institution_id: string | null;
  target_category_key: PDECategoryKey;
  target_skill_name: string;
  target_evidence: Record<string, unknown>;
  target_evidence_type: string;
  target_status: PDEDemonstrationStatus;
  target_passed: boolean;
  target_weighted_score: number | null;
}

export interface BridgeRunOptions {
  scope: 'all' | { learnerId: string };
  dry_run: boolean;
  run_id?: string;
}

export interface BridgeRunResult {
  run_id: string;
  bridged: number;
  failed: number;
  skipped: number;
  dry_run: boolean;
  per_source: Record<BridgeSourceTable, number>;
  errors: { source_row_id: string; message: string }[];
  started_at: string;
  completed_at: string;
}

export interface BridgeAuditRow {
  id: string;
  source_table: BridgeSourceTable;
  source_row_id: string;
  target_demonstration_id: string | null;
  learner_id: string;
  institution_id: string | null;
  category_key: string | null;
  status: BridgeStatus;
  error_message: string | null;
  run_id: string;
  run_started_at: string | null;
  run_completed_at: string | null;
  dry_run: boolean;
  created_at: string;
  created_by: string | null;
}
