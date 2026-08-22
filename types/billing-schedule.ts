// Billing Schedule Types
// This file contains all TypeScript interfaces for the billing schedule management system

import type { BillingCollectionType } from './billing';
import type { EntityType } from './organizations';

// Enums and Union Types
export type BillStatus =
  | 'paid'
  | 'unpaid'
  | 'partially_paid'
  | 'cancelled'
  | 'overdue'
  | 'refunded'
  | 'superseded';
export type PaymentMode = 'cash' | 'online' | 'bank_transfer' | 'dd' | 'cheque' | 'combined';
export type RecurrencePattern = 'monthly' | 'quarterly' | 'yearly';
export type DiscountCategory =
  | 'merit_scholarship'
  | 'financial_aid'
  | 'staff_quota'
  | 'sports_quota'
  | 'special_circumstances';
export type DiscountType = 'amount' | 'percentage';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type RefundCategory =
  | 'course_change'
  | 'withdrawal'
  | 'overpayment'
  | 'duplicate_payment'
  | 'administrative_error'
  | 'service_not_provided'
  | 'system_error'
  | 'other';
export type RefundMethod =
  | 'cash'
  | 'bank_transfer'
  | 'adjust_future_bills'
  | 'cheque'
  | 'online_transfer';
export type RefundStatus = 'pending' | 'approved' | 'rejected' | 'processed';
export type InvoiceType = 'individual' | 'consolidated';

// Student Bill Interface
export interface StudentBill {
  id: string;
  student_id: string;
  institution_id: string;
  item_category_id: string;
  bill_description: string;
  due_date: string;
  quantity: number;
  unit_amount: number;
  total_amount: number;
  tax_amount: number;
  final_amount: number;
  status: BillStatus;
  payment_date?: string;
  balance_amount: number;
  remarks?: string;
  // Set once a refund-workflow request against this bill is disbursed
  // (billing_refund_requests → fn_disburse_refund_request RPC).
  refunded_amount?: number;
  refund_status?: 'partially_refunded' | 'refunded' | null;
  is_recurring: boolean;
  recurrence_pattern?: RecurrencePattern;
  number_of_recurrences?: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Academic year this bill applies to (academic_years.id). Nullable: legacy
  // and automated bills may be NULL ("Unspecified"); manual/bulk-create require it.
  academic_year_id?: string | null;

  // Related data
  creator?: {
    id: string;
    full_name: string;
  };
  academic_year?: {
    id: string;
    academic_year_name: string;
  };
  student?: {
    id: string;
    first_name: string;
    last_name: string;
    roll_number?: string;
    college_email: string;
    student_mobile: string;
    // Learner lifecycle state off learners_profiles (account → reserved →
    // admitted → active …). Surfaced as the "Learner Status" table column.
    lifecycle_status?: string;
    degree?: {
      id: string;
      degree_name: string;
    };
    department?: {
      id: string;
      department_name: string;
    };
    semester?: {
      id: string;
      semester_name: string;
    };
  };
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  item_category?: {
    id: string;
    category_name: string;
    /** Fee head (tuition/hostel/transport/…) — drives online-payment account routing. */
    kind?: string | null;
    amount?: number | null;
    frequency?: 'monthly' | 'quarterly' | 'yearly' | 'one-time';
  };
  discounts?: BillingDiscount[];
  receipt_items?: ReceiptItem[];
}

// Create and Update DTOs for Student Bill
export interface CreateStudentBillDto {
  student_id: string;
  institution_id: string;
  item_category_id: string;
  bill_description?: string;
  due_date: string;
  quantity?: number;
  unit_amount: number;
  total_amount: number;
  tax_amount?: number;
  final_amount: number;
  remarks?: string;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  number_of_recurrences?: number;
  // Hostel-billing provenance (columns on billing_student_bills). 'ad_hoc'
  // bills are exempt from the hostel-year generation dedup indexes.
  fee_source?: string;
  hostel_year_id?: string | null;
  applies_year_of_study?: number | null;
  // Academic year (academic_years.id) this bill applies to. Required by the
  // manual create + bulk-create forms; flows straight into the insert.
  academic_year_id?: string | null;
}

export interface UpdateStudentBillDto extends Partial<CreateStudentBillDto> {
  status?: BillStatus;
  payment_date?: string;
  balance_amount?: number;
}

// Student Bill Filters
export interface StudentBillFilters {
  search?: string;
  student_id?: string;
  institution_id?: string;
  // Restricts the list to bills of institutions with this entity_type. The
  // billing schedule is a college module, so every screen passes 'institution'
  // — school fee bills live behind /billing/school-fees. Without it the
  // "All Institutions" default view leaks the entity types the dropdown hides.
  institution_entity_type?: EntityType;
  item_category_id?: string;
  // Ownership of the fee — resolved to the matching billing_categories ids and
  // applied as item_category_id IN (...). Uncategorised bills are excluded when set.
  collection_type?: BillingCollectionType;
  status?: BillStatus;
  // learners_profiles.lifecycle_status — filters bills by the learner's
  // lifecycle state (routes the query through the !inner learner join).
  lifecycle_status?: string;
  due_date_from?: string;
  due_date_to?: string;
  amount_from?: number;
  amount_to?: number;
  is_recurring?: boolean;
  // Academic hierarchy filters
  academic_year_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  // accommodation_types.code (hostel | dayscholar | pg | not_applicable)
  accommodation_type?: string;
  // admission_years.admission_year_name (e.g. '2025-2026') — NOT an id.
  // admission_years is per-institution (79 rows, only 9 distinct names across
  // 11 colleges), so filtering by a single id would silently scope the result
  // to one college. The service resolves the name to every matching id and
  // applies them as student.admission_year_id IN (...).
  admission_year?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

// Student Bill List Response
export interface StudentBillListResponse {
  data: StudentBill[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Receipt Interface
export interface BillingReceipt {
  id: string;
  receipt_number: string;
  receipt_date: string;
  student_id: string;
  institution_id: string;
  payment_mode: PaymentMode;
  payment_reference_number?: string;
  payment_amount: number;
  /** Transaction date — when the payer says the money left their hands. */
  payment_paid_date: string;
  /**
   * When the money actually credited to the institution account. Deliberately
   * separate from payment_paid_date: a NEFT initiated on the 18th may credit on
   * the 19th, and reconciliation keys on the credit date.
   * NULL for cash and for every receipt raised before 20260909000000.
   */
  date_of_credit?: string | null;
  /** payment_mode='dd' only. */
  dd_bank_name?: string | null;
  /** payment_mode='dd' only. */
  dd_branch?: string | null;
  /**
   * Payer as named on the bank record for NEFT (payment_mode='bank_transfer').
   * Distinct from payer_name, which is who the counter recorded as paying.
   */
  remitter_name?: string | null;
  payer_name: string;
  payer_contact?: string;
  accountant_id?: string;
  payment_remarks?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;

  // Related data
  creator?: {
    id: string;
    full_name: string;
  };
  student?: {
    id: string;
    first_name: string;
    last_name: string;
    roll_number?: string;
    college_email: string;
  };
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  accountant?: {
    id: string;
    full_name: string;
  };
  receipt_items?: ReceiptItem[];
  refunds?: BillingRefund[];
}

// Receipt Item Interface
export interface ReceiptItem {
  id: string;
  receipt_id: string;
  bill_id: string;
  amount_paid: number;
  created_at: string;

  // Related data
  bill?: StudentBill;
  receipt?: BillingReceipt;
}

// Create and Update DTOs for Receipt
export interface CreateReceiptDto {
  student_id: string;
  institution_id: string;
  payment_mode: PaymentMode;
  payment_reference_number?: string;
  payment_amount: number;
  payment_paid_date: string;
  // NOTE: date_of_credit / dd_bank_name / dd_branch / remitter_name are NOT
  // here. They live on the billing_receipts ROW (see BillingReceipt) and are
  // read back by the school reprint, but only the school counter WRITES them,
  // through CreateSchoolReceiptDto + fn_create_school_fee_receipt. The college
  // RPC does not carry them, so accepting them here would silently drop them.
  payer_name: string;
  payer_contact?: string;
  accountant_id?: string;
  payment_remarks?: string;
  receipt_items: {
    bill_id: string;
    amount_paid: number;
  }[];
}

export interface UpdateReceiptDto
  extends Partial<Omit<CreateReceiptDto, 'receipt_items'>> {
  receipt_date?: string;
}

// Receipt Filters
export interface ReceiptFilters {
  search?: string;
  student_id?: string;
  institution_id?: string;
  /**
   * Matches receipts containing AT LEAST ONE line of this ownership. A single
   * payment can settle both management and government bills, so this is
   * inclusive — a mixed receipt appears under both filters.
   */
  collection_type?: BillingCollectionType;
  payment_mode?: PaymentMode;
  receipt_date_from?: string;
  receipt_date_to?: string;
  amount_from?: number;
  amount_to?: number;
  payer_name?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

// Receipt List Response
export interface ReceiptListResponse {
  data: BillingReceipt[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Discount Interface
export interface BillingDiscount {
  id: string;
  bill_id: string;
  discount_category: DiscountCategory;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  discount_reason: string;
  supporting_documents?: any;
  authorizer_id?: string;
  approval_date?: string;
  approval_status: ApprovalStatus;
  effective_date: string;
  expiry_date?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;

  // Related data
  creator?: {
    id: string;
    full_name: string;
  };
  bill?: StudentBill;
  authorizer?: {
    id: string;
    full_name: string;
  };
}

// Create and Update DTOs for Discount
export interface CreateDiscountDto {
  bill_id: string;
  discount_category: DiscountCategory;
  discount_type: DiscountType;
  discount_value: number;
  discount_reason: string;
  supporting_documents?: any;
  effective_date: string;
  expiry_date?: string;
}

export interface UpdateDiscountDto extends Partial<CreateDiscountDto> {
  authorizer_id?: string;
  approval_date?: string;
  approval_status?: ApprovalStatus;
  discount_amount?: number;
}

// Discount Filters
export interface DiscountFilters {
  search?: string;
  bill_id?: string;
  discount_category?: DiscountCategory;
  discount_type?: DiscountType;
  approval_status?: ApprovalStatus;
  effective_date_from?: string;
  effective_date_to?: string;
  page?: number;
  limit?: number;
}

// Discount List Response
export interface DiscountListResponse {
  data: BillingDiscount[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Refund Interface
export interface BillingRefund {
  id: string;
  receipt_id: string;
  refund_category: RefundCategory;
  refund_amount: number;
  refund_date: string;
  refund_method: RefundMethod;
  bank_details?: any;
  refund_reason: string;
  supporting_documents?: any;
  authorizer_id?: string;
  approved_by?: string;
  processing_fee: number;
  net_refund_amount: number;
  approval_status: RefundStatus;
  created_by?: string;
  created_at: string;
  updated_at: string;

  // Related data
  creator?: {
    id: string;
    full_name: string;
  };
  receipt?: BillingReceipt;
  authorizer?: {
    id: string;
    full_name: string;
  };
  approver?: {
    id: string;
    full_name: string;
  };
}

// Create and Update DTOs for Refund
export interface CreateRefundDto {
  receipt_id: string;
  refund_category: RefundCategory;
  refund_amount: number;
  refund_date: string;
  refund_method: RefundMethod;
  bank_details?: any;
  refund_reason: string;
  supporting_documents?: any;
  processing_fee?: number;
}

export interface UpdateRefundDto extends Partial<CreateRefundDto> {
  authorizer_id?: string;
  approval_status?: RefundStatus;
  net_refund_amount?: number;
}

// Refund Filters
export interface RefundFilters {
  search?: string;
  receipt_id?: string;
  refund_category?: RefundCategory;
  refund_method?: RefundMethod;
  approval_status?: RefundStatus;
  refund_date_from?: string;
  refund_date_to?: string;
  page?: number;
  limit?: number;
}

// Refund List Response
export interface RefundListResponse {
  data: BillingRefund[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Invoice Interface
export interface BillingInvoice {
  id: string;
  invoice_number: string;
  invoice_type: InvoiceType;
  invoice_date: string;
  student_id: string;
  institution_id: string;
  billing_period_from?: string;
  billing_period_to?: string;
  invoice_description?: string;
  tax_summary?: any;
  payment_terms?: string;
  due_date?: string;
  additional_charges: number;
  discount_applied: number;
  grand_total: number;
  created_by?: string;
  created_at: string;
  updated_at: string;

  // Related data
  student?: {
    id: string;
    first_name: string;
    last_name: string;
    roll_number?: string;
    college_email: string;
  };
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  invoice_items?: InvoiceItem[];
}

// Invoice Item Interface
export interface InvoiceItem {
  id: string;
  invoice_id: string;
  receipt_id: string;
  amount: number;
  created_at: string;

  // Related data
  receipt?: BillingReceipt;
}

// Create and Update DTOs for Invoice
export interface CreateInvoiceDto {
  invoice_type: InvoiceType;
  student_id: string;
  institution_id: string;
  billing_period_from?: string;
  billing_period_to?: string;
  invoice_description?: string;
  tax_summary?: any;
  payment_terms?: string;
  due_date?: string;
  additional_charges?: number;
  discount_applied?: number;
  invoice_items: {
    receipt_id: string;
    amount: number;
  }[];
}

export interface UpdateInvoiceDto
  extends Partial<Omit<CreateInvoiceDto, 'invoice_items'>> {
  invoice_date?: string;
  grand_total?: number;
}

// Invoice Filters
export interface InvoiceFilters {
  search?: string;
  student_id?: string;
  institution_id?: string;
  invoice_type?: InvoiceType;
  invoice_date_from?: string;
  invoice_date_to?: string;
  billing_period_from?: string;
  billing_period_to?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

// Invoice List Response
export interface InvoiceListResponse {
  data: BillingInvoice[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Accommodation-type filter options. The `value` is an `accommodation_types.code`.
// That table is GLOBAL (single row per code since 20260610100000), not per
// institution, so the dropdown works without first picking an institution.
// Billing Schedule resolves the code to ids in the service layer; the billing
// REPORTS filters resolve it in SQL instead — billing_report_student_cohort
// LEFT JOINs accommodation_types and compares on code.
export const ACCOMMODATION_TYPE_OPTIONS = [
  { value: 'hostel', label: 'Hostel' },
  { value: 'dayscholar', label: 'Day Scholar' },
  { value: 'pg', label: 'Paying Guest' },
  { value: 'not_applicable', label: 'Not Applicable' }
] as const;

/** The four valid accommodation_types.code values, derived so a typo like
 *  'day_scholar' fails to compile instead of silently matching nothing. */
export type AccommodationCode =
  (typeof ACCOMMODATION_TYPE_OPTIONS)[number]['value'];

// Learner lifecycle-status filter options for the billing schedule list.
// Scoped to the states a learner can be in once bills exist (the 'account'
// step onward — that's when bills are generated). `value` is the
// learners_profiles.lifecycle_status enum code; labels mirror
// components/learners/lifecycle-status-badge.tsx. Ordered by lifecycle
// progression so the dropdown reads top-to-bottom like the funnel.
export const LIFECYCLE_STATUS_FILTER_OPTIONS = [
  { value: 'account', label: 'Account' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'admitted', label: 'Admitted' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'exited', label: 'Exited' }
] as const;

// Student Search and List Interfaces
export interface StudentSearchFilters {
  institution_id?: string;
  // Restricts the result set to learners of institutions with this entity_type.
  // The billing schedule is a college module, so its student search passes
  // 'institution' — schools / offices / companies are billed elsewhere.
  institution_entity_type?: EntityType;
  academic_year_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  // accommodation_types.code (hostel | dayscholar | pg | not_applicable)
  accommodation_type?: string;
  first_name?: string;
  last_name?: string;
  roll_number?: string;
  /** learners_profiles.register_number — the university enrolment number,
   *  distinct from the institution-local roll_number. Both are printed on the
   *  ID card barcode, so the unified `query` below matches either. */
  register_number?: string;
  mobile_number?: string;
  /**
   * Unified operator search box. One string matched (case-insensitive,
   * substring) against first_name, last_name, roll_number, register_number
   * and student_mobile at once — what the counter clerk types or scans.
   * Applied as a single PostgREST `or(...)`, so it stays one round trip.
   *
   * When set, it takes precedence over the individual name/roll/mobile
   * filters (which the bulk pages still use programmatically).
   */
  query?: string;
  is_profile_complete?: boolean;
  page?: number;
  limit?: number;
}

export interface StudentForBilling {
  id: string;
  roll_number?: string;
  /** University enrolment number. Carried by the list query so the unified
   *  search box can show WHICH identifier matched the scan. */
  register_number?: string;
  first_name: string;
  last_name: string;
  father_name: string;
  mobile_number: string;
  college_email: string;
  institution_id: string;
  academic_year_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  // Quota and community are the two demographic dimensions a fee structure
  // resolves on, and gender drives the hostel/mess bands — accounts reads all
  // three next to the academic hierarchy when a bill looks wrong. Selected by
  // getStudentForBilling only; the list query does not carry them.
  gender?: string;
  quota_id?: string;
  community_category_id?: string;
  // Accommodation type off learners_profiles. Surfaced on the
  // /billing/schedule/students/[id] detail page (Accommodation card) and used by
  // the accommodation-type filter on the list pages.
  accommodation_type_id?: string;
  // Admission year off learners_profiles. Shown on the
  // /billing/schedule/students/[id] Academic Information card — the accounts
  // team reads it alongside Academic Year, which is a different thing: the
  // admission year is the cohort the learner joined in and never changes.
  admission_year_id?: string;
  // 2026-05-21: shown on /billing/schedule/students/[id] header so the
  // accounts team sees the learner's current state (account → reserved →
  // admitted → active) at a glance.
  lifecycle_status?: string;
  outstanding_amount: number;

  // Related data
  institution?: {
    id: string;
    name: string;
  };
  academic_year?: {
    id: string;
    academic_year_name: string;
  };
  degree?: {
    id: string;
    degree_name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  program?: {
    id: string;
    program_name: string;
  };
  semester?: {
    id: string;
    semester_name: string;
  };
  section?: {
    id: string;
    section_name: string;
  };
  quota?: {
    id: string;
    name: string;
  };
  // community_categories.code ('OC' | 'BC' | 'MBC' | 'SC' | 'ST' | …) is the
  // string every other learner surface displays (learner-detail, my-profile,
  // the API boundary), so billing shows the same one.
  community_category?: {
    id: string;
    code: string;
  };
  accommodation_type?: {
    id: string;
    code: string;
    name: string;
  };
  // admission_year_name is the display label ("2024-2025"); year is the plain
  // integer the rest of the platform keys cohorts on. Both carried so the UI
  // can fall back when a row was created without a name.
  admission_year?: {
    id: string;
    admission_year_name: string | null;
    year: number | null;
  };
}

export interface StudentForBillingListResponse {
  data: StudentForBilling[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Student Billing Summary Interface
export interface StudentBillingSummary {
  student: StudentForBilling;
  bills: StudentBill[];
  receipts: BillingReceipt[];
  discounts: BillingDiscount[];
  refunds: BillingRefund[];
  invoices: BillingInvoice[];
  summary: {
    total_bills: number;
    paid_amount: number;
    outstanding_amount: number;
    overdue_amount: number;
    discount_amount: number;
    refund_amount: number;
  };
}

// Bulk Operations
export interface BulkBillScheduleDto {
  student_ids: string[];
  bills: Omit<CreateStudentBillDto, 'student_id'>[];
}

export interface BulkOperationResult {
  success: string[];
  failed: {
    id: string;
    error: string;
  }[];
}

// Transaction and Reports
export interface TransactionSummary {
  total_bills: number;
  total_receipts: number;
  total_amount_billed: number;
  total_amount_collected: number;
  total_outstanding: number;
  total_overdue: number;
  total_discounts: number;
  total_refunds: number;
}

export type ReportSchemeKey =
  | 'first_graduate'
  | 'pmss'
  | 'scholarship_7_5'
  | 'other';

export const REPORT_SCHEME_OPTIONS: { value: ReportSchemeKey; label: string }[] = [
  { value: 'first_graduate', label: 'First Graduate' },
  { value: 'pmss', label: 'PMSS' },
  { value: 'scholarship_7_5', label: '7.5% Scholarship' },
  { value: 'other', label: 'Others / Not Applicable' },
];

export interface BillingReportFilters {
  institution_id?: string;
  /** Academic year id, or the ACADEMIC_YEAR_UNSPECIFIED sentinel for bills with no year. */
  academic_year_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  item_category_id?: string;
  /** Empty or absent means no scheme restriction. */
  schemes?: ReportSchemeKey[];
  /** accommodation_types.code values. Empty or absent means no restriction. */
  accommodation_codes?: AccommodationCode[];
  student_id?: string;
  date_from?: string;
  date_to?: string;
  report_type?:
    | 'summary'
    | 'detailed'
    | 'outstanding'
    | 'collection'
    | 'invoice'
    | 'discount'
    | 'refund';
  format?: 'pdf' | 'excel' | 'csv';
}

// Detailed Report Interfaces
export interface OutstandingReport {
  student_id: string;
  first_name: string;
  last_name?: string;
  roll_number?: string;
  institution_name: string;
  department_name?: string;
  total_outstanding: number;
  overdue_amount: number;
  bills: {
    id: string;
    bill_description: string;
    due_date: string;
    amount: number;
    status: BillStatus;
  }[];
}

export interface CollectionReport {
  receipt_id: string;
  receipt_number: string;
  receipt_date: string;
  first_name: string;
  last_name?: string;
  roll_number?: string;
  institution_name: string;
  payment_mode: PaymentMode;
  payment_amount: number;
  total_refunds: number;
  net_amount: number;
  has_refunds: boolean;
  accountant_name?: string;
}

export interface DiscountReport {
  discount_id: string;
  first_name: string;
  last_name?: string;
  roll_number?: string;
  institution_name: string;
  bill_description: string;
  discount_category: DiscountCategory;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  approval_status: ApprovalStatus;
  effective_date: string;
  authorizer_name?: string;
}

export interface RefundReport {
  refund_id: string;
  receipt_number: string;
  first_name: string;
  last_name?: string;
  roll_number?: string;
  institution_name: string;
  refund_category: RefundCategory;
  refund_method: RefundMethod;
  refund_amount: number;
  processing_fee: number;
  net_refund_amount: number;
  approval_status: RefundStatus;
  refund_date: string;
}

export interface InvoiceReport {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  first_name: string;
  last_name?: string;
  roll_number?: string;
  institution_name: string;
  invoice_type: InvoiceType;
  grand_total: number;
  billing_period_from?: string;
  billing_period_to?: string;
}

/**
 * One year-wise bucket for the /billing/reports dashboard cards.
 *
 * Produced by StudentYearBreakdownService, not by the dashboard RPC — that RPC
 * returns grand totals only.
 */
export interface StudentYearBreakdown {
  /** 1, 2, 3, … — or null for learners whose year cannot be determined. */
  year: number | null;
  /** Distinct learners with bills in this year. */
  student_count: number;
  amount_billed: number;
  amount_collected: number;
  /** Balance still carried on unpaid / partially paid / overdue bills. */
  outstanding: number;
}

export interface BillingDashboardMetrics {
  total_students: number;
  total_bills: number;
  total_amount_billed: number;
  total_amount_collected: number;
  total_outstanding: number;
  total_overdue: number;
  collection_rate: number;
  recent_transactions: {
    receipts: BillingReceipt[];
    bills: StudentBill[];
    refunds: BillingRefund[];
  };
  monthly_collection: {
    month: string;
    amount: number;
  }[];
  institution_wise_summary: {
    institution_id: string;
    institution_name: string;
    total_bills: number;
    amount_billed: number;
    amount_collected: number;
    outstanding: number;
  }[];
}

export interface ReportExportOptions {
  format: 'pdf' | 'excel' | 'csv';
  include_charts?: boolean;
  include_summary?: boolean;
  page_orientation?: 'portrait' | 'landscape';
}

// Bill Template Interface
export interface BillTemplate {
  id: string;
  template_name: string;
  institution_id: string;
  item_categories: {
    item_category_id: string;
    quantity: number;
    unit_amount?: number;
  }[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateBillTemplateDto {
  template_name: string;
  institution_id: string;
  item_categories: {
    item_category_id: string;
    quantity: number;
    unit_amount?: number;
  }[];
  is_active?: boolean;
}
