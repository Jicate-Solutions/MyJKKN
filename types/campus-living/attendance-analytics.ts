/**
 * Hostel attendance analytics — shapes returned by the three
 * fn_cl_attendance_* RPCs (migration 20260909190000).
 *
 * THE PERCENTAGE. Every `attendance_pct` here is
 *
 *     (present + late_entry) / (marks - on_leave - medical)
 *
 * i.e. approved absence does not count against a learner. The denominator is
 * carried alongside as `pct_denominator` so a card can state what it divided
 * by instead of leaving the reader to guess.
 *
 * WHAT IS DELIBERATELY ABSENT. hostel_attendance.morning_status,
 * check_in_time, late_minutes and is_curfew_violation are empty on every row in
 * production, so there is no check-in-time or curfew shape here. Do not add one
 * without checking the columns are actually being written.
 */

/** Status values in use. `medical` and `late_entry` are rare but real. */
export type HostelAttendanceStatus =
  | 'present'
  | 'absent'
  | 'on_leave'
  | 'late_entry'
  | 'medical';

export interface AttendanceKpis {
  marks: number;
  learners_marked: number;
  days_covered: number;
  present: number;
  late_entry: number;
  absent: number;
  on_leave: number;
  medical: number;
  /** marks − on_leave − medical. What `attendance_pct` divided by. */
  pct_denominator: number;
  /** null when the denominator is 0 — render an em-dash, never 0%. */
  attendance_pct: number | null;
}

export interface AttendanceTrendPoint {
  date: string;
  marks: number;
  present: number;
  absent: number;
  on_leave: number;
  attendance_pct: number | null;
}

export interface AttendanceBlockRow {
  block_id: string;
  block_name: string | null;
  hostel_type: string | null;
  institution_id: string | null;
  institution_name: string | null;
  marks: number;
  learners: number;
  present: number;
  absent: number;
  attendance_pct: number | null;
}

export interface AttendanceWeekdayRow {
  /** 0 = Sunday. */
  dow: number;
  marks: number;
  present: number;
  attendance_pct: number | null;
}

/**
 * Marked-vs-expected per block. `residents` comes from hostel_allocations,
 * which is gated by a DIFFERENT permission key than attendance — see
 * `coverage_visible` on the payload before rendering any ratio from this.
 */
export interface AttendanceCoverageRow {
  block_id: string;
  block_name: string | null;
  hostel_type: string | null;
  residents: number;
  ever_marked: number;
  marked_in_range: number;
}

export interface AttendanceDashboard {
  range: { from: string; to: string };
  block_id: string | null;
  kpis: AttendanceKpis;
  trend: AttendanceTrendPoint[];
  by_block: AttendanceBlockRow[];
  weekday: AttendanceWeekdayRow[];
  coverage: AttendanceCoverageRow[];
  /**
   * False when the caller cannot read hostel_allocations. The coverage panel
   * must then say so rather than divide by a zero it mistook for a real total.
   */
  coverage_visible: boolean;
}

/**
 * One row of the at-risk table.
 *
 * `longest_absent_run` / `current_absent_run` count consecutive **marked**
 * days, not calendar days — a gap in marking does not break a run. Always
 * label them as such in the UI.
 */
export interface AttendanceLearnerRow {
  learner_id: string;
  full_name: string;
  roll_number: string | null;
  block_id: string | null;
  block_name: string | null;
  institution_name: string | null;
  program_name: string | null;
  room_number: string | null;
  marks: number;
  present: number;
  absent: number;
  on_leave: number;
  pct_denominator: number;
  attendance_pct: number | null;
  longest_absent_run: number;
  current_absent_run: number;
  last_present_date: string | null;
  /** Window count over the whole filtered set, for pagination. */
  total_count: number;
}

export interface AttendanceLearnerProfile {
  learner_id: string;
  full_name: string | null;
  email: string | null;
  roll_number: string | null;
  program_name: string | null;
  institution_name: string | null;
  block_name: string | null;
  room_number: string | null;
}

export interface AttendanceLearnerSummary extends AttendanceKpis {
  first_marked: string | null;
  last_marked: string | null;
  last_present_date: string | null;
  longest_absent_run: number;
  current_absent_run: number;
}

/** One marked day. Unmarked days are simply absent from the array. */
export interface AttendanceDay {
  date: string;
  status: HostelAttendanceStatus;
}

export interface AttendanceMark {
  id: string;
  date: string;
  status: HostelAttendanceStatus;
  marking_method: string | null;
  remarks: string | null;
  block_name: string | null;
  marked_by_name: string | null;
  created_at: string | null;
}

export interface AttendanceLearnerDetail {
  range: { from: string; to: string };
  /**
   * NULL when the caller may not see this learner's attendance at all. The RPC
   * withholds identity in that case so the drill-down cannot be used to turn a
   * UUID into a name. Render a not-found state.
   */
  profile: AttendanceLearnerProfile | null;
  summary: Partial<AttendanceLearnerSummary>;
  days: AttendanceDay[];
  marks: AttendanceMark[];
}
