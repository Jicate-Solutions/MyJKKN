// types/procurement/purchase-order.ts
import type { ProcurementDomain } from '@/lib/services/procurement/domain-adapters/types';

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
  created_at: string;
  updated_at: string;
  supplier?: { id: string; name: string; code: string; email: string | null; gstin: string | null } | null;
  created_by_profile?: { full_name: string | null } | null;
  approved_by_profile?: { full_name: string | null } | null;
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
