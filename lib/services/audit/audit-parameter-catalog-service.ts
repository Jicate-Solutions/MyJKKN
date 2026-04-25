// Audit Parameter Catalog Service — read + institution-override merge + CRUD
// Thrash T2: override = same code + non-null institution_id.
// System rows (institution_id NULL, is_system=true) protected via RLS.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AuditParameterCatalogRow,
  FrameworkMapping,
} from '@/lib/types/audit';

export class AuditParameterCatalogService {
  private static supabase = createClientSupabaseClient();

  /**
   * List parameters resolved for an institution.
   * institution-specific override row wins over system default for the same code.
   */
  static async listForInstitution(institutionId: string): Promise<AuditParameterCatalogRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('audit_parameter_catalog')
      .select('*')
      .or(`institution_id.eq.${institutionId},institution_id.is.null`)
      .eq('is_active', true)
      .order('code', { ascending: true });
    if (error) throw error;

    // Merge: for each code, prefer institution-specific row over system row
    const byCode = new Map<string, AuditParameterCatalogRow>();
    for (const row of (data ?? []) as AuditParameterCatalogRow[]) {
      const existing = byCode.get(row.code);
      if (!existing) {
        byCode.set(row.code, row);
        continue;
      }
      // Institution-specific (non-null institution_id) wins
      if (row.institution_id && !existing.institution_id) {
        byCode.set(row.code, row);
      }
    }
    return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  /**
   * List all system default parameters (no institution overrides).
   */
  static async listSystem(): Promise<AuditParameterCatalogRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('audit_parameter_catalog')
      .select('*')
      .is('institution_id', null)
      .eq('is_system', true)
      .eq('is_active', true)
      .order('code', { ascending: true });
    if (error) throw error;
    return (data ?? []) as AuditParameterCatalogRow[];
  }

  /**
   * Get a specific parameter. Institution override wins over system default.
   */
  static async getResolved(
    code: string,
    institutionId: string
  ): Promise<AuditParameterCatalogRow | null> {
    const { data, error } = await (this.supabase as any)
      .from('audit_parameter_catalog')
      .select('*')
      .eq('code', code)
      .or(`institution_id.eq.${institutionId},institution_id.is.null`)
      .order('institution_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as AuditParameterCatalogRow) ?? null;
  }

  /**
   * Create an institution override row. Cannot override system rows with is_system=true
   * (RLS enforces this + DB CHECK constraint).
   */
  static async upsertOverride(
    code: string,
    institutionId: string,
    updates: Partial<
      Pick<
        AuditParameterCatalogRow,
        'name' | 'description' | 'framework_mapping' | 'default_owner_role' | 'escalation_role'
        | 'p1_sla_days' | 'p2_sla_days' | 'evidence_required'
      >
    >,
    opts: { userId: string }
  ): Promise<AuditParameterCatalogRow> {
    // Start from system default, merge overrides
    const system = await this.getResolved(code, institutionId);
    if (!system) throw new Error(`System parameter ${code} not found`);

    const payload = {
      code,
      name: updates.name ?? system.name,
      parameter_group: system.parameter_group,
      description: updates.description ?? system.description,
      framework_mapping: updates.framework_mapping ?? system.framework_mapping,
      default_owner_role: updates.default_owner_role ?? system.default_owner_role,
      escalation_role: updates.escalation_role ?? system.escalation_role,
      p1_sla_days: updates.p1_sla_days ?? system.p1_sla_days,
      p2_sla_days: updates.p2_sla_days ?? system.p2_sla_days,
      evidence_required: updates.evidence_required ?? system.evidence_required,
      institution_id: institutionId,
      is_system: false,
      is_active: true,
      created_by: opts.userId,
    };

    const { data, error } = await (this.supabase as any)
      .from('audit_parameter_catalog')
      .upsert(payload, { onConflict: 'code,institution_id' })
      .select('*')
      .single();
    if (error) throw error;
    return data as AuditParameterCatalogRow;
  }

  /**
   * Delete an institution override. System rows protected by RLS.
   */
  static async deleteOverride(code: string, institutionId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('audit_parameter_catalog')
      .delete()
      .eq('code', code)
      .eq('institution_id', institutionId);
    if (error) throw error;
  }

  /**
   * Count parameters per framework body (for coverage dashboard tiles).
   */
  static async countByFramework(): Promise<Record<string, number>> {
    const rows = await this.listSystem();
    const counts: Record<string, number> = {};
    for (const row of rows) {
      for (const body of Object.keys(row.framework_mapping as FrameworkMapping)) {
        const metric = (row.framework_mapping as Record<string, string>)[body];
        if (metric && metric !== '-') {
          counts[body.toUpperCase()] = (counts[body.toUpperCase()] ?? 0) + 1;
        }
      }
    }
    return counts;
  }
}
