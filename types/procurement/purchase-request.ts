// types/procurement/purchase-request.ts
import type { ProcurementDomain } from '@/lib/services/procurement/domain-adapters/types';

export type PurchaseRequestType = 'restock' | 'new_item' | 'mixed';

export type PurchaseRequestStatus =
  | 'draft'
  | 'submitted' // = "Requisition" (awaiting Super Admin)
  | 'returned' // sent back to the requester for changes; resubmit -> submitted
  | 'approved'
  | 'rejected'
  | 'converted' // rolled into an RFQ/PO
  | 'cancelled';

export interface ProcurementPurchaseRequest {
  id: string;
  institution_id: string;
  store_id: string | null;
  request_number: string;
  domain: ProcurementDomain;
  request_type: PurchaseRequestType;
  status: PurchaseRequestStatus;
  requested_by: string;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  /** Last "send back for changes": what the approver asked for, who, when, how many times. */
  returned_reason?: string | null;
  returned_by?: string | null;
  returned_at?: string | null;
  return_count?: number;
  /** Requester-given label, e.g. which lab the request is for. */
  title: string | null;
  /** Chosen by the requester; decides the approval steps. null = old single-approver rule. */
  category_id?: string | null;
  /** The department the purchase is FOR — its HOD approves an HOD step. */
  department_id?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Optional joins
  requested_by_profile?: { full_name: string | null } | null;
  approved_by_profile?: { full_name: string | null } | null;
  item_count?: number;
  /** List view only: what was asked for, so a row reads "Keyboard × 5", not a number. */
  item_preview?: Array<{ item_name: string; required_quantity: number }>;
  /** List view only: statuses of the quotation(s) raised from this request. */
  quote_statuses?: string[];
  /** List view only: statuses of the purchase orders those quotations produced. */
  order_statuses?: string[];
}

export interface ProcurementPurchaseRequestItem {
  id: string;
  request_id: string;
  domain_item_id: string | null; // null = new item
  item_name: string;
  item_spec: string | null;
  required_quantity: number;
  unit_id: string | null;
  unit_label: string | null;
  reason: string | null; // required when parent request_type = 'new_item'
  current_stock: number | null;
  reorder_level: number | null;
  estimated_cost: number | null;
  /** Snapshot of required_quantity before an approver's "Modify & Approve" edit — null if never modified. */
  original_quantity: number | null;
  quantity_modified_by: string | null;
  quantity_modified_at: string | null;
  created_at: string;
}

export interface PurchaseRequestWithItems extends ProcurementPurchaseRequest {
  items: ProcurementPurchaseRequestItem[];
}

export interface CreatePurchaseRequestItemDto {
  domain_item_id?: string | null;
  item_name: string;
  item_spec?: string | null;
  required_quantity: number;
  unit_id?: string | null;
  unit_label?: string | null;
  reason?: string | null;
  current_stock?: number | null;
  reorder_level?: number | null;
  estimated_cost?: number | null;
}

export interface CreatePurchaseRequestDto {
  institution_id: string;
  store_id?: string | null;
  domain?: ProcurementDomain; // defaults to 'ims'
  title?: string | null;
  notes?: string | null;
  category_id?: string | null;
  department_id?: string | null;
  /** Per item: domain_item_id set = restock, null = new item — request_type is derived from these, not client-supplied. */
  items: CreatePurchaseRequestItemDto[];
}

export interface PurchaseRequestFilters {
  institution_id?: string;
  /** No institution filter: every institution the viewer's RLS allows. */
  all_institutions?: boolean;
  store_id?: string;
  status?: PurchaseRequestStatus;
  /** Only purchases raised by this user ("Raised by me"). */
  requested_by?: string;
  /** Purchase stage (lib/procurement/purchase-stage.ts) — overrides `status`. */
  stage?: string;
  request_type?: PurchaseRequestType;
  search?: string;
  page?: number;
  limit?: number;
}

export const PR_STATUS_CONFIG: Record<
  PurchaseRequestStatus,
  { label: string; color: string }
> = {
  draft: { label: 'Not submitted', color: 'gray' },
  submitted: { label: 'Waiting for approval', color: 'amber' },
  returned: { label: 'Sent back for changes', color: 'amber' },
  approved: { label: 'Ready for quotations', color: 'blue' },
  rejected: { label: 'Rejected', color: 'red' },
  converted: { label: 'Collecting quotations', color: 'purple' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};
