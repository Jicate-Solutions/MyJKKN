/**
 * Projects Module — TypeScript Types
 *
 * Interfaces for all 34 project* tables. Columns matched 1:1 against the
 * live production schema (ref kvizhngldtiuufknvehv, applied via PR #1114),
 * NOT against the spec's column guesses. The live schema is the source of truth.
 *
 * Pattern: types/hr-recruitment-need.ts (interface style, nullable handling).
 * Spec: specs/pm-projects-module-2026-05-26.md
 */

// ─── Shared union types ─────────────────────────────────────────────────────────

/** projects.rag_status / status reports / risks */
export type RagStatus = 'green' | 'amber' | 'red';

/** projects.scope_model — single-institution vs cross-institution shared */
export type ProjectScopeModel = 'single_institution' | 'cross_institution' | 'global';

/** projects.visibility */
export type ProjectVisibility = 'public' | 'members_only' | 'private';

/** project_statuses.category — coarse bucket for status grouping */
export type ProjectStatusCategory = 'todo' | 'active' | 'on_hold' | 'done' | 'cancelled';

/** project_tasks.status_key — free-form key resolved against board columns */
export type TaskStatusKey = string;

/** project_tasks.task_type */
export type TaskType = string;

/** Membership / assignee roles (free-form text in DB) */
export type ProjectMemberRole = string;

/**
 * RACI accountability roles stored in `project_task_assignees.role`.
 * The column is free-form text (back-compat: legacy 'assignee' rows remain valid),
 * but task assignment now uses these four. The auto-accountability meeting engine
 * resolves the single 'accountable' person as the meeting owner, 'responsible' as
 * the doer, 'consulted' as notified, 'informed' as bell-only.
 */
export type RaciRole = 'responsible' | 'accountable' | 'consulted' | 'informed';

export const RACI_ROLES: RaciRole[] = [
  'responsible',
  'accountable',
  'consulted',
  'informed',
];

export const RACI_LABELS: Record<RaciRole, string> = {
  responsible: 'Responsible',
  accountable: 'Accountable',
  consulted: 'Consulted',
  informed: 'Informed',
};

export const RACI_LETTERS: Record<RaciRole, string> = {
  responsible: 'R',
  accountable: 'A',
  consulted: 'C',
  informed: 'I',
};

export const RACI_DESCRIPTIONS: Record<RaciRole, string> = {
  responsible: 'Does the work',
  accountable: 'Answers for it — exactly one per task',
  consulted: 'Gives input before it is done',
  informed: 'Kept in the loop',
};

export function isRaciRole(value: string | null | undefined): value is RaciRole {
  return value === 'responsible' || value === 'accountable'
    || value === 'consulted' || value === 'informed';
}

// ─── Masters (CRUDable) ─────────────────────────────────────────────────────────

export interface ProjectType {
  id: string;
  key: string;
  name: string;
  description: string | null;
  field_config: Record<string, unknown>;
  closure_model: string;
  icon: string | null;
  color: string | null;
  order_index: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectStatus {
  id: string;
  key: string;
  name: string;
  category: ProjectStatusCategory | string;
  color: string | null;
  order_index: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectPriority {
  id: string;
  key: string;
  name: string;
  color: string | null;
  weight: number;
  order_index: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectLabel {
  id: string;
  key: string;
  name: string;
  color: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectBudgetCategory {
  id: string;
  key: string;
  name: string;
  description: string | null;
  order_index: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ─── Core: Project ──────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  project_type_id: string | null;
  status_id: string | null;
  priority_id: string | null;
  institution_id: string | null;
  owner_staff_id: string | null;
  scope_model: ProjectScopeModel | string;
  visibility: ProjectVisibility | string;
  is_confidential: boolean;
  start_date: string | null;
  due_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  financial_year: string | null;
  percent_complete: number;
  rag_status: RagStatus | string;
  is_okr: boolean;
  status_workflow: Record<string, unknown>;
  enforce_dependencies: boolean;
  allow_collaborators: boolean;
  snapshot_approval_chain: Record<string, unknown> | null;
  is_refreezable: boolean;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  baseline_snapshot: Record<string, unknown> | null;
  source_template_id: string | null;
  client_id: string | null;
  solution_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectInsert {
  code?: string | null;
  title: string;
  description?: string | null;
  project_type_id?: string | null;
  status_id?: string | null;
  priority_id?: string | null;
  institution_id?: string | null;
  owner_staff_id?: string | null;
  scope_model?: ProjectScopeModel | string;
  visibility?: ProjectVisibility | string;
  is_confidential?: boolean;
  start_date?: string | null;
  due_date?: string | null;
  financial_year?: string | null;
  is_okr?: boolean;
  status_workflow?: Record<string, unknown>;
  enforce_dependencies?: boolean;
  allow_collaborators?: boolean;
  source_template_id?: string | null;
  client_id?: string | null;
  solution_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ProjectUpdate {
  code?: string | null;
  title?: string;
  description?: string | null;
  project_type_id?: string | null;
  status_id?: string | null;
  priority_id?: string | null;
  institution_id?: string | null;
  owner_staff_id?: string | null;
  scope_model?: ProjectScopeModel | string;
  visibility?: ProjectVisibility | string;
  is_confidential?: boolean;
  start_date?: string | null;
  due_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  financial_year?: string | null;
  percent_complete?: number;
  rag_status?: RagStatus | string;
  is_okr?: boolean;
  status_workflow?: Record<string, unknown>;
  enforce_dependencies?: boolean;
  allow_collaborators?: boolean;
  client_id?: string | null;
  solution_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ProjectInstitution {
  id: string;
  project_id: string;
  institution_id: string;
  role: string;
  created_at: string;
  created_by: string | null;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  staff_id: string;
  role: ProjectMemberRole;
  allocation_percentage: number | null;
  delegation_to_user_id: string | null;
  delegation_start: string | null;
  delegation_end: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectStakeholder {
  id: string;
  project_id: string;
  staff_id: string | null;
  external_name: string | null;
  external_email: string | null;
  role: string | null;
  notify_in_app: boolean;
  notify_email: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ─── Structure: Phases & Milestones ─────────────────────────────────────────────

export interface ProjectPhase {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  order_index: number;
  start_date: string | null;
  due_date: string | null;
  percent_complete: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectMilestone {
  id: string;
  project_id: string;
  phase_id: string | null;
  name: string;
  description: string | null;
  planned_date: string | null;
  actual_date: string | null;
  is_complete: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ─── Tasks ──────────────────────────────────────────────────────────────────────

export interface ProjectTask {
  id: string;
  project_id: string;
  phase_id: string | null;
  milestone_id: string | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  status_key: TaskStatusKey;
  priority_id: string | null;
  owner_staff_id: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  story_points: number | null;
  sprint_id: string | null;
  order_index: number;
  is_blocked: boolean;
  is_overdue: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectTaskInsert {
  project_id: string;
  phase_id?: string | null;
  milestone_id?: string | null;
  title: string;
  description?: string | null;
  task_type?: TaskType;
  status_key?: TaskStatusKey;
  priority_id?: string | null;
  owner_staff_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  estimated_hours?: number | null;
  story_points?: number | null;
  sprint_id?: string | null;
  order_index?: number;
  metadata?: Record<string, unknown>;
}

export interface ProjectTaskUpdate {
  phase_id?: string | null;
  milestone_id?: string | null;
  title?: string;
  description?: string | null;
  task_type?: TaskType;
  status_key?: TaskStatusKey;
  priority_id?: string | null;
  owner_staff_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  story_points?: number | null;
  sprint_id?: string | null;
  order_index?: number;
  is_blocked?: boolean;
  is_overdue?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ProjectTaskAssignee {
  id: string;
  task_id: string;
  staff_id: string;
  role: string;
  assigned_by: string | null;
  created_at: string;
}

/** ProjectTaskAssignee with the joined staff name (from listAssignees). */
export interface ProjectTaskAssigneeWithStaff extends ProjectTaskAssignee {
  staff?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export interface ProjectTaskComment {
  id: string;
  task_id: string;
  parent_comment_id: string | null;
  body: string;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectTaskCommentAuthor {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

/** A comment with its author profile joined. author is null for pre-existing
 *  rows written before author_id was populated, and for deleted profiles. */
export interface ProjectTaskCommentWithAuthor extends ProjectTaskComment {
  author: ProjectTaskCommentAuthor | null;
}

export interface ProjectTaskSubtask {
  id: string;
  task_id: string;
  title: string;
  is_complete: boolean;
  assignee_staff_id: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectTaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: string;
  created_at: string;
  created_by: string | null;
}

export interface ProjectTaskLabel {
  id: string;
  task_id: string;
  label_id: string;
  created_at: string;
}

export interface ProjectTaskAttachment {
  id: string;
  task_id: string | null;
  project_id: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  version: number;
  supersedes_id: string | null;
  is_final_report: boolean;
  uploaded_by: string | null;
  created_at: string;
}

// ─── Budget ─────────────────────────────────────────────────────────────────────

export interface ProjectBudget {
  id: string;
  project_id: string;
  category_id: string | null;
  planned_amount_inr: number;
  actual_amount_inr: number;
  forecast_amount_inr: number | null;
  currency: string;
  period_month: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectBudgetChange {
  id: string;
  project_id: string;
  budget_id: string | null;
  old_amount_inr: number | null;
  new_amount_inr: number | null;
  reason: string | null;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  requested_by: string | null;
  created_at: string;
}

// ─── Risks & Issues ─────────────────────────────────────────────────────────────

export interface ProjectRisk {
  id: string;
  project_id: string;
  task_id: string | null;
  milestone_id: string | null;
  title: string;
  description: string | null;
  risk_category: string | null;
  severity_simple: string | null;
  likelihood: number | null;
  impact: number | null;
  rag_status: RagStatus | string;
  status_key: string;
  owner_staff_id: string | null;
  is_escalated: boolean;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectRiskMitigationStep {
  id: string;
  risk_id: string;
  description: string;
  owner_staff_id: string | null;
  deadline: string | null;
  is_complete: boolean;
  linked_task_id: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectRiskEscalation {
  id: string;
  risk_id: string;
  escalated_to_staff_id: string | null;
  escalated_by: string | null;
  escalation_level: string | null;
  reason: string | null;
  is_auto: boolean;
  created_at: string;
}

export interface ProjectIssue {
  id: string;
  project_id: string;
  task_id: string | null;
  raised_from_risk_id: string | null;
  title: string;
  description: string | null;
  severity: string | null;
  status_key: string;
  owner_staff_id: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ─── Change requests ────────────────────────────────────────────────────────────

export interface ProjectChangeRequest {
  id: string;
  project_id: string;
  change_type: string;
  title: string;
  description: string | null;
  impact_summary: string | null;
  is_major: boolean;
  status: string;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ─── Approvals ──────────────────────────────────────────────────────────────────

export interface ProjectApprovalWorkflow {
  id: string;
  project_type_id: string | null;
  name: string;
  trigger_action: string;
  approval_chain: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectApprovalRequest {
  id: string;
  project_id: string;
  workflow_id: string | null;
  trigger_action: string;
  status: string;
  snapshot_chain: Record<string, unknown> | null;
  current_step: number;
  is_emergency: boolean;
  emergency_followup_due: string | null;
  escalation_status: string;
  reminded_at: string | null;
  escalated_at: string | null;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Closure & reporting ────────────────────────────────────────────────────────

export interface ProjectClosureReport {
  id: string;
  project_id: string;
  closure_type: string;
  checklist: Record<string, unknown>;
  outcome_summary: string | null;
  impact_summary: string | null;
  is_finalized: boolean;
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectStatusReport {
  id: string;
  project_id: string;
  report_period_start: string | null;
  report_period_end: string | null;
  summary: string | null;
  rag_status: RagStatus | string | null;
  generated_type: string;
  content: Record<string, unknown>;
  storage_path: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectLessonLearned {
  id: string;
  project_id: string | null;
  closure_report_id: string | null;
  project_type_id: string | null;
  category: string | null;
  lesson: string;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ─── Templates ──────────────────────────────────────────────────────────────────

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  project_type_id: string | null;
  blueprint: Record<string, unknown>;
  source_project_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ─── Integrations & feed ────────────────────────────────────────────────────────

export interface ProjectMeetingLink {
  id: string;
  project_id: string;
  meeting_source: string;
  external_meeting_id: string | null;
  meeting_title: string | null;
  meeting_date: string | null;
  transcript_url: string | null;
  suggested_tasks: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProjectActivityFeedEntry {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string | null;
  event_type: string;
  actor_id: string | null;
  summary: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface ProjectAuditLogEntry {
  id: string;
  project_id: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
}

// ─── Filters ────────────────────────────────────────────────────────────────────

export interface ProjectFilters {
  institutionId?: string | null;
  statusId?: string | null;
  statusCategory?: ProjectStatusCategory | string | null;
  projectTypeId?: string | null;
  priorityId?: string | null;
  ownerStaffId?: string | null;
  ragStatus?: RagStatus | string | null;
  isOkr?: boolean | null;
  scopeModel?: ProjectScopeModel | string | null;
  financialYear?: string | null;
  /** Solutions Hub bridge: projects delivered for a client / a solution. */
  clientId?: string | null;
  solutionId?: string | null;
  /** Include cancelled (soft-deleted) projects. Default false. */
  includeCancelled?: boolean;
  search?: string | null;
}

export interface TaskFilters {
  projectId?: string | null;
  phaseId?: string | null;
  milestoneId?: string | null;
  statusKey?: TaskStatusKey | null;
  taskType?: TaskType | null;
  priorityId?: string | null;
  ownerStaffId?: string | null;
  isBlocked?: boolean | null;
  isOverdue?: boolean | null;
  search?: string | null;
}

// ─── Joined/expanded read shapes ────────────────────────────────────────────────

/** Project with master relations resolved (for list/detail rendering). */
export interface ProjectWithRelations extends Project {
  project_type?: Pick<ProjectType, 'id' | 'key' | 'name' | 'icon' | 'color'> | null;
  status?: Pick<ProjectStatus, 'id' | 'key' | 'name' | 'category' | 'color'> | null;
  priority?: Pick<ProjectPriority, 'id' | 'key' | 'name' | 'color' | 'weight'> | null;
}
