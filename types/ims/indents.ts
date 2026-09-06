/**
 * IMS Indents (Purchase Requests)
 */

export type ImsIndentStatus =
  | 'draft'
  | 'pending_local_approval'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'pending_issue'
  | 'partially_issued'
  | 'issued'
  | 'delivered'
  | 'shipped'
  | 'received'
  | 'received_with_variance'
  | 'expired';

export type ImsIndentUrgency = 'normal' | 'urgent' | 'emergency';

/**
 * - `internal`          — department indent against its own store
 * - `intra_institution` — warehouse -> operating store, WITHIN one institution
 * - `inter_institution` — across institutions (RLS-limited; see ims_indent_requests_select)
 */
export type ImsRequestScope = 'internal' | 'inter_institution' | 'intra_institution';

/** Store-to-store supply scopes, as opposed to a department indent. */
export const IMS_SUPPLY_SCOPES: ImsRequestScope[] = ['intra_institution', 'inter_institution'];

export interface ImsIndentRequest {
  id: string;
  indent_number: string;
  department_id: string | null;
  requested_by: string;
  required_date: string | null;
  purpose: string;
  urgency: ImsIndentUrgency;
  is_emergency: boolean;
  emergency_reason: string | null;
  status: ImsIndentStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  institution_id: string;
  store_id: string | null;
  request_scope: ImsRequestScope;
  source_store_id: string | null;
  destination_institution_id: string | null;
  destination_store_id: string | null;
  local_approved_by: string | null;
  local_approved_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  department?: { id: string; department_name: string } | null;
  requested_by_profile?: { full_name: string } | null;
  approved_by_profile?: { full_name: string } | null;
  local_approved_by_profile?: { full_name: string } | null;
  /**
   * Un-inverted aliases. The underlying columns read backwards:
   * `source_store_id` is the store that RAISED the request (goods end there) and
   * `destination_store_id` is the store that SUPPLIES it. Prefer these two.
   */
  requesting_store?: { id: string; name: string; code: string; is_central_supply_store?: boolean } | null;
  supplying_store?: { id: string; name: string; code: string; is_central_supply_store?: boolean } | null;
  counterpart_institution?: { id: string; name: string } | null;

  /** @deprecated raw-column aliases — use requesting_store / supplying_store. */
  source_store?: { id: string; name: string; code: string } | null;
  // `institutions` has no `institution_name` column — only `name`.
  destination_institution?: { id: string; name: string } | null;
  /** @deprecated this is the SUPPLYING store — use supplying_store. */
  destination_store?: { id: string; name: string; code: string } | null;
}

export interface ImsIndentRequestItem {
  id: string;
  indent_id: string;
  item_id: string;
  quantity: number;
  unit_id: string;
  issued_quantity: number;
  notes: string | null;
  // Joined
  item?: { id: string; name: string; code: string };
  unit?: { id: string; name: string; abbreviation: string };
}

export interface ImsIndentWithItems extends ImsIndentRequest {
  items: ImsIndentRequestItem[];
}

export interface ImsIndentFilters {
  search?: string;
  status?: ImsIndentStatus;
  urgency?: ImsIndentUrgency;
  department_id?: string;
  requested_by?: string;
  institution_id?: string;
  store_id?: string;
  // Cross-store transfer filters (supply scopes)
  request_scope?: ImsRequestScope;
  /** Match any of these scopes. Takes precedence over `request_scope`. */
  request_scopes?: ImsRequestScope[];
  source_store_id?: string;
  destination_store_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export type CreateImsIndentDto = {
  department_id?: string;           // optional for inter-institution (no dept required)
  required_date?: string;
  purpose: string;
  urgency: ImsIndentUrgency;
  is_emergency?: boolean;
  emergency_reason?: string;
  institution_id: string;
  store_id?: string;
  // Cross-store transfer fields
  request_scope?: ImsRequestScope;
  source_store_id?: string;
  destination_institution_id?: string;
  destination_store_id?: string;
  items: Array<{
    item_id: string;
    quantity: number;
    unit_id: string;
    notes?: string;
  }>;
};

export const INDENT_STATUS_CONFIG: Record<ImsIndentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  // Phase D: dual-purpose status — HOD approval for department-scoped
  // requesters (internal scope); branch approval for inter-institution scope.
  pending_local_approval: { label: 'Awaiting HOD Approval', variant: 'outline' },
  pending_approval: { label: 'Pending Approval', variant: 'outline' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  pending_issue: { label: 'Pending Issue', variant: 'outline' },
  partially_issued: { label: 'Partially Issued', variant: 'outline' },
  issued: { label: 'Issued', variant: 'default' },
  delivered: { label: 'Delivered', variant: 'default' },
  shipped: { label: 'Shipped', variant: 'default' },
  received: { label: 'Received', variant: 'default' },
  received_with_variance: { label: 'Received (Variance)', variant: 'outline' },
  expired: { label: 'Expired', variant: 'destructive' },
};

export const INDENT_URGENCY_CONFIG: Record<ImsIndentUrgency, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  normal: { label: 'Normal', variant: 'secondary' },
  urgent: { label: 'Urgent', variant: 'outline' },
  emergency: { label: 'Emergency', variant: 'destructive' },
};
