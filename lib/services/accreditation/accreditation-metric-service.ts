// lib/services/accreditation/accreditation-metric-service.ts
// ============================================================================
// Admin CRUD for sh_accreditation_metrics. Separate from AccreditationService
// (reads) because manage permission scope differs.
//
// is_system rows are RLS-writable but CrudRowActions refuses delete. The 64
// seeded rows represent the official rubric from 10 bodies — IQAC coordinators
// can add local/supplementary metrics (is_system=false) but cannot remove
// official rubric entries.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

export type BodyCode =
  | 'NAAC' | 'NIRF' | 'NBA' | 'QS' | 'DCI' | 'PCI'
  | 'INC' | 'NCTE' | 'AICTE' | 'UGC';

export interface AccreditationMetricRow {
  id: string;
  metric_type: BodyCode;
  metric_code: string;
  metric_name: string;
  category: string | null;
  max_score: number | null;
  weightage: number | null;
  calculation_method: string | null;
  data_sources: string[] | null;
  verification_requirements: string | null;
  is_active: boolean | null;
  is_system: boolean;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
  created_at: string;
}

export interface AccreditationMetricInput {
  metric_type: BodyCode;
  metric_code: string;
  metric_name: string;
  category?: string | null;
  max_score?: number | null;
  weightage?: number | null;
  calculation_method?: string | null;
  data_sources?: string[] | null;
  verification_requirements?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  notes?: string | null;
}

export class AccreditationMetricService {
  private static supabase = createClientSupabaseClient();

  static async list(params?: { body_code?: BodyCode; activeOnly?: boolean }): Promise<AccreditationMetricRow[]> {
    let q = (this.supabase as any)
      .from('sh_accreditation_metrics')
      .select('*');
    if (params?.body_code) q = q.eq('metric_type', params.body_code);
    if (params?.activeOnly) q = q.eq('is_active', true);
    q = q.order('metric_type', { ascending: true }).order('metric_code', { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AccreditationMetricRow[];
  }

  static async create(input: AccreditationMetricInput): Promise<AccreditationMetricRow> {
    const { data, error } = await (this.supabase as any)
      .from('sh_accreditation_metrics')
      .insert({
        ...input,
        is_active: true,
        is_system: false, // user-added metrics never mark themselves system
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as AccreditationMetricRow;
  }

  static async update(id: string, patch: Partial<AccreditationMetricInput> & { is_active?: boolean }): Promise<AccreditationMetricRow> {
    const { data, error } = await (this.supabase as any)
      .from('sh_accreditation_metrics')
      .update({ ...patch, is_system: undefined })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as AccreditationMetricRow;
  }

  static async delete(id: string): Promise<void> {
    const { data: existing, error: fetchErr } = await (this.supabase as any)
      .from('sh_accreditation_metrics')
      .select('id, is_system, metric_code, metric_type')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;
    if (existing?.is_system) {
      throw new Error(
        `Official ${existing.metric_type} rubric metric ${existing.metric_code} cannot be deleted. Deactivate it instead.`
      );
    }

    const { error } = await (this.supabase as any)
      .from('sh_accreditation_metrics')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  static async bulkDelete(ids: string[]): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.delete(id);
        success.push(id);
      } catch (err) {
        failed.push({ id, error: (err as Error).message });
      }
    }
    return { success, failed };
  }
}
