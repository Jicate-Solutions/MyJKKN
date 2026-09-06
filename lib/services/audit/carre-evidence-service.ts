// CARRE Evidence & Sealed-Lane Service — data access for the two 2026-07-25
// additions to the CARRE flow:
//
//   1. LIVE ITEM EVIDENCE (fn_carre_item_evidence, migrations 20260725…/110000):
//      per-item machine evidence + DOCTRINE CAPS for the score sheet. Caps
//      mechanize EXISTING doctrine only (zero-measured-activity → cap 2); the
//      UI enforces them via override-with-logged-reason — the score-write RPCs
//      are untouched and the human number stays sovereign. RS items always
//      return "human-only" (Respect is never machine-scored).
//
//   2. SEALED PARTICIPANT LANE (fn_carre_participant_* — migration
//      20260725101500 + context RPC 20260725114500): learners submit sealed
//      0–4 scores; identity is sealed to the Director (super_admin RLS);
//      leadership reads k≥3-floored aggregates ONLY. The context RPC is the
//      learner's read path (cycle name + frozen catalog + own submissions).
//
// RPC-only for the same reasons as carre-audit-service.ts: the audit module's
// staff RLS must not apply to learners, and the seal must never depend on
// client-side discipline.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { CarreSnapshotParameter } from '@/lib/services/audit/carre-audit-service';

// ============================================================================
// Types (RPC payload shapes)
// ============================================================================

export interface CarreItemEvidence {
  parameter_code: string;
  /** Human-readable live evidence line for the scorer. */
  evidence: string;
  /** Doctrine cap (e.g. 2 when the measured stream is empty); null = no cap. */
  cap: number | null;
  /** Raw numbers behind the evidence line. */
  basis: Record<string, unknown>;
}

export interface CarreParticipantRollupRow {
  parameter_code: string;
  lane: 'own' | 'observer';
  scorers: number;
  median_score: number;
}

export interface CarreParticipantContext {
  success: true;
  cycle: { id: string; name: string; audience: string | null; phase: string };
  setting_code: string | null;
  parameters: CarreSnapshotParameter[];
  my_scores: Array<{
    parameter_code: string;
    lane: 'own' | 'observer';
    score: number;
    evidence_note: string | null;
  }>;
}

export interface CarreLaneDenial {
  success: false;
  reason: string;
}

export type CarreLaneResult<T> = T | CarreLaneDenial;

// ============================================================================
// Service
// ============================================================================

export class CarreEvidenceService {
  private static supabase = createClientSupabaseClient();

  /**
   * Live evidence + doctrine caps for every auto-evidenced item of a CARRE
   * cycle. RPC-gated to the cycle's lead auditor + audit leadership; returns
   * an empty list for everyone else (never throws a permission error).
   */
  static async getItemEvidence(cycleId: string): Promise<CarreItemEvidence[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_item_evidence', {
      p_cycle_id: cycleId,
    });
    if (error) throw error;
    return (data ?? []) as CarreItemEvidence[];
  }

  /**
   * k≥3-floored sealed participant aggregates (leadership read). Groups with
   * fewer than 3 scorers return nothing — a lone voice can never be isolated.
   */
  static async getParticipantRollup(cycleId: string): Promise<CarreParticipantRollupRow[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_participant_rollup', {
      p_cycle_id: cycleId,
    });
    if (error) throw error;
    return (data ?? []) as CarreParticipantRollupRow[];
  }

  /** Learner read path for the sealed scoring door (cycle + catalog + own rows). */
  static async getParticipantContext(
    cycleId: string,
  ): Promise<CarreLaneResult<CarreParticipantContext>> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_participant_context', {
      p_cycle_id: cycleId,
    });
    if (error) throw error;
    return data;
  }

  /** Learner sealed score submit (upsert own row; lane = 'own' | 'observer'). */
  static async submitParticipantScore(input: {
    cycleId: string;
    parameterCode: string;
    score: number;
    note?: string | null;
    lane: 'own' | 'observer';
  }): Promise<CarreLaneResult<{ success: true }>> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_participant_score', {
      p_cycle_id: input.cycleId,
      p_parameter_code: input.parameterCode,
      p_score: input.score,
      p_note: input.note ?? null,
      p_lane: input.lane,
    });
    if (error) throw error;
    return data;
  }
}
