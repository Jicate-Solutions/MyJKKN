// lib/services/school-fees/school-term-calendar-service.ts
//
// Due dates and flat fines, entered ONCE per school per academic year and
// inherited by every class plan in that institution+year. This is the table
// that must be filled in FIRST — a plan without a calendar cannot generate
// bills, because generation copies due_date and fine_effective_date onto the
// billing_student_bills rows.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logActivityForCurrentUser } from '@/lib/utils/activity-logger-client';
import type { SchoolTermCalendar, UpsertSchoolTermCalendarDto } from '@/types/school-fees';

const CALENDAR_COLUMNS =
  'id, institution_id, academic_year_id, term_number, term_name, due_date, fine_effective_date, fine_amount, created_at, updated_at, created_by, updated_by';

export class SchoolTermCalendarService {
  static async listForYear(
    institutionId: string,
    academicYearId: string,
  ): Promise<SchoolTermCalendar[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('school_term_calendars')
      .select(CALENDAR_COLUMNS)
      .eq('institution_id', institutionId)
      .eq('academic_year_id', academicYearId)
      .order('term_number', { ascending: true });
    if (error) throw error;
    return (data ?? []) as SchoolTermCalendar[];
  }

  /**
   * Replace the whole calendar for one institution+year.
   *
   * Upsert rather than delete-then-insert: the ON CONFLICT target matches the
   * UNIQUE (institution_id, academic_year_id, term_number) constraint, so a
   * re-save of the same terms updates in place. Deleting first would briefly
   * leave the year with no calendar, and a concurrent generation run in that
   * window would produce bills with no due dates.
   *
   * Terms removed from the form ARE deleted, but only after the upsert lands,
   * so the table is never empty mid-flight.
   */
  static async saveForYear(
    institutionId: string,
    academicYearId: string,
    terms: Array<Omit<UpsertSchoolTermCalendarDto, 'institution_id' | 'academic_year_id'>>,
  ): Promise<SchoolTermCalendar[]> {
    const supabase = createClientSupabaseClient();

    const rows = terms.map((t) => ({
      institution_id: institutionId,
      academic_year_id: academicYearId,
      term_number: t.term_number,
      term_name: t.term_name,
      due_date: t.due_date,
      fine_effective_date: t.fine_effective_date ?? null,
      fine_amount: t.fine_amount ?? 0,
    }));

    const { data, error } = await supabase
      .from('school_term_calendars')
      .upsert(rows, { onConflict: 'institution_id,academic_year_id,term_number' })
      .select(CALENDAR_COLUMNS);
    if (error) throw error;

    // Drop terms the operator removed.
    const keptTermNumbers = rows.map((r) => r.term_number);
    if (keptTermNumbers.length > 0) {
      const { error: deleteError } = await supabase
        .from('school_term_calendars')
        .delete()
        .eq('institution_id', institutionId)
        .eq('academic_year_id', academicYearId)
        .not('term_number', 'in', `(${keptTermNumbers.join(',')})`);
      if (deleteError) throw deleteError;
    }

    void logActivityForCurrentUser({
      actionType: 'update',
      resourceType: 'school_term_calendar',
      resourceId: academicYearId,
      resourceName: `Term calendar (${rows.length} terms)`,
      description: `Saved school term calendar with ${rows.length} term(s)`,
      institutionId,
    });

    return (data ?? []) as SchoolTermCalendar[];
  }

  /**
   * True when the year has a usable calendar. The generate screen blocks on
   * this — bills raised without due dates cannot be chased or fined.
   */
  static async hasCalendar(institutionId: string, academicYearId: string): Promise<boolean> {
    const supabase = createClientSupabaseClient();
    const { count, error } = await supabase
      .from('school_term_calendars')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('academic_year_id', academicYearId);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  /**
   * Copy an entire year's calendar forward, shifting every date by a whole
   * number of days. Dates still need review afterwards, but this removes the
   * retyping that makes operators skip the fine dates.
   */
  static async cloneToYear(
    institutionId: string,
    fromAcademicYearId: string,
    toAcademicYearId: string,
    shiftDays: number,
  ): Promise<SchoolTermCalendar[]> {
    const source = await this.listForYear(institutionId, fromAcademicYearId);
    if (source.length === 0) {
      throw new Error('The source academic year has no term calendar to clone.');
    }

    const shift = (iso: string | null): string | null => {
      if (!iso) return null;
      const d = new Date(`${iso}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + shiftDays);
      return d.toISOString().slice(0, 10);
    };

    return this.saveForYear(
      institutionId,
      toAcademicYearId,
      source.map((t) => ({
        term_number: t.term_number,
        term_name: t.term_name,
        due_date: shift(t.due_date) as string,
        fine_effective_date: shift(t.fine_effective_date),
        fine_amount: t.fine_amount,
      })),
    );
  }
}
