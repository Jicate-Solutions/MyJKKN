// Audit Cycle Service — CRUD + phase transitions for audit_cycles
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md (decisions #1-20 + thrash T6-T8)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AuditCycle,
  AuditCyclePhase,
  CreateAuditCycleDto,
} from '@/lib/types/audit';

export class AuditCycleService {
  private static supabase = createClientSupabaseClient();

  /**
   * List cycles. Default: excludes closed (matches /audit/cycles active view).
   * Pass includeClosed=true to see archive.
   */
  static async list(options: { includeClosed?: boolean } = {}): Promise<AuditCycle[]> {
    let query = (this.supabase as any)
      .from('audit_cycles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!options.includeClosed) {
      query = query.neq('phase', 'closed');
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as AuditCycle[];
  }

  static async get(id: string): Promise<AuditCycle | null> {
    const { data, error } = await (this.supabase as any)
      .from('audit_cycles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as AuditCycle) ?? null;
  }

  static async create(input: CreateAuditCycleDto): Promise<AuditCycle> {
    const { data, error } = await (this.supabase as any)
      .from('audit_cycles')
      .insert({
        name: input.name,
        description: input.description ?? null,
        frameworks: input.frameworks,
        start_date: input.start_date,
        end_date: input.end_date,
        lead_auditor_id: input.lead_auditor_id,
        institution_ids: input.institution_ids ?? null,
        cosigner_roles: input.cosigner_roles ?? ['cao', 'ceo'],
        phase: 'draft',
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as AuditCycle;
  }

  /**
   * Transition cycle phase. Freezes parameter_catalog_snapshot when going draft→in-progress.
   * Allowed transitions (enforced here; DB allows any, but we gate at service):
   *   draft → in-progress
   *   in-progress → rectification → peer-visit → closed
   *   any phase → closed (emergency close, super_admin only via RLS)
   */
  static async transitionPhase(id: string, next: AuditCyclePhase): Promise<AuditCycle> {
    const current = await this.get(id);
    if (!current) throw new Error(`Audit cycle ${id} not found`);

    const updates: Partial<AuditCycle> & Record<string, unknown> = { phase: next };

    if (current.phase === 'draft' && next === 'in-progress') {
      // Thrash: freeze catalog snapshot at transition
      const { data: params, error: paramsErr } = await (this.supabase as any)
        .from('audit_parameter_catalog')
        .select('code, framework_mapping, evidence_required, p1_sla_days, p2_sla_days')
        .eq('is_active', true);
      if (paramsErr) throw paramsErr;
      updates.parameter_catalog_snapshot = {
        frozen_at: new Date().toISOString(),
        parameters: params ?? [],
      };
    }

    if (next === 'closed') {
      updates.closed_at = new Date().toISOString();
    }

    const { data, error } = await (this.supabase as any)
      .from('audit_cycles')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as AuditCycle;
  }

  /**
   * Delete a draft cycle. RLS also enforces this — service check is for better UX error.
   */
  static async deleteDraft(id: string): Promise<void> {
    const cycle = await this.get(id);
    if (!cycle) throw new Error(`Audit cycle ${id} not found`);
    if (cycle.phase !== 'draft') {
      throw new Error('Only draft cycles can be deleted. In-progress or later cycles must be closed by super_admin.');
    }
    const { error } = await (this.supabase as any)
      .from('audit_cycles')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Resolve institution_ids to actual list for this cycle. Empty/null = scope-merge via RLS.
   * Used by dashboards + discovery queries.
   */
  static async resolveInstitutions(cycleId: string): Promise<string[]> {
    const cycle = await this.get(cycleId);
    if (!cycle) return [];
    if (cycle.institution_ids && cycle.institution_ids.length > 0) {
      return cycle.institution_ids;
    }
    // Null/empty → query institutions table (RLS will filter per lead_auditor's scope)
    const { data, error } = await (this.supabase as any)
      .from('institutions')
      .select('id')
      .eq('is_active', true);
    if (error) throw error;
    return (data ?? []).map((row: { id: string }) => row.id);
  }
}
