// Audit Adaptations Service — Gate ④ (adapt).
// The audit sharpening itself: reads audit_parameter_results history + findings
// and surfaces recommendations (escalate a recurring gap, automate a hand-found
// check, sample a long-clean parameter less, tune a noisy check). Recommend-only;
// applying — which can change a parameter's rigor — is human-gated via the RPCs.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AuditAdaptation } from '@/lib/types/audit';

export class AuditAdaptationsService {
  private static supabase = createClientSupabaseClient();

  /**
   * List this cycle's recommendations. Ordered proposed-first, then by severity
   * (high → low), so the act-on-now items sit at the top.
   */
  static async listByCycle(cycleId: string): Promise<AuditAdaptation[]> {
    const { data, error } = await (this.supabase as any)
      .from('audit_adaptations')
      .select('*')
      .eq('audit_cycle_id', cycleId);
    if (error) throw error;
    const rows = (data ?? []) as AuditAdaptation[];
    const statusRank: Record<string, number> = { proposed: 0, applied: 1, dismissed: 2 };
    const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return rows.sort(
      (a, b) =>
        (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) ||
        (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) ||
        a.rule.localeCompare(b.rule) ||
        a.parameter_code.localeCompare(b.parameter_code)
    );
  }

  /**
   * (Re)compute recommendations for one cycle from its history. Idempotent —
   * re-proposes fresh but never disturbs a human-applied/dismissed row. Returns
   * the number of open (proposed) recommendations.
   */
  static async compute(cycleId: string): Promise<number> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_audit_compute_adaptations',
      { p_cycle_id: cycleId }
    );
    if (error) throw error;
    return Number(data ?? 0);
  }

  /**
   * Apply a recommendation. For escalate/reduce_frequency this mutates the
   * parameter catalog (owner, SLA, or check frequency); for the advisory rules
   * it simply acknowledges. Requires audit.parameter.manage.
   */
  static async apply(
    id: string,
    note?: string
  ): Promise<{ id: string; status: string; kind?: string }> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_audit_apply_adaptation',
      { p_id: id, p_note: note ?? null }
    );
    if (error) throw error;
    return data as { id: string; status: string; kind?: string };
  }

  /** Dismiss a recommendation (no catalog change). Requires audit.parameter.manage. */
  static async dismiss(
    id: string,
    note?: string
  ): Promise<{ id: string; status: string }> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_audit_dismiss_adaptation',
      { p_id: id, p_note: note ?? null }
    );
    if (error) throw error;
    return data as { id: string; status: string };
  }
}
