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
