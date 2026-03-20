// ============================================
// SERVICE REQUEST TYPES
// Created: 2026-02-09
// ============================================

import { z } from 'zod';

// ---------- Enums ----------

export type ServiceRequestStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'fulfilled'
  | 'closed'
  | 'cancelled';

export type ServiceFieldType =
  | 'text'
  | 'select'
  | 'date'
  | 'number'
  | 'boolean'
  | 'textarea'
  | 'file';

export type ServiceRequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export type ServiceApprovalAction = 'pending' | 'approved' | 'rejected' | 'returned';

export type ServiceTimelineEventType =
  | 'status_change'
  | 'comment'
  | 'internal_note'
  | 'edit'
  | 'attachment_added'
  | 'system';

export type ApprovalWorkflowType = 'sequential' | 'parallel';

// ---------- Status Transitions ----------

export const SERVICE_REQUEST_STATUS_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['in_review', 'cancelled'],
  in_review: ['approved', 'rejected', 'returned'],
  approved: ['fulfilled', 'closed'],
  rejected: [],
  returned: ['submitted', 'cancelled'],
  fulfilled: ['closed'],
  closed: [],
  cancelled: [],
};

// ---------- Service Type ----------

export interface ServiceType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  is_active: boolean;
  is_system_default: boolean;
  allowed_roles: string[];
  max_active_requests: number;
  auto_fulfill_on_approval: boolean;
  enable_priority: boolean;
  enable_attachments: boolean;
  enable_email_notifications: boolean;
  approval_workflow_type: ApprovalWorkflowType;
  attachment_config: {
    max_files: number;
    max_size_mb: number;
    allowed_types: string[];
  } | null;
  validity_period_days: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Relations (joined)
  fields?: ServiceTypeField[];
  approval_steps?: ServiceRequestApprovalStep[];
}

export interface ServiceTypeField {
  id: string;
  service_type_id: string;
  field_key: string;
  field_label: string;
  field_type: ServiceFieldType;
  field_options: Array<{ label: string; value: string }> | null;
  is_required: boolean;
  display_order: number;
  placeholder: string | null;
  help_text: string | null;
  default_value: string | null;
  created_at: string;
}

export interface ServiceRequestApprovalStep {
  id: string;
  service_type_id: string;
  step_order: number;
  step_name: string;
  approver_role: string;
  is_required: boolean;
  on_return_restart_from_step: number | null;
  created_at: string;
}

// ---------- Service Request ----------

export interface ServiceRequest {
  id: string;
  request_number: string;
  service_type_id: string;
  requester_id: string;
  institution_id: string | null;
  status: ServiceRequestStatus;
  priority: ServiceRequestPriority | null;
  current_approval_step: number;
  form_data: Record<string, any>;
  requester_context: {
    institution_name?: string;
    department?: string;
    program?: string;
    semester?: string;
    section?: string;
    batch?: string;
    role?: string;
    email?: string;
    phone?: string;
  };
  submitted_at: string | null;
  approved_at: string | null;
  fulfilled_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  validity_expires_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;

  // Relations (joined)
  service_type?: ServiceType;
  requester?: { id: string; full_name: string; email: string; avatar_url: string | null };
  institution?: { id: string; name: string };
  approvals?: ServiceRequestApproval[];
  timeline?: ServiceRequestTimelineEntry[];
  attachments?: ServiceRequestAttachment[];
}

export interface ServiceRequestApproval {
  id: string;
  service_request_id: string;
  approval_step_id: string | null;
  step_order: number;
  approver_id: string;
  action: ServiceApprovalAction;
  comments: string | null;
  acted_at: string | null;
  created_at: string;

  // Relations
  approver?: { id: string; full_name: string; email: string };
  approval_step?: ServiceRequestApprovalStep;
}

export interface ServiceRequestTimelineEntry {
  id: string;
  service_request_id: string;
  actor_id: string | null;
  event_type: ServiceTimelineEventType;
  old_status: ServiceRequestStatus | null;
  new_status: ServiceRequestStatus | null;
  content: string | null;
  is_internal: boolean;
  metadata: Record<string, any>;
  created_at: string;

  // Relations
  actor?: { id: string; full_name: string; email: string; avatar_url: string | null };
}

export interface ServiceRequestAttachment {
  id: string;
  service_request_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;

  // Relations
  uploader?: { id: string; full_name: string };
}

// ---------- DTOs ----------

export interface CreateServiceTypeDto {
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  allowed_roles: string[];
  max_active_requests?: number;
  auto_fulfill_on_approval?: boolean;
  enable_priority?: boolean;
  enable_attachments?: boolean;
  enable_email_notifications?: boolean;
  approval_workflow_type?: ApprovalWorkflowType;
  attachment_config?: { max_files: number; max_size_mb: number; allowed_types: string[] };
  validity_period_days?: number | null;
  fields: CreateServiceTypeFieldDto[];
  approval_steps: CreateApprovalStepDto[];
}

export interface CreateServiceTypeFieldDto {
  field_key: string;
  field_label: string;
  field_type: ServiceFieldType;
  field_options?: Array<{ label: string; value: string }>;
  is_required?: boolean;
  display_order: number;
  placeholder?: string;
  help_text?: string;
  default_value?: string;
}

export interface CreateApprovalStepDto {
  step_order: number;
  step_name: string;
  approver_role: string;
  is_required?: boolean;
  on_return_restart_from_step?: number | null;
}

export interface UpdateServiceTypeDto extends Partial<Omit<CreateServiceTypeDto, 'slug'>> {
  is_active?: boolean;
}

export interface CreateServiceRequestDto {
  service_type_id: string;
  form_data: Record<string, any>;
  priority?: ServiceRequestPriority;
  status?: 'draft' | 'submitted';
}

export interface UpdateServiceRequestDto {
  form_data?: Record<string, any>;
  priority?: ServiceRequestPriority;
}

export interface ProcessApprovalDto {
  action: 'approved' | 'rejected' | 'returned';
  comments?: string;
}

// ---------- Filters ----------

export interface ServiceRequestFilters {
  search?: string;
  service_type_id?: string;
  status?: ServiceRequestStatus | ServiceRequestStatus[];
  priority?: ServiceRequestPriority;
  requester_id?: string;
  institution_id?: string;
  submitted_from?: string;
  submitted_to?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ServiceRequestListResponse {
  data: ServiceRequest[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ---------- Analytics ----------

export interface ServiceRequestAnalytics {
  overview: {
    total_requests: number;
    by_status: Record<ServiceRequestStatus, number>;
    by_priority: Record<ServiceRequestPriority, number>;
    by_service_type: Array<{ type_id: string; type_name: string; count: number }>;
    avg_approval_time_hours: number;
    avg_fulfillment_time_hours: number;
  };
  trends: Array<{
    date: string;
    submitted: number;
    approved: number;
    rejected: number;
  }>;
  approval_bottlenecks: Array<{
    step_name: string;
    approver_role: string;
    avg_wait_hours: number;
    pending_count: number;
  }>;
}

// ---------- Zod Schemas ----------

export const serviceTypeFieldSchema = z.object({
  field_key: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, 'Must be lowercase with underscores'),
  field_label: z.string().min(1).max(255),
  field_type: z.enum(['text', 'select', 'date', 'number', 'boolean', 'textarea', 'file']),
  field_options: z.array(z.object({ label: z.string(), value: z.string() })).optional().nullable(),
  is_required: z.boolean().default(false),
  display_order: z.number().int().min(0),
  placeholder: z.string().max(255).optional().nullable(),
  help_text: z.string().optional().nullable(),
  default_value: z.string().optional().nullable(),
});

export const approvalStepSchema = z.object({
  step_order: z.number().int().min(1),
  step_name: z.string().min(1).max(255),
  approver_role: z.string().min(1),
  is_required: z.boolean().default(true),
  on_return_restart_from_step: z.number().int().min(1).optional().nullable(),
});

export const createServiceTypeSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z][a-z0-9-]*$/, 'Must be lowercase with hyphens'),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  icon: z.string().default('FileText'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
  allowed_roles: z.array(z.string()).min(1, 'At least one role must be allowed'),
  max_active_requests: z.number().int().min(1).default(1),
  auto_fulfill_on_approval: z.boolean().default(false),
  enable_priority: z.boolean().default(false),
  enable_attachments: z.boolean().default(false),
  enable_email_notifications: z.boolean().default(true),
  approval_workflow_type: z.enum(['sequential', 'parallel']).default('sequential'),
  attachment_config: z.object({
    max_files: z.number().int().min(1).max(10),
    max_size_mb: z.number().min(1).max(50),
    allowed_types: z.array(z.string()),
  }).optional(),
  validity_period_days: z.number().int().min(1).optional().nullable(),
  fields: z.array(serviceTypeFieldSchema).min(1, 'At least one field required'),
  approval_steps: z.array(approvalStepSchema).min(1, 'At least one approval step required'),
});

export const createServiceRequestSchema = z.object({
  service_type_id: z.string().uuid(),
  form_data: z.record(z.any()),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status: z.enum(['draft', 'submitted']).default('submitted'),
});

export const processApprovalSchema = z.object({
  action: z.enum(['approved', 'rejected', 'returned']),
  comments: z.string().optional(),
});

// ---------- Status Display Config ----------

export const SERVICE_REQUEST_STATUS_CONFIG: Record<ServiceRequestStatus, {
  label: string;
  variant: string;
  color: string;
  icon: string;
}> = {
  draft: { label: 'Draft', variant: 'outline', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: 'FileEdit' },
  submitted: { label: 'Submitted', variant: 'secondary', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icon: 'Send' },
  in_review: { label: 'In Review', variant: 'secondary', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', icon: 'Eye' },
  approved: { label: 'Approved', variant: 'success', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', icon: 'CheckCircle' },
  rejected: { label: 'Rejected', variant: 'destructive', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', icon: 'XCircle' },
  returned: { label: 'Returned', variant: 'secondary', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', icon: 'RotateCcw' },
  fulfilled: { label: 'Fulfilled', variant: 'success', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300', icon: 'PackageCheck' },
  closed: { label: 'Closed', variant: 'outline', color: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400', icon: 'Archive' },
  cancelled: { label: 'Cancelled', variant: 'destructive', color: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400', icon: 'Ban' },
};

// ---------- Priority Display Config ----------

export const SERVICE_REQUEST_PRIORITY_CONFIG: Record<ServiceRequestPriority, {
  label: string;
  color: string;
  icon: string;
}> = {
  low: { label: 'Low', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: 'ArrowDown' },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: 'Minus' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', icon: 'ArrowUp' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: 'AlertTriangle' },
};
