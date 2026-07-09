// types/procurement/grn.ts
import type { ProcurementDomain } from '@/lib/services/procurement/domain-adapters/types';

export type GrnStatus =
  | 'draft'
  | 'pending_verification'
  | 'partially_accepted'
  | 'replacement_requested'
  | 'accepted'
  | 'completed'
  | 'cancelled';

export type GrnMatchStatus = 'matched' | 'qty_mismatch' | 'short' | 'over';

export interface ProcurementGrn {
  id: string;
  institution_id: string;
  store_id: string | null;
  grn_number: string;
  purchase_order_id: string;
  supplier_id: string;
  domain: ProcurementDomain;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  invoice_document_url: string | null;
  status: GrnStatus;
  received_by: string;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  supplier?: { id: string; name: string; code: string; gstin: string | null } | null;
  purchase_order?: { id: string; po_number: string } | null;
  received_by_profile?: { full_name: string | null } | null;
  verified_by_profile?: { full_name: string | null } | null;
  item_count?: number;
}

export interface ProcurementGrnItem {
  id: string;
  grn_id: string;
  po_item_id: string;
  domain_item_id: string | null;
  item_name: string;
  ordered_quantity: number;
  invoice_quantity: number | null;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  mismatch_flag: boolean;
  mismatch_remarks: string | null;
  replacement_required: boolean;
  rejection_reason: string | null;
  match_status: GrnMatchStatus;
  batch_number: string | null;
  expiry_date: string | null;
  manufacturing_date: string | null;
  cost_price: number;
  is_chemical: boolean;
  created_at: string;
}

export interface GrnWithItems extends ProcurementGrn {
  items: ProcurementGrnItem[];
}

/** Payload a receiver submits per line when creating a GRN against a PO. */
export interface GrnLineInput {
  po_item_id: string;
  invoice_quantity?: number | null;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  rejection_reason?: string | null;
  replacement_required?: boolean;
  batch_number?: string | null;
  expiry_date?: string | null;
  manufacturing_date?: string | null;
}

export interface CreateGrnInput {
  purchase_order_id: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  invoice_amount?: number | null;
  invoice_document_url?: string | null;
  notes?: string | null;
  lines: GrnLineInput[];
}

export interface GrnFilters {
  institution_id?: string;
  store_id?: string;
  status?: GrnStatus;
  purchase_order_id?: string;
  supplier_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const GRN_STATUS_CONFIG: Record<GrnStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'gray' },
  pending_verification: { label: 'Pending Verification', color: 'amber' },
  partially_accepted: { label: 'Partially Accepted', color: 'indigo' },
  replacement_requested: { label: 'Replacement Requested', color: 'orange' },
  accepted: { label: 'Accepted', color: 'green' },
  completed: { label: 'Completed', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export const GRN_MATCH_CONFIG: Record<GrnMatchStatus, { label: string; color: string }> = {
  matched: { label: 'Matched', color: 'green' },
  qty_mismatch: { label: 'Qty Mismatch', color: 'amber' },
  short: { label: 'Short Supply', color: 'red' },
  over: { label: 'Over Supply', color: 'orange' },
};
