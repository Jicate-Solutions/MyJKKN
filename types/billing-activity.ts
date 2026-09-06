import type { UserActivityLogWithUser, ActivityLogFilters } from './activity';

export const BILLING_RESOURCE_TYPES = [
  'bill',
  'receipt',
  'invoice',
  'discount',
  'refund',
  'category'
] as const;

export type BillingResourceType = (typeof BILLING_RESOURCE_TYPES)[number];

export const BILLING_ACTION_TYPES = [
  'create',
  'update',
  'delete',
  'payment_process',
  'invoice_generate',
  'discount_apply',
  'refund_process',
  'approve',
  'reject',
  // Receipt-cancellation lifecycle. Written by trg_log_receipt_cancel_activity
  // (20260825170000), one row per billing_receipt_cancel_request_actions row,
  // so the feed and the audit trail cannot drift.
  'cancel_request',
  'cancel_approve',
  'cancel_decline',
  'cancel_withdraw',
  'cancel_failed'
] as const;

export type BillingActionType = (typeof BILLING_ACTION_TYPES)[number];

export const BILLING_ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  payment_process: 'Payment',
  invoice_generate: 'Invoice',
  discount_apply: 'Discount',
  refund_process: 'Refund',
  approve: 'Approved',
  reject: 'Rejected',
  cancel_request: 'Cancellation Requested',
  cancel_approve: 'Cancellation Approved',
  cancel_decline: 'Cancellation Declined',
  cancel_withdraw: 'Cancellation Withdrawn',
  cancel_failed: 'Cancellation Failed'
};

export const BILLING_ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  payment_process: 'bg-emerald-100 text-emerald-800',
  invoice_generate: 'bg-purple-100 text-purple-800',
  discount_apply: 'bg-amber-100 text-amber-800',
  refund_process: 'bg-orange-100 text-orange-800',
  approve: 'bg-teal-100 text-teal-800',
  reject: 'bg-rose-100 text-rose-800',
  // Only cancel_approve moves money — it reads as destructive on purpose, to
  // stand out from the three that leave the receipt and the bill untouched.
  cancel_request: 'bg-yellow-100 text-yellow-800',
  cancel_approve: 'bg-red-100 text-red-800',
  cancel_decline: 'bg-slate-100 text-slate-800',
  cancel_withdraw: 'bg-slate-100 text-slate-800',
  cancel_failed: 'bg-rose-100 text-rose-800'
};

export const BILLING_RESOURCE_LABELS: Record<string, string> = {
  bill: 'Bill',
  receipt: 'Receipt',
  invoice: 'Invoice',
  discount: 'Discount',
  refund: 'Refund',
  category: 'Category'
};

export const BILLING_RESOURCE_COLORS: Record<string, string> = {
  bill: 'bg-sky-100 text-sky-800',
  receipt: 'bg-emerald-100 text-emerald-800',
  invoice: 'bg-violet-100 text-violet-800',
  discount: 'bg-amber-100 text-amber-800',
  refund: 'bg-orange-100 text-orange-800',
  category: 'bg-gray-100 text-gray-800'
};

export interface BillingActivityMetadata {
  sub_type?: string;
  student_id?: string;
  total_amount?: number;
  final_amount?: number;
  category_id?: string;
  reason?: string;
  deleted_ids?: string[];
  cancelled_ids?: string[];
  failed_count?: number;
  updated_fields?: string[];
  original_amount?: number;
  balance_at_cancel?: number;
  [key: string]: unknown;
}

export interface BillingActivityLog extends Omit<UserActivityLogWithUser, 'metadata'> {
  metadata?: BillingActivityMetadata;
}

export interface BillingActivityFilters extends Omit<ActivityLogFilters, 'ip_address' | 'status_code' | 'session_id'> {
  sub_type?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface BillingActivityMetrics {
  totalActivities: number;
  uniqueUsers: number;
  todayCount: number;
  yesterdayCount: number;
  topAction: { type: string; count: number; percentage: number } | null;
  topResource: { type: string; count: number; percentage: number } | null;
  actionBreakdown: Array<{ action_type: string; count: number; percentage: number }>;
  resourceBreakdown: Array<{ resource_type: string; count: number; percentage: number }>;
}

export interface BillingActivityListResponse {
  data: BillingActivityLog[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
