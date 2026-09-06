/**
 * HR Shift Timings service.
 * Created: 2026-08-06.
 * Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
 *
 * Shape follows the HR module convention (static class, SupabaseClient as the
 * first argument) rather than BaseService, which no HR service extends. The two
 * guarantees BaseService would have given are enforced by hand here:
 *
 *   1. Institution filtering happens in SQL, never in JS. The predecessor
 *      module did the opposite — ShiftService.listAssignmentsForInstitution
 *      pulled .limit(500) then filtered in JS, which silently drops rows once
 *      the table is populated.
 *   2. Every call destructures { error } and throws. Supabase errors are plain
 *      objects, not Error instances, and an unchecked RLS denial is
 *      indistinguishable from "no data".
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  HRShiftTiming,
  IsoDayOfWeek,
  ResolvedShiftTiming,
  ShiftApplicableGender,
  ShiftStaffScope,
  ShiftTimingCoverageRow,
} from '@/types/hr-shift-timings';
import { toPgTime, validateTimingRow } from '@/types/hr-shift-timings';

/** One weekday as submitted from the grid editor. */
export interface WeekDayInput {
  day_of_week: IsoDayOfWeek;
  is_working_day: boolean;
  first_half_start?: string | null;
  first_half_end?: string | null;
  second_half_start?: string | null;
  second_half_end?: string | null;
  grace_minutes?: number;
  second_saturday_holiday?: boolean;
}

export interface SaveWeekParams {
  institutionId: string;
  staffScope: ShiftStaffScope;
  employmentCategoryId?: string | null;
  /** Required with staffScope 'work_pattern'; the RPC refuses any other pairing. */
  workPatternId?: string | null;
  /** Defaults to 'all'. A Female save never touches the Everyone week. */
  applicableGender?: ShiftApplicableGender;
  /** ISO date. Today (or earlier) corrects in place; a future date supersedes. */
  effectiveFrom: string;
  days: WeekDayInput[];
}

/** One override in force, as the Override tab lists it. */
export interface ShiftTimingOverrideSummary {
  staff_scope: ShiftStaffScope;
  employment_category_id: string | null;
  applicable_gender: ShiftApplicableGender;
  /** From the first working day of the week — see listOverrides. */
  first_half_start: string | null;
  second_half_end: string | null;
  working_days: IsoDayOfWeek[];
  effective_from: string;
}

export interface EndOverrideParams {
  institutionId: string;
  staffScope: ShiftStaffScope;
  employmentCategoryId?: string | null;
  applicableGender: ShiftApplicableGender;
  /** Defaults to today. Exclusive: the override stops applying ON this date. */
  on?: string;
}

export interface GetWeekParams {
  institutionId: string;
  staffScope: ShiftStaffScope;
  employmentCategoryId?: string | null;
  /** Required with staffScope 'work_pattern'. Reaches the key through `params`. */
  workPatternId?: string | null;
  /** Defaults to 'all'. Must reach the React Query key — see ShiftTimingFilters. */
  applicableGender?: ShiftApplicableGender;
  /** ISO date. Defaults to today. */
  asOf?: string;
}

export interface EmploymentCategoryOption {
  id: string;
  category_name: string;
  is_teaching: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ShiftWindow {
  timing_id: string;
  is_working_day: boolean;
  first_half_start: string | null;
  first_half_end: string | null;
  second_half_start: string | null;
  second_half_end: string | null;
  grace_minutes: number | null;
  matched_by: string | null;
}

export class ShiftTimingService {
  /**
   * The window in force for one staff member on one date.
   *
   * fn_shift_window, not fn_resolve_shift_timing: the latter refuses anyone
   * without is_super_admin / is_admin / hr.shift_timings.view /
   * hr.attendance.override, and a member of staff filling in a permission form
   * holds none of them. The open variant returns a working-hours calendar and
   * nothing about the person.
   */
  static async window(
    supabase: SupabaseClient,
    staffId: string,
    date: string,
  ): Promise<ShiftWindow | null> {
    const { data, error } = await supabase.rpc('fn_shift_window', {
      p_staff_id: staffId,
      p_date: date,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row ?? null) as ShiftWindow | null;
  }

  /**
   * The week in force for one (institution, scope, category) on a date.
   * Returns 0..7 rows — a scope that has never been configured returns [].
   */
  static async getWeek(
    supabase: SupabaseClient,
    params: GetWeekParams,
  ): Promise<HRShiftTiming[]> {
    const asOf = params.asOf ?? today();

    let query = supabase
      .from('hr_shift_timings')
      .select('*')
      .eq('institution_id', params.institutionId)
      .eq('staff_scope', params.staffScope)
      // Explicit, never omitted: without it the Female week and the Everyone
      // week come back interleaved and hydrate() — which keys by day_of_week —
      // would keep whichever of the two arrived last for each day.
      .eq('applicable_gender', params.applicableGender ?? 'all')
      .eq('is_active', true)
      .lte('effective_from', asOf)
      .or(`effective_until.is.null,effective_until.gt.${asOf}`)
      .order('day_of_week', { ascending: true });

    // `.is('col', null)` and `.eq` are different operators — a null category is
    // the institution-wide default row, not a missing filter.
    query = params.employmentCategoryId
      ? query.eq('employment_category_id', params.employmentCategoryId)
      : query.is('employment_category_id', null);
    // Same reasoning for the pattern: a null is the non-pattern rows, not "any".
    query = params.workPatternId
      ? query.eq('work_pattern_id', params.workPatternId)
      : query.is('work_pattern_id', null);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HRShiftTiming[];
  }

  /**
   * Which category overrides exist for an institution on a date.
   * Drives the "category override" picker so it only lists what is configured.
   */
  static async listCategoryOverrides(
    supabase: SupabaseClient,
    institutionId: string,
    asOf?: string,
  ): Promise<string[]> {
    const on = asOf ?? today();
    const { data, error } = await supabase
      .from('hr_shift_timings')
      .select('employment_category_id')
      .eq('institution_id', institutionId)
      .eq('staff_scope', 'category')
      .eq('is_active', true)
      .lte('effective_from', on)
      .or(`effective_until.is.null,effective_until.gt.${on}`)
      .not('employment_category_id', 'is', null);

    if (error) throw error;
    const ids = (data ?? [])
      .map((r: { employment_category_id: string | null }) => r.employment_category_id)
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(ids));
  }

  /**
   * EVERY override in force at an institution, one entry per
   * (staff_scope, category, gender).
   *
   * The tab could always CREATE any number of these — the current-row unique
   * index is per (institution, scope, category, gender, weekday), so they
   * coexist happily. What was missing was any way to see them, so an operator
   * had no way to find an override again or tell a new combination from one
   * they configured last month. That is what made the tab feel single-override.
   *
   * Grouped in TypeScript rather than SQL: this is at most a few dozen rows for
   * one institution, and a GROUP BY would still need the day-by-day detail to
   * summarise the week.
   */
  static async listOverrides(
    supabase: SupabaseClient,
    institutionId: string,
    asOf?: string,
  ): Promise<ShiftTimingOverrideSummary[]> {
    const on = asOf ?? today();
    const { data, error } = await supabase
      .from('hr_shift_timings')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .lte('effective_from', on)
      .or(`effective_until.is.null,effective_until.gt.${on}`)
      .order('day_of_week', { ascending: true });

    if (error) throw error;

    const byKey = new Map<string, HRShiftTiming[]>();
    for (const row of (data ?? []) as HRShiftTiming[]) {
      // The GENERAL weeks are not overrides — they are what an override
      // overrides. Excluded here so the list only shows things that can be
      // added and removed. A work pattern's week is not one either: it is
      // managed on its own page and is exclusive for its members.
      if (row.staff_scope === 'work_pattern') continue;
      const isGeneral = row.staff_scope !== 'category' && row.applicable_gender === 'all';
      if (isGeneral) continue;
      const key = `${row.staff_scope}|${row.employment_category_id ?? ''}|${row.applicable_gender}`;
      const bucket = byKey.get(key);
      if (bucket) bucket.push(row);
      else byKey.set(key, [row]);
    }

    return [...byKey.values()].map((rows) => {
      const first = rows[0];
      const working = rows.filter((r) => r.is_working_day);
      return {
        staff_scope: first.staff_scope,
        employment_category_id: first.employment_category_id,
        applicable_gender: first.applicable_gender,
        // The window shown in the list. Taken from the first working day rather
        // than asserted to be uniform: a week may legitimately differ on
        // Saturday, and `working_days` below is what tells the operator that.
        first_half_start: working[0]?.first_half_start ?? null,
        second_half_end: working[0]?.second_half_end ?? null,
        working_days: working.map((r) => r.day_of_week),
        effective_from: first.effective_from,
      };
    });
  }

  /**
   * Retire one override from `on` onward via fn_end_shift_timing_override.
   *
   * An RPC, not a client-side update: the function picks between closing a row
   * that had a life and deactivating one that never applied, and getting that
   * backwards violates hr_shift_timings_effective_chk. It also refuses to touch
   * a general week, which a hand-written filter could reach by accident.
   */
  static async endOverride(
    supabase: SupabaseClient,
    params: EndOverrideParams,
  ): Promise<number> {
    const { data, error } = await supabase.rpc('fn_end_shift_timing_override', {
      p_institution_id: params.institutionId,
      p_staff_scope: params.staffScope,
      p_employment_category_id: params.employmentCategoryId ?? null,
      p_applicable_gender: params.applicableGender,
      ...(params.on ? { p_on: params.on } : {}),
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }

  /**
   * Write a full week atomically via fn_save_shift_timing_week.
   *
   * Deliberately an RPC: an effective-dated edit is close-old + insert-new, and
   * PostgREST has no transaction. Doing it client-side can leave rows closed
   * with no successor — a date range where staff have no timing at all.
   */
  static async saveWeek(
    supabase: SupabaseClient,
    params: SaveWeekParams,
  ): Promise<number> {
    // Defense in depth: the same pure validator the form uses, so the two can
    // never disagree, plus the DB CHECKs behind both.
    for (const day of params.days) {
      const message = validateTimingRow(day);
      if (message) throw new Error(`${dayLabel(day.day_of_week)}: ${message}`);
    }

    const payload = params.days.map((d) => ({
      day_of_week: d.day_of_week,
      is_working_day: d.is_working_day,
      first_half_start: d.is_working_day ? toPgTime(d.first_half_start) : null,
      first_half_end: d.is_working_day ? toPgTime(d.first_half_end) : null,
      second_half_start: d.is_working_day ? toPgTime(d.second_half_start) : null,
      second_half_end: d.is_working_day ? toPgTime(d.second_half_end) : null,
      grace_minutes: d.is_working_day ? (d.grace_minutes ?? 0) : 0,
      second_saturday_holiday: d.second_saturday_holiday ?? false,
    }));

    const { data, error } = await supabase.rpc('fn_save_shift_timing_week', {
      p_institution_id: params.institutionId,
      p_staff_scope: params.staffScope,
      p_employment_category_id: params.employmentCategoryId ?? null,
      p_effective_from: params.effectiveFrom,
      p_days: payload,
      p_applicable_gender: params.applicableGender ?? 'all',
      p_work_pattern_id: params.workPatternId ?? null,
    });

    if (error) throw error;
    return (data as number) ?? 0;
  }

  /** The timing that applies to one staff member on one date. Null if none. */
  static async resolveForStaff(
    supabase: SupabaseClient,
    staffId: string,
    date: string,
  ): Promise<ResolvedShiftTiming | null> {
    const { data, error } = await supabase.rpc('fn_resolve_shift_timing', {
      p_staff_id: staffId,
      p_date: date,
    });
    if (error) throw error;
    const rows = (data ?? []) as ResolvedShiftTiming[];
    return rows[0] ?? null;
  }

  /**
   * Per-category coverage for an institution on a date. A row with a null
   * resolved_timing_id is staff who have NO timing — the silent-empty-state
   * this module exists to make visible.
   */
  static async getCoverage(
    supabase: SupabaseClient,
    institutionId: string,
    date?: string,
  ): Promise<ShiftTimingCoverageRow[]> {
    const { data, error } = await supabase.rpc('fn_shift_timing_coverage', {
      p_institution_id: institutionId,
      p_date: date ?? today(),
    });
    if (error) throw error;
    return (data ?? []) as ShiftTimingCoverageRow[];
  }

  /** Employment categories, for the override picker. Global list, not per-institution. */
  static async listEmploymentCategories(
    supabase: SupabaseClient,
  ): Promise<EmploymentCategoryOption[]> {
    const { data, error } = await supabase
      .from('employment_categories')
      .select('id, category_name, is_teaching')
      .eq('is_active', true)
      .order('category_name', { ascending: true });

    if (error) throw error;
    return (data ?? []) as EmploymentCategoryOption[];
  }
}

function dayLabel(dow: IsoDayOfWeek): string {
  return ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dow];
}
