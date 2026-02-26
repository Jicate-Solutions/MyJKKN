/**
 * IMS Indents (Purchase Requests)
 */

export type ImsIndentStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'pending_issue'
  | 'partially_issued'
  | 'issued'
  | 'delivered';

export type ImsIndentUrgency = 'normal' | 'urgent' | 'emergency';

export interface ImsIndentRequest {
  id: string;
  indent_number: string;
  department_id: string;
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
  created_at: string;
  updated_at: string;
  // Joined
  department?: { id: string; department_name: string } | null;
  requested_by_profile?: { full_name: string } | null;
  approved_by_profile?: { full_name: string } | null;
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
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export type CreateImsIndentDto = {
  department_id: string;
  required_date?: string;
  purpose: string;
  urgency: ImsIndentUrgency;
  is_emergency?: boolean;
  emergency_reason?: string;
  institution_id: string;
  store_id?: string;
  items: Array<{
    item_id: string;
    quantity: number;
    unit_id: string;
    notes?: string;
  }>;
};

export const INDENT_STATUS_CONFIG: Record<ImsIndentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  pending_approval: { label: 'Pending Approval', variant: 'outline' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  pending_issue: { label: 'Pending Issue', variant: 'outline' },
  partially_issued: { label: 'Partially Issued', variant: 'outline' },
  issued: { label: 'Issued', variant: 'default' },
  delivered: { label: 'Delivered', variant: 'default' },
};

export const INDENT_URGENCY_CONFIG: Record<ImsIndentUrgency, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  normal: { label: 'Normal', variant: 'secondary' },
  urgent: { label: 'Urgent', variant: 'outline' },
  emergency: { label: 'Emergency', variant: 'destructive' },
};
