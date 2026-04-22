// lib/types/grievance.ts
// ============================================================================
// Grievance module types — PR-A6a.
// Mirrors production grievance_tickets + grievance_categories + grievance_comments.
// ============================================================================

export type GrievanceStatus =
  | 'open'
  | 'in_progress'
  | 'pending_info'
  | 'resolved'
  | 'closed'
  | 'reopened';

export type GrievancePriority = 'low' | 'medium' | 'high' | 'urgent';

export type RaisedByType = 'learner' | 'parent' | 'staff' | 'alumni';

export type SlaStatus = 'on_track' | 'at_risk' | 'breached';

export interface GrievanceCategory {
  id: string;
  name: string;
  default_sla_hours: number | null;
  default_assignee_role: string | null;
  is_emergency: boolean;
  attachment_required: boolean;
  default_naac_metric_code: string | null;
  sort_order: number | null;
}

export interface GrievanceTicket {
  id: string;
  ticket_number: string;
  category_id: string;
  institution_id: string;
  subject: string;
  priority: GrievancePriority | null;
  status: GrievanceStatus | null;
  raised_by_type: RaisedByType;
  raised_by_name: string | null;
  sla_deadline: string;
  sla_status: SlaStatus | null;
  resolved_at: string | null;
  is_emergency: boolean;
  is_anonymous: boolean;
  escalation_level: number;
  created_at: string | null;
}

export interface GrievanceTicketDetail extends GrievanceTicket {
  description: string;
  raised_by_id: string | null;
  raised_by_email: string | null;
  raised_by_phone: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  department_id: string | null;
  sla_hours: number;
  resolution: string | null;
  resolved_by: string | null;
  satisfaction_rating: number | null;
  satisfaction_feedback: string | null;
  is_icc_only: boolean;
  sla_breached_at: string | null;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
  acknowledgment_pdf_url: string | null;
  resolution_letter_pdf_url: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
}

export interface GrievanceComment {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_name: string;
  author_type: 'staff' | 'learner' | 'parent' | 'alumni';
  content: string;
  is_internal: boolean | null;
  created_at: string | null;
}

export interface CreateGrievanceInput {
  institution_id: string;
  category_id: string;
  subject: string;
  description: string;
  priority?: GrievancePriority;
  raised_by_type: RaisedByType;
  raised_by_id?: string | null;
  raised_by_name?: string | null;
  raised_by_email?: string | null;
  raised_by_phone?: string | null;
  is_anonymous?: boolean;
  filed_by?: string | null;
  is_emergency?: boolean;
  is_icc_only?: boolean;
  sla_hours: number;
  sla_deadline: string;
  metadata?: Record<string, unknown>;
}

export interface GrievanceDashboardStats {
  total_open: number;
  total_in_progress: number;
  total_pending_info: number;
  total_resolved: number;
  total_closed: number;
  on_track: number;
  at_risk: number;
  breached: number;
  [key: string]: number | undefined;
}
