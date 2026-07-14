// Audit Parameter Results Service — Gate ③ capture (per parameter × institution × cycle)
// Reads the snapshot rows written by fn_audit_capture_cycle_results (the audit's
// cross-cycle memory) and triggers an idempotent recompute for one cycle.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AuditParameterResult } from '@/lib/types/audit';

export class AuditParameterResultsService {
  private static supabase = createClientSupabaseClient();

  /**
   * List captured results for a cycle, one row per (parameter × institution) pair.
   * Ordered by parameter_code then institution_id (institution-wide nulls sort last).
   */
  static async listByCycle(cycleId: string): Promise<AuditParameterResult[]> {
    const { data, error } = await (this.supabase as any)
      .from('audit_parameter_results')
      .select('*')
      .eq('audit_cycle_id', cycleId)
      .order('parameter_code', { ascending: true })
      .order('institution_id', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as AuditParameterResult[];
  }

  /**
   * The most recent captured result for one (parameter × institution) pair from a
   * cycle OTHER than `cycleId` — i.e. this college's last-cycle verdict for the
   * parameter about to be filed against. `institutionId` may be null for an
   * institution-wide parameter (matched with IS NULL). Returns null when this pair
   * has never been scored in a prior cycle.
   */
  static async getPriorForPair(
    cycleId: string,
    parameterCode: string,
    institutionId: string | null
  ): Promise<AuditParameterResult | null> {
    let query = (this.supabase as any)
      .from('audit_parameter_results')
      .select('*')
      .eq('parameter_code', parameterCode)
      .neq('audit_cycle_id', cycleId);
    query =
      institutionId === null
        ? query.is('institution_id', null)
        : query.eq('institution_id', institutionId);
    const { data, error } = await query
      .order('computed_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return (data?.[0] ?? null) as AuditParameterResult | null;
  }

  /**
   * Idempotent recompute of one cycle's parameter results. Callable by an
   * authenticated auditor or the service role. Returns the number of rows written.
   */
  static async capture(cycleId: string): Promise<number> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_audit_capture_cycle_results',
      { p_cycle_id: cycleId }
    );
    if (error) throw error;
    return Number(data ?? 0);
  }
}
