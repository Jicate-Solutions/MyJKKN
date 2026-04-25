// Types for the approval_chain engine (PR-0).
// Backs the rewritten /campus-living/settings/approval-chains page and the
// upcoming hostel_vacate workflow. Engine is workflow-agnostic — more
// workflow_type values get added as other flows migrate onto the engine.

export type ApprovalChainWorkflowType =
  | 'hostel_vacate'
  | 'hostel_leave'
  | 'hostel_gate_pass'
  | 'hostel_curfew_exception'
  | 'hostel_visitor_extension'
  | 'hostel_maintenance_escalation';

export type ApprovalChainRunStatus =
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type ApprovalChainAction =
  | 'approve'
  | 'reject'
  | 'rollback'
  | 'skip'
  | 'escalate';

export type StageActionType = 'otp' | 'approve' | 'checklist';

export interface StageDefinition {
  stage_idx: number;
  stage_name: string;              // snake_case machine key, e.g. 'warden_approval'
  stage_label: string;             // human display, e.g. 'Warden Approval'
  actor_role_key: string;          // who acts at this stage (warden, chief_warden, parent, hostel_office, etc.)
  sla_hours: number;               // hours before SLA triggers
  action_type: StageActionType;
  sla_escalate_to_stage?: number;  // if set + SLA exceeded, auto-advance to this stage_idx
}

// JSONB criteria — simple declarative matcher evaluated at rule-selection time.
// - Scalar equality:          { resident_type: 'learner' }
// - Array membership:         { resident_type: { in: ['staff', 'married'] } }
// - Multiple keys ANDed:      { resident_type: 'learner', reason_type: 'medical' }
// - Empty {} matches anything (fallback rule).
export type CriteriaValue = string | number | boolean | { in: (string | number | boolean)[] };
export type ApprovalChainCriteria = Record<string, CriteriaValue>;

export interface ApprovalChainRule {
  id: string;
  institution_id: string;
  workflow_type: ApprovalChainWorkflowType;
  rule_name: string;
  description: string | null;
  criteria: ApprovalChainCriteria;
  stages: StageDefinition[];
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// One entry in approval_chain_runs.history (JSONB[]).
export interface RunHistoryEntry {
  stage_idx: number;
  stage_name: string;
  actor_id: string | null;         // null for parent OTP (no auth.users row); otherwise auth.users.id
  action: ApprovalChainAction;
  remarks: string | null;
  at: string;                      // ISO timestamp
}

export interface ApprovalChainRun {
  id: string;
  institution_id: string;
  rule_id: string;
  subject_type: ApprovalChainWorkflowType;
  subject_id: string;
  current_stage_idx: number;
  status: ApprovalChainRunStatus;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  history: RunHistoryEntry[];
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Service DTOs

export interface StartRunDTO {
  institution_id: string;
  workflow_type: ApprovalChainWorkflowType;
  subject_id: string;
  context: Record<string, unknown>;   // matched against rule.criteria
}

export interface AdvanceRunDTO {
  run_id: string;
  actor_id: string | null;            // null only for OTP stage
  action: ApprovalChainAction;
  remarks?: string;
}

// Read-friendly shape for UI (rule + its stages expanded, plus human-readable
// summary of criteria for the settings page).
export interface ApprovalChainRuleSummary extends ApprovalChainRule {
  stage_count: number;
  criteria_summary: string;           // e.g. 'resident_type = learner'
}

// Update DTO — settings UI only mutates rule_name/description/is_active/priority
// in PR-0. Editing stages/criteria requires a follow-up (complex JSON UX).
export interface UpdateApprovalChainRuleDTO {
  rule_name?: string;
  description?: string | null;
  is_active?: boolean;
  priority?: number;
}
