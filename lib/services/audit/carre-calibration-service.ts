// CARRE Calibration Mirror Service — predict-then-see (culture mechanism v1,
// Director interview 2026-07-25; migrations 20260725123000 + 20260725124500).
//
// Team members PREDICT the sealed participant medians BEFORE seeing them; the
// k≥3 'own'-lane actual is revealed only for items they committed on, and a
// prediction freezes once its actual is revealed. The reward is CALIBRATION,
// not level — predicting accurately that participants feel unheard beats
// claiming they feel heard, which makes coercing high sealed scores pointless.
//
// Hard data-gates mechanize EXISTING doctrine: CARRE-A3 ("fast feedback
// loops") cannot be predicted at 3+ while the caller's own OD/leave approval
// queue holds waiting people (the same queue their work-signals card shows).
//
// RPC-only: predictors may sit below audit leadership RLS, and the k-floor
// must never depend on client-side discipline.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { CarreSnapshotParameter } from '@/lib/services/audit/carre-audit-service';
import type { CarreLaneDenial, CarreLaneResult } from '@/lib/services/audit/carre-evidence-service';

// ============================================================================
// Types (RPC payload shapes)
// ============================================================================

export interface CarrePredictContext {
  success: true;
  cycle: {
    id: string;
    name: string;
    audience: string | null;
    phase: string;
    participant_scoring_open: boolean;
  };
  setting_code: string | null;
  parameters: CarreSnapshotParameter[];
}

export interface CarreMirrorRow {
  cycle_id: string;
  cycle_name: string;
  parameter_code: string;
  predicted_median: number;
  predicted_at: string;
  /** null until the k≥3 'own'-lane actual exists — the reveal. */
  actual_median: number | null;
  scorers: number;
  abs_error: number | null;
}

export type { CarreLaneDenial, CarreLaneResult };

// ============================================================================
// Service
// ============================================================================

export class CarreCalibrationService {
  private static supabase = createClientSupabaseClient();

  /** Cycle + frozen catalog for the prediction page (team members only). */
  static async getPredictContext(
    cycleId: string,
  ): Promise<CarreLaneResult<CarrePredictContext>> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_predict_context', {
      p_cycle_id: cycleId,
    });
    if (error) throw error;
    return data;
  }

  /** Upsert the caller's prediction (frozen once revealed; A3 data-gated). */
  static async predictMedian(input: {
    cycleId: string;
    parameterCode: string;
    predicted: number;
  }): Promise<CarreLaneResult<{ success: true }>> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_predict_median', {
      p_cycle_id: input.cycleId,
      p_parameter_code: input.parameterCode,
      p_predicted: input.predicted,
    });
    if (error) throw error;
    return data;
  }

  /** The caller's mirror: own predictions + k≥3 reveals + errors. */
  static async getMirror(cycleId?: string): Promise<CarreMirrorRow[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_calibration_mirror', {
      p_cycle_id: cycleId ?? null,
    });
    if (error) throw error;
    return (data ?? []) as CarreMirrorRow[];
  }
}
