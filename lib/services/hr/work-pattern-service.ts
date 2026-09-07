/**
 * HR Work Patterns — data access.
 * Created: 2026-09-04.
 *
 * Static class, SupabaseClient first, like ShiftTimingService. Every call
 * destructures `{ error }`: a Supabase failure is a plain object, and a
 * try/catch alone would turn an RLS refusal into an empty list.
 *
 * The pattern's WEEK is not here — it is ordinary hr_shift_timings rows with
 * staff_scope = 'work_pattern', read and written through ShiftTimingService
 * with `workPatternId`. Membership is written ONLY through
 * fn_hr_assign_work_pattern, which also resyncs the open leave balances; the
 * assignments table refuses direct writes from anyone but a super admin.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { HRShiftTiming, IsoDayOfWeek } from '@/types/hr-shift-timings';
import type {
  AssignWorkPatternResult,
  AssignableStaff,
  DeleteWorkPatternResult,
  HRStaffWorkPatternAssignment,
  HRWorkPattern,
  HRWorkPatternInsert,
  HRWorkPatternLeaveEntitlement,
  HRWorkPatternUpdate,
  StaffWorkPatternCurrent,
  WorkPatternEntitlementInput,
  WorkPatternLeaveTypeOption,
  WorkPatternMember,
  WorkPatternSummary,
} from '@/types/hr-work-patterns';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fullName(first: string | null | undefined, last: string | null | undefined): string {
  return `${first ?? ''} ${last ?? ''}`.trim() || '(unnamed)';
}

export interface AssignWorkPatternParams {
  staffIds: string[];
  /** Null = take these staff off whatever pattern they hold. */
  patternId: string | null;
  /** ISO date. The change applies from this day; earlier days keep resolving as before. */
  effectiveFrom: string;
  notes?: string | null;
}

interface StaffLite {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  category_id: string | null;
}

export class WorkPatternService {
  // ─────────────────────────────────────────────────────────────────────────
  // Patterns
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Every pattern of the given institutions, with its week, member count and
   * figures on `asOf`. Takes the caller's accessible-institution ids directly
   * ("All institutions" = all of them) — never a super-admin branch, which
   * would strip a scope='all' secondary role. RLS still gates the rows.
   */
  static async list(
    supabase: SupabaseClient,
    institutionIds: readonly string[],
    asOf?: string,
  ): Promise<WorkPatternSummary[]> {
    const on = asOf ?? today();
    if (institutionIds.length === 0) return [];

    const { data: patterns, error } = await supabase
      .from('hr_work_patterns')
      .select('*, institutions(name)')
      .in('institution_id', institutionIds)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;

    type PatternRow = HRWorkPattern & { institutions: { name: string } | null };
    const rows = ((patterns ?? []) as PatternRow[]).map(({ institutions, ...p }) => ({
      ...p,
      institution_name: institutions?.name ?? null,
    }));
    if (rows.length === 0) return [];
    const ids = rows.map((p) => p.id);

    const [weekRes, memberRes, entRes] = await Promise.all([
      supabase
        .from('hr_shift_timings')
        .select('work_pattern_id, day_of_week, is_working_day, first_half_start, second_half_end, effective_from')
        .eq('staff_scope', 'work_pattern')
        .in('work_pattern_id', ids)
        .eq('is_active', true)
        .lte('effective_from', on)
        .or(`effective_until.is.null,effective_until.gt.${on}`)
        .order('day_of_week', { ascending: true }),
      supabase
        .from('hr_staff_work_pattern_assignments')
        .select('work_pattern_id')
        .in('work_pattern_id', ids)
        .lte('effective_from', on)
        .or(`effective_until.is.null,effective_until.gt.${on}`)
        .limit(1000),
      supabase
        .from('hr_work_pattern_leave_entitlements')
        .select('work_pattern_id, entitled_days, hr_leave_types(leave_type_code, display_order)')
        .in('work_pattern_id', ids),
    ]);
    if (weekRes.error) throw weekRes.error;
    if (memberRes.error) throw memberRes.error;
    if (entRes.error) throw entRes.error;

    type WeekRow = Pick<HRShiftTiming, 'work_pattern_id' | 'day_of_week' | 'is_working_day' | 'first_half_start' | 'second_half_end' | 'effective_from'>;
    const weekByPattern = new Map<string, WeekRow[]>();
    for (const w of (weekRes.data ?? []) as WeekRow[]) {
      if (!w.work_pattern_id) continue;
      const bucket = weekByPattern.get(w.work_pattern_id);
      if (bucket) bucket.push(w);
      else weekByPattern.set(w.work_pattern_id, [w]);
    }

    const memberCount = new Map<string, number>();
    for (const m of (memberRes.data ?? []) as Array<{ work_pattern_id: string }>) {
      memberCount.set(m.work_pattern_id, (memberCount.get(m.work_pattern_id) ?? 0) + 1);
    }

    type EntRow = {
      work_pattern_id: string;
      entitled_days: number | string;
      hr_leave_types: { leave_type_code: string; display_order: number } | null;
    };
    const entByPattern = new Map<string, Array<{ leave_type_code: string; entitled_days: number; order: number }>>();
    for (const e of (entRes.data ?? []) as EntRow[]) {
      const bucket = entByPattern.get(e.work_pattern_id) ?? [];
      bucket.push({
        leave_type_code: e.hr_leave_types?.leave_type_code ?? '?',
        entitled_days: Number(e.entitled_days),
        order: e.hr_leave_types?.display_order ?? 0,
      });
      entByPattern.set(e.work_pattern_id, bucket);
    }

    return rows.map((p) => {
      const week = weekByPattern.get(p.id) ?? [];
      const working = week.filter((w) => w.is_working_day);
      return {
        ...p,
        working_days: working.map((w) => w.day_of_week as IsoDayOfWeek),
        first_half_start: working[0]?.first_half_start ?? null,
        second_half_end: working[0]?.second_half_end ?? null,
        week_effective_from: week[0]?.effective_from ?? null,
        member_count: memberCount.get(p.id) ?? 0,
        entitlements: (entByPattern.get(p.id) ?? [])
          .sort((a, b) => a.order - b.order)
          .map(({ leave_type_code, entitled_days }) => ({ leave_type_code, entitled_days })),
      };
    });
  }

  static async get(supabase: SupabaseClient, id: string): Promise<HRWorkPattern | null> {
    const { data, error } = await supabase
      .from('hr_work_patterns')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as HRWorkPattern | null) ?? null;
  }

  static async create(supabase: SupabaseClient, input: HRWorkPatternInsert): Promise<HRWorkPattern> {
    const { data, error } = await supabase
      .from('hr_work_patterns')
      .insert({
        institution_id: input.institution_id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        sort_order: input.sort_order ?? 0,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as HRWorkPattern;
  }

  static async update(
    supabase: SupabaseClient,
    id: string,
    patch: HRWorkPatternUpdate,
  ): Promise<HRWorkPattern> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name.trim();
    if (patch.description !== undefined) body.description = patch.description?.trim() || null;
    if (patch.sort_order !== undefined) body.sort_order = patch.sort_order;
    if (patch.is_active !== undefined) body.is_active = patch.is_active;

    const { data, error } = await supabase
      .from('hr_work_patterns')
      .update(body)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as HRWorkPattern;
  }

  /**
   * Delete a pattern nobody has ever held (its week rows and figures with it).
   * An RPC because hr_shift_timings' DELETE policy is admin-only; the function
   * refuses — with the reason — when any assignment, live or ended, exists.
   */
  static async delete(supabase: SupabaseClient, id: string): Promise<DeleteWorkPatternResult> {
    const { data, error } = await supabase.rpc('fn_hr_delete_work_pattern', { p_id: id });
    if (error) throw error;
    return data as DeleteWorkPatternResult;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Leave entitlements
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * The day-based leave types a pattern can carry a figure for. Hourly and
   * comp-off types are excluded: their budgets are minutes and credits, and a
   * day figure on them is a lie nothing reads.
   */
  static async listLeaveTypes(
    supabase: SupabaseClient,
    institutionId: string,
  ): Promise<WorkPatternLeaveTypeOption[]> {
    const { data: org, error: orgErr } = await supabase
      .from('hr_organizations')
      .select('id')
      .eq('institution_id', institutionId)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) return [];

    const { data, error } = await supabase
      .from('hr_leave_types')
      .select('id, leave_type_code, leave_type_name, default_entitled_days')
      .eq('hr_organization_id', (org as { id: string }).id)
      .eq('request_category', 'leave')
      .eq('is_active', true)
      .is('superseded_by', null)
      .order('display_order', { ascending: true });
    if (error) throw error;

    return ((data ?? []) as Array<Record<string, unknown>>).map((t) => ({
      id: t.id as string,
      leave_type_code: t.leave_type_code as string,
      leave_type_name: t.leave_type_name as string,
      default_entitled_days: Number(t.default_entitled_days ?? 0),
    }));
  }

  static async getEntitlements(
    supabase: SupabaseClient,
    patternId: string,
  ): Promise<HRWorkPatternLeaveEntitlement[]> {
    const { data, error } = await supabase
      .from('hr_work_pattern_leave_entitlements')
      .select('id, work_pattern_id, leave_type_id, entitled_days, hr_leave_types(leave_type_code, leave_type_name, display_order)')
      .eq('work_pattern_id', patternId);
    if (error) throw error;

    type Row = {
      id: string;
      work_pattern_id: string;
      leave_type_id: string;
      entitled_days: number | string;
      hr_leave_types: { leave_type_code: string; leave_type_name: string; display_order: number } | null;
    };
    return ((data ?? []) as Row[])
      .sort((a, b) => (a.hr_leave_types?.display_order ?? 0) - (b.hr_leave_types?.display_order ?? 0))
      .map((r) => ({
        id: r.id,
        work_pattern_id: r.work_pattern_id,
        leave_type_id: r.leave_type_id,
        entitled_days: Number(r.entitled_days),
        leave_type_code: r.hr_leave_types?.leave_type_code ?? '?',
        leave_type_name: r.hr_leave_types?.leave_type_name ?? '',
      }));
  }

  /**
   * Replace the pattern's figures with `rows`: upsert what is given, delete
   * what is not. A type left blank in the editor is simply absent here, and
   * its people fall back to policy at the next resync or generation.
   *
   * Editing figures does NOT rewrite existing balances — that happens per
   * person when they are (re)assigned. HR wanting a changed figure applied to
   * current members re-assigns them from a date; the change list says what moved.
   */
  static async saveEntitlements(
    supabase: SupabaseClient,
    patternId: string,
    rows: WorkPatternEntitlementInput[],
  ): Promise<void> {
    const keep = rows.filter((r) => Number.isFinite(r.entitled_days) && r.entitled_days >= 0);

    if (keep.length > 0) {
      const { error } = await supabase
        .from('hr_work_pattern_leave_entitlements')
        .upsert(
          keep.map((r) => ({
            work_pattern_id: patternId,
            leave_type_id: r.leave_type_id,
            entitled_days: r.entitled_days,
          })),
          { onConflict: 'work_pattern_id,leave_type_id' },
        );
      if (error) throw error;
    }

    let del = supabase
      .from('hr_work_pattern_leave_entitlements')
      .delete()
      .eq('work_pattern_id', patternId);
    if (keep.length > 0) {
      del = del.not('leave_type_id', 'in', `(${keep.map((r) => r.leave_type_id).join(',')})`);
    }
    const { error: delErr } = await del;
    if (delErr) throw delErr;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Members
  // ─────────────────────────────────────────────────────────────────────────

  private static async staffLite(
    supabase: SupabaseClient,
    staffIds: string[],
  ): Promise<{ byId: Map<string, StaffLite>; categoryName: Map<string, string> }> {
    const byId = new Map<string, StaffLite>();
    const categoryName = new Map<string, string>();
    if (staffIds.length === 0) return { byId, categoryName };

    // v_hr_staff, not staff: employment_categories.included_in_hr gates the
    // whole HR module. Categories come from a second query — PostgREST cannot
    // infer an embed through a view.
    const { data, error } = await supabase
      .from('v_hr_staff')
      .select('id, staff_id, first_name, last_name, designation, category_id')
      .in('id', staffIds)
      .limit(1000);
    if (error) throw error;

    const catIds = new Set<string>();
    for (const s of (data ?? []) as StaffLite[]) {
      byId.set(s.id, s);
      if (s.category_id) catIds.add(s.category_id);
    }

    if (catIds.size > 0) {
      const { data: cats, error: catErr } = await supabase
        .from('employment_categories')
        .select('id, category_name')
        .in('id', Array.from(catIds));
      if (catErr) throw catErr;
      for (const c of (cats ?? []) as Array<{ id: string; category_name: string }>) {
        categoryName.set(c.id, c.category_name);
      }
    }

    return { byId, categoryName };
  }

  /** Who is on a pattern on `asOf` (default today). */
  static async listMembers(
    supabase: SupabaseClient,
    patternId: string,
    asOf?: string,
  ): Promise<WorkPatternMember[]> {
    const on = asOf ?? today();
    const { data, error } = await supabase
      .from('hr_staff_work_pattern_assignments')
      .select('id, staff_id, work_pattern_id, institution_id, effective_from, effective_until, notes')
      .eq('work_pattern_id', patternId)
      .lte('effective_from', on)
      .or(`effective_until.is.null,effective_until.gt.${on}`)
      .limit(1000);
    if (error) throw error;

    const assignments = (data ?? []) as HRStaffWorkPatternAssignment[];
    const { byId, categoryName } = await WorkPatternService.staffLite(
      supabase,
      assignments.map((a) => a.staff_id),
    );

    return assignments
      .map((a) => {
        const s = byId.get(a.staff_id);
        return {
          assignment_id: a.id,
          staff_id: a.staff_id,
          staff_code: s?.staff_id ?? null,
          name: fullName(s?.first_name, s?.last_name),
          designation: s?.designation ?? null,
          category_name: s?.category_id ? (categoryName.get(s.category_id) ?? null) : null,
          effective_from: a.effective_from,
          effective_until: a.effective_until,
          notes: a.notes,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every active HR staff member of an institution, with what they hold today. */
  static async listAssignableStaff(
    supabase: SupabaseClient,
    institutionId: string,
  ): Promise<AssignableStaff[]> {
    const on = today();
    const [staffRes, assignRes] = await Promise.all([
      supabase
        .from('v_hr_staff')
        .select('id, staff_id, first_name, last_name, designation, category_id')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('first_name', { ascending: true })
        .limit(1000),
      supabase
        .from('hr_staff_work_pattern_assignments')
        .select('staff_id, work_pattern_id, hr_work_patterns(name)')
        .eq('institution_id', institutionId)
        .lte('effective_from', on)
        .or(`effective_until.is.null,effective_until.gt.${on}`)
        .limit(1000),
    ]);
    if (staffRes.error) throw staffRes.error;
    if (assignRes.error) throw assignRes.error;

    const staff = (staffRes.data ?? []) as StaffLite[];
    const catIds = Array.from(new Set(staff.map((s) => s.category_id).filter((c): c is string => Boolean(c))));
    const categoryName = new Map<string, string>();
    if (catIds.length > 0) {
      const { data: cats, error: catErr } = await supabase
        .from('employment_categories')
        .select('id, category_name')
        .in('id', catIds);
      if (catErr) throw catErr;
      for (const c of (cats ?? []) as Array<{ id: string; category_name: string }>) {
        categoryName.set(c.id, c.category_name);
      }
    }

    type AssignRow = { staff_id: string; work_pattern_id: string; hr_work_patterns: { name: string } | null };
    const current = new Map<string, { id: string; name: string }>();
    for (const a of (assignRes.data ?? []) as AssignRow[]) {
      current.set(a.staff_id, { id: a.work_pattern_id, name: a.hr_work_patterns?.name ?? '' });
    }

    return staff.map((s) => ({
      staff_id: s.id,
      staff_code: s.staff_id,
      name: fullName(s.first_name, s.last_name),
      designation: s.designation,
      category_name: s.category_id ? (categoryName.get(s.category_id) ?? null) : null,
      current_pattern_id: current.get(s.id)?.id ?? null,
      current_pattern_name: current.get(s.id)?.name ?? null,
    }));
  }

  /**
   * Put staff on a pattern, or take them off (patternId null), from a date.
   * The RPC closes the previous assignment, writes the new one and resyncs the
   * open leave balances, returning what changed per person.
   */
  static async assign(
    supabase: SupabaseClient,
    params: AssignWorkPatternParams,
  ): Promise<AssignWorkPatternResult> {
    const { data, error } = await supabase.rpc('fn_hr_assign_work_pattern', {
      p_staff_ids: params.staffIds,
      p_work_pattern_id: params.patternId,
      p_effective_from: params.effectiveFrom,
      p_notes: params.notes ?? null,
    });
    if (error) throw error;
    return data as AssignWorkPatternResult;
  }

  /** What one staff member holds on `asOf` (default today), or null. */
  static async getForStaff(
    supabase: SupabaseClient,
    staffId: string,
    asOf?: string,
  ): Promise<StaffWorkPatternCurrent | null> {
    const on = asOf ?? today();
    const { data, error } = await supabase
      .from('hr_staff_work_pattern_assignments')
      .select('id, work_pattern_id, effective_from, effective_until, hr_work_patterns(name)')
      .eq('staff_id', staffId)
      .lte('effective_from', on)
      .or(`effective_until.is.null,effective_until.gt.${on}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = data as {
      id: string;
      work_pattern_id: string;
      effective_from: string;
      effective_until: string | null;
      hr_work_patterns: { name: string } | null;
    };
    return {
      assignment_id: row.id,
      work_pattern_id: row.work_pattern_id,
      pattern_name: row.hr_work_patterns?.name ?? '',
      effective_from: row.effective_from,
      effective_until: row.effective_until,
    };
  }
}
