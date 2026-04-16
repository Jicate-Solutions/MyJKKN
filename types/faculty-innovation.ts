// types/faculty-innovation.ts
// Types for the Faculty Innovation Portfolio module.
// Matches DB schema: supabase/migrations/20260415120000_faculty_innovation_week1.sql
// Spec: specs/faculty-innovation-module-spec.md v1.0.0

import { z } from 'zod';

// =============================================================================
// ENUMS / Union Types
// =============================================================================

export type FacultyInitiativeCategory =
  | 'ip_bearing'
  | 'clinical'
  | 'research_grant'
  | 'publication';

// 12-state TRL lifecycle (§3 + §12 thrash)
export type FacultyInitiativeStatus =
  | 'draft'
  | 'draft_from_email'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'resourced'
  | 'in_progress'
  | 'piloting'
  | 'completed'
  | 'scaled'
  | 'terminated';

export type FacultyApprovalAuthority = 'director' | 'dean' | 'ip_cell' | 'hod';

export type FacultyInitiativeSource =
  | 'manual'
  | 'email_triage'
  | 'bulk_import'
  | 'retro_load';

export type FacultyInitiativeStartupStudioLinkStatus =
  | 'unlinked'
  | 'requested'
  | 'linked'
  | 'declined';

// Allowed status transitions — mirrors the DB trigger
// faculty_initiatives_enforce_status_transition
export const ALLOWED_FACULTY_INITIATIVE_TRANSITIONS: Record<
  FacultyInitiativeStatus,
  FacultyInitiativeStatus[]
> = {
  draft:            ['submitted', 'draft'],
  draft_from_email: ['submitted', 'draft_from_email', 'draft'],
  submitted:        ['under_review', 'rejected', 'submitted'],
  under_review:     ['approved', 'rejected', 'under_review'],
  approved:         ['resourced', 'approved'],
  rejected:         ['rejected'],
  resourced:        ['in_progress', 'resourced'],
  in_progress:      ['piloting', 'terminated', 'in_progress'],
  piloting:         ['completed', 'terminated', 'piloting'],
  completed:        ['scaled', 'completed'],
  scaled:           ['scaled'],
  terminated:       ['terminated'],
};

// Category -> default approval_authority (learning #4)
export const CATEGORY_APPROVAL_AUTHORITY: Record<
  FacultyInitiativeCategory,
  FacultyApprovalAuthority
> = {
  ip_bearing:     'ip_cell',
  clinical:       'dean',
  research_grant: 'director',
  publication:    'director',
};

// Minimum TRL level required before a given status can be reached.
// Used by /email-triage handoff + UI progression indicator.
export const STATUS_ORDER: FacultyInitiativeStatus[] = [
  'draft',
  'draft_from_email',
  'submitted',
  'under_review',
  'approved',
  'resourced',
  'in_progress',
  'piloting',
  'completed',
  'scaled',
  'rejected',
  'terminated',
];

// =============================================================================
// External co-inventor (JSONB — not a JKKN user)
// =============================================================================
export interface ExternalCoinventor {
  name: string;
  email?: string;
  affiliation?: string;
  role?: string; // 'co-inventor' | 'advisor' | 'technical-lead' | free text
  contribution_percent?: number;
}

export interface AttachmentRef {
  type: 'supabase' | 'drive';
  url: string;
  filename: string;
  size_bytes?: number;
  uploaded_at?: string;
}

export interface ClinicalDetails {
  validation_methodology?: string;
  modality?: string | string[];
  current_maturity?: string;
  sample_size?: number;
  ethics_approval_id?: string;
  deployment_site?: string;
  pilot_need?: string;
  [key: string]: unknown;
}

export interface ResearchDetails {
  funding_agency?: string;
  grant_amount?: number;
  grant_currency?: string;
  project_duration?: string;
  deliverables?: string[];
  collaborators?: string[];
  ip_status?: string;
  needs?: string[];
  [key: string]: unknown;
}

// =============================================================================
// Main record type (matches DB row shape)
// =============================================================================
export interface FacultyInitiative {
  id: string;
  institution_id: string;

  original_inventor_id: string;
  inventor_id: string;

  title: string;
  abstract: string;
  description: string | null;

  category: FacultyInitiativeCategory;
  status: FacultyInitiativeStatus;

  approval_authority: FacultyApprovalAuthority | null;
  approval_sub_authority: string | null;
  current_approver_id: string | null;
  submitted_at: string | null;
  last_status_change_at: string | null;
  last_status_change_by: string | null;

  external_coinventors: ExternalCoinventor[];

  clinical_details: ClinicalDetails | null;
  research_details: ResearchDetails | null;

  sh_publication_id: string | null;

  startup_studio_cycle_id: string | null;
  startup_studio_link_status: FacultyInitiativeStartupStudioLinkStatus | null;

  source: FacultyInitiativeSource;
  source_email_thread_id: string | null;
  source_note: string | null;

  attachment_urls: AttachmentRef[];

  // Week 2: collaboration request (JSONB)
  collaboration_request: CollaborationRequest | null;

  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  is_active: boolean;
}

export interface FacultyInitiativeCoinventor {
  id: string;
  initiative_id: string;
  coinventor_user_id: string;
  contribution_percent: number | null;
  role: string | null;
  added_at: string;
  added_by: string | null;
}

export interface FacultyInitiativeAuditEntry {
  id: string;
  initiative_id: string;
  action:
    | 'created'
    | 'status_changed'
    | 'approver_changed'
    | 'transferred'
    | 'updated'
    | 'deleted';
  actor_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface ApprovalAuthorityConfig {
  id: string;
  approval_authority: FacultyApprovalAuthority;
  institution_id: string | null;
  escalate_after_days: number;
  fallback_role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Filter + list response types (match lead-service.ts pattern)
// =============================================================================
export interface FacultyInitiativeFilters {
  institution_id?: string;
  inventor_id?: string;
  category?: FacultyInitiativeCategory | FacultyInitiativeCategory[];
  status?: FacultyInitiativeStatus | FacultyInitiativeStatus[];
  approval_authority?: FacultyApprovalAuthority;
  source?: FacultyInitiativeSource;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'updated_at' | 'submitted_at' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface FacultyInitiativeListResponse {
  data: FacultyInitiative[];
  total: number;
  page: number;
  limit: number;
}

// =============================================================================
// Input types (create / update / status transition)
// =============================================================================
export interface CreateFacultyInitiativeInput {
  institution_id: string;
  inventor_id?: string; // defaults to auth.uid()
  title: string;
  abstract: string;
  description?: string;
  category: FacultyInitiativeCategory;
  status?: Extract<FacultyInitiativeStatus, 'draft' | 'submitted'>;

  external_coinventors?: ExternalCoinventor[];
  coinventor_user_ids?: string[]; // internal JKKN co-inventors (sync table)

  clinical_details?: ClinicalDetails;
  research_details?: ResearchDetails;
  sh_publication_id?: string;

  attachment_urls?: AttachmentRef[];

  source?: FacultyInitiativeSource;
  source_email_thread_id?: string;
  source_note?: string;
}

export type UpdateFacultyInitiativeInput = Partial<CreateFacultyInitiativeInput> & {
  approval_authority?: FacultyApprovalAuthority;
  approval_sub_authority?: string;
};

export interface TransitionStatusInput {
  initiative_id: string;
  to_status: FacultyInitiativeStatus;
  reason?: string;
}

export interface TransferOwnershipInput {
  initiative_id: string;
  new_inventor_id: string;
  reason?: string;
}

export interface SubmitAsDraftFromEmailInput {
  institution_id: string;
  inventor_id: string;
  title: string;
  abstract: string;
  category: FacultyInitiativeCategory;
  source_email_thread_id: string;
  source_note?: string;
}

// =============================================================================
// Zod validation schemas
// =============================================================================

export const facultyInitiativeCategorySchema = z.enum([
  'ip_bearing',
  'clinical',
  'research_grant',
  'publication',
]);

export const facultyInitiativeStatusSchema = z.enum([
  'draft',
  'draft_from_email',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'resourced',
  'in_progress',
  'piloting',
  'completed',
  'scaled',
  'terminated',
]);

export const externalCoinventorSchema = z.object({
  name: z.string().min(1, 'Co-inventor name required').max(200),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  affiliation: z.string().max(200).optional(),
  role: z.string().max(100).optional(),
  contribution_percent: z.number().min(0).max(100).optional(),
});

export const attachmentRefSchema = z.object({
  type: z.enum(['supabase', 'drive']),
  url: z.string().url('Invalid URL'),
  filename: z.string().min(1).max(255),
  size_bytes: z.number().int().nonnegative().optional(),
  uploaded_at: z.string().optional(),
});

export const createFacultyInitiativeSchema = z.object({
  institution_id: z.string().uuid(),
  inventor_id: z.string().uuid().optional(),
  title: z.string().min(5, 'Title must be at least 5 characters').max(500),
  abstract: z.string().min(20, 'Abstract must be at least 20 characters'),
  description: z.string().optional(),
  category: facultyInitiativeCategorySchema,
  status: z.enum(['draft', 'submitted']).optional(),

  external_coinventors: z.array(externalCoinventorSchema).max(20).optional(),
  coinventor_user_ids: z.array(z.string().uuid()).max(20).optional(),

  clinical_details: z.record(z.string(), z.any()).optional(),
  research_details: z.record(z.string(), z.any()).optional(),
  sh_publication_id: z.string().uuid().optional(),

  attachment_urls: z.array(attachmentRefSchema).max(20).optional(),

  source: z.enum(['manual', 'email_triage', 'bulk_import', 'retro_load']).optional(),
  source_email_thread_id: z.string().optional(),
  source_note: z.string().optional(),
});

export const updateFacultyInitiativeSchema = createFacultyInitiativeSchema
  .partial()
  .extend({
    approval_authority: z.enum(['director', 'dean', 'ip_cell', 'hod']).optional(),
    approval_sub_authority: z.string().optional(),
  });

export const transitionStatusSchema = z.object({
  initiative_id: z.string().uuid(),
  to_status: facultyInitiativeStatusSchema,
  reason: z.string().max(1000).optional(),
});

export const transferOwnershipSchema = z.object({
  initiative_id: z.string().uuid(),
  new_inventor_id: z.string().uuid(),
  reason: z.string().max(1000).optional(),
});

// =============================================================================
// Display helpers (used by UI badges / kanban columns)
// =============================================================================
export const CATEGORY_LABEL: Record<FacultyInitiativeCategory, string> = {
  ip_bearing:     'IP-Bearing',
  clinical:       'Clinical',
  research_grant: 'Research Grant',
  publication:    'Publication',
};

export const STATUS_LABEL: Record<FacultyInitiativeStatus, string> = {
  draft:            'Draft',
  draft_from_email: 'Draft (from email)',
  submitted:        'Submitted',
  under_review:     'Under Review',
  approved:         'Approved',
  rejected:         'Rejected',
  resourced:        'Resourced',
  in_progress:      'In Progress',
  piloting:         'Piloting',
  completed:        'Completed',
  scaled:           'Scaled',
  terminated:       'Terminated',
};

export const STATUS_COLOR: Record<FacultyInitiativeStatus, string> = {
  draft:            'bg-slate-100 text-slate-700',
  draft_from_email: 'bg-amber-100 text-amber-800',
  submitted:        'bg-blue-100 text-blue-800',
  under_review:     'bg-indigo-100 text-indigo-800',
  approved:         'bg-emerald-100 text-emerald-800',
  rejected:         'bg-red-100 text-red-800',
  resourced:        'bg-purple-100 text-purple-800',
  in_progress:      'bg-violet-100 text-violet-800',
  piloting:         'bg-fuchsia-100 text-fuchsia-800',
  completed:        'bg-green-100 text-green-800',
  scaled:           'bg-teal-100 text-teal-800',
  terminated:       'bg-gray-100 text-gray-700',
};

// =============================================================================
// WEEK 2: IP Filings
// =============================================================================

export type IpFilingType =
  | 'patent'
  | 'design'
  | 'trademark'
  | 'copyright'
  | 'trade_secret'
  | 'utility_model';

export type IpFilingStatus =
  | 'draft'
  | 'filed'
  | 'published'
  | 'granted'
  | 'rejected'
  | 'abandoned'
  | 'expired';

export interface IpFiling {
  id: string;
  initiative_id: string;
  institution_id: string;
  inventor_id: string;

  filing_type: IpFilingType;
  filing_status: IpFilingStatus;
  filing_number: string | null;
  filing_date: string | null;
  grant_date: string | null;
  jurisdiction: string | null;
  assignee: string | null;

  title: string;
  abstract: string | null;

  cost_currency: string;
  cost_amount: number | null;

  naac_criteria: string | null;
  naac_metric_code: string | null;
  naac_score_claim: number | null;

  coinventors: ExternalCoinventor[];
  attachment_urls: AttachmentRef[];

  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  is_active: boolean;
}

export interface CreateIpFilingInput {
  initiative_id: string;
  institution_id: string;
  inventor_id?: string;

  filing_type: IpFilingType;
  filing_status?: IpFilingStatus;
  filing_number?: string;
  filing_date?: string;
  grant_date?: string;
  jurisdiction?: string;
  assignee?: string;

  title: string;
  abstract?: string;

  cost_currency?: string;
  cost_amount?: number;

  naac_criteria?: string;
  naac_metric_code?: string;
  naac_score_claim?: number;

  coinventors?: ExternalCoinventor[];
  attachment_urls?: AttachmentRef[];
}

export type UpdateIpFilingInput = Partial<CreateIpFilingInput>;

export const IP_FILING_TYPE_LABEL: Record<IpFilingType, string> = {
  patent:        'Patent',
  design:        'Design',
  trademark:     'Trademark',
  copyright:     'Copyright',
  trade_secret:  'Trade Secret',
  utility_model: 'Utility Model',
};

export const IP_FILING_STATUS_LABEL: Record<IpFilingStatus, string> = {
  draft:     'Draft',
  filed:     'Filed',
  published: 'Published',
  granted:   'Granted',
  rejected:  'Rejected',
  abandoned: 'Abandoned',
  expired:   'Expired',
};

export const IP_FILING_STATUS_COLOR: Record<IpFilingStatus, string> = {
  draft:     'bg-slate-100 text-slate-700',
  filed:     'bg-blue-100 text-blue-800',
  published: 'bg-indigo-100 text-indigo-800',
  granted:   'bg-emerald-100 text-emerald-800',
  rejected:  'bg-red-100 text-red-800',
  abandoned: 'bg-orange-100 text-orange-800',
  expired:   'bg-gray-100 text-gray-600',
};

export const createIpFilingSchema = z.object({
  initiative_id: z.string().uuid(),
  institution_id: z.string().uuid(),
  inventor_id: z.string().uuid().optional(),
  filing_type: z.enum(['patent', 'design', 'trademark', 'copyright', 'trade_secret', 'utility_model']),
  filing_status: z.enum(['draft', 'filed', 'published', 'granted', 'rejected', 'abandoned', 'expired']).optional(),
  filing_number: z.string().max(100).optional(),
  filing_date: z.string().optional(),
  grant_date: z.string().optional(),
  jurisdiction: z.string().max(100).optional(),
  assignee: z.string().max(200).optional(),
  title: z.string().min(5, 'Title must be at least 5 characters').max(500),
  abstract: z.string().optional(),
  cost_currency: z.string().max(3).optional(),
  cost_amount: z.number().nonnegative().optional(),
  naac_criteria: z.string().max(50).optional(),
  naac_metric_code: z.string().max(50).optional(),
  naac_score_claim: z.number().min(0).max(100).optional(),
  coinventors: z.array(externalCoinventorSchema).max(20).optional(),
  attachment_urls: z.array(attachmentRefSchema).max(20).optional(),
});

export const updateIpFilingSchema = createIpFilingSchema.partial();

// =============================================================================
// WEEK 2: Inventor Transfers
// =============================================================================

export interface InventorTransfer {
  id: string;
  initiative_id: string;
  from_inventor_id: string;
  to_inventor_id: string;
  transferred_at: string;
  transferred_by: string | null;
  reason: string | null;
}

// =============================================================================
// WEEK 2: Notifications
// =============================================================================

export type FacultyInnovationEventType =
  | 'status_changed'
  | 'approval_needed'
  | 'collab_request'
  | 'escalated'
  | 'transfer'
  | 'ip_filed'
  | 'changes_requested';

export interface FacultyInnovationNotification {
  id: string;
  user_id: string;
  initiative_id: string | null;
  event_type: FacultyInnovationEventType;
  title: string | null;
  body: string | null;
  channels: string[];
  read_at: string | null;
  created_at: string;
}

// =============================================================================
// WEEK 2: Collaboration Request (JSONB on faculty_initiatives)
// =============================================================================

export interface CollaborationRequest {
  target_institution_id: string;
  target_department_id?: string;
  description: string;
  status: 'pending' | 'accepted' | 'declined';
  requested_at: string;
  responded_at?: string;
  responded_by?: string;
}

// =============================================================================
// WEEK 2: Approval Queue
// =============================================================================

export interface ApprovalAction {
  initiative_id: string;
  action: 'approve' | 'request_changes' | 'reject' | 'defer';
  reason?: string;
  defer_days?: number;
  reroute_to?: FacultyApprovalAuthority;
}

export const approvalActionSchema = z.object({
  initiative_id: z.string().uuid(),
  action: z.enum(['approve', 'request_changes', 'reject', 'defer']),
  reason: z.string().max(2000).optional(),
  defer_days: z.number().int().min(1).max(90).optional(),
  reroute_to: z.enum(['director', 'dean', 'ip_cell', 'hod']).optional(),
});

export interface ApprovalQueueItem extends FacultyInitiative {
  is_overdue: boolean;
  days_pending: number;
  escalation_config?: ApprovalAuthorityConfig;
}
