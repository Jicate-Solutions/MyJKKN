// Billing Schedule Types
// This file contains all TypeScript interfaces for the billing schedule management system

// Enums and Union Types
export type BillStatus =
  | 'paid'
  | 'unpaid'
  | 'partially_paid'
  | 'cancelled'
  | 'overdue'
  | 'refunded';
export type PaymentMode = 'cash' | 'online' | 'bank_transfer' | 'dd' | 'cheque';
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

// ============================================
// OUTCOME-BASED DISCOUNT TYPES (Workshop Transformation)
// ============================================

/**
 * Type of outcome criteria for discounts
 */
export type OutcomeCriteriaType =
  | 'competency_achievement'
  | 'attendance'
  | 'cgpa'
  | 'industry_readiness'
  | 'placement';

/**
 * Condition for outcome-based discount qualification
 */
export interface OutcomeCondition {
  type: OutcomeCriteriaType;
  minimum_percentage?: number;
  minimum_value?: number;
  required_competencies?: string[];
  minimum_level?: 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

/**
 * Outcome criteria for automatic discount qualification
 */
export interface OutcomeCriteria {
  type: OutcomeCriteriaType;
  competency_ids?: string[];
  required_competencies?: string[];
  min_proficiency?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  minimum_level?: 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'expert';
  min_score?: number;
  evaluation_period_days?: number;
  industry_readiness_threshold?: number;
  or_conditions?: OutcomeCondition[];
}

/**
 * Verification details for outcome-based discounts
 */
export interface OutcomeVerification {
  verified: boolean;
  verified_at?: string;
  verified_by?: string;
  evidence_urls?: string[];
  status?: 'pending' | 'verified' | 'rejected';
  competencies_verified?: string[];
  readiness_score_at_verification?: number;
  notes?: string;
}
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
  is_recurring: boolean;
  recurrence_pattern?: RecurrencePattern;
  number_of_recurrences?: number;
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
    student_mobile: string;
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
    item_category_name: string;
    parent_category?: {
      id: string;
      parent_category_name: string;
    };
    sub_category?: {
      id: string;
      sub_category_name: string;
    };
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
  item_category_id?: string;
  status?: BillStatus;
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
  payment_paid_date: string;
  payer_name: string;
  payer_contact?: string;
  accountant_id?: string;
  payment_remarks?: string;
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

  // Outcome-based discount fields (Workshop Transformation)
  is_outcome_based?: boolean;
  outcome_criteria?: OutcomeCriteria;
  outcome_verification?: OutcomeVerification;

  // Related data
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
  // Outcome-based discount fields
  is_outcome_based?: boolean;
  outcome_criteria?: OutcomeCriteria;
}

export interface UpdateDiscountDto extends Partial<CreateDiscountDto> {
  authorizer_id?: string;
  approval_date?: string;
  approval_status?: ApprovalStatus;
  discount_amount?: number;
  outcome_verification?: OutcomeVerification;
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

// Student Search and List Interfaces
export interface StudentSearchFilters {
  institution_id?: string;
  academic_year_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  first_name?: string;
  last_name?: string;
  roll_number?: string;
  mobile_number?: string;
  is_profile_complete?: boolean;
  page?: number;
  limit?: number;
}

export interface StudentForBilling {
  id: string;
  roll_number?: string;
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

export interface BillingReportFilters {
  institution_id?: string;
  department_id?: string;
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
