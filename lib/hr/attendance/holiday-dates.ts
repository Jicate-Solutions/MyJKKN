/**
 * Which dates are declared holidays, for attendance.
 * Created: 2026-09-02.
 *
 * THIS FILE DELIBERATELY CONTAINS NO HOLIDAY LOGIC. Both helpers are thin
 * wrappers over `fn_hr_calendar_holiday_dates` / `fn_hr_is_calendar_holiday`,
 * because the same question is asked from four places — a trigger on
 * calendar_entries, the backfill, the biometric import and the recompute — and
 * a TypeScript re-implementation would be free to disagree with the SQL one.
 * The disagreement would surface as pay: a day the database calls a holiday and
 * the importer calls an absence is a day's salary.
 *
 * The scope rule (NULL or empty `scope_institution_ids` means every institution)
 * and the UTC date extraction both live in the SQL function. See the migration
 * header for why reading an all-day entry at Asia/Kolkata puts its end on the
 * following day.
 *
 * WHY HOLIDAYS ARE NOT INSIDE evaluateDay(). That function turns punches into a
 * verdict, and "is today a holiday" is not a property of the punches. It stays
 * pure and testable; the substitution happens at the two call sites, next to the
 * existing WEEKLY_OFF reconciliation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** `${institutionId}|${yyyy-MM-dd}` — the key both call sites look up by. */
export function holidayKey(institutionId: string, workDate: string): string {
  return `${institutionId}|${workDate}`;
}

/**
 * Every holiday day for a set of institutions over one date range, as a Set of
 * `institutionId|date` keys.
 *
 * One RPC per institution rather than one per row: an import covers a month and
 * a few institutions, so this is a handful of calls, not thousands.
 */
export async function fetchHolidayKeys(
  supabase: SupabaseClient,
  institutionIds: readonly string[],
  from: string,
  to: string
): Promise<Set<string>> {
  const keys = new Set<string>();
  const unique = Array.from(new Set(institutionIds.filter(Boolean)));
  if (unique.length === 0 || !from || !to) return keys;

  for (const institutionId of unique) {
    const { data, error } = await (supabase as any).rpc('fn_hr_calendar_holiday_dates', {
      p_institution_id: institutionId,
      p_from: from,
      p_to: to,
    });

    // Thrown, never swallowed. An empty Set would silently mean "no holidays"
    // and the import would stamp a whole institution ABSENT for a festival.
    if (error) {
      throw new Error(`Failed to load holidays for institution ${institutionId}: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<{ holiday_date: string }>) {
      if (row?.holiday_date) keys.add(holidayKey(institutionId, row.holiday_date.slice(0, 10)));
    }
  }

  return keys;
}

/** Single-day form, for the recompute path which works one (staff, date) at a time. */
export async function isCalendarHoliday(
  supabase: SupabaseClient,
  institutionId: string | null | undefined,
  workDate: string
): Promise<boolean> {
  if (!institutionId || !workDate) return false;

  const { data, error } = await (supabase as any).rpc('fn_hr_is_calendar_holiday', {
    p_institution_id: institutionId,
    p_date: workDate,
  });
  if (error) {
    throw new Error(`Failed to check holiday for ${workDate}: ${error.message}`);
  }
  return data === true;
}

/**
 * The substitution rule, in one place so both call sites apply it identically.
 *
 * ONLY ABSENT BECOMES HOLIDAY. A punch is evidence of work: overwriting PRESENT
 * or HALF_DAY would erase what the device recorded and leave the person with no
 * basis to claim the day back. WEEKLY_OFF is already outside working days, so
 * relabelling it would change nothing and lose information.
 */
export function applyHolidayToStatusCode(code: string, isHoliday: boolean): string {
  return isHoliday && code === 'ABSENT' ? 'HOLIDAY' : code;
}
