// CARRE Coverage Service — data access for the CARRE Coverage Map (Phase 1).
// Spec: team-lead build brief 2026-07-05.
//
// Mirrors carre-audit-service.ts: RPC-only, static class over the browser
// Supabase client (session-scoped, RLS applies). Reads go through
// fn_carre_module_coverage (leadership-gated); the module tag write goes
// through fn_carre_set_audit_module (owner-checked).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { CarreScoreInput } from '@/lib/services/audit/carre-scoring-service';
import type { CarreRpcResult } from '@/lib/services/audit/carre-audit-service';

// ============================================================================
// Types (RPC payload shapes)
// ============================================================================

/** One row of fn_carre_module_coverage — the most-recent CARE/CARRE audit for a
 *  module_key (or a single unassigned audit when module_key is null). */
export interface CarreModuleCoverageRow {
  /** Module slug (lib/navigation/modules.ts) this audit is tagged to, or null. */
  module_key: string | null;
  /** 'CARE' | 'CARRE' (from the frozen snapshot), or null on legacy rows. */
  framework: string | null;
  cycle_id: string;
  name: string;
  /** Re-audit / end date (YYYY-MM-DD), or null. */
  re_audit_date: string | null;
  created_at: string;
  /** Owner's raw scores — fed to carreIndex()/respectFrozen() on the page. */
  owner_scores: CarreScoreInput[];
}

/** One row of fn_carre_module_auto_signals — a Phase-2 evidence-grade signal
 *  derived from live participant data. This lane is ALWAYS rendered separately
 *  and labeled "auto-derived"; it is NEVER merged into the human /100 index.
 *  A module with no evidence-grade data returns NO row (the page shows "—",
 *  never a fabricated score). signal_code is a neutral, non-CARRE code — the
 *  RPC is physically incapable of emitting a Respect (CARRE-RS*) value. */
export interface CarreModuleAutoSignalRow {
  /** Module slug (lib/navigation/modules.ts) this signal belongs to. */
  module_key: string;
  /** Neutral signal code, e.g. 'FEEDBACK_PARTICIPATION'. Never a CARRE-RS* value. */
  signal_code: string;
  /** Human-readable label, e.g. 'Feedback participation'. */
  label: string;
  /** The signal value as a percentage (0–100). */
  value_pct: number;
  /** Numerator (e.g. submissions) — shown for transparency, not a score. */
  numerator: number;
  /** Denominator (participants) — the k>=3 anonymity-floor base. */
  denominator: number;
  /** Context count (e.g. active sessions) so the reader can size the signal. */
  cohort_count: number;
  /** Rolling window the signal was computed over, in days. */
  window_days: number;
  /** Server compute time (ISO). */
  computed_at: string;
}

// ============================================================================
// Service
// ============================================================================

export class CarreCoverageService {
  private static supabase = createClientSupabaseClient();

  /** Coverage across every people-facing module (leadership-gated server-side). */
  static async getCoverage(): Promise<CarreModuleCoverageRow[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_module_coverage');
    if (error) throw error;
    return (data ?? []) as CarreModuleCoverageRow[];
  }

  /** Phase-2 evidence-grade auto-signals per module (leadership-gated
   *  server-side). Returns only modules whose live data honestly supports a
   *  signal above the k>=3 floor — everything else is simply absent. */
  static async getAutoSignals(): Promise<CarreModuleAutoSignalRow[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_module_auto_signals');
    if (error) throw error;
    return (data ?? []) as CarreModuleAutoSignalRow[];
  }

  /** Owner tags a CARRE cycle with the module it audited. */
  static async setAuditModule(input: {
    cycleId: string;
    moduleKey: string;
  }): Promise<CarreRpcResult<{ success: true }>> {
    const { data, error } = await (this.supabase as any).rpc('fn_carre_set_audit_module', {
      p_cycle_id: input.cycleId,
      p_module_key: input.moduleKey,
    });
    if (error) throw error;
    return data;
  }
}
