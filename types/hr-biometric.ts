/**
 * HR Biometric — contracts for enrolment mapping and import reporting.
 * Created: 2026-08-06.
 * Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
 */

export interface BiometricStaffOption {
  id: string;
  staff_id: string | null;
  full_name: string;
  institution_id: string | null;
  institution_name: string | null;
  /** Code already assigned on THIS machine, if any. */
  current_code: string | null;
  /** Code assigned on a DIFFERENT machine — mapping here would move them. */
  other_machine: boolean;
}

/** One device enrolment awaiting confirmation. */
export interface BiometricMappingRow {
  /** Empcode exactly as the machine printed it. */
  code: string;
  /** Name as held by the machine. Display only. */
  device_name: string;
  /** Already mapped on this machine. */
  mapped_staff_id: string | null;
  /** Single confident name match, or null when 0 or >1 matched. */
  suggested_staff_id: string | null;
  suggestion_reason: 'exact_name' | null;
}

export interface BiometricSuggestResponse {
  institution: { id: string; name: string; code: string | null; matched_by: string | null };
  month_label: string;
  rows: BiometricMappingRow[];
  staff: BiometricStaffOption[];
  warnings: string[];
  counts: { total: number; already_mapped: number; suggested: number; unresolved: number };
}

/** Payload for saving confirmed mappings. */
export interface BiometricMappingSave {
  institutionId: string;
  /** staffId null clears that staff member's mapping. */
  assignments: Array<{ code: string; staffId: string | null }>;
}

export type ImportVerdict = 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'WEEKLY_OFF' | 'EXCEPTION';

export interface ImportPreviewRow {
  code: string;
  device_name: string;
  staff_name: string | null;
  staff_code: string | null;
  work_date: string;
  weekday: string;
  in_time: string | null;
  out_time: string | null;
  work_minutes: number | null;
  overtime_minutes: number | null;
  device_status: string;
  verdict: ImportVerdict;
  day_calc: string | null;
  late_minutes: number | null;
  exception_reason: string | null;
}

/** Machine-reported per-employee totals vs what we computed. */
export interface BiometricReconciliationRow {
  code: string;
  name: string;
  staff_name: string | null;
  machine_present: number | null;
  machine_absent: number | null;
  machine_work_minutes: number | null;
  our_present: number;
  our_half_day: number;
  our_absent: number;
  our_weekly_off: number;
  our_exception: number;
  our_work_minutes: number;
  /** Machine P == our present+half+exception, AND machine A == our absent+weekly_off. */
  reconciled: boolean;
}

export type BiometricAnomalyKind =
  | 'work_exceeds_span'
  | 'work_zero_with_both_punches'
  | 'ot_without_work'
  | 'break_recorded'
  | 'status_disagreement';

export interface BiometricAnomaly {
  code: string;
  name: string;
  work_date: string;
  kind: BiometricAnomalyKind;
  detail: string;
}

export interface BiometricFieldTotals {
  late_days: number;
  half_days: number;
  ot_days: number;
  ot_minutes: number;
  break_days: number;
  work_minutes: number;
  status_disagreements: number;
  /** Sundays and second Saturdays the machine called Absent and we call Weekly Off. */
  expected_weekly_off_flips: number;
}

export const ANOMALY_LABEL: Record<BiometricAnomalyKind, string> = {
  work_exceeds_span: 'Worked longer than the time between punches',
  work_zero_with_both_punches: 'Both punches present but zero worked time',
  ot_without_work: 'Overtime recorded with zero worked time',
  break_recorded: 'Break time recorded (new — lunch punches may now be captured)',
  status_disagreement: 'Machine and MyJKKN disagree',
};

export interface BiometricImportReport {
  success: boolean;
  dry_run: boolean;
  institution: { id: string; name: string; code: string | null; matched_by: string | null } | null;
  month_label: string;
  date_from: string | null;
  date_to: string | null;
  employees_in_file: number;
  matched_employees: number;
  unmatched_codes: Array<{ code: string; name: string }>;
  total_day_cells: number;
  counts: Record<ImportVerdict, number>;
  preview: ImportPreviewRow[];
  preview_truncated: boolean;
  parser_warnings: string[];
  exceptions: Array<{ code: string; name: string; work_date: string; reason: string }>;
  exceptions_total: number;
  skipped_no_organization: number;
  /** Field-level validation of the new machine columns. */
  reconciliation: BiometricReconciliationRow[];
  reconciled_employees: number;
  anomalies: BiometricAnomaly[];
  anomalies_total: number;
  field_totals: BiometricFieldTotals;
  written: number;
  exceptions_written: number;
  message?: string;
}

export const VERDICT_LABEL: Record<ImportVerdict, string> = {
  PRESENT: 'Present',
  HALF_DAY: 'Half day',
  ABSENT: 'Absent',
  WEEKLY_OFF: 'Weekly off',
  EXCEPTION: 'Needs review',
};

export const VERDICT_CLASS: Record<ImportVerdict, string> = {
  PRESENT: 'bg-green-100 text-green-800 hover:bg-green-100',
  HALF_DAY: 'bg-amber-100 text-amber-900 hover:bg-amber-100',
  ABSENT: 'bg-red-100 text-red-800 hover:bg-red-100',
  WEEKLY_OFF: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  EXCEPTION: 'bg-orange-100 text-orange-900 hover:bg-orange-100',
};
