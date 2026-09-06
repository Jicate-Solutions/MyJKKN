/**
 * HR Payroll Module — TypeScript Types (T4.3 PR 2)
 *
 * Spec: specs/t4-payroll-design-lock-2026-05-15.md (20 decisions, lock 2026-05-15)
 * Migration (substrate): 20260628000000_t4_3_payroll_periods_approvals_payslips.sql
 * Migration (RPCs):      20260629000000_t4_3_pr2_payroll_rpcs.sql
 *
 * Pattern: mirrors types/hr-recruitment.ts (hand-rolled interfaces instead of
 * regenerated `types/supabase.ts`, which is too large to refresh per-PR).
 */

// =====================================================================================
// Enum-style literal types
// =====================================================================================

export type PayrollPeriodStatus =
  | 'draft'
  | 'prepared'
  | 'cao_reviewed'
  | 'accounts_verified'
  | 'chairperson_approved'
  | 'distributed'
  | 'locked';

export type PayrollEngineType = 'faculty' | 'non_teaching';

export type PayrollApprovalStage =
  | 'prepared'
  | 'cao_reviewed'
  | 'accounts_verified'
  | 'chairperson_approved'
  | 'distributed'
  | 'backdated_approval'
  | 'rejected_to_prior';

export type PayrollPaymentMode = 'neft' | 'cheque' | 'cash';

export type PayslipCorrectionType =
  | 'initial'
  | 'adjustment'
  | 'arrear'
  | 'recovery'
  | 'backdated';

// =====================================================================================
// hr_payroll_periods
// =====================================================================================

export interface HRPayrollPeriod {
  id: string;
  hr_organization_id: string;
  institution_id: string;
  engine_type: PayrollEngineType;
  period_year: number;
  period_month: number;
  status: PayrollPeriodStatus;

  working_days_count: number | null;
  total_calendar_days: number | null;

  is_backdated: boolean;
  backdate_reason: string | null;

  // Snapshots captured at "prepared" stage
  pay_matrix_snapshot: Record<string, unknown> | null;
  deduction_rates_snapshot: Record<string, unknown> | null;

  // Stage timestamps + actors
  prepared_at: string | null;
  prepared_by: string | null;
  cao_reviewed_at: string | null;
  cao_reviewed_by: string | null;
  accounts_verified_at: string | null;
  accounts_verified_by: string | null;
  chairperson_approved_at: string | null;
  chairperson_approved_by: string | null;
  distributed_at: string | null;
  distributed_by: string | null;
  locked_at: string | null;
  locked_by: string | null;

  // Aggregates (populated by T4.4+)
  total_gross: number | null;
  total_deductions: number | null;
  total_net: number | null;
  staff_count: number | null;

  created_at: string;
  updated_at: string;
}

export interface HRPayrollPeriodInsert {
  hr_organization_id: string;
  institution_id: string;
  engine_type: PayrollEngineType;
  period_year: number;
  period_month: number;
  /** Optional; defaults to 'draft' server-side. */
  status?: PayrollPeriodStatus;
  is_backdated?: boolean;
  backdate_reason?: string | null;
}

export interface HRPayrollPeriodUpdate {
  status?: PayrollPeriodStatus;
  total_gross?: number;
  total_deductions?: number;
  total_net?: number;
  staff_count?: number;
}

export interface PayrollPeriodFilters {
  hr_organization_id?: string;
  institution_id?: string;
  engine_type?: PayrollEngineType;
  period_year?: number;
  period_month?: number;
  status?: PayrollPeriodStatus | PayrollPeriodStatus[];
  is_backdated?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PayrollPeriodListResponse {
  data: HRPayrollPeriod[];
  metadata: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// =====================================================================================
// hr_payroll_period_approvals
// =====================================================================================

export interface HRPayrollPeriodApproval {
  id: string;
  period_id: string;
  stage: PayrollApprovalStage;
  approver_id: string;
  acted_at: string;
  comment: string | null;
  delegation_acting_as: string | null;
  rejected_from_stage: PayrollPeriodStatus | null;
}

// =====================================================================================
// hr_payslips (minimal — full surface lands with T4.4+ when slips are generated)
// =====================================================================================

export interface HRPayslip {
  id: string;
  period_id: string;
  staff_id: string;
  engine_type: PayrollEngineType;
  basic_pay: number;
  pay_scale_snapshot_id: string | null;
  working_days_attended: number;
  lop_days: number;
  gross_amount: number;
  total_deductions: number;
  net_amount: number;
  payment_mode: PayrollPaymentMode;
  bank_file_batch_id: string | null;
  cheque_roll_batch_id: string | null;
  pdf_storage_path: string | null;
  superseded_by: string | null;
  correction_type: PayslipCorrectionType;
  reason: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Salary import (2026-08-21) — POST /api/hr/payroll/salaries/import
// ---------------------------------------------------------------------------
// The dry run and the commit return the SAME shape, so the preview the user
// approves is literally the verdict the commit acts on. `written` and
// `failures` are the only fields a dry run leaves empty.

import type { SalaryUploadValidation } from '@/lib/hr/payroll/validate-salary-upload';

export interface SalaryImportResponse {
  success: boolean;
  dry_run: boolean;
  sheet_name: string;
  effective_from: string;
  parser_warnings: string[];
  validation: SalaryUploadValidation;
  written: number;
  failures: Array<{ employee_code: string; message: string }>;
  message?: string;
  error?: string;
}

// =====================================================================================
// Salary Register (2026-08-30) — hr_salary_register_runs / hr_salary_register_lines
// =====================================================================================
// Migration: 20260830150000_hr_salary_register.sql
//
// The frozen monthly register. NOT hr_payroll_periods — see that migration's
// header for why the two coexist rather than one replacing the other.
//
// Hand-rolled like the rest of this file: types/supabase.ts is too large to
// regenerate per-PR, so the services use `(supabase as any).from(...)` and these
// interfaces carry the shape.

/** Why a roster member produced no payable row. Ordered by how HR fixes them. */
export type SalaryRegisterExclusionReason =
  | 'no_salary_recorded'
  | 'salary_is_zero'
  | 'no_attendance_summary'
  | 'attendance_month_not_closed';

export interface HRSalaryRegisterRun {
  id: string;
  hr_organization_id: string;
  institution_id: string;
  period_year: number;
  period_month: number;

  /** The day-rate divisor, frozen. Institution month standard, not per-staff. */
  working_days_basis: number;
  /** Every closed attendance month that fed this run — plural by design. */
  source_attendance_period_ids: string[];

  staff_total: number;
  included_count: number;
  excluded_count: number;

  total_gross: number;
  total_deductions: number;
  total_net: number;

  generated_at: string;
  generated_by: string | null;
  /** Liveness. NULL = this is the live run for its org-month. */
  superseded_at: string | null;
  /** Provenance only — the run that replaced this one. Liveness is superseded_at. */
  superseded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRSalaryRegisterLine {
  id: string;
  run_id: string;
  staff_id: string;
  serial_no: number;

  // Snapshotted identity — a later transfer or rename must not rewrite an
  // issued register. employee_code is the CURRENT staff.staff_id, not legacy.
  employee_code: string | null;
  staff_name: string;
  designation: string | null;
  department_name: string | null;
  date_of_joining: string | null;
  bank_account_number: string | null;

  // WHO BEARS THIS SALARY. The register is grouped by WORK location, so a row's
  // payer can be a different institution — at Main Office all 121 are. Null is a
  // real answer: 105 active staff have no payer recorded and are still paid.
  paid_by_organization_id: string | null;
  paid_by_name: string | null;

  business_working_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  on_duty_days: number;
  worked_days: number;
  paid_days: number;

  actual_gross: number;
  basic_pay: number;
  /** Paid on top of basic_pay. Pro-rated with it, and never in the TDS base. */
  allowance: number;
  unpaid_leave_deduction: number;
  // Statutory deductions, snapshotted from the salary in force at generation.
  // Broken out rather than buried in total_deductions (which still carries
  // them) so a PF/ESI return can be read straight off the register.
  epf_deduction: number;
  esi_deduction: number;
  /**
   * Resolved from hr_tds_slabs against the monthly gross ALONE and snapshotted
   * here — which is what keeps an issued register explicable after someone
   * edits a band, and why the slab table needs no effective-dating.
   */
  tds_deduction: number;
  total_earnings: number;
  total_deductions: number;
  adjustment_amount: number;
  net_pay: number;
  remarks: string | null;

  is_included: boolean;
  exclusion_reason: SalaryRegisterExclusionReason | null;
  attendance_period_id: string | null;

  created_at: string;
  updated_at: string;
}

/** One work-location month the run depends on, and whether it is ready. */
export interface SalaryRegisterPeriodDependency {
  institution_id: string;
  institution_name: string;
  /** How many of THIS run's payees work there. */
  staff_count: number;
  period_id: string | null;
  status: 'locked' | 'open' | 'not_created';
  working_days_count: number | null;
  locked_at: string | null;
}

/**
 * The readiness verdict. This is the surface that answers "why can I not
 * generate", so every blocker is named rather than folded into a boolean.
 */
export interface SalaryRegisterPreflight {
  hr_organization_id: string;
  institution_id: string;
  organisation_name: string;
  period_year: number;
  period_month: number;

  /** True only when every dependency is locked AND at least one payee is payable. */
  can_generate: boolean;
  /** Ordered, human-readable. Rendered verbatim — the RPC/service names counts. */
  blockers: string[];
  warnings: string[];

  roster_count: number;
  payable_count: number;
  missing_salary_count: number;
  missing_bank_count: number;
  /** No paying institution recorded. Never blocks — only empties the subtotals. */
  missing_payer_count: number;
  /** Days the attendance evaluator could not judge, across the roster. */
  unprocessed_days: number;
  /** Half-days across the roster — a heavy count usually means missing punch-outs. */
  half_day_count: number;

  dependencies: SalaryRegisterPeriodDependency[];
  /** The divisor a generate would use, or null when no dependency is closed. */
  working_days_basis: number | null;
  /** A live run already exists for this org-month; generating supersedes it. */
  existing_run_id: string | null;
}

export interface SalaryRegisterRunDetail {
  run: HRSalaryRegisterRun;
  lines: HRSalaryRegisterLine[];
  organisation_name: string;
  institution_name: string;
}
