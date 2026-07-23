// types/procurement/purchase-request.ts
import type { ProcurementDomain } from '@/lib/services/procurement/domain-adapters/types';

export type PurchaseRequestType = 'restock' | 'new_item' | 'mixed';

export type PurchaseRequestStatus =
  | 'draft'
  | 'submitted' // = "Requisition" (awaiting Super Admin)
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
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Optional joins
  requested_by_profile?: { full_name: string | null } | null;
  approved_by_profile?: { full_name: string | null } | null;
  item_count?: number;
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
  notes?: string | null;
  /** Per item: domain_item_id set = restock, null = new item — request_type is derived from these, not client-supplied. */
  items: CreatePurchaseRequestItemDto[];
}

export interface PurchaseRequestFilters {
  institution_id?: string;
  store_id?: string;
  status?: PurchaseRequestStatus;
  request_type?: PurchaseRequestType;
  search?: string;
  page?: number;
  limit?: number;
}

export const PR_STATUS_CONFIG: Record<
  PurchaseRequestStatus,
  { label: string; color: string }
> = {
  draft: { label: 'Draft', color: 'gray' },
  submitted: { label: 'Submitted', color: 'blue' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  converted: { label: 'Converted', color: 'purple' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};
