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
  /** staff.is_active — false means relieved. Still selectable; just labelled. */
  is_active: boolean | null;
}

/**
 * Does the person behind this enrolment exist in the MyJKKN staff table at all?
 *
 * Deliberately SEPARATE from link state. "Unresolved" used to mean both "our
 * employee, code not linked yet" and "not our employee at all", which are
 * opposite problems: the first is one click away from importing, the second can
 * never import no matter what HR does. Biometric machines keep every enrolment
 * ever made, so a monthly export routinely carries people who left years ago.
 *
 * 'not_in_myjkkn' is a NAME verdict, not proof of absence — normPersonName
 * reaches 36 of 48 on the real July export. Treat it as "nothing in MyJKKN
 * answers to this name", which is why the picker stays enabled on those rows.
 */
export type BiometricIdentityKind = 'linked' | 'name_match' | 'ambiguous' | 'not_in_myjkkn';

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
  /** Whether this person exists in the MyJKKN staff table — see the type doc. */
  identity: BiometricIdentityKind;
  /** Staff sharing this device name: 1 for name_match, >1 for ambiguous, else 0. */
  name_candidates: number;
  /** is_active of the linked / single-name-matched staff row; null when none. */
  staff_is_active: boolean | null;
}

export interface BiometricSuggestResponse {
  institution: { id: string; name: string; code: string | null; matched_by: string | null };
  month_label: string;
  rows: BiometricMappingRow[];
  staff: BiometricStaffOption[];
  warnings: string[];
  /** Size of the MyJKKN staff table this file was measured against. */
  roster: { total: number; active: number };
  counts: {
    total: number; already_mapped: number; suggested: number; unresolved: number;
    /** identity !== 'not_in_myjkkn' — the ceiling on what this file can ever import. */
    in_myjkkn: number;
    not_in_myjkkn: number;
    ambiguous: number;
    /** in_myjkkn rows whose staff record is relieved (is_active = false). */
    inactive_staff: number;
  };
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
  /**
   * The machine's own P/A. STORED on the row and used by the reconciliation
   * and status-disagreement checks, but no longer shown per row in the preview:
   * a machine 'P' beside our 'Half day' read as a contradiction when it is only
   * the machine saying "there was a punch". Our verdict comes from the shift
   * timing and nothing else.
   */
  device_status: string;
  /** The window this verdict was judged against, e.g. '09:00–16:30 +5m'. */
  shift_window: string | null;
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

export type BiometricStaffMatchKind =
  | 'linked' | 'unlinked_match' | 'ambiguous_match' | 'absent';

export interface BiometricEmployeeValidation {
  /** Verbatim, as the machine printed it. */
  code: string;
  /** normBiometricCode output — null when the code is blank/unreadable. */
  normalised_code: string | null;
  device_name: string;
  match: BiometricStaffMatchKind;
  staff_uuid: string | null;
  staff_name: string | null;
  /** staff.staff_id — may legitimately be null (198 of 864 staff have none). */
  staff_code: string | null;
  candidate_count: number;
  importable: boolean;
  reason: string | null;
}

export type BiometricBlockKind =
  | 'duplicate_code_in_file' | 'invalid_code_in_file' | 'zero_importable'
  | 'unknown_staff_present'  | 'unreconciled_totals';

export type BiometricWarningKind = 'missing_staff_code' | 'missing_organisation';

export interface BiometricBlock {
  kind: BiometricBlockKind;
  severity: 'hard' | 'acknowledgeable';
  count: number;
  message: string;
  detail: string[];
}

export interface BiometricWarning {
  kind: BiometricWarningKind;
  count: number;
  message: string;
  detail: string[];
}

export interface BiometricUploadValidation {
  employees: BiometricEmployeeValidation[];
  counts: {
    total: number; importable: number;
    unlinked_match: number; ambiguous_match: number; absent: number;
  };
  blocks: BiometricBlock[];
  warnings: BiometricWarning[];
  /** No hard blocks. Set only by finaliseValidation. */
  can_import: boolean;
  /** Acknowledgeable blocks present; commit needs acknowledge=true. */
  requires_acknowledgement: boolean;
}

export const BLOCK_LABEL: Record<BiometricBlockKind, string> = {
  duplicate_code_in_file: 'Duplicate enrolment code in file',
  invalid_code_in_file: 'Blank or unreadable enrolment code',
  zero_importable: 'Nothing to import',
  unknown_staff_present: 'People not in the staff table',
  unreconciled_totals: 'Totals do not reconcile',
};

export const IDENTITY_LABEL: Record<BiometricIdentityKind, string> = {
  linked: 'In MyJKKN',
  name_match: 'In MyJKKN',
  ambiguous: 'In MyJKKN',
  not_in_myjkkn: 'Not in MyJKKN',
};

export const MATCH_LABEL: Record<BiometricStaffMatchKind, string> = {
  linked: 'Linked',
  unlinked_match: 'Needs linking',
  ambiguous_match: 'Ambiguous name',
  absent: 'Not in staff table',
};

export const ANOMALY_LABEL: Record<BiometricAnomalyKind, string> = {
  work_exceeds_span: 'Worked longer than the time between punches',
  work_zero_with_both_punches: 'Both punches present but zero worked time',
  ot_without_work: 'Overtime recorded with zero worked time',
  break_recorded: 'Break time recorded (new — lunch punches may now be captured)',
  status_disagreement: 'Machine and MyJKKN disagree',
};

/**
 * Which shift timing the importer resolved for one employee, and how.
 *
 * hr_shift_timings can be set three ways — a per-CATEGORY override, or a
 * blanket teaching / non_teaching row — and fn_resolve_shift_timings_bulk picks
 * between them per staff member per date, category first. That choice decides
 * every verdict in the file, and until now the only trace of it was one
 * EXCEPTION row per unresolved DAY buried in the exceptions list. A staff
 * member with no timing at all produced 31 of them and no statement of the
 * actual problem.
 */
export interface BiometricShiftCoverageRow {
  code: string;
  staff_name: string | null;
  staff_code: string | null;
  category_name: string | null;
  is_teaching: boolean | null;
  /** 'category' | 'teaching' | 'non_teaching', or null when nothing resolved. */
  matched_by: string | null;
  /** True when different days resolved through different scopes. */
  mixed: boolean;
  /** '09:00–17:30', from the first day that resolved. */
  window: string | null;
  grace_minutes: number | null;
  days_total: number;
  /** Days with no timing at all — each becomes a needs-review row. */
  days_without_timing: number;
}

export const SHIFT_SCOPE_LABEL: Record<string, string> = {
  category: 'Category override',
  teaching: 'Teaching',
  non_teaching: 'Non-teaching',
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
  /** Codes owned by a RELIEVED team member. Skipped, not imported -- named so
   *  a skip is visible rather than looking like an unknown code. */
  relieved_skipped: Array<{ code: string; name: string; staff: string }>;
  /**
   * Days this import marked ABSENT or HALF_DAY that already carry an undecided
   * request. Reported, never acted on: attendance restamps only on approval,
   * because status feeds payable_days and the Salary Register.
   */
  pending_requests_on_marked_days: {
    count: number;
    staff: number;
    sample: Array<{ staff_name: string; work_date: string; request: string; category: string }>;
  };
  total_day_cells: number;
  counts: Record<ImportVerdict, number>;
  preview: ImportPreviewRow[];
  preview_truncated: boolean;
  parser_warnings: string[];
  exceptions: Array<{ code: string; name: string; work_date: string; reason: string }>;
  exceptions_total: number;
  skipped_no_organization: number;
  /** Field-level validation of the new machine columns. */
  /** Per-employee shift-timing resolution, so the rule can be checked before committing. */
  shift_coverage: BiometricShiftCoverageRow[];
  reconciliation: BiometricReconciliationRow[];
  reconciled_employees: number;
  anomalies: BiometricAnomaly[];
  anomalies_total: number;
  field_totals: BiometricFieldTotals;
  validation: BiometricUploadValidation;
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

// ---------------------------------------------------------------------------
// Import purge — super admin only. See
// supabase/migrations/20260820150000_biometric_import_purge_super_admin.sql
// ---------------------------------------------------------------------------

/**
 * One imported (machine, month). The MACHINE, not the staff member's college:
 * the Main Office machine's July 2026 import covers staff of six institutions,
 * so the file is the unit of import and therefore the unit of undo.
 */
export interface BiometricImportBatch {
  machine_institution_id: string;
  machine_name: string | null;
  machine_code: string | null;
  /** First day of the month, 'YYYY-MM-DD'. */
  month_start: string;
  record_count: number;
  staff_count: number;
  /** How many DIFFERENT colleges' staff this one machine's import touched. */
  staff_institution_count: number;
  reconciled_count: number;
  regularization_count: number;
  exception_count: number;
  open_exception_count: number;
  first_work_date: string;
  last_work_date: string;
  last_imported_at: string | null;
}

export interface BiometricPurgePreview {
  machine_name: string;
  month_start: string;
  month_label: string;
  records: number;
  staff: number;
  staff_institutions: number;
  /** Status code -> day count, e.g. { PRESENT: 757, ABSENT: 313 }. */
  by_status: Record<string, number>;
  /** Human work about to be discarded. Warn, do not block. */
  reconciled_records: number;
  /** Detached, not deleted — the staff member's request survives. */
  regularizations_unlinked: number;
  audit_rows_unlinked: number;
  exceptions: number;
  resolved_exceptions: number;
}

export interface BiometricPurgeReceipt {
  machine_name: string;
  month_start: string;
  month_label: string;
  deleted: { records: number; exceptions: number };
  unlinked: { regularizations: number; audit_rows: number };
}

/** 'YYYY-MM-DD' -> 'July 2026', without letting a Date constructor shift the month. */
export function biometricMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number);
  if (!y || !m) return monthStart;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
