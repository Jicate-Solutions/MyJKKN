// Audit Cycle Service — CRUD + phase transitions for audit_cycles
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md (decisions #1-20 + thrash T6-T8)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { AuditParameterResultsService } from './audit-parameter-results-service';
import { filterParametersByFrameworks } from './framework-filter';
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

  /**
   * Idempotently ensure the single standing "Whole Institution — Ongoing" audit
   * exists (creating it if missing) and return its id. Backs the cycles list +
   * dashboard self-heal so the org-wide checks (loop health, exam integrity)
   * always have a home. Wraps public.fn_ensure_standing_institution_audit().
   */
  static async ensureStandingAudit(): Promise<string> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_ensure_standing_institution_audit',
    );
    if (error) throw error;
    return data as string;
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
        module_key: input.module_key ?? null,
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
      // Capture the display + grouping columns too — the parameter sheet and
      // attestations grid group by `parameter_group` and render `name`/`default_owner_role`.
      // Omitting them froze a snapshot the UI couldn't group, so every group rendered empty.
      const { data: params, error: paramsErr } = await (this.supabase as any)
        .from('audit_parameter_catalog')
        .select(
          'code, name, parameter_group, default_owner_role, framework_mapping, evidence_required, p1_sla_days, p2_sla_days'
        )
        .eq('is_active', true);
      if (paramsErr) throw paramsErr;

      // Freeze only what this cycle actually audits. This filter was missing:
      // the wizard previewed a framework-filtered count while the freeze took
      // every active row, so the number shown was never the number frozen
      // (Q4 FY26-27 previewed 38, froze 63). Same predicate as the preview —
      // see framework-filter.ts. Filtered in JS, not PostgREST, because the
      // match is case-insensitive over jsonb KEYS, which `.select()` can't do.
      const relevant = filterParametersByFrameworks(
        (params ?? []) as Array<{ framework_mapping?: Record<string, string> | null }>,
        current.frameworks ?? []
      );
      updates.parameter_catalog_snapshot = {
        frozen_at: new Date().toISOString(),
        parameters: relevant,
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

    // Gate ③ capture — snapshot per-parameter results as the cycle closes, so the
    // audit keeps cross-cycle memory (recurrence, deltas). Best-effort: a capture
    // failure must NEVER fail the close; results are recomputable via
    // fn_audit_capture_cycle_results (AuditParameterResultsService.capture is idempotent).
    if (next === 'closed') {
      try {
        await AuditParameterResultsService.capture(id);
      } catch (captureErr) {
        console.error('[audit/cycles] Gate ③ result capture failed on close:', captureErr);
      }
    }

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
