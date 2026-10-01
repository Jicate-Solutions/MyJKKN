// Consultant commission payment approval workflow — mirrors the billing refund
// workflow (types/billing-refund-workflow.ts). Tables and RPCs:
// supabase/migrations/20261228100000_consultant_commission_payment_workflow.sql

import type { RefundAttachment, RefundFlowStage } from '@/types/billing-refund-workflow';
import type { ConsultantFirstYearFeeCollection } from '@/types/education-consultants';

// Same shapes as the refund flow; aliased so callers read in commission terms.
export type CommissionPaymentAttachment = RefundAttachment;
export type CommissionPaymentFlowStage = RefundFlowStage;

export type CommissionPaymentStatus = 'pending_review' | 'pending_disbursement' | 'disbursed' | 'declined';
export type CommissionPaymentMode = 'bank_transfer' | 'upi' | 'cheque' | 'cash' | 'other';

export const COMMISSION_PAYMENT_MODES: { value: CommissionPaymentMode; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

export interface CommissionPaymentFlowConfig {
  id: string;
  name: string;
  initiator_roles: string[];
  initiator_users: string[];
  stages: CommissionPaymentFlowStage[];
  disburser_roles: string[];
  disburser_users: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CommissionPaymentRequestLine {
  id: string;
  request_id: string;
  group_id: string;
  earned_snapshot: number;
  paid_snapshot: number;
  balance_snapshot: number;
  amount: number;
  group?: { id: string; name: string };
}

export interface CommissionPaymentRequestAction {
  id: string;
  request_id: string;
  action_type: 'initiated' | 'approved' | 'declined' | 'disbursed';
  stage_index: number | null;
  stage_name: string;
  actor_id: string;
  actor_role_name: string | null;
  notes: string | null;
  attachments: CommissionPaymentAttachment[];
  created_at: string;
  actor?: { id: string; full_name: string };
}

export interface CommissionPaymentRequest {
  id: string;
  request_number: string;
  consultant_id: string;
  card_id: string;
  academic_year: number;
  status: CommissionPaymentStatus;
  current_stage_index: number;
  flow_snapshot: {
    config_id: string;
    initiator: { assignee_roles: string[]; assignee_users: string[] };
    stages: CommissionPaymentFlowStage[];
    disburser: { assignee_roles: string[]; assignee_users: string[] };
  };
  /** 1st-year fee collection per institution, frozen at initiation. */
  fee_collection_snapshot: ConsultantFirstYearFeeCollection[];
  total_amount: number;
  initiated_by: string;
  initiated_at: string;
  declined_by: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  declined_stage_name: string | null;
  payment_mode: CommissionPaymentMode | null;
  payment_details: Record<string, unknown> | null;
  disbursed_by: string | null;
  disbursed_at: string | null;
  created_at: string;
  consultant?: {
    id: string; name: string; code: string | null;
    bank_name?: string | null; bank_account_number?: string | null; bank_ifsc?: string | null; pan_number?: string | null;
  };
  initiator?: { id: string; full_name: string };
  lines?: CommissionPaymentRequestLine[];
  actions?: CommissionPaymentRequestAction[];
}

/** One rate-card line the initiate dialog can pay against. */
export interface PayableCommissionLine {
  group_id: string;
  group_name: string;
  earned: number;
  paid: number;
  balance: number;
  held: number;       // already asked for by other open requests
  payable: number;    // balance - held
}

export interface InitiateCommissionPaymentInput {
  consultant_id: string;
  academic_year: number;
  lines: { group_id: string; amount: number }[];
  notes: string;
  attachments: CommissionPaymentAttachment[];
}

export interface CommissionPaymentRequestFilters {
  page?: number;
  limit?: number;
  status?: CommissionPaymentStatus;
  consultant_id?: string;
  academic_year?: number;
  search?: string;      // matches request_number
}
