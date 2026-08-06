/**
 * HR Shift Timings — TypeScript contracts for institution-wise shift config.
 * Created: 2026-08-06.
 * Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
 *
 * Mirrors supabase/migrations/20260806090000_create_hr_shift_timings.sql verbatim.
 *
 * Grain: (institution_id, staff_scope, employment_category_id, day_of_week),
 * effective-dated. Resolution is most-specific-wins — a `category` row beats
 * the `teaching` / `non_teaching` row for the same weekday.
 */

// ---------------------------------------------------------------------------
// Core row
// ---------------------------------------------------------------------------

/**
 * Which staff a timing row applies to.
 *   'teaching'     — every category with employment_categories.is_teaching = true
 *   'non_teaching' — every category with is_teaching = false
 *   'category'     — one specific employment_category_id (beats the two above)
 */
export type ShiftStaffScope = 'teaching' | 'non_teaching' | 'category';

/** ISO-8601 weekday: 1=Mon .. 7=Sun. Matches Postgres EXTRACT(ISODOW FROM date). */
export type IsoDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface HRShiftTiming {
  id: string;
  institution_id: string;
  staff_scope: ShiftStaffScope;
  /** Non-null iff staff_scope === 'category'. */
  employment_category_id: string | null;
  day_of_week: IsoDayOfWeek;
  is_working_day: boolean;
  /** time string 'HH:MM:SS'. Null iff is_working_day is false. */
  first_half_start: string | null;
  first_half_end: string | null;
  /**
   * The second half MAY start before the first half ends — 09:00-13:00 paired
   * with 12:30-16:30 is the real JKKN pattern. This is a session overlap, not a
   * lunch break, and the DB CHECK permits it deliberately.
   */
  second_half_start: string | null;
  second_half_end: string | null;
  /** Late allowance on first_half_start ONLY. */
  grace_minutes: number;
  /** Only meaningful when day_of_week === 6. */
  second_saturday_holiday: boolean;
  effective_from: string;
  effective_until: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRShiftTimingInsert {
  institution_id: string;
  staff_scope: ShiftStaffScope;
  employment_category_id?: string | null;
  day_of_week: IsoDayOfWeek;
  is_working_day: boolean;
  first_half_start?: string | null;
  first_half_end?: string | null;
  second_half_start?: string | null;
  second_half_end?: string | null;
  grace_minutes?: number;
  second_saturday_holiday?: boolean;
  effective_from?: string;
  notes?: string | null;
}

export type HRShiftTimingUpdate = Partial<
  Pick<
    HRShiftTiming,
    | 'is_working_day'
    | 'first_half_start'
    | 'first_half_end'
    | 'second_half_start'
    | 'second_half_end'
    | 'grace_minutes'
    | 'second_saturday_holiday'
    | 'effective_until'
    | 'notes'
    | 'is_active'
  >
>;

export interface ShiftTimingFilters {
  institutionId: string;
  staffScope?: ShiftStaffScope;
  employmentCategoryId?: string | null;
  /** ISO date 'YYYY-MM-DD'. Returns rows effective on this date. Defaults to today. */
  asOf?: string;
}

// ---------------------------------------------------------------------------
// RPC shapes
// ---------------------------------------------------------------------------

/** Return shape of fn_resolve_shift_timing(staff_id, date). */
export interface ResolvedShiftTiming {
  timing_id: string;
  institution_id: string;
  staff_scope: ShiftStaffScope;
  employment_category_id: string | null;
  day_of_week: IsoDayOfWeek;
  is_working_day: boolean;
  first_half_start: string | null;
  first_half_end: string | null;
  second_half_start: string | null;
  second_half_end: string | null;
  grace_minutes: number;
  /** first_half_start + grace_minutes. Null on a non-working day. */
  grace_deadline: string | null;
  /** Which rule matched: a scope, or 'second_saturday_holiday'. */
  matched_by: ShiftStaffScope | 'second_saturday_holiday';
}

/** Return shape of fn_shift_timing_coverage(institution_id, date). */
export interface ShiftTimingCoverageRow {
  employment_category_id: string;
  category_name: string;
  is_teaching: boolean;
  staff_count: number;
  /** Null means these staff have NO timing on that date. */
  resolved_timing_id: string | null;
  resolved_via: ShiftStaffScope | null;
}

// ---------------------------------------------------------------------------
// UI constants
// ---------------------------------------------------------------------------

export const DAY_OF_WEEK_OPTIONS: ReadonlyArray<{
  value: IsoDayOfWeek;
  short: string;
  label: string;
}> = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 7, short: 'Sun', label: 'Sunday' },
] as const;

export const STAFF_SCOPE_OPTIONS: ReadonlyArray<{
  value: ShiftStaffScope;
  label: string;
}> = [
  { value: 'teaching', label: 'Teaching' },
  { value: 'non_teaching', label: 'Non-teaching' },
  { value: 'category', label: 'Specific category' },
] as const;

/** Group default used when creating a week from scratch in the UI. */
export const DEFAULT_WORKING_DAY = {
  is_working_day: true,
  first_half_start: '09:00',
  first_half_end: '13:00',
  second_half_start: '12:30',
  second_half_end: '16:30',
  grace_minutes: 5,
} as const;

// ---------------------------------------------------------------------------
// Pure helpers — shared by the form validator (immediate UX) and the service
// (defense in depth), so the two can never disagree.
// ---------------------------------------------------------------------------

/** 'HH:MM' or 'HH:MM:SS' -> 'HH:MM'. Returns null for empty/invalid input. */
export function toHHMM(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

/** 'HH:MM' or 'HH:MM:SS' -> 'HH:MM:SS' for Postgres `time`. Null if invalid. */
export function toPgTime(value: string | null | undefined): string | null {
  const hhmm = toHHMM(value);
  return hhmm ? `${hhmm}:00` : null;
}

/** Minutes since midnight, or null when the value is not a valid time. */
export function timeToMinutes(value: string | null | undefined): number | null {
  const hhmm = toHHMM(value);
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * The grace deadline for a first-half start, e.g. '09:00' + 5 -> '09:05'.
 * Mirrors fn_resolve_shift_timing's grace_deadline so the UI can preview it
 * without a round trip.
 */
export function computeGraceDeadline(
  firstHalfStart: string | null | undefined,
  graceMinutes: number,
): string | null {
  const start = timeToMinutes(firstHalfStart);
  if (start === null) return null;
  const total = start + (Number.isFinite(graceMinutes) ? graceMinutes : 0);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * True when `date` is the 2nd Saturday of its month.
 * Nth Saturday = ceil(dayOfMonth / 7), so the 2nd falls on days 8..14.
 * Mirrors the SQL in fn_resolve_shift_timing.
 */
export function isSecondSaturday(date: Date): boolean {
  const day = date.getDate();
  return date.getDay() === 6 && day >= 8 && day <= 14;
}

/** ISO weekday (1=Mon..7=Sun) for a JS Date, whose getDay() is 0=Sun. */
export function isoDayOfWeek(date: Date): IsoDayOfWeek {
  const d = date.getDay();
  return (d === 0 ? 7 : d) as IsoDayOfWeek;
}

/**
 * Validate one weekday row. Returns null when valid, else a human-readable
 * message. Mirrors the DB CHECK constraints exactly — including the fact that
 * an overlap between the two halves is ALLOWED and only inversion is rejected.
 */
export function validateTimingRow(row: {
  is_working_day: boolean;
  first_half_start?: string | null;
  first_half_end?: string | null;
  second_half_start?: string | null;
  second_half_end?: string | null;
  grace_minutes?: number;
  day_of_week: IsoDayOfWeek;
  second_saturday_holiday?: boolean;
}): string | null {
  if (row.second_saturday_holiday && row.day_of_week !== 6) {
    return 'Second-Saturday holiday can only be set on Saturday.';
  }

  const grace = row.grace_minutes ?? 0;
  if (!Number.isInteger(grace) || grace < 0 || grace > 240) {
    return 'Grace must be a whole number of minutes between 0 and 240.';
  }

  if (!row.is_working_day) {
    const anyTime =
      row.first_half_start || row.first_half_end || row.second_half_start || row.second_half_end;
    return anyTime ? 'A non-working day must not have any timings.' : null;
  }

  const fs = timeToMinutes(row.first_half_start);
  const fe = timeToMinutes(row.first_half_end);
  const ss = timeToMinutes(row.second_half_start);
  const se = timeToMinutes(row.second_half_end);

  if (fs === null || fe === null || ss === null || se === null) {
    return 'A working day needs all four times: both halves must have a start and an end.';
  }
  if (fe <= fs) return 'First half must end after it starts.';
  if (se <= ss) return 'Second half must end after it starts.';
  if (ss < fs) return 'Second half cannot start before the first half starts.';
  if (se < fe) return 'Second half cannot end before the first half ends.';

  return null;
}
