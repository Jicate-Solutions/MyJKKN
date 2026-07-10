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

export type GrnMatchStatus =
  | 'awaiting_invoice'
  | 'matched'
  | 'qty_mismatch'
  | 'price_mismatch'
  | 'short'
  | 'over';

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
  /** Supplier's invoiced unit price for this line (for the price axis of the match). */
  invoice_unit_price: number | null;
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
  /** Actual invoice unit price → the batch's cost_price (overrides the PO estimate). */
  cost?: number | null;
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

export type ReplacementStatus = 'pending' | 'received';

export interface ProcurementGrnReplacement {
  id: string;
  grn_item_id: string;
  rejected_quantity: number;
  reason: string | null;
  status: ReplacementStatus;
  replacement_grn_item_id: string | null;
  created_at: string;
  // joined from the originating grn_item for display:
  grn_item?: {
    id: string;
    item_name: string;
    is_chemical: boolean;
    domain_item_id: string | null;
  } | null;
}

/** Payload when the supplier delivers replacement goods for a rejected line. */
export interface ReceiveReplacementInput {
  replacement_id: string;
  accepted_quantity: number;
  batch_number?: string | null;
  expiry_date?: string | null;
  manufacturing_date?: string | null;
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
  awaiting_invoice: { label: 'Awaiting Invoice', color: 'amber' }, // no supplier invoice yet — not a match
  matched: { label: 'Matched', color: 'green' },
  qty_mismatch: { label: 'Qty Mismatch', color: 'amber' },
  price_mismatch: { label: 'Price Mismatch', color: 'amber' },
  short: { label: 'Partial Delivery', color: 'blue' }, // expected, not an error
  over: { label: 'Over Supply', color: 'orange' },
};
