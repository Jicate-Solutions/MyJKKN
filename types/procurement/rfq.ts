// types/procurement/rfq.ts
import type { ProcurementDomain } from '@/lib/services/procurement/domain-adapters/types';

export type RfqStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'sent'
  | 'quotations_received'
  | 'compared'
  | 'awarded'
  | 'closed'
  | 'cancelled';

export interface ProcurementRfq {
  id: string;
  institution_id: string;
  store_id: string | null;
  rfq_number: string;
  source_request_id: string | null;
  domain: ProcurementDomain;
  status: RfqStatus;
  requirement_pdf_url: string | null;
  created_by: string;
  sent_at: string | null;
  // Super-Admin review gate (before an RFQ can be sent to vendors).
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Optional joins
  created_by_profile?: { full_name: string | null } | null;
  source_request?: { request_number: string } | null;
  item_count?: number;
  vendor_count?: number;
}

export interface ProcurementRfqItem {
  id: string;
  rfq_id: string;
  request_item_id: string | null;
  domain_item_id: string | null;
  item_name: string;
  item_spec: string | null;
  quantity: number;
  unit_id: string | null;
  unit_label: string | null;
  created_at: string;
  /** Resolved live from the catalog when the RFQ is loaded — not a persisted column. Gates the Concentration field. */
  is_chemical?: boolean;
}

export interface ProcurementRfqVendor {
  id: string;
  rfq_id: string;
  supplier_id: string;
  sent_at: string | null;
  sent_email: string | null;
  created_at: string;
  // Optional join
  supplier?: { id: string; name: string; code: string; email: string | null } | null;
}

export interface RfqWithDetails extends ProcurementRfq {
  items: ProcurementRfqItem[];
  vendors: ProcurementRfqVendor[];
}

export interface RfqFilters {
  institution_id?: string;
  store_id?: string;
  status?: RfqStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export const RFQ_STATUS_CONFIG: Record<RfqStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'gray' },
  pending_review: { label: 'Pending Review', color: 'amber' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  sent: { label: 'Sent to Vendors', color: 'blue' },
  quotations_received: { label: 'Quotations Received', color: 'indigo' },
  compared: { label: 'Compared', color: 'purple' },
  awarded: { label: 'Awarded', color: 'green' },
  closed: { label: 'Closed', color: 'gray' },
  cancelled: { label: 'Cancelled', color: 'red' },
};
