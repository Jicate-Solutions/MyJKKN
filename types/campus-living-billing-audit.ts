// ============================================================================
// CAMPUS LIVING — BILLING AUDIT TYPES
// ============================================================================
// Hostel-learner bill coverage + fee-band audit. Mirrors the two RPCs in
// migration 20260922120000 (get_cl_billing_audit_learners /
// get_cl_billing_audit_summary). Money columns arrive as strings over
// PostgREST (numeric) and are coerced in the service; a NULL stays null here —
// "no expectation configured" is a different fact from "expects zero".
// ============================================================================

export type BillingAuditFinding =
  | 'no_room_bill'
  | 'no_mess_bill'
  | 'upgrade_unbilled'
  | 'unpaid'
  | 'overdue'
  | 'amount_mismatch'
  | 'no_band'
  | 'category_drift';

/** Findings the RPC treats as problems. `no_band` and `category_drift` are
 *  informational — a learner carrying only those still counts as clean. */
export const PROBLEM_FINDINGS: readonly BillingAuditFinding[] = [
  'no_room_bill',
  'no_mess_bill',
  'upgrade_unbilled',
  'unpaid',
  'overdue',
  'amount_mismatch'
] as const;

export const FINDING_LABELS: Record<BillingAuditFinding, string> = {
  no_room_bill: 'No room bill',
  no_mess_bill: 'No mess bill',
  upgrade_unbilled: 'Upgrade not billed',
  unpaid: 'Outstanding',
  overdue: 'Overdue',
  amount_mismatch: 'Amount differs from structure',
  no_band: 'No fee band',
  category_drift: 'Bed ≠ billed category'
};

export const FINDING_DESCRIPTIONS: Record<BillingAuditFinding, string> = {
  no_room_bill: 'No live room / hostel-fee bill in the target academic year.',
  no_mess_bill: 'No live mess bill in the target academic year.',
  upgrade_unbilled:
    'The billed room category is above the fee-band entitlement and no room-upgrade bill exists.',
  unpaid: 'At least one hostel-kind bill has a pending balance.',
  overdue: 'A pending balance is past its due date.',
  amount_mismatch:
    'The room, mess or room-upgrade amount billed differs from what the resolved fee structure / upgrade table expects.',
  no_band: 'No hostel_program_eligibility band resolves for this learner (no entitlement to judge against).',
  category_drift:
    'The category of the occupied bed differs from the billed category (excludes the by-design Deluxe Plus → Deluxe stock mapping).'
};

/** Finding filter value for the table: one finding, everything, or only clean rows. */
export type BillingAuditFindingFilter = BillingAuditFinding | 'all' | 'clean';

export type BandStatus = 'within' | 'above' | 'below' | 'no_band' | 'no_category';

export const BAND_STATUS_LABELS: Record<BandStatus, string> = {
  within: 'Within band',
  above: 'Above band',
  below: 'Below band',
  no_band: 'No band',
  no_category: 'No category'
};

export type BillClass = 'room' | 'room_upgrade' | 'mess' | 'mess_upgrade';

export const BILL_CLASS_LABELS: Record<BillClass, string> = {
  room: 'Room',
  room_upgrade: 'Room upgrade',
  mess: 'Mess',
  mess_upgrade: 'Mess upgrade'
};

export type BillAggregateStatus = 'paid' | 'partially_paid' | 'unpaid';

export interface BillingAuditFilters {
  institution_ids?: string[] | null;
  /** null = each institution's current academic year (resolved in SQL). */
  academic_year_id?: string | null;
  block_id?: string | null;
  room_category_id?: string | null;
  program_id?: string | null;
  gender?: string | null;
  allocated_only?: boolean;
  finding?: BillingAuditFindingFilter;
  search?: string | null;
  page?: number;
  page_size?: number;
  sort_by?: string | null;
  sort_dir?: 'asc' | 'desc';
}

export interface BillingAuditBill {
  bill_id: string;
  class: BillClass;
  category_name: string;
  description: string | null;
  year_name: string | null;
  amount: number;
  paid: number;
  pending: number;
  status: string;
  due_date: string | null;
  is_overdue: boolean;
}

export interface BillingAuditRow {
  learner_id: string;
  roll_number: string | null;
  register_number: string | null;
  full_name: string;
  gender: string | null;
  institution_id: string;
  institution_name: string | null;
  program_name: string | null;
  year_of_study: number | null;
  semester_name: string | null;
  lifecycle_status: string;
  is_allocated: boolean;
  block_id: string | null;
  block_name: string | null;
  room_number: string | null;
  bed_number: string | null;
  seated_category_name: string | null;
  tagged_category_id: string | null;
  tagged_category_name: string | null;
  mess_category_name: string | null;
  band_fee: number | null;
  entitled_category_name: string | null;
  band_status: BandStatus;
  /** From the learner's resolved fee structure (fee_items). null = no snapshot. */
  expected_room_fee: number | null;
  expected_mess_fee: number | null;
  /** From hostel_category_upgrade_fees for entitled → billed category. */
  expected_upgrade_fee: number | null;
  /** hostel_fees per-bed annual rate for the billed category — informational. */
  category_room_rate: number | null;
  category_mess_rate: number | null;
  room_billed: number | null;
  room_paid: number | null;
  room_status: BillAggregateStatus | null;
  room_due_date: string | null;
  mess_billed: number | null;
  mess_paid: number | null;
  mess_status: BillAggregateStatus | null;
  mess_due_date: string | null;
  upgrade_billed: number | null;
  upgrade_paid: number | null;
  upgrade_status: BillAggregateStatus | null;
  upgrade_due_date: string | null;
  total_billed: number;
  total_paid: number;
  total_outstanding: number;
  overdue_amount: number;
  overdue_count: number;
  findings: BillingAuditFinding[];
  bills: BillingAuditBill[];
  target_academic_year_name: string | null;
  total_count: number;
}

export interface BillingAuditKpis {
  hostel_learners: number;
  allocated: number;
  room_billed_learners: number;
  mess_billed_learners: number;
  upgrade_billed_learners: number;
  above_band: number;
  upgrade_unbilled: number;
  upgrade_unbilled_amount: number;
  no_band: number;
  amount_mismatch: number;
  category_drift: number;
  overdue_learners: number;
  unpaid_learners: number;
  clean: number;
  total_billed: number;
  total_paid: number;
  total_outstanding: number;
  overdue_amount: number;
}

export interface BillingAuditSummary {
  kpis: BillingAuditKpis;
  by_finding: Array<{ finding: BillingAuditFinding; learners: number; outstanding: number }>;
  by_institution: Array<{
    id: string;
    name: string | null;
    learners: number;
    allocated: number;
    room_billed: number;
    mess_billed: number;
    billed: number;
    paid: number;
    outstanding: number;
    overdue: number;
    overdue_learners: number;
  }>;
  by_block: Array<{
    id: string | null;
    name: string;
    learners: number;
    billed: number;
    paid: number;
    outstanding: number;
    overdue: number;
    upgrade_unbilled: number;
  }>;
  by_room_category: Array<{
    id: string | null;
    name: string;
    learners: number;
    above_band: number;
    room_billed: number;
    category_room_rate: number | null;
    room_billed_amount: number;
    upgrade_billed_amount: number;
  }>;
  by_bill_status: Array<{ status: string; bills: number; amount: number }>;
  by_bill_class: Array<{ class: BillClass; bills: number; amount: number; paid: number; pending: number }>;
  overdue_aging: Array<{ bucket: '1-30' | '31-60' | '61-90' | '90+'; bills: number; amount: number }>;
  due_soon: Array<{ bucket: 'this_week' | 'this_month' | 'later'; bills: number; amount: number }>;
  target_years: Array<{ institution: string | null; academic_year_name: string | null }>;
}
