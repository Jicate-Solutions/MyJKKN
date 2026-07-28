// ============================================================================
// Billing Analytics Dashboard — shared types
// ============================================================================
// Response shapes for the 7 SECURITY DEFINER analytics RPCs and the filters
// that drive them. See docs/superpowers/specs/2026-06-02-billing-analytics-
// dashboard-design.md for the data semantics (snapshot vs date-ranged metrics).
// ============================================================================

/** Filters shared by every analytics query. */
export interface BillingAnalyticsFilters {
  /** Accessible institution scope. Empty/undefined → all institutions the
   *  caller can access (resolved server-side via get_user_accessible_institutions). */
  institution_ids?: string[];
  /** ISO date (YYYY-MM-DD). Applies to date-ranged metrics (billed, collected, trend). */
  date_from?: string;
  date_to?: string;
}

/** Headline KPI card payload — single row. */
export interface BillingAnalyticsOverview {
  total_billed: number;
  total_collected: number;
  net_collected: number; // collected − processed refunds
  total_outstanding: number; // snapshot, as-of-now
  collection_rate: number; // %, collected / billed in range
  students_billed: number;
  total_bills: number;
  bills_paid: number;
  bills_unpaid: number;
  bills_partially_paid: number;
  total_discounts: number;
  total_refunds: number;
}

export interface TodayPaymentModeSlice {
  payment_mode: string;
  amount: number;
  count: number;
}

export interface TodayInstitutionSlice {
  institution_id: string;
  institution_name: string;
  amount: number;
  count: number;
}

export interface TodayRecentReceipt {
  id: string;
  receipt_number: string;
  payer_name: string;
  payment_amount: number;
  payment_mode: string;
  institution_name: string;
  created_at: string;
}

/** Live "Today's Collections" panel payload — single row. */
export interface BillingTodayCollections {
  today_total: number;
  today_count: number;
  by_mode: TodayPaymentModeSlice[];
  by_institution: TodayInstitutionSlice[];
  recent: TodayRecentReceipt[];
}

export type TrendGranularity = 'day' | 'month';

/** One point on the collection trend chart. */
export interface BillingCollectionTrendPoint {
  period: string; // 'YYYY-MM-DD' (day) or 'YYYY-MM' (month)
  billed: number;
  collected: number;
}

/** One row of the institution comparison table/chart. */
export interface BillingInstitutionAnalytics {
  institution_id: string;
  institution_name: string;
  total_billed: number;
  total_collected: number;
  total_outstanding: number; // snapshot
  collection_rate: number;
  bill_count: number;
  student_count: number; // distinct students billed in range
  students_with_dues: number; // distinct students with balance > 0 (fees pending, snapshot)
}

export type AgingBucket = 'not_due' | '0-30' | '31-60' | '61-90' | '90+';

/** One aging/overdue bucket (snapshot of bills with balance > 0). */
export interface BillingAgingBucketRow {
  bucket: AgingBucket;
  bill_count: number;
  balance: number;
}

/** Pending-fees breakdown by category kind (snapshot). */
export interface BillingCategoryAnalytics {
  kind: string; // tuition | hostel | transport | exam | university_fee | application_fee | other
  /** 'management' | 'government' — from billing_categories.collection_type. */
  collection_type: string;
  total_billed: number;
  total_outstanding: number;
  paid_to_date: number; // billed − outstanding (snapshot basis)
  /** Receipt-traced cash (billing_receipt_items). Differs from paid_to_date
   *  wherever a receipt was never linked to a bill. */
  collected_actual: number;
  bill_count: number;
}

/**
 * Management vs Government collection split.
 *
 * Cash is attributed through billing_receipt_items → bills → categories, which
 * is the only path that exists (receipts carry no category). Receipts with no
 * line items cannot be attributed at all and land in `unallocated_*` — on
 * current production data that is the LARGEST bucket, so it is always shown
 * rather than folded into management.
 *
 * Invariant, for any filter:
 *   management_collected + government_collected + unallocated_collected
 *     === total_collected
 *
 * The `*_billed` / `*_outstanding` figures come off the bill instead, which is
 * categorised almost everywhere — use those for "how much of what we charged
 * belongs to government".
 */
export interface BillingCollectionSplit {
  management_collected: number;
  government_collected: number;
  unallocated_collected: number;
  management_refunds: number;
  government_refunds: number;
  unallocated_refunds: number;
  management_net: number;
  government_net: number;
  unallocated_net: number;
  total_collected: number;
  management_billed: number;
  government_billed: number;
  management_outstanding: number;
  government_outstanding: number;
}

/** One (day × institution) row of the daily accounts-activity breakdown. */
export interface BillingDailyActivityRow {
  activity_date: string; // 'YYYY-MM-DD' (IST)
  institution_id: string;
  institution_name: string;
  bills_created: number; // billing_student_bills created that day
  amount_billed: number; // sum(final_amount) of those bills
  students_billed: number; // distinct students billed that day
  receipts_created: number; // billing_receipts with payment_paid_date that day
  amount_collected: number; // sum(payment_amount)
}

/** One account-user row of the activity leaderboard (actions + ₹ collected). */
export interface BillingUserActivityRow {
  user_id: string;
  full_name: string;
  role: string;
  actions_count: number; // user_activity_logs billing actions in range
  receipts_count: number; // billing_receipts created/handled in range
  amount_collected: number; // sum(payment_amount) in range
  discounts_count: number;
  refunds_count: number;
  last_active: string | null;
}
