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
