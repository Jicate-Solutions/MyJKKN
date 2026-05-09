/**
 * HR Shifts Service (T1.6 Phase 2a)
 *
 * Static class — SupabaseClient passed as first argument (mirrors
 * RecruitmentJobsService). Methods cover both halves of the surface:
 *
 *   Templates (admin):
 *     listTemplates       — global + institution-specific (institution wins
 *                           on duplicate template_code).
 *     getTemplate         — single record by id
 *     createTemplate      — admin only
 *     updateTemplate      — admin only
 *     deleteTemplate      — hard delete (soft-archival via is_active=false)
 *
 *   Assignments (HR officer):
 *     assignShift         — create assignment for a staff
 *     updateAssignment    — patch existing
 *     deleteAssignment    — hard delete
 *     getMyShiftAssignment — current active assignment for one staff (with
 *                            effective hours computed from template+override)
 *     listAssignmentsForInstitution — HR view, filtered by institution + asOf
 *
 * Spec: specs/hr-module-decomposition-2026-05-09.md (T1.6 Phase 2a)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeEffectiveHours,
  type HRShiftAssignment,
  type HRShiftAssignmentInsert,
  type HRShiftAssignmentUpdate,
  type HRShiftAssignmentWithTemplate,
  type HRShiftTemplate,
  type HRShiftTemplateInsert,
  type HRShiftTemplateUpdate,
  type ShiftAssignmentFilters,
  type ShiftTemplateFilters,
} from '@/types/hr-shifts';

export class ShiftService {
  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------

  /**
   * List templates — combines global + institution-specific. When a template
   * row exists for both `is_global=true` AND a matching `institution_id` with
   * the same `template_code`, the institution-specific row WINS (per Q-lock
   * #4: per-institution overrides take precedence).
   *
   * If `institutionId` is null/undefined, returns globals + all institution
   * rows the caller can read (RLS handles visibility).
   */
  static async listTemplates(
    supabase: SupabaseClient,
    filters: ShiftTemplateFilters = {}
  ): Promise<HRShiftTemplate[]> {
    const activeOnly = filters.activeOnly ?? true;

    let q = supabase
      .from('hr_shift_templates')
      .select('*')
      .order('is_global', { ascending: false })
      .order('template_code', { ascending: true });

    if (activeOnly) q = q.eq('is_active', true);
    if (filters.category) q = q.eq('category', filters.category);
    if (filters.search) {
      q = q.or(
        `template_name.ilike.%${filters.search}%,template_code.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data ?? []) as HRShiftTemplate[];
    if (!filters.institutionId) return rows;

    // Apply institution-override precedence: if both global + institution-
    // specific row share the same template_code, institution wins.
    const institutionId = filters.institutionId;
    const institutionByCode = new Map<string, HRShiftTemplate>();
    for (const r of rows) {
      if (r.institution_id === institutionId) {
        institutionByCode.set(r.template_code, r);
      }
    }
    return rows.filter((r) => {
      // Drop globals that have an institution-specific override.
      if (r.is_global && institutionByCode.has(r.template_code)) return false;
      // Drop institution rows for OTHER institutions when filtering this one.
      if (!r.is_global && r.institution_id !== institutionId) return false;
      return true;
    });
  }

  static async getTemplate(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRShiftTemplate | null> {
    const { data, error } = await supabase
      .from('hr_shift_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as HRShiftTemplate | null;
  }

  static async createTemplate(
    supabase: SupabaseClient,
    payload: HRShiftTemplateInsert
  ): Promise<HRShiftTemplate> {
    const tplCode = (payload.template_code ?? '').trim();
    const tplName = (payload.template_name ?? '').trim();
    if (!tplCode) throw new Error('Template code is required.');
    if (!tplName) throw new Error('Template name is required.');
    if (!payload.start_time) throw new Error('Start time is required.');
    if (!payload.end_time) throw new Error('End time is required.');

    const isGlobal = payload.is_global ?? false;
    if (isGlobal && payload.institution_id) {
      throw new Error('Global templates cannot have institution_id set.');
    }
    if (!isGlobal && !payload.institution_id) {
      throw new Error(
        'Institution-specific templates require institution_id (set is_global=true to share across institutions).'
      );
    }

    const insertPayload: Record<string, unknown> = {
      template_code: tplCode,
      template_name: tplName,
      start_time: payload.start_time,
      end_time: payload.end_time,
      is_global: isGlobal,
      institution_id: isGlobal ? null : payload.institution_id,
      category: payload.category ?? null,
      notes: payload.notes ?? null,
      is_active: payload.is_active ?? true,
    };

    const { data, error } = await supabase
      .from('hr_shift_templates')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as HRShiftTemplate;
  }

  static async updateTemplate(
    supabase: SupabaseClient,
    id: string,
    patch: HRShiftTemplateUpdate
  ): Promise<HRShiftTemplate> {
    if (patch.is_global === true && patch.institution_id) {
      throw new Error('Global templates cannot have institution_id set.');
    }
    if (patch.is_global === false && patch.institution_id === null) {
      throw new Error(
        'Institution-specific templates require institution_id (set is_global=true to share across institutions).'
      );
    }

    const { data, error } = await supabase
      .from('hr_shift_templates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRShiftTemplate;
  }

  static async deleteTemplate(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('hr_shift_templates')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // -------------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------------

  static async assignShift(
    supabase: SupabaseClient,
    payload: HRShiftAssignmentInsert
  ): Promise<HRShiftAssignment> {
    if (!payload.staff_id) throw new Error('staff_id is required.');
    if (!payload.effective_from) {
      throw new Error('effective_from is required.');
    }
    const hasTemplate = !!payload.template_id;
    const hasFreeform = !!payload.start_time_override && !!payload.end_time_override;
    if (!hasTemplate && !hasFreeform) {
      throw new Error(
        'Either template_id or both start_time_override + end_time_override must be provided.'
      );
    }
    const rotationWeeks = payload.rotation_weeks ?? 1;
    if (rotationWeeks < 1 || rotationWeeks > 4) {
      throw new Error('rotation_weeks must be between 1 and 4.');
    }
    if (
      payload.effective_until &&
      payload.effective_until < payload.effective_from
    ) {
      throw new Error('effective_until cannot precede effective_from.');
    }

    const insertPayload: Record<string, unknown> = {
      staff_id: payload.staff_id,
      template_id: payload.template_id ?? null,
      start_time_override: payload.start_time_override ?? null,
      end_time_override: payload.end_time_override ?? null,
      effective_from: payload.effective_from,
      effective_until: payload.effective_until ?? null,
      rotation_weeks: rotationWeeks,
      rotation_pattern: payload.rotation_pattern ?? null,
      notes: payload.notes ?? null,
    };

    const { data, error } = await supabase
      .from('hr_shift_assignments')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as HRShiftAssignment;
  }

  static async updateAssignment(
    supabase: SupabaseClient,
    id: string,
    patch: HRShiftAssignmentUpdate
  ): Promise<HRShiftAssignment> {
    if (patch.rotation_weeks != null && (patch.rotation_weeks < 1 || patch.rotation_weeks > 4)) {
      throw new Error('rotation_weeks must be between 1 and 4.');
    }
    if (
      patch.effective_until != null &&
      patch.effective_from != null &&
      patch.effective_until < patch.effective_from
    ) {
      throw new Error('effective_until cannot precede effective_from.');
    }

    const { data, error } = await supabase
      .from('hr_shift_assignments')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRShiftAssignment;
  }

  static async deleteAssignment(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('hr_shift_assignments')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Active assignment for a single staff member, with effective hours
   * computed from template + override. Returns null if no current assignment.
   *
   * "Active" = effective_from <= today AND (effective_until IS NULL OR
   * effective_until >= today). Most-recently-effective wins.
   */
  static async getMyShiftAssignment(
    supabase: SupabaseClient,
    staffId: string
  ): Promise<HRShiftAssignmentWithTemplate | null> {
    const today = new Date().toISOString().slice(0, 10);

    const { data: assignments, error } = await supabase
      .from('hr_shift_assignments')
      .select('*')
      .eq('staff_id', staffId)
      .lte('effective_from', today)
      .or(`effective_until.is.null,effective_until.gte.${today}`)
      .order('effective_from', { ascending: false })
      .limit(1);
    if (error) throw error;

    const a = (assignments ?? [])[0] as HRShiftAssignment | undefined;
    if (!a) return null;

    let template: HRShiftTemplate | null = null;
    if (a.template_id) {
      template = await this.getTemplate(supabase, a.template_id);
    }
    const effective = computeEffectiveHours(a, template) ?? {
      start_time: a.start_time_override ?? '00:00:00',
      end_time: a.end_time_override ?? '00:00:00',
      source: 'override' as const,
    };

    return { ...a, template, effective };
  }

  /**
   * HR-level listing of assignments for an institution (or all when
   * institutionId is null). Joins the template and (best-effort) the staff
   * display fields. Bounded at pageSize to keep the LookupTable responsive.
   */
  static async listAssignmentsForInstitution(
    supabase: SupabaseClient,
    filters: ShiftAssignmentFilters = {}
  ): Promise<HRShiftAssignmentWithTemplate[]> {
    const asOf = filters.asOf ?? new Date().toISOString().slice(0, 10);

    let q = supabase
      .from('hr_shift_assignments')
      .select('*')
      .order('effective_from', { ascending: false })
      .limit(500);

    if (filters.staffId) q = q.eq('staff_id', filters.staffId);

    // Filter to assignments active on the asOf date.
    q = q.lte('effective_from', asOf).or(
      `effective_until.is.null,effective_until.gte.${asOf}`
    );

    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as HRShiftAssignment[];
    if (rows.length === 0) return [];

    // Resolve unique template ids in one round-trip.
    const tplIds = Array.from(
      new Set(rows.map((r) => r.template_id).filter((x): x is string => !!x))
    );
    let templates: Record<string, HRShiftTemplate> = {};
    if (tplIds.length > 0) {
      const { data: tplRows, error: tplErr } = await supabase
        .from('hr_shift_templates')
        .select('*')
        .in('id', tplIds);
      if (tplErr) throw tplErr;
      for (const t of (tplRows ?? []) as HRShiftTemplate[]) {
        templates[t.id] = t;
      }
    }

    // Best-effort staff display lookup. RLS may prevent joining staff for
    // some callers; we fall through silently to keep the assignment view
    // functional even when staff display is unavailable.
    const staffIds = Array.from(new Set(rows.map((r) => r.staff_id)));
    let staffById: Record<string, { name: string | null; staff_no: string | null; institution_id: string | null }> = {};
    if (staffIds.length > 0) {
      // staff.staff_id is the human-readable staff number (text); staff.id is the uuid PK.
      const { data: staffRows } = await supabase
        .from('staff')
        .select('id, first_name, last_name, staff_id, institution_id')
        .in('id', staffIds);
      for (const s of (staffRows ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        staff_id: string | null;
        institution_id: string | null;
      }>) {
        const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
        staffById[s.id] = {
          name: fullName || null,
          staff_no: s.staff_id,
          institution_id: s.institution_id,
        };
      }
    }

    // Optional institution filter — assignments are staff-scoped, so we
    // filter by staff.institution_id (most reliable) when set.
    const institutionId = filters.institutionId ?? null;

    const enriched: HRShiftAssignmentWithTemplate[] = [];
    for (const r of rows) {
      const tpl = r.template_id ? templates[r.template_id] ?? null : null;
      if (institutionId) {
        const staffInst = staffById[r.staff_id]?.institution_id ?? null;
        if (staffInst !== institutionId) {
          continue; // skip mismatched institution
        }
      }
      const eff = computeEffectiveHours(r, tpl) ?? {
        start_time: r.start_time_override ?? '00:00:00',
        end_time: r.end_time_override ?? '00:00:00',
        source: 'override' as const,
      };
      const staff = staffById[r.staff_id];
      enriched.push({
        ...r,
        template: tpl,
        effective: eff,
        staff_name: staff?.name ?? null,
        staff_no: staff?.staff_no ?? null,
      });
    }
    return enriched;
  }
}
