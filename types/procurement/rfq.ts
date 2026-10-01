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
  | 'pending_award_approval'
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
  // Super Admin award approval (the single final sign-off).
  award_submitted_by: string | null;
  award_submitted_at: string | null;
  award_approved_by: string | null;
  award_approved_at: string | null;
  award_rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Optional joins
  created_by_profile?: { full_name: string | null } | null;
  source_request?: { request_number: string } | null;
  item_count?: number;
  vendor_count?: number;
  /** List view: quotations received so far. */
  quote_count?: number;
  /** List view: what is being bought, so a row reads "Keyboard × 5". */
  item_preview?: Array<{ item_name: string; quantity: number }>;
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
  // Plain stages: a quotation is never really a "draft" to the people using it.
  // pending_review / approved / rejected / sent are the retired review gate.
  draft: { label: 'Waiting for quotes', color: 'blue' },
  pending_review: { label: 'Waiting for quotes', color: 'blue' },
  approved: { label: 'Waiting for quotes', color: 'blue' },
  rejected: { label: 'Sent back', color: 'red' },
  sent: { label: 'Waiting for quotes', color: 'blue' },
  quotations_received: { label: 'Comparing quotes', color: 'purple' },
  compared: { label: 'Comparing quotes', color: 'purple' },
  pending_award_approval: { label: 'Waiting for Super Admin', color: 'amber' },
  awarded: { label: 'Ordered', color: 'green' },
  closed: { label: 'Closed', color: 'gray' },
  cancelled: { label: 'Cancelled', color: 'red' },
};
