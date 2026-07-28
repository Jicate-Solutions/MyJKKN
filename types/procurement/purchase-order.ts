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
  /** Values for the active format's footer_values.* fields. */
  footer_field_values: Record<string, string>;
  /** Free-text T&C; overrides the format's terms_and_conditions_default when set. */
  terms_and_conditions: string | null;
  created_at: string;
  updated_at: string;
  supplier?: { id: string; name: string; code: string; email: string | null; gstin: string | null } | null;
  created_by_profile?: { full_name: string | null } | null;
  approved_by_profile?: { full_name: string | null } | null;
  po_format?: ProcurementPoFormat | null;
  item_count?: number;
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
  created_at: string;
}

export interface PoWithItems extends ProcurementPurchaseOrder {
  items: ProcurementPurchaseOrderItem[];
}

export interface PurchaseOrderFilters {
  institution_id?: string;
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
