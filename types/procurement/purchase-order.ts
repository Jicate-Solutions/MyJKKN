// types/procurement/purchase-order.ts
import type { ProcurementDomain } from '@/lib/services/procurement/domain-adapters/types';
import type { ProcurementPoFormat } from './po-format';

export type PoStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'sent'
  | 'partially_received'
  | 'completed'
  | 'closed'
  | 'cancelled';

export interface ProcurementPurchaseOrder {
  id: string;
  institution_id: string;
  store_id: string | null;
  po_number: string;
  supplier_id: string;
  rfq_id: string | null;
  domain: ProcurementDomain;
  status: PoStatus;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_terms: string | null;
  expected_delivery_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  pdf_url: string | null;
  created_by: string | null;
  notes: string | null;
  /** Accreditation tag — library-resource POs in a post-approval status auto-emit NAAC 3.1.1 purchase-bill evidence (DB trigger, Wave 2D). */
  is_library_resource: boolean;
  /** Selected document format; NULL falls back to the standard hardcoded layout. */
  po_format_id: string | null;
  /** Values for the active format's header_values.* fields. */
  header_field_values: Record<string, string>;
  /** Approved renegotiations so far (0 = as first ordered). Shown as "Rev N" on the order. */
  revision_no?: number;
  revised_at?: string | null;
  /** Values for the active format's footer_values.* fields. */
  footer_field_values: Record<string, string>;
  /** Free-text T&C; overrides the format's terms_and_conditions_default when set. */
  terms_and_conditions: string | null;
  created_at: string;
  updated_at: string;
  supplier?: {
    id: string;
    name: string;
    code: string;
    email: string | null;
    gstin: string | null;
    address?: string | null;
    phone?: string | null;
    /** The vendor master's usual terms — the order's last fallback. */
    payment_terms?: string | null;
    lead_time_days?: number | null;
  } | null;
  created_by_profile?: { full_name: string | null } | null;
  approved_by_profile?: { full_name: string | null } | null;
  po_format?: ProcurementPoFormat | null;
  item_count?: number;
  /** The request this order came from (PO -> RFQ -> request). Its number is the "Purchase no." users track. */
  purchase_request?: PurchaseRequestRef | null;
}

/** The source purchase request of a PO / GRN, as embedded by the list and detail selects. */
export interface PurchaseRequestRef {
  id: string;
  request_number: string;
  title: string | null;
}

export interface ProcurementPurchaseOrderItem {
  id: string;
  po_id: string;
  rfq_item_id: string | null;
  source_quotation_item_id: string | null;
  domain_item_id: string | null;
  item_name: string;
  item_spec: string | null;
  ordered_quantity: number;
  unit_id: string | null;
  unit_label: string | null;
  unit_price: number;
  line_total: number;
  received_quantity: number;
  /** Values for the active format's item_extra.* columns (HSN, GST%, MRP, ISBN, ...). */
  extra_fields: Record<string, string | number>;
  /** From the vendor's quotation line, else the item master — used when the order has no HSN / GST % of its own. */
  catalog?: { hsn: string | null; gst_percent: number | null } | null;
  created_at: string;
}

export interface PoWithItems extends ProcurementPurchaseOrder {
  items: ProcurementPurchaseOrderItem[];
  /** The vendor quotation this PO was awarded from (via its items), for the printed document. */
  /**
   * What the last order to this vendor printed (warranty, payment, terms…), minus the
   * per-order keys — a new order to the same vendor starts from these.
   */
  vendor_defaults?: Record<string, string> | null;
  vendor_default_terms?: string | null;
  source_quotation?: {
    vendor_quote_number: string | null;
    quote_date: string | null;
    delivery_time_days: number | null;
    payment_terms: string | null;
    warranty?: string | null;
    /** When the quotation was entered — stands in for an undated quotation. */
    created_at?: string | null;
  } | null;
}

export interface PurchaseOrderFilters {
  institution_id?: string;
  /** No institution filter: every institution the viewer's RLS allows. */
  all_institutions?: boolean;
  store_id?: string;
  status?: PoStatus;
  supplier_id?: string;
  rfq_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const PO_STATUS_CONFIG: Record<PoStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'gray' },
  pending_approval: { label: 'Pending Approval', color: 'amber' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  sent: { label: 'Sent to Vendor', color: 'blue' },
  partially_received: { label: 'Partially Received', color: 'indigo' },
  completed: { label: 'Completed', color: 'green' },
  closed: { label: 'Closed', color: 'gray' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

/** A renegotiation of an order's prices (procurement_po_revisions). */
export interface PoRevisionLine {
  po_item_id: string;
  item_name: string;
  quantity: number;
  unit_label: string | null;
  old_unit_price: number;
  new_unit_price: number;
}

export interface ProcurementPoRevision {
  id: string;
  po_id: string;
  revision_no: number;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  reason: string;
  vendor_quote_number: string | null;
  quote_date: string | null;
  delivery_time_days: number | null;
  payment_terms: string | null;
  lines: PoRevisionLine[];
  old_total: number;
  new_total: number;
  requested_by: string | null;
  requested_at: string;
  decided_at: string | null;
  decision_note: string | null;
  requester?: { full_name: string | null } | null;
  decider?: { full_name: string | null } | null;
}

export interface ProposePoRevisionDto {
  poId: string;
  lines: Array<{ po_item_id: string; unit_price: number }>;
  reason: string;
  quote: {
    vendor_quote_number?: string | null;
    quote_date?: string | null;
    delivery_time_days?: number | null;
    payment_terms?: string | null;
  };
}
