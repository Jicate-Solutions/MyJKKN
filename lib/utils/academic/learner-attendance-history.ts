// Updated: 2026-09-07 - Day-level rollup for one learner's attendance history.
//
// The SQL side (fn_learner_attendance_history) returns one row per
// (date x period the section has a register for), carrying this learner's saved
// status or NULL. Everything that decides what a NUMBER MEANS lives here, in a
// pure function with no Supabase import, so it can be unit tested:
//
//   * which days count as Present,
//   * which days count as marked at all,
//   * what the percentage divides by.
//
// THE RULE THIS FILE EXISTS TO ENFORCE
// ------------------------------------
// A day the register exists for but where this learner has no entry is
// UNMARKED, not Absent, and it is excluded from the percentage entirely. It is
// reported as its own number beside the percentage, never folded into it. The
// attendance dashboard once read "60 present + 16 absent" out of 462 learners
// while 386 had simply never been marked; that is the confusion this rollup
// refuses to reproduce.
//
// ON-DUTY COUNTS AS ATTENDED (Director ruling, 2026-09-07)
// ----------------------------------------------------------
// A day marked OnDuty is shown as ATTENDED: it sits in BOTH the numerator and
// the denominator of `attendancePercent`, and it must never pull the rate
// down. It keeps its own distinct label and its own count
// (`summary.onDutyDays`) so a Senior Learner can still tell duty apart from
// ordinary attendance -- only the RATE treats them the same. Mixed-day
// rollup precedence is Present > OnDuty > Absent (> Other), unchanged from
// before; what changed is only which day states feed the percentage.

/** The statuses the marking screen actually saves into attendance_data. */
export type LearnerAttendanceStatus = 'present' | 'absent' | 'on_duty' | 'other';

/**
 * What one day amounts to for this learner.
 * `unmarked` = the section had a register that day but this learner is not in
 * it. A day with no register at all never reaches here — the SQL returns no row
 * for it and the caller renders "no class recorded".
 */
export type LearnerAttendanceDayState = LearnerAttendanceStatus | 'unmarked';

/** One row exactly as fn_learner_attendance_history returns it. */
export interface LearnerAttendanceHistoryRow {
  lah_attendance_date: string;
  lah_period_key: string;
  lah_period_name: string | null;
  lah_start_time: string | null;
  lah_end_time: string | null;
  lah_course_name: string | null;
  /**
   * Which section this register was filed under. Learner-first as of
   * 2026-09-07: a row can carry a DIFFERENT section than the one the dialog
   * was opened from (a combined/practical register filed under a sibling
   * section) — this is what makes that legible instead of mysterious.
   */
  lah_section_id: string | null;
  lah_section_name: string | null;
  /** null = the register exists but holds no entry for this learner. */
  lah_status: string | null;
  lah_marked_at: string | null;
}

export interface LearnerAttendancePeriod {
  periodKey: string;
  periodName: string | null;
  startTime: string | null;
  endTime: string | null;
  courseName: string | null;
  sectionId: string | null;
  sectionName: string | null;
  /** null = unmarked for this learner in this period. */
  status: LearnerAttendanceStatus | null;
  /** The exact string that was saved, kept so an unexpected value stays visible. */
  rawStatus: string | null;
  markedAt: string | null;
}

export interface LearnerAttendanceDay {
  date: string;
  state: LearnerAttendanceDayState;
  /** Periods the section has a register for that day, register order preserved. */
  periods: LearnerAttendancePeriod[];
  /** Periods in which this learner carries a status. */
  markedPeriodCount: number;
  /** Periods in which this learner carries no status. */
  unmarkedPeriodCount: number;
}

export interface LearnerAttendanceSummary {
  /** Days the section has at least one register for, in the window. */
  daysWithRegister: number;
  /** Days this learner carries a status in at least one period. */
  markedDays: number;
  presentDays: number;
  absentDays: number;
  onDutyDays: number;
  otherDays: number;
  /**
   * presentDays + onDutyDays. Director ruling 2026-09-07: OnDuty reads as
   * attended, so it belongs in this count even though it keeps its own
   * distinct `onDutyDays` for display.
   */
  attendedDays: number;
  /** Days the register exists but this learner is not in it. NEVER absence. */
  unmarkedDays: number;
  /**
   * attendedDays / markedDays, 0-100, rounded to one decimal.
   * null when nothing is marked — an unknown rate is not 0%.
   * Unmarked days are excluded from BOTH sides of this division; OnDuty days
   * are INCLUDED in both sides (Director ruling 2026-09-07) so they never
   * pull the rate down.
   */
  attendancePercent: number | null;
}

export interface LearnerAttendanceHistory {
  days: LearnerAttendanceDay[];
  summary: LearnerAttendanceSummary;
}

/**
 * Map a saved status string onto the four states.
 *
 * Anything unrecognised becomes `other`, never `absent`. A status this build
 * has not seen is not evidence that the learner missed the class, and silently
 * counting it as absence is how a rate turns into a wrong number.
 */
export function normalizeAttendanceStatus(
  raw: string | null | undefined
): LearnerAttendanceStatus | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim().toLowerCase();
  if (value === '') return null;
  if (value === 'present') return 'present';
  if (value === 'absent') return 'absent';
  if (
    value === 'onduty' ||
    value === 'on duty' ||
    value === 'on_duty' ||
    value === 'od'
  ) {
    return 'on_duty';
  }
  return 'other';
}

/**
 * Roll a day's periods up to one state.
 *
 * Precedence: present > on_duty > absent > other. A learner present in ANY
 * period of the day counts as present for that day — the marking screen records
 * per period, but the question being answered ("which days did he come") is a
 * day-level one. A day with no status in any period is `unmarked`.
 */
function rollUpDay(periods: LearnerAttendancePeriod[]): LearnerAttendanceDayState {
  let sawOnDuty = false;
  let sawAbsent = false;
  let sawOther = false;

  for (const period of periods) {
    if (period.status === 'present') return 'present';
    if (period.status === 'on_duty') sawOnDuty = true;
    else if (period.status === 'absent') sawAbsent = true;
    else if (period.status === 'other') sawOther = true;
  }

  if (sawOnDuty) return 'on_duty';
  if (sawAbsent) return 'absent';
  if (sawOther) return 'other';
  return 'unmarked';
}

/**
 * Group the RPC rows into days, newest first, and compute the summary.
 *
 * Input order is not trusted: days are sorted descending by date here so the
 * dialog reads the same way regardless of how the rows arrived.
 */
export function buildLearnerAttendanceHistory(
  rows: LearnerAttendanceHistoryRow[] | null | undefined
): LearnerAttendanceHistory {
  const byDate = new Map<string, LearnerAttendancePeriod[]>();

  for (const row of rows ?? []) {
    if (!row || !row.lah_attendance_date) continue;
    const rawStatus = row.lah_status ?? null;
    const period: LearnerAttendancePeriod = {
      periodKey: row.lah_period_key,
      periodName: row.lah_period_name ?? null,
      startTime: row.lah_start_time ?? null,
      endTime: row.lah_end_time ?? null,
      courseName: row.lah_course_name ?? null,
      sectionId: row.lah_section_id ?? null,
      sectionName: row.lah_section_name ?? null,
      status: normalizeAttendanceStatus(rawStatus),
      rawStatus,
      markedAt: row.lah_marked_at ?? null,
    };
    const bucket = byDate.get(row.lah_attendance_date);
    if (bucket) bucket.push(period);
    else byDate.set(row.lah_attendance_date, [period]);
  }

  const days: LearnerAttendanceDay[] = Array.from(byDate.entries())
    .map(([date, periods]) => {
      const markedPeriodCount = periods.filter((p) => p.status !== null).length;
      return {
        date,
        state: rollUpDay(periods),
        periods,
        markedPeriodCount,
        unmarkedPeriodCount: periods.length - markedPeriodCount,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const summary: LearnerAttendanceSummary = {
    daysWithRegister: days.length,
    markedDays: 0,
    presentDays: 0,
    absentDays: 0,
    onDutyDays: 0,
    otherDays: 0,
    attendedDays: 0,
    unmarkedDays: 0,
    attendancePercent: null,
  };

  for (const day of days) {
    switch (day.state) {
      case 'present':
        summary.presentDays += 1;
        break;
      case 'absent':
        summary.absentDays += 1;
        break;
      case 'on_duty':
        summary.onDutyDays += 1;
        break;
      case 'other':
        summary.otherDays += 1;
        break;
      case 'unmarked':
        summary.unmarkedDays += 1;
        break;
    }
  }

  summary.markedDays =
    summary.presentDays +
    summary.absentDays +
    summary.onDutyDays +
    summary.otherDays;

  // Director ruling 2026-09-07: OnDuty counts as attended, in both the
  // numerator and the denominator (markedDays already includes it) of the
  // rate. `other` stays out of the numerator — an unrecognised status is not
  // evidence the learner attended.
  summary.attendedDays = summary.presentDays + summary.onDutyDays;

  summary.attendancePercent =
    summary.markedDays === 0
      ? null
      : Math.round((summary.attendedDays / summary.markedDays) * 1000) / 10;

  return { days, summary };
}

/** Human label for a day state. Kept beside the rule so the two cannot drift. */
export const LEARNER_ATTENDANCE_DAY_LABEL: Record<
  LearnerAttendanceDayState,
  string
> = {
  present: 'Present',
  absent: 'Absent',
  on_duty: 'On duty',
  other: 'Other status',
  unmarked: 'No register marked for this learner',
};
