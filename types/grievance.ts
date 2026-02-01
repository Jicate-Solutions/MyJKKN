// types/grievance.ts
// F004: Grievance Ticketing System - Type Definitions

// Enums
export type GrievancePriority = 'low' | 'medium' | 'high' | 'urgent';
export type GrievanceStatus = 'open' | 'in_progress' | 'pending_info' | 'resolved' | 'closed' | 'reopened';
export type GrievanceSLAStatus = 'on_track' | 'at_risk' | 'breached';
export type RaiserType = 'learner' | 'parent' | 'staff' | 'alumni';
export type CommentAuthorType = 'staff' | 'learner' | 'parent' | 'system';

// Attachment interface
export interface GrievanceAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

// Category interface
export interface GrievanceCategory {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  default_sla_hours: number;
  default_assignee_role: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;

  // Nested children for tree structure
  children?: GrievanceCategory[];

  // Joined parent category
  parent?: GrievanceCategory;
}

// Create/Update DTOs for Category
export interface CreateGrievanceCategoryDto {
  institution_id: string;
  name: string;
  description?: string;
  parent_id?: string;
  default_sla_hours?: number;
  default_assignee_role?: string;
  is_active?: boolean;
  sort_order?: number;
}

export type UpdateGrievanceCategoryDto = Partial<CreateGrievanceCategoryDto>;

// Ticket interface
export interface GrievanceTicket {
  id: string;
  institution_id: string;
  ticket_number: string;
  category_id: string;
  subject: string;
  description: string;
  priority: GrievancePriority;
  status: GrievanceStatus;

  // Raiser info
  raised_by_type: RaiserType;
  raised_by_id: string | null;
  raised_by_name: string;
  raised_by_email: string | null;
  raised_by_phone: string | null;

  // Assignment
  assigned_to: string | null;
  assigned_at: string | null;
  department_id: string | null;

  // SLA tracking
  sla_hours: number;
  sla_deadline: string;
  sla_status: GrievanceSLAStatus;

  // Resolution
  resolution: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  satisfaction_rating: number | null;
  satisfaction_feedback: string | null;

  // Metadata
  attachments: GrievanceAttachment[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;

  // Joined fields
  category?: GrievanceCategory;
  assignee?: {
    id: string;
    full_name: string;
    email: string | null;
  };
  department?: {
    id: string;
    name: string;
  };
  resolver?: {
    id: string;
    full_name: string;
  };
  comments_count?: number;
}

// Create Ticket DTO
export interface CreateGrievanceTicketDto {
  institution_id: string;
  category_id: string;
  subject: string;
  description: string;
  priority?: GrievancePriority;
  raised_by_type: RaiserType;
  raised_by_id?: string;
  raised_by_name: string;
  raised_by_email?: string;
  raised_by_phone?: string;
  attachments?: GrievanceAttachment[];
  metadata?: Record<string, unknown>;
}

// Update Ticket DTO
export interface UpdateGrievanceTicketDto {
  category_id?: string;
  subject?: string;
  description?: string;
  priority?: GrievancePriority;
  status?: GrievanceStatus;
  assigned_to?: string;
  department_id?: string;
  resolution?: string;
  attachments?: GrievanceAttachment[];
  metadata?: Record<string, unknown>;
}

// Assign Ticket DTO
export interface AssignGrievanceTicketDto {
  assignee_id: string;
  department_id?: string;
}

// Resolve Ticket DTO
export interface ResolveGrievanceTicketDto {
  resolution: string;
}

// Rate Satisfaction DTO
export interface RateSatisfactionDto {
  rating: number; // 1-5
  feedback?: string;
}

// Comment interface
export interface GrievanceComment {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_name: string;
  author_type: CommentAuthorType;
  content: string;
  is_internal: boolean;
  attachments: GrievanceAttachment[];
  created_at: string;
}

// Create Comment DTO
export interface CreateGrievanceCommentDto {
  author_id?: string;
  author_name: string;
  author_type: CommentAuthorType;
  content: string;
  is_internal?: boolean;
  attachments?: GrievanceAttachment[];
}

// History interface
export interface GrievanceHistory {
  id: string;
  ticket_id: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  performed_by: string | null;
  performed_at: string;

  // Joined performer
  performer?: {
    id: string;
    full_name: string;
  };
}

// Filter interfaces
export interface GrievanceCategoryFilters {
  institution_id?: string;
  parent_id?: string;
  is_active?: boolean;
  search?: string;
}

export interface GrievanceTicketFilters {
  institution_id?: string;
  status?: GrievanceStatus;
  sla_status?: GrievanceSLAStatus;
  priority?: GrievancePriority;
  assigned_to?: string;
  category_id?: string;
  raised_by_type?: RaiserType;
  raised_by_id?: string;
  department_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

// List response interfaces
export interface GrievanceCategoryListResponse {
  data: GrievanceCategory[];
  total: number;
}

export interface GrievanceTicketListResponse {
  data: GrievanceTicket[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// SLA Dashboard Report
export interface GrievanceSLAReport {
  total_tickets: number;
  resolved_within_sla: number;
  breached: number;
  avg_resolution_hours: number;
  by_category: Record<string, {
    total: number;
    within_sla: number;
    avg_hours: number;
  }>;
  by_priority: Record<GrievancePriority, {
    total: number;
    within_sla: number;
    breached: number;
  }>;
  by_status: Record<GrievanceStatus, number>;
  sla_compliance_rate: number;
  trend: {
    date: string;
    total: number;
    resolved: number;
    breached: number;
  }[];
}

// Dashboard Stats
export interface GrievanceDashboardStats {
  total_open: number;
  total_in_progress: number;
  total_pending_info: number;
  total_resolved: number;
  total_closed: number;
  sla_on_track: number;
  sla_at_risk: number;
  sla_breached: number;
  avg_satisfaction: number;
  avg_resolution_time_hours: number;
}
