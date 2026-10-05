// types/instasolver.ts
//
// InstaSolver module — issues (facility faults) and requirements (procurement
// requests). Mirrors migrations 20270510090000-0200. Spec:
// docs/instasolver/MYJKKN-MODULE-SPEC.md.
//
// Status / severity / priority VALUES live here as types only; their labels,
// tones and transitions live in lib/instasolver/constants.ts and nowhere else.

export type IssueStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'withdrawn';

export type RequirementStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'withdrawn';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Priority = 'urgent' | 'high' | 'medium' | 'low';
export type CategoryKind = 'issue' | 'requirement';
export type EntityType = 'issue' | 'requirement';

export type TriageReason =
  | 'disputed'
  | 'critical'
  | 'urgent'
  | 'reopened'
  | 'recurring'
  | 'ageing'
  | 'unassigned';

/** The module's view of the signed-in person — from instasolver_my_access(). */
export interface InstaSolverAccess {
  user_id: string | null;
  is_admin: boolean;
  is_manager: boolean;
  is_principal: boolean;
  is_maintenance: boolean;
  can_report: boolean;
  team_ids: number[];
  lead_team_ids: number[];
  principal_institution_ids: string[];
}

/** From instasolver_my_reporter_profile() — the Reporter card on the forms. */
export interface ReporterProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  institution_id: string | null;
  institution_name: string | null;
  phone: string | null;
  designation: string | null;
}

export interface PersonRef {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
  email?: string | null;
}

export interface InstitutionRef {
  id: string;
  name: string;
}

export interface Category {
  id: number;
  kind: CategoryKind;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceTeam {
  id: number;
  name: string;
  description: string | null;
  institution_id: string | null;
  category_id: number | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institution?: InstitutionRef | null;
  category?: Pick<Category, 'id' | 'name'> | null;
}

export interface TeamMember {
  team_id: number;
  user_id: string;
  is_team_lead: boolean;
  created_at: string;
  person?: PersonRef | null;
}

export interface TeamWithMembers extends MaintenanceTeam {
  members: TeamMember[];
}

export interface Issue {
  id: number;
  reference_no: string;
  reported_by: string;
  institution_id: string;
  category_id: number;
  severity: Severity;
  priority: Priority | null;
  status: IssueStatus;
  title: string;
  details: string;
  location: string;
  suspected_reason: string | null;
  resolution_suggestion: string | null;
  contact_phone: string | null;
  alternate_phone: string | null;
  image_urls: string[];
  assigned_to: string | null;
  assigned_team_id: number | null;
  assigned_at: string | null;
  assigned_by: string | null;
  resolution_notes: string | null;
  resolution_image_urls: string[];
  completed_at: string | null;
  reopened_count: number;
  last_reopened_at: string | null;
  resolution_confirmed_at: string | null;
  resolution_disputed_at: string | null;
  resolution_dispute_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  reporter?: PersonRef | null;
  assignee?: PersonRef | null;
  assigner?: PersonRef | null;
  team?: Pick<MaintenanceTeam, 'id' | 'name'> | null;
  institution?: InstitutionRef | null;
  category?: Pick<Category, 'id' | 'name'> | null;
}

export interface TriagedIssue extends Issue {
  open_days: number;
  similar_reports: number;
  triage_score: number;
  triage_reasons: TriageReason[];
}

export interface Requirement {
  id: number;
  reference_no: string;
  requested_by: string;
  institution_id: string;
  category_id: number;
  status: RequirementStatus;
  item_requested: string;
  specifications: string | null;
  quantity_needed: number | null;
  cost_estimate: number | null;
  needed_by: string | null;
  last_ordered: string | null;
  usage_location: string;
  delivery_location: string;
  usage_details: string | null;
  reason_needed: string | null;
  preferred_vendor: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  alternate_phone: string | null;
  image_urls: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
  requester?: PersonRef | null;
  reviewer?: PersonRef | null;
  institution?: InstitutionRef | null;
  category?: Pick<Category, 'id' | 'name'> | null;
}

export interface ActivityEntry {
  id: number;
  entity_type: EntityType;
  entity_id: number;
  actor_id: string | null;
  action: string;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
  created_at: string;
  actor?: PersonRef | null;
}

export interface Note {
  id: number;
  entity_type: EntityType;
  entity_id: number;
  author_id: string;
  note: string;
  is_internal: boolean;
  created_at: string;
  author?: PersonRef | null;
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
export interface CreateIssueDto {
  institution_id: string;
  category_id: number;
  severity: Severity;
  title: string;
  details: string;
  location: string;
  suspected_reason?: string | null;
  resolution_suggestion?: string | null;
  contact_phone?: string | null;
  alternate_phone?: string | null;
  image_urls?: string[];
}

export type UpdateIssueDto = Partial<CreateIssueDto>;

export interface TriageIssueDto {
  priority: Priority;
  assigned_to?: string | null;
  assigned_team_id?: number | null;
}

export interface CreateRequirementDto {
  institution_id: string;
  category_id: number;
  item_requested: string;
  specifications?: string | null;
  quantity_needed?: number | null;
  cost_estimate?: number | null;
  needed_by?: string | null;
  last_ordered?: string | null;
  usage_location: string;
  delivery_location: string;
  usage_details?: string | null;
  reason_needed?: string | null;
  preferred_vendor?: string | null;
  contact_person?: string | null;
  contact_phone?: string | null;
  alternate_phone?: string | null;
  image_urls?: string[];
}

export type UpdateRequirementDto = Partial<CreateRequirementDto>;

export interface SaveTeamDto {
  name: string;
  description?: string | null;
  institution_id?: string | null;
  category_id?: number | null;
  email?: string | null;
  is_active?: boolean;
}

export interface SaveCategoryDto {
  kind: CategoryKind;
  name: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// Filters and lists
// ---------------------------------------------------------------------------
export type IssueScope = 'all' | 'mine' | 'assigned_to_me' | 'my_teams';

export interface IssueFilters {
  search?: string;
  status?: IssueStatus[];
  severity?: Severity[];
  priority?: Priority[];
  institution_id?: string;
  category_id?: number;
  scope?: IssueScope;
  unassigned?: boolean;
  disputed?: boolean;
  page?: number;
  limit?: number;
}

export interface RequirementFilters {
  search?: string;
  status?: RequirementStatus[];
  institution_id?: string;
  category_id?: number;
  mine?: boolean;
  page?: number;
  limit?: number;
}

export interface TriageFilters {
  view?: 'decide' | 'open' | 'all';
  institution_id?: string;
  page?: number;
  limit?: number;
}

export type WorkTab = 'assigned' | 'in_progress' | 'to_claim' | 'completed';

export interface ListMetadata {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListResponse<T> {
  data: T[];
  metadata: ListMetadata;
}

// ---------------------------------------------------------------------------
// RPC result shapes
// ---------------------------------------------------------------------------
export interface DashboardStats {
  issues: {
    total: number;
    pending: number;
    assigned: number;
    in_progress: number;
    completed: number;
    rejected: number;
    withdrawn: number;
    unassigned: number;
    completed_today: number;
    reopened: number;
    disputed: number;
    critical_open: number;
  };
  requirements: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    fulfilled: number;
    withdrawn: number;
  };
  mine: {
    assigned_to_me: number;
    to_claim: number;
    in_progress: number;
    completed_today: number;
  };
  own: {
    issues_open: number;
    awaiting_confirmation: number;
    issues_total: number;
    requirements_open: number;
    requirements_total: number;
  };
  generated_at: string;
}

/** One "Your next step" group: how many, and the first one to open. */
export interface NextStepGroup {
  count: number;
  first: { id: number; title: string; assigned_to: string | null } | null;
}

export interface NextSteps {
  toConfirm: NextStepGroup;
  disputed: NextStepGroup;
  needsPriority: NextStepGroup;
  toStart: NextStepGroup;
  inProgress: NextStepGroup;
}

export interface LabelTotal {
  label: string;
  total: number;
}

export interface Analytics {
  issues: {
    total: number;
    completed: number;
    reopened: number;
    disputed: number;
    resolution_rate: number | null;
    reopen_rate: number | null;
    avg_resolution_hours: number | null;
  };
  requirements: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    fulfilled: number;
    fulfilment_rate: number | null;
  };
  timeline: { date: string; reported: number; completed: number }[];
  by_institution: (LabelTotal & { completed: number })[];
  by_category: LabelTotal[];
  by_severity: LabelTotal[];
  by_status: LabelTotal[];
  recurring: { location: string; category: string; occurrences: number; reopens: number }[];
  window_days: number;
  generated_at: string;
}

export interface WorkloadCounts {
  active: number;
  critical: number;
  urgent: number;
  high: number;
  ageing_7d: number;
  ageing_30d: number;
  reopened: number;
  oldest_open_hours: number | null;
}

export interface Workload {
  summary: Omit<WorkloadCounts, 'oldest_open_hours'> & { unclaimed: number; awaiting_triage: number };
  teams: (WorkloadCounts & {
    team_id: number;
    team_name: string;
    institution: string | null;
    category: string | null;
    unclaimed: number;
    members: number;
  })[];
  members: (WorkloadCounts & {
    user_id: string;
    full_name: string | null;
    in_progress: number;
    completed_7d: number;
    team_ids: number[];
  })[];
  generated_at: string;
}

export interface WorkloadFilters {
  institution_id?: string;
  priority?: Priority;
  open_days?: number;
}

export interface AdminOverview {
  submissions_by_institution: { label: string; issues: number; requirements: number }[];
  teams_active: number;
  team_members: number;
  categories_active: number;
  notification_failures_7d: number;
  generated_at: string;
}
