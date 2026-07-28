// lib/services/hr/sanctioned-posts-service.ts
// ============================================================================
// CRUD for sanctioned_posts — the sanctioned faculty-posts register (Wave 2A).
// One row per institution × academic year × cadre (department optional).
// fn_hr_refresh_naac_evidence (cron 'hr-naac-evidence') compares filled
// strength against these rows nightly to emit NAAC 2.2.1 evidence — the
// metric is emitted ONLY for institution+AY combinations that have rows here,
// so this register is the switch that lights 2.2.1 up.
//
// Permission scope: reads need 'hr.sanctioned_posts.view', writes need
// 'hr.sanctioned_posts.manage' — both enforced by RLS; the page mirrors them
// for UX. Modeled on collaboration-service.ts (PR #2407).
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

export type SanctionedCadre =
  | 'professor'
  | 'associate_professor'
  | 'assistant_professor'
  | 'other_teaching';

export interface SanctionedPostRow {
  id: string;
  institution_id: string;
  department_id: string | null;
  cadre: SanctionedCadre;
  sanctioned_count: number;
  academic_year: string; // 'AY 2026-27'
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SanctionedPostInput {
  institution_id: string;
  department_id?: string | null;
  cadre: SanctionedCadre;
  sanctioned_count: number;
  academic_year: string;
  notes?: string | null;
}

export const CADRE_LABELS: Record<SanctionedCadre, string> = {
  ['professor']: 'Professor',
  associate_professor: 'Associate Professor',
  assistant_professor: 'Assistant Professor',
  other_teaching: 'Other Teaching',
};

/**
 * Academic-year label for a given date — 'AY 2026-27', June cutoff, matching
 * the DB's fn_accreditation_ay_label so register rows line up with snapshots.
 */
export function ayLabel(d: Date = new Date()): string {
  const y = d.getMonth() + 1 >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `AY ${y}-${String(y + 1).slice(-2)}`;
}

/** Current AY plus one back and one forward — the picker's option set. */
export function ayOptions(): string[] {
  const now = new Date();
  const prev = new Date(now);
  prev.setFullYear(now.getFullYear() - 1);
  const next = new Date(now);
  next.setFullYear(now.getFullYear() + 1);
  return [ayLabel(prev), ayLabel(now), ayLabel(next)];
}

export class SanctionedPostsService {
  private static supabase = createClientSupabaseClient();

  static async list(institutionId: string): Promise<SanctionedPostRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('sanctioned_posts')
      .select('*')
      .eq('institution_id', institutionId)
      .order('academic_year', { ascending: false })
      .order('cadre', { ascending: true });
    if (error) throw error;
    return (data ?? []) as SanctionedPostRow[];
  }

  static async create(input: SanctionedPostInput): Promise<SanctionedPostRow> {
    const { data, error } = await (this.supabase as any)
      .from('sanctioned_posts')
      .insert({
        institution_id: input.institution_id,
        department_id: input.department_id ?? null,
        cadre: input.cadre,
        sanctioned_count: input.sanctioned_count,
        academic_year: input.academic_year,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as SanctionedPostRow;
  }

  static async update(
    id: string,
    input: Partial<SanctionedPostInput>
  ): Promise<SanctionedPostRow> {
    const { data, error } = await (this.supabase as any)
      .from('sanctioned_posts')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as SanctionedPostRow;
  }

  static async delete(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('sanctioned_posts')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  static async bulkDelete(
    ids: string[]
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
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
