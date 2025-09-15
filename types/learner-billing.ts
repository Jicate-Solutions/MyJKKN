/**
 * Types for Learner Billing Module
 * Comprehensive billing management and analytics for students
 */

export interface LearnerBillRecord {
  id: string;
  bill_description: string;
  due_date: string;
  quantity: number;
  unit_amount: number;
  total_amount: number;
  tax_amount: number;
  final_amount: number;
  balance_amount: number;
  status: 'paid' | 'unpaid' | 'partially_paid' | 'overdue' | 'cancelled' | 'refunded';
  payment_date?: string;
  created_at: string;
  updated_at: string;

  // Category details
  item_category: {
    id: string;
    item_category_name: string;
    frequency: 'monthly' | 'quarterly' | 'yearly' | 'one-time';
    parent_category?: {
      id: string;
      parent_category_name: string;
    };
    sub_category?: {
      id: string;
      sub_category_name: string;
    };
  };

  // Payment details
  payments?: LearnerPaymentRecord[];
  discounts?: LearnerDiscountRecord[];
}

export interface LearnerPaymentRecord {
  id: string;
  receipt_number: string;
  receipt_date: string;
  payment_mode: 'cash' | 'online' | 'bank_transfer' | 'dd' | 'cheque';
  payment_amount: number;
  payment_reference_number?: string;
  payment_remarks?: string;
  payer_name: string;
  payer_contact?: string;
  created_at: string;

  // Receipt items for this payment
  receipt_items: {
    id: string;
    amount_paid: number;
    bill_id: string;
  }[];
}

export interface LearnerDiscountRecord {
  id: string;
  discount_category: 'merit_scholarship' | 'financial_aid' | 'staff_quota' | 'sports_quota' | 'special_circumstances';
  discount_type: 'amount' | 'percentage';
  discount_value: number;
  discount_amount: number;
  discount_reason: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  effective_date: string;
  expiry_date?: string;
  created_at: string;
}

export interface LearnerBillingStats {
  total_bills: number;
  paid_bills: number;
  unpaid_bills: number;
  overdue_bills: number;
  total_amount_billed: number;
  total_amount_paid: number;
  outstanding_amount: number;
  overdue_amount: number;
  discount_amount: number;
  refund_amount: number;

  // Trends and analytics
  payment_trends: PaymentTrend[];
  monthly_breakdown: MonthlyBilling[];
  category_wise_breakdown: CategoryBilling[];
  payment_method_stats: PaymentMethodStats[];
  alerts: BillingAlert[];
}

export interface PaymentTrend {
  date: string;
  amount_paid: number;
  amount_due: number;
  outstanding_balance: number;
}

export interface MonthlyBilling {
  month: string;
  year: number;
  total_billed: number;
  total_paid: number;
  outstanding: number;
  bills_count: number;
  payments_count: number;
}

export interface CategoryBilling {
  category_id: string;
  category_name: string;
  parent_category?: string;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  bills_count: number;
  frequency: string;
}

export interface PaymentMethodStats {
  payment_mode: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface BillingAlert {
  id: string;
  type: 'overdue_payment' | 'payment_reminder' | 'payment_due' | 'partial_payment' | 'payment_success' | 'discount_available' | 'document_required';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  amount?: number;
  due_date?: string;
  bill_id?: string;
  action_url?: string;
  action_text?: string;
  suggested_action?: string;
  is_read: boolean;
  created_at: string;
}

export interface BillRecord {
  id: string;
  bill_number: string;
  student_id: string;
  category_id: string;
  category_name: string;
  description?: string;
  base_amount: number;
  additional_charges: number;
  discount_amount: number;
  final_amount: number;
  amount_paid: number;
  remaining_amount: number;
  due_date: string;
  status: 'paid' | 'unpaid' | 'overdue' | 'partially_paid';
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  receipt_number: string;
  student_id: string;
  payment_date: string;
  payment_amount: number;
  payment_mode: 'cash' | 'online' | 'bank_transfer' | 'dd' | 'cheque';
  transaction_id?: string;
  reference_number?: string;
  bank_name?: string;
  gateway_name?: string;
  gateway_response?: any;
  charges?: number;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  remarks?: string;
  created_at: string;
  updated_at: string;
}

export interface LearnerBillingFilters {
  status?: 'all' | 'paid' | 'unpaid' | 'overdue' | 'partially_paid';
  category_id?: string;
  date_range?: {
    from: string;
    to: string;
  };
  amount_range?: {
    min: number;
    max: number;
  };
  payment_mode?: string;
  view_mode: 'all' | 'current_semester' | 'academic_year' | 'custom';
}

export interface LearnerSemesterBilling {
  semester_id: string;
  semester_name: string;
  academic_year: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  bills_count: number;
  payment_percentage: number;
}

export interface BillingCalendarData {
  date: string;
  type: 'due_date' | 'payment_date' | 'overdue' | 'discount_effective';
  amount: number;
  description: string;
  status: 'completed' | 'pending' | 'overdue';
  bill_id?: string;
  receipt_id?: string;
}

export interface LearnerBillingDetails {
  student_id: string;
  student_name: string;
  roll_number?: string;
  student_photo_url?: string;
  program_name: string;
  department_name: string;
  semester_name: string;
  section_name: string;
  academic_year: string;

  // Financial summary
  current_semester: LearnerSemesterBilling;
  all_semesters: LearnerSemesterBilling[];
  billing_stats: LearnerBillingStats;

  // Detailed records
  bills: LearnerBillRecord[];
  payments: LearnerPaymentRecord[];
  discounts: LearnerDiscountRecord[];

  // Calendar and timeline
  billing_calendar: BillingCalendarData[];
  recent_transactions: (LearnerBillRecord | LearnerPaymentRecord)[];
}

export interface BillingChartData {
  type: 'line' | 'bar' | 'pie' | 'doughnut' | 'area' | 'combo';
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string;
      borderWidth?: number;
      fill?: boolean;
      type?: 'line' | 'bar';
      yAxisID?: string;
    }[];
  };
  options?: {
    responsive: boolean;
    interaction?: {
      intersect: boolean;
      mode: 'index' | 'nearest';
    };
    plugins?: {
      legend?: {
        display: boolean;
        position?: 'top' | 'bottom' | 'left' | 'right';
      };
      title?: {
        display: boolean;
        text: string;
      };
      tooltip?: {
        callbacks?: {
          label?: (context: any) => string;
        };
      };
    };
    scales?: {
      x?: {
        display: boolean;
        title?: {
          display: boolean;
          text: string;
        };
      };
      y?: {
        beginAtZero: boolean;
        max?: number;
        title?: {
          display: boolean;
          text: string;
        };
      };
      y1?: {
        type: 'linear';
        position: 'right';
        beginAtZero: boolean;
        title?: {
          display: boolean;
          text: string;
        };
      };
    };
  };
}

export interface BillingExportOptions {
  format: 'pdf' | 'excel' | 'csv';
  period: 'current_semester' | 'academic_year' | 'all_time' | 'custom';
  date_range?: {
    from: string;
    to: string;
  };
  include_charts: boolean;
  include_payment_details: boolean;
  include_discount_details: boolean;
  include_category_breakdown: boolean;
}

export interface PaymentRequest {
  bill_ids: string[];
  payment_mode: 'online' | 'bank_transfer' | 'dd';
  amount: number;
  return_url: string;
  webhook_url?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  payment_id: string;
  payment_url?: string;
  status: 'initiated' | 'processing' | 'success' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  gateway_response?: Record<string, any>;
  created_at: string;
}

// Notification types for billing events
export interface BillingNotification {
  id: string;
  type: 'bill_generated' | 'payment_received' | 'payment_overdue' | 'discount_applied' | 'refund_processed';
  title: string;
  message: string;
  amount?: number;
  bill_id?: string;
  receipt_id?: string;
  is_read: boolean;
  priority: 'low' | 'medium' | 'high';
  action_url?: string;
  created_at: string;
  expires_at?: string;
}