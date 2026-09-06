/**
 * HR Academic Years service.
 * Created: 2026-08-10.
 *
 * Shape follows the HR module convention (static class, SupabaseClient as the
 * first argument) rather than BaseService, which no HR service extends. Every
 * call destructures { error } and throws: Supabase errors are plain objects,
 * not Error instances, so an unchecked RLS denial would be indistinguishable
 * from "no rows".
 *
 * There is no institution filter here on purpose. hr_academic_years is a
 * group-wide calendar -- see types/hr-academic-years.ts for why HR does not
 * reuse academic_years.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  CreateHRAcademicYearDto,
  HRAcademicYear,
  HRAcademicYearFilters,
  HRAcademicYearWithUsage,
  UpdateHRAcademicYearDto,
} from '@/types/hr-academic-years';

const TABLE = 'hr_academic_years';

export class HRAcademicYearService {
  /**
   * Ordered newest first by start_date, never by year_name -- the name is TEXT,
   * so a lexical sort is only accidentally chronological and breaks the moment
   * a name is entered in another format.
   */
  static async list(
    supabase: SupabaseClient,
    filters: HRAcademicYearFilters = {}
  ): Promise<HRAcademicYear[]> {
    let query = supabase.from(TABLE).select('*').order('start_date', { ascending: false });

    if (filters.search) {
      query = query.ilike('year_name', `%${filters.search}%`);
    }
    if (filters.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HRAcademicYear[];
  }

  /**
   * The year containing `onDate` (default today).
   *
   * A date bracket, not the highest name: active years cannot overlap, so
   * exactly one row matches and there is no tie to break. Returns null when HR
   * has not configured a year covering the date -- the caller decides whether
   * that is an error or an empty state.
   */
  static async getCurrent(
    supabase: SupabaseClient,
    onDate?: string
  ): Promise<HRAcademicYear | null> {
    const day = onDate ?? new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('is_active', true)
      .lte('start_date', day)
      .gte('end_date', day)
      .maybeSingle();

    if (error) throw error;
    return (data as HRAcademicYear | null) ?? null;
  }

  static async getById(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRAcademicYear | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as HRAcademicYear | null) ?? null;
  }

  /**
   * How many leave rows point at each year. Drives the delete guard -- a 23503
   * surfaced raw would tell the user nothing about which year is in use or by
   * how much.
   */
  static async listWithUsage(
    supabase: SupabaseClient,
    filters: HRAcademicYearFilters = {}
  ): Promise<HRAcademicYearWithUsage[]> {
    const years = await this.list(supabase, filters);
    if (years.length === 0) return [];

    const ids = years.map((y) => y.id);

    const [balances, applications] = await Promise.all([
      supabase.from('hr_leave_balances').select('hr_academic_year_id').in('hr_academic_year_id', ids),
      supabase
        .from('hr_leave_applications')
        .select('hr_academic_year_id')
        .in('hr_academic_year_id', ids),
    ]);

    if (balances.error) throw balances.error;
    if (applications.error) throw applications.error;

    const tally = (rows: { hr_academic_year_id: string | null }[] | null) => {
      const counts = new Map<string, number>();
      for (const row of rows ?? []) {
        if (!row.hr_academic_year_id) continue;
        counts.set(row.hr_academic_year_id, (counts.get(row.hr_academic_year_id) ?? 0) + 1);
      }
      return counts;
    };

    const balanceCounts = tally(balances.data as { hr_academic_year_id: string | null }[]);
    const applicationCounts = tally(applications.data as { hr_academic_year_id: string | null }[]);

    return years.map((y) => ({
      ...y,
      balance_count: balanceCounts.get(y.id) ?? 0,
      application_count: applicationCounts.get(y.id) ?? 0,
    }));
  }

  static async create(
    supabase: SupabaseClient,
    payload: CreateHRAcademicYearDto
  ): Promise<HRAcademicYear> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(describeWriteError(error, payload.year_name));
    return data as HRAcademicYear;
  }

  static async update(
    supabase: SupabaseClient,
    id: string,
    payload: UpdateHRAcademicYearDto
  ): Promise<HRAcademicYear> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(describeWriteError(error, payload.year_name));
    return data as HRAcademicYear;
  }

  /**
   * Refuses before the database does, so the operator is told which rows hold
   * the year rather than seeing a foreign-key code.
   */
  static async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const [balances, applications] = await Promise.all([
      supabase
        .from('hr_leave_balances')
        .select('*', { count: 'exact', head: true })
        .eq('hr_academic_year_id', id),
      supabase
        .from('hr_leave_applications')
        .select('*', { count: 'exact', head: true })
        .eq('hr_academic_year_id', id),
    ]);

    if (balances.error) throw balances.error;
    if (applications.error) throw applications.error;

    const balanceCount = balances.count ?? 0;
    const applicationCount = applications.count ?? 0;

    if (balanceCount > 0 || applicationCount > 0) {
      const held = [
        balanceCount > 0 ? `${balanceCount} leave balance row(s)` : null,
        applicationCount > 0 ? `${applicationCount} leave application(s)` : null,
      ]
        .filter(Boolean)
        .join(' and ');

      throw new Error(
        `This year cannot be deleted: ${held} still reference it. ` +
          'Deactivate it instead to keep the history and stop it being offered for new work.'
      );
    }

    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }
}

/**
 * The two constraints an operator can realistically trip, named in their own
 * terms. Anything else is passed through unchanged.
 */
function describeWriteError(
  error: { code?: string; message?: string },
  yearName?: string
): string {
  if (error.code === '23505') {
    return `An HR academic year named "${yearName ?? ''}" already exists.`;
  }
  // The EXCLUDE constraint reports 23P01, not 23505 -- overlapping is a
  // different mistake from duplicate naming and deserves a different sentence.
  if (error.code === '23P01') {
    return (
      'These dates overlap another active HR academic year. ' +
      'Years must not share days, because a date resolves to exactly one year.'
    );
  }
  if (error.code === '23514') {
    return 'The end date must be after the start date.';
  }
  return error.message ?? 'Could not save the HR academic year.';
}
