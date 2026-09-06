// types/billing.ts
//
// 2026-04-28: Collapsed 3-tier (parent/sub/item) institution-scoped billing categories
// into a single global flat BillingCategory. Categories are now common across all
// institutions and no longer carry institution_id.

export type BillingCategoryFrequency =
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'one-time';

// DB enum `billing_category_kind`. Drives category grouping and lets specific
// pickers exclude kinds they don't manage (e.g. the admission fee-structure
// editor excludes 'transport' + 'hostel' — those are owned by the transport
// and campus-living modules respectively).
export type BillingCategoryKind =
  | 'application_fee'
  | 'tuition'
  | 'hostel'
  | 'transport'
  | 'exam'
  | 'library'
  | 'other'
  | 'university_fee'
  | 'mess'
  | 'establishment'
  // Late-payment charge head (2026-08-07). Penalty bills are created only by
  // fn_late_charge_accrue — never hand-picked in the category form.
  | 'penalty';

/**
 * Who the money ultimately belongs to.
 *
 * 'government' fees are collected ON BEHALF OF a government body — the cash passes
 * through the institution but is not management revenue, so the billing dashboards
 * report it as its own bucket. See `billing_categories.collection_type`.
 */
export type BillingCollectionType = 'management' | 'government';

export interface BillingCategory {
  id: string;
  category_name: string;
  amount: number | null;
  frequency: BillingCategoryFrequency;
  kind: BillingCategoryKind;
  description: string | null;
  is_active: boolean;
  /**
   * false = this category's bills and receipt lines are hidden from the learner
   * side (/learners/my-bills + parent portal). It stays fully billable, payable
   * and visible to Accounts — this is a learner-presentation gate only.
   */
  visible_to_learners: boolean;
  /**
   * true = a learner may hold at most ONE live bill for this category, ever.
   *
   * Enforced in Postgres by trg_billing_bills_once_per_learner, NOT in the
   * service layer — bills reach billing_student_bills from ten paths (four in
   * TypeScript, six SECURITY DEFINER RPCs plus the feesync cron), so an
   * application-level guard would be bypassed by most of them.
   *
   * Distinct from `frequency`, which is descriptive metadata only and is
   * already 'one-time' on nearly every category. Defaults false so enabling is
   * always deliberate.
   */
  once_per_learner: boolean;
  collection_type: BillingCollectionType;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateBillingCategoryDto {
  category_name: string;
  amount?: number | null;
  frequency: BillingCategoryFrequency;
  // Fee head — drives Razorpay account routing (payment-gateway-service matches
  // billing_categories.kind against razorpay_accounts.fee_head). Required so a new
  // category never silently defaults to 'other' and misroutes its payments.
  kind: BillingCategoryKind;
  description?: string | null;
  is_active?: boolean;
  /** Defaults to true (visible) when omitted. */
  visible_to_learners?: boolean;
  /** Defaults to false (unrestricted) when omitted. */
  once_per_learner?: boolean;
  // Required so a fee collected for a government body is never silently booked
  // as management revenue — same reasoning as `kind` above.
  collection_type: BillingCollectionType;
}

export interface UpdateBillingCategoryDto
  extends Partial<CreateBillingCategoryDto> {}

export interface BillingCategoryFilters {
  search?: string;
  frequency?: BillingCategoryFrequency;
  isActive?: boolean;
  collectionType?: BillingCollectionType;
  visibleToLearners?: boolean;
  page?: number;
  limit?: number;
  // Server-side sort (consumed by the advanced DataTable's sortable column headers).
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface BillingCategoryListResponse {
  data: BillingCategory[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Student self-service "My Bills" (read-only). The /learners/my-bills page
// fetches these server-side via the user session; RLS ("Students can view their
// own bills/receipts") scopes every row to the signed-in learner.
// ---------------------------------------------------------------------------

export interface MyBill {
  id: string;
  description: string;
  categoryName: string | null;
  /** Fee head (billing_categories.kind) — the routing/grouping bucket. */
  kind: BillingCategoryKind | null;
  totalAmount: number;
  balanceAmount: number;
  paidAmount: number;
  dueDate: string | null;
  status: string | null;
  /**
   * Grouping label — trimmed academic_years.academic_year_name when the bill
   * carries one, otherwise inferred from due_date (Indian AY: June–May).
   */
  academicYear: string;
  /** True when academicYear was inferred from due_date, not stored on the bill. */
  yearInferred: boolean;
}

/**
 * One month of the late-payment-charge derivation for an overdue bill —
 * a row from fn_late_charge_derivation. Present on /learners/my-bills ONLY
 * while the billing.late_charge.enabled policy is true (OFF today).
 */
export interface MyBillLateChargeMonth {
  monthNumber: number;
  periodStart: string;
  periodEnd: string;
  openingBase: number;
  ratePercent: number;
  monthCharge: number;
  cumulativeCharge: number;
}

/** The late-payment charge on one overdue bill, with its full derivation. */
export interface MyBillLateCharge {
  months: number;
  ratePercent: number;
  /** Total late charge accrued so far (the last month's cumulative figure). */
  chargeAmount: number;
  /** Unpaid balance + late charge — what settling the bill today would cost. */
  totalWithCharge: number;
  derivation: MyBillLateChargeMonth[];
}

/** One receipt line — which bill this payment settled (drives the PDF table). */
export interface MyReceiptItem {
  billId: string;
  billDescription: string;
  billDueDate: string | null;
  billAmount: number | null;
  amountPaid: number;
}

export interface MyReceiptRefund {
  date: string | null;
  category: string | null;
  method: string | null;
  amount: number;
}

export interface MyReceipt {
  id: string;
  receiptNumber: string;
  receiptDate: string | null;
  amount: number;
  paidDate: string | null;
  mode: string | null;
  reference: string | null;
  payerName: string | null;
  remarks: string | null;
  /** Grouping label — from the linked bills' academic year, else the paid date. */
  academicYear: string;
  items: MyReceiptItem[];
  /** Processed refunds only — total already deducted from this payment. */
  refundedAmount: number;
  refunds: MyReceiptRefund[];
}

export interface MyBillsData {
  totalDue: number;
  totalBilled: number;
  totalPaid: number;
  currency: string;
  /** All active bills (cancelled/superseded excluded) — client derives outstanding. */
  bills: MyBill[];
  receipts: MyReceipt[];
}
