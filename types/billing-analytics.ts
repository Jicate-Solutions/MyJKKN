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
  student_count: number;
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
  total_billed: number;
  total_outstanding: number;
  paid_to_date: number; // billed − outstanding (snapshot basis)
  bill_count: number;
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
