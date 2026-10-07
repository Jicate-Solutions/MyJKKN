// types/procurement/approval-chain.ts
//
// Category approval chains (migration 20271006105000). The Super Admin keeps a
// list of purchase categories, each with ordered steps; a request copies its
// category's steps at submit (procurement_request_approvals) and goes through
// them once.

/** Who approves a step: the HOD of the request's department, a role, or one named person. */
export type ApproverKind = 'hod' | 'role' | 'user';

/** Which list a step belongs to: approving the items asked for, or the vendors/prices chosen. */
export type ApprovalStage = 'request' | 'final';

export type ApprovalStepStatus =
  | 'waiting' // later step, not its turn yet
  | 'pending' // its turn now
  | 'approved'
  | 'skipped' // the requester was this step's only approver
  | 'returned' // sent back to the requester from this step
  | 'rejected'
  | 'cancelled'; // the round ended before this step was reached

export interface CategoryStep {
  id?: string;
  stage?: ApprovalStage;
  step_order: number;
  label: string;
  approver_kind: ApproverKind;
  role_key: string | null;
  /** Role steps: true = only holders in the request's college (Principal); false = anywhere (CAO). */
  same_college: boolean;
  user_id: string | null;
  /** Joined for display when approver_kind = 'user'. */
  user?: { id: string; full_name: string | null; email: string | null } | null;
}

export interface ProcurementCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  steps?: CategoryStep[];
}

export interface SaveProcurementCategoryDto {
  id?: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
}

/** One step copied onto a request. */
export interface RequestApproval {
  id: string;
  request_id: string;
  stage: ApprovalStage;
  round: number;
  step_order: number;
  label: string;
  approver_kind: ApproverKind;
  approver_ids: string[];
  status: ApprovalStepStatus;
  acted_by: string | null;
  acted_at: string | null;
  on_behalf: boolean;
  remarks: string | null;
  acted_by_profile?: { full_name: string | null } | null;
}

/** procurement_preview_chain(): what the requester sees before submitting. */
export interface ChainPreviewStep {
  step_order: number;
  label: string;
  approver_kind: ApproverKind;
  approver_names: string | null;
  ok: boolean;
  problem: string | null;
}

/** procurement_my_approvals(): a request waiting for the signed-in person. */
export interface MyApproval {
  request_id: string;
  request_number: string;
  title: string | null;
  institution_name: string | null;
  category_name: string | null;
  step_label: string;
  step_order: number;
  steps_total: number;
  requested_by_name: string | null;
  submitted_at: string | null;
  stage: ApprovalStage;
}
