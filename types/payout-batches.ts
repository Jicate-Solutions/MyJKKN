// types/payout-batches.ts
// Four-stage payout batch. Backs fn_create_payout_batch + fn_advance_payout_batch
// (migration 20260722150000). SPECS.md §6 F6 / D10.

export type PayoutBatchStatus =
  | 'prepared' | 'reviewed' | 'approved' | 'processed' | 'cancelled';

export interface PayoutBatch {
  id: string;
  institution_id: string;
  batch_number: string | null;
  batch_name: string | null;
  total_consultants: number | null;
  total_transactions: number | null;
  total_gross_amount: number | null;
  total_tds_amount: number | null;
  total_net_amount: number | null;
  status: PayoutBatchStatus;
  prepared_by: string | null;
  prepared_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  processed_by: string | null;
  processed_at: string | null;
  completed_at: string | null;
  payment_mode: string | null;
  bank_reference: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  institution?: { id: string; name: string } | null;
}

export interface CreatePayoutBatchResult {
  batch_id: string;
  batch_number: string;
  transactions: number;
  consultants: number;
  net: number;
  status: 'prepared';
}
