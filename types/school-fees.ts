// types/school-fees.ts
//
// School fee module — Phase 2 (Layer 2).
// Design: docs/plans/2026-08-13-school-fee-structure-design.md
// Schema:  supabase/migrations/20260813100001..100009 (LIVE 2026-08-13)
//
// THE ONE FACT THAT EXPLAINS THIS MODULE:
// learners_profiles carries BOTH admission_year_id (cohort, never changes) and
// academic_year_id (current year). College admission_fee_structures resolve on
// the former — which is why a 4-year learner pays their admission-year sheet
// for 4 years. School plans resolve on the LATTER, which is why school fees
// re-fix annually. The two engines read different columns and never collide.

// ---------------------------------------------------------------------------
// Enums / literals
// ---------------------------------------------------------------------------

export type SchoolFeePlanStatus = 'draft' | 'active' | 'archived';

export type SchoolConcessionMode = 'percent' | 'flat';

/** Which institution kinds may use a billing category. See billing_categories.applies_to. */
export type FeeHeadAppliesTo = 'college' | 'school';

/** DB CHECK caps term_number at 1..6 so a 2- or 4-term school needs no migration. */
export const MIN_TERM_NUMBER = 1;
export const MAX_TERM_NUMBER = 6;

/** Default for both JKKN schools; a plan may still use fewer or more terms. */
export const DEFAULT_TERM_COUNT = 3;

/** Roman labels used on the printed fee sheets ("Term I", "Term II", …). */
export const TERM_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const;

export function termLabel(termNumber: number): string {
  return `Term ${TERM_ROMAN[termNumber - 1] ?? termNumber}`;
}

// ---------------------------------------------------------------------------
// Fee heads — a filtered projection of the GLOBAL billing_categories table
// ---------------------------------------------------------------------------

/**
 * A billing category usable by schools. Heads are NOT school-owned rows: they
 * live in the global billing_categories table and are scoped by the
 * `applies_to text[]` column added in 20260813100009. School screens must
 * filter `applies_to @> '{school}'` — without that filter every college head
 * (Hostel Fee, University Fee, "4 Year Tuition Fee", …) appears in the grid.
 */
export interface SchoolFeeHead {
  id: string;
  category_name: string;
  kind: string;
  frequency: string;
  applies_to: FeeHeadAppliesTo[];
  description: string | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Fee plans
// ---------------------------------------------------------------------------

export interface SchoolFeePlan {
  id: string;
  institution_id: string;
  /** The class (I STD / Grade 5). `programs` renders as "Class" for schools. */
  program_id: string;
  /** CURRENT academic year — never admission_year_id. */
  academic_year_id: string;
  version: number;
  name: string;
  status: SchoolFeePlanStatus;
  /**
   * Set by generation on first commit. Non-null means the plan is frozen and
   * edits must go through a new version (design §5.3). The service refuses
   * writes to a locked plan; the DB trigger that enforces it lands in Phase 9.
   */
  locked_at: string | null;
  superseded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;

  // Joined relations, populated by select() when requested
  institution?: { id: string; name: string; counselling_code: string | null };
  program?: { id: string; program_name: string };
  academic_year?: { id: string; academic_year_name: string };
}

/**
 * One NON-BLANK cell of the heads x terms grid. A head that is not charged in
 * a term simply has no row — that is how "Books & Notebooks — with Term I fee"
 * is represented.
 */
export interface SchoolFeePlanItem {
  id: string;
  plan_id: string;
  billing_category_id: string;
  term_number: number;
  amount: number;
  /**
   * Books & Notebooks, Uniform Kit: charged once per YEAR (not once ever).
   * For a mid-year joiner these follow the learner to their first generated
   * term rather than being skipped with the terms that already passed.
   */
  is_one_time: boolean;
  sort_order: number;

  // Joined
  billing_category?: { id: string; category_name: string; kind: string };
}

export interface SchoolFeePlanWithItems extends SchoolFeePlan {
  items: SchoolFeePlanItem[];
}

// ---------------------------------------------------------------------------
// Grid projection — what the editor and the list page actually render
// ---------------------------------------------------------------------------

export interface FeeGridRow {
  billing_category_id: string;
  category_name: string;
  is_one_time: boolean;
  sort_order: number;
  /** term_number -> amount. Absent key = blank cell = no DB row. */
  amounts: Record<number, number>;
  total: number;
}

export interface FeeGrid {
  /** Ascending term numbers actually present in the plan. */
  terms: number[];
  rows: FeeGridRow[];
  /** term_number -> column total */
  termTotals: Record<number, number>;
  grandTotal: number;
}

// ---------------------------------------------------------------------------
// Term calendar
// ---------------------------------------------------------------------------

/**
 * Due dates and flat fines, entered ONCE per school per academic year and
 * inherited by every class plan in that institution+year.
 *
 * NOTE: fine_amount is a FLAT rupee figure, not a rate. The college/hostel
 * fn_late_charge_* engine is a monthly compounding PERCENTAGE model and is
 * deliberately not used here.
 */
export interface SchoolTermCalendar {
  id: string;
  institution_id: string;
  academic_year_id: string;
  term_number: number;
  term_name: string;
  due_date: string;
  /** null = this term carries no late fine at all. */
  fine_effective_date: string | null;
  fine_amount: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// ---------------------------------------------------------------------------
// Concessions
// ---------------------------------------------------------------------------

export interface SchoolFeeConcessionScheme {
  id: string;
  institution_id: string;
  code: string;
  name: string;
  mode: SchoolConcessionMode;
  /** percent -> 0..100 (DB CHECK); flat -> rupees. */
  value: number;
  applies_to_all_heads: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;

  /** Heads the scheme touches. Ignored when applies_to_all_heads. */
  head_ids?: string[];
  heads?: Array<{ billing_category_id: string; category_name?: string }>;
}

export interface SchoolFeeConcessionAssignment {
  id: string;
  learner_id: string;
  scheme_id: string;
  /** Scoped per year so a concession never rolls forward silently. */
  academic_year_id: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;

  scheme?: Pick<SchoolFeeConcessionScheme, 'id' | 'code' | 'name' | 'mode' | 'value'>;
  learner?: { id: string; first_name: string | null; last_name: string | null; roll_number: string | null };
}

// ---------------------------------------------------------------------------
// Generation runs
// ---------------------------------------------------------------------------

export interface SchoolFeeGenerationRunClassRow {
  program_id: string;
  class_name: string;
  learners: number;
  plan_id: string | null;
  version: number | null;
  status: 'ready' | 'no_plan' | 'already_generated';
}

export interface SchoolFeeGenerationRun {
  id: string;
  institution_id: string;
  academic_year_id: string;
  is_dry_run: boolean;
  learners_matched: number;
  bills_created: number;
  skipped_no_plan: number;
  skipped_existing: number;
  result: SchoolFeeGenerationRunClassRow[] | null;
  run_by: string | null;
  run_at: string;
}

// ---------------------------------------------------------------------------
// Resolution — the output of school_fee_resolve_for_learner()
// ---------------------------------------------------------------------------

export interface ResolvedFeeHead {
  billing_category_id: string;
  category_name: string;
  is_one_time: boolean;
  gross: number;
  concession: number;
  net: number;
}

export interface ResolvedFeeTerm {
  term_number: number;
  term_name: string;
  /** null when the year has no term calendar row — generation refuses these. */
  due_date: string | null;
  fine_effective_date: string | null;
  fine_amount: number;
  heads: ResolvedFeeHead[];
  gross: number;
  concession: number;
  net: number;
}

export interface AppliedConcession {
  scheme_id: string;
  code: string;
  name: string;
  mode: SchoolConcessionMode;
  value: number;
  applies_to_all_heads: boolean;
}

export type SchoolFeeResolution =
  | {
      matched: false;
      learner_id: string;
      /** 'no_active_plan' | 'learner_missing_class_or_year' | 'plan_has_no_items' */
      reason: string;
      institution_id?: string;
      program_id?: string;
      academic_year_id?: string;
      plan_id?: string;
    }
  | {
      matched: true;
      learner_id: string;
      learner_name: string;
      roll_number: string | null;
      lifecycle_status: string;
      institution_id: string;
      program_id: string;
      academic_year_id: string;
      plan_id: string;
      plan_name: string;
      version: number;
      plan_locked: boolean;
      /** false when any term is missing its calendar row. */
      has_term_calendar: boolean;
      terms: ResolvedFeeTerm[];
      year_gross: number;
      year_concession: number;
      year_net: number;
      concessions_applied: AppliedConcession[];
    };

/** One row of school_fee_resolve_preview_for_class(). */
export interface ClassFeePreviewRow {
  learner_id: string;
  learner_name: string;
  roll_number: string | null;
  matched: boolean;
  reason: string | null;
  year_gross: number;
  year_concession: number;
  year_net: number;
  concession_count: number;
}

// ---------------------------------------------------------------------------
// Generation (Phase 7)
// ---------------------------------------------------------------------------

export type GenerationClassStatus =
  | 'ready'
  | 'no_plan'
  | 'no_calendar'
  | 'no_learners'
  | 'already_generated';

export interface GenerationPreviewRow {
  program_id: string;
  class_name: string;
  plan_id: string | null;
  plan_name: string | null;
  version: number | null;
  learners: number;
  already_billed: number;
  billable: number;
  status: GenerationClassStatus;
  year_gross: number;
  year_concession: number;
  year_net: number;
}

export interface GenerationResult {
  dry_run: boolean;
  run_id?: string;
  learners_matched: number;
  bills_created: number;
  skipped_no_plan: number;
  skipped_existing: number;
  plans_locked?: number;
  note?: string;
  classes: GenerationPreviewRow[];
}

/** Only 'ready' classes are billed; the rest explain why they were skipped. */
export const GENERATION_STATUS_LABEL: Record<GenerationClassStatus, string> = {
  ready: 'Ready',
  no_plan: 'No active plan',
  no_calendar: 'Term calendar incomplete',
  no_learners: 'No enrolled learners',
  already_generated: 'Already generated',
};

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface CreateSchoolFeePlanItemDto {
  billing_category_id: string;
  term_number: number;
  amount: number;
  is_one_time?: boolean;
  sort_order?: number;
}

export interface CreateSchoolFeePlanDto {
  institution_id: string;
  program_id: string;
  academic_year_id: string;
  name: string;
  status?: SchoolFeePlanStatus;
  notes?: string | null;
  items: CreateSchoolFeePlanItemDto[];
}

export type UpdateSchoolFeePlanDto = Partial<
  Omit<CreateSchoolFeePlanDto, 'institution_id' | 'program_id' | 'academic_year_id'>
>;

export interface UpsertSchoolTermCalendarDto {
  institution_id: string;
  academic_year_id: string;
  term_number: number;
  term_name: string;
  due_date: string;
  fine_effective_date?: string | null;
  fine_amount?: number;
}

export interface CreateSchoolFeeConcessionSchemeDto {
  institution_id: string;
  code: string;
  name: string;
  mode: SchoolConcessionMode;
  value: number;
  applies_to_all_heads?: boolean;
  is_active?: boolean;
  notes?: string | null;
  head_ids?: string[];
}

export type UpdateSchoolFeeConcessionSchemeDto = Partial<
  Omit<CreateSchoolFeeConcessionSchemeDto, 'institution_id'>
>;

export interface CreateSchoolFeeConcessionAssignmentDto {
  learner_id: string;
  scheme_id: string;
  academic_year_id: string;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Filters / list responses
// ---------------------------------------------------------------------------

export interface SchoolFeePlanFilters {
  search?: string;
  institution_id?: string;
  academic_year_id?: string;
  program_id?: string;
  status?: SchoolFeePlanStatus;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SchoolFeePlanListResponse {
  data: SchoolFeePlan[];
  metadata: { total: number; page: number; limit: number; totalPages: number };
}

export interface SchoolFeeConcessionSchemeFilters {
  institution_id?: string;
  is_active?: boolean;
  search?: string;
}

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

/** Build the render-ready grid from flat item rows. */
export function buildFeeGrid(items: SchoolFeePlanItem[]): FeeGrid {
  const byHead = new Map<string, FeeGridRow>();
  const termSet = new Set<number>();

  for (const item of items) {
    termSet.add(item.term_number);
    let row = byHead.get(item.billing_category_id);
    if (!row) {
      row = {
        billing_category_id: item.billing_category_id,
        category_name: item.billing_category?.category_name ?? 'Unknown head',
        is_one_time: item.is_one_time,
        sort_order: item.sort_order,
        amounts: {},
        total: 0,
      };
      byHead.set(item.billing_category_id, row);
    }
    // Same (head, term) twice cannot happen — UNIQUE (plan_id,
    // billing_category_id, term_number) — so assignment is safe.
    row.amounts[item.term_number] = item.amount;
    row.total += item.amount;
    // A head is one-time if ANY of its cells says so; the flag is per row in
    // the DB but conceptually per head.
    row.is_one_time = row.is_one_time || item.is_one_time;
    row.sort_order = Math.min(row.sort_order, item.sort_order);
  }

  const terms = [...termSet].sort((a, b) => a - b);
  const rows = [...byHead.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.category_name.localeCompare(b.category_name),
  );

  const termTotals: Record<number, number> = {};
  for (const t of terms) {
    termTotals[t] = rows.reduce((sum, r) => sum + (r.amounts[t] ?? 0), 0);
  }

  return {
    terms,
    rows,
    termTotals,
    grandTotal: rows.reduce((sum, r) => sum + r.total, 0),
  };
}

/** Flatten a grid back into DTO rows, dropping blank cells (design §4.2). */
export function gridToItems(grid: FeeGrid): CreateSchoolFeePlanItemDto[] {
  const out: CreateSchoolFeePlanItemDto[] = [];
  grid.rows.forEach((row, index) => {
    for (const term of grid.terms) {
      const amount = row.amounts[term];
      // `0` is a meaningful amount only if someone typed it; treat undefined
      // and null as "not charged" so no zero-rows pollute the plan.
      if (amount === undefined || amount === null) continue;
      out.push({
        billing_category_id: row.billing_category_id,
        term_number: term,
        amount,
        is_one_time: row.is_one_time,
        sort_order: row.sort_order ?? index,
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// School Bill Payment counter (/billing/school-fees/collect)
//
// These describe the READ side only. A recorded payment is a billing_receipts
// row created through BillingReceiptService — there is no school-specific
// payment table, so nothing here mirrors one.
// ---------------------------------------------------------------------------

/** A school learner as shown on the payment counter's profile card. */
export interface SchoolLearnerForPayment {
  id: string;
  first_name: string;
  last_name: string;
  roll_number: string | null;
  register_number: string | null;
  student_mobile: string | null;
  father_name: string | null;
  student_photo_url: string | null;
  institution_id: string;
  academic_year_id: string;
  /** programs.program_name — renders as "Class" for schools. */
  class_name: string | null;
  section_name: string | null;
}

/** One outstanding school fee bill row (one term × one fee head). */
export interface SchoolOutstandingBill {
  id: string;
  student_id: string;
  institution_id: string;
  item_category_id: string | null;
  category_name: string | null;
  bill_description: string | null;
  due_date: string | null;
  term_number: number | null;
  fine_effective_date: string | null;
  final_amount: number;
  /** Derived (final_amount − balance_amount), not a stored column. */
  paid_amount: number;
  balance_amount: number;
  status: string;
}

/** One receipt line that settled part or all of a school bill. */
export interface SchoolBillReceiptLink {
  receipt_id: string;
  receipt_number: string;
  receipt_date: string | null;
  amount_paid: number;
}

/**
 * A school bill that is fully settled — the "Paid" tab of the counter.
 *
 * Deliberately NOT a SchoolOutstandingBill with a zero balance: billBalance()
 * treats a zero balance as the legacy "never paid anything" case and falls back
 * to final_amount, which would render every settled bill as fully owed. A paid
 * bill carries no balance at all, so the shape does not have one.
 */
export interface SchoolSettledBill {
  id: string;
  item_category_id: string | null;
  category_name: string | null;
  bill_description: string | null;
  due_date: string | null;
  term_number: number | null;
  final_amount: number;
  paid_amount: number;
  status: string;
  /** Receipts that settled this bill, newest first. Empty on a bill written off
   *  or settled by an adjustment rather than a receipt. */
  receipts: SchoolBillReceiptLink[];
  /** Newest receipt_date across `receipts`; null when there is no receipt. */
  last_paid_date: string | null;
}

/** One past receipt that settled at least one of this year's school bills. */
export interface SchoolPaymentHistoryRow {
  receipt_id: string;
  receipt_number: string;
  receipt_date: string | null;
  payment_mode: string;
  payment_reference_number: string | null;
  date_of_credit: string | null;
  /** Header total of the receipt, which may span other years' bills too. */
  receipt_total: number;
  /**
   * Sum of this receipt's lines against THIS year's school bills. Not the
   * header total: a receipt that also settled a prior-year bill must not
   * report its full amount against the selected year.
   */
  amount_allocated: number;
}

/**
 * Counter payment modes. NEFT deliberately maps onto the existing
 * PaymentMode value 'bank_transfer' rather than widening the DB CHECK —
 * see migration 20260909000000.
 */
export const SCHOOL_PAYMENT_MODES = [
  { value: 'cash', label: 'Cash', icon: 'cash' },
  { value: 'dd', label: 'DD', icon: 'dd' },
  { value: 'bank_transfer', label: 'NEFT', icon: 'neft' },
  { value: 'online', label: 'Online', icon: 'online' },
] as const;

export type SchoolPaymentModeValue = (typeof SCHOOL_PAYMENT_MODES)[number]['value'];

/**
 * What the counter sends to fn_create_school_fee_receipt.
 *
 * Separate from the college CreateReceiptDto on purpose: the four non-cash
 * fields below exist only on the school path, and the college RPC does not
 * carry them (see migration 20260909002000).
 */
export interface CreateSchoolReceiptDto {
  student_id: string;
  institution_id: string;
  payment_mode: string;
  payment_reference_number?: string | null;
  payment_amount: number;
  payment_paid_date: string;
  /** Non-cash only. When the money actually credited. */
  date_of_credit?: string | null;
  dd_bank_name?: string | null;
  dd_branch?: string | null;
  remitter_name?: string | null;
  payer_name: string;
  payer_contact?: string | null;
  payment_remarks?: string | null;
  receipt_items: { bill_id: string; amount_paid: number }[];
}

/**
 * One generated school-fee bill line, flattened for the learner-wise report.
 * Sourced from billing_student_bills — what was actually written, not what
 * the generation preview projected.
 */
export interface SchoolFeeReportRow {
  student_id: string;
  learner_name: string;
  roll_number: string;
  register_number: string;
  class_name: string;
  section_name: string;
  fee_head: string;
  term_number: number | null;
  due_date: string | null;
  amount: number;
  balance: number;
  status: string;
}
