// lib/types/issues.ts
// ============================================================================
// Insta Solver core module — types for the unified `/issues` surface.
//
// Wave B.1 substrate (PR-instasolver-substrate). Mirrors the production DDL
// from `supabase/migrations/<date>_instasolver_substrate.sql` (sibling agent
// scope). This file re-exports the existing `lib/types/grievance.ts` shape
// where it covers the same column set, and ADDS:
//
//   - `IssueType`             discriminator on grievance_tickets
//   - `RequirementStatus`     state machine for requirement_requests
//   - `VoteState`             state machine for requirement votes
//   - extended `RaisedByType` (adds 'faculty' | 'admin')
//   - `IssueTicket`           = grievance_tickets row + new B.1 columns
//   - `RequirementRequest`    = full requirement_requests row
//   - `RequirementVote`       = requirement_votes row
//   - `RequirementCategory`   = clones GrievanceCategory shape
//   - `ApprovalChainStep`     = snapshot pattern (cloned from leave-service.ts)
//   - input types for create/update/vote/approve flows
//
// Strategic spec:    docs/INSTASOLVER-MODULE-SPEC.md
// Implementation:    specs/instasolver-core-module-spec.md
// Pattern source:    lib/types/grievance.ts (clone)
// ============================================================================

import type {
  GrievanceCategory,
  GrievancePriority,
  GrievanceStatus,
  RaisedByType as GrievanceRaisedByType,
  SlaStatus,
} from '@/lib/types/grievance';

// ----------------------------------------------------------------------------
// Re-export the underlying grievance enum primitives so callers under
// /issues/* can import everything from `@/lib/types/issues` without reaching
// into grievance.ts directly.
// ----------------------------------------------------------------------------
export type { GrievancePriority, GrievanceStatus, SlaStatus };

// ----------------------------------------------------------------------------
// Issue discriminator + extended raised-by audience matrix
// ----------------------------------------------------------------------------

/**
 * `issue_type` discriminator on grievance_tickets. Set at creation:
 *   - 'grievance'         standard complaint
 *   - 'requirement_link'  ticket auto-created from a manual grievance→requirement promotion
 */
export type IssueType = 'grievance' | 'requirement_link';

/**
 * Audience matrix per Persona Matrix in INSTASOLVER-MODULE-SPEC.md §Persona Matrix.
 * Extends the production `raised_by_type_enum` with 'faculty' + 'admin' (B.1
 * additive ALTER TYPE migration).
 */
export type RaisedByType = GrievanceRaisedByType | 'faculty' | 'admin';

/** Convenience: who is allowed to vote on Requirements. */
export type VoterType = Exclude<RaisedByType, 'alumni'>;

// ----------------------------------------------------------------------------
// Requirement state machines
// ----------------------------------------------------------------------------

/**
 * Requirement lifecycle. Locked Q-scope state machine:
 *
 *   submitted
 *     ↓
 *   under_review
 *     ↓
 *   voting_open  ──►  voting_closed
 *                       ↓ (quorum met + approved by chain)
 *                     approved
 *                       ↓
 *                     budgeted
 *                       ↓
 *                     in_progress
 *                       ↓
 *                     fulfilled
 *
 *   rejected   = terminal (any state can transition to rejected)
 *   withdrawn  = terminal (filer-initiated OR auto on quorum miss)
 */
export type RequirementStatus =
  | 'submitted'
  | 'under_review'
  | 'voting_open'
  | 'voting_closed'
  | 'approved'
  | 'budgeted'
  | 'in_progress'
  | 'fulfilled'
  | 'rejected'
  | 'withdrawn';

/** Vote-window state. Voting opens, closes, or is cancelled by withdrawal. */
export type VoteState = 'active' | 'closed' | 'cancelled';

/** Two-option ballot for a Requirement. */
export type VoteChoice = 'yes' | 'no';

// ----------------------------------------------------------------------------
// Approval chain snapshot — pattern cloned from leave-service.ts
// ----------------------------------------------------------------------------

/**
 * One step in the approval chain stored as JSONB on requirement_requests.
 * The chain is built at apply-time (frozen-snapshot pattern) from
 * `requirement_approval_thresholds` rows — so later threshold edits don't
 * disturb in-flight requirements.
 *
 * `approver_user_id` is null on insert and resolved at approve-time by role
 * lookup (mirrors LeaveApprovalStep semantics in lib/services/hr/leave-service.ts).
 */
export interface ApprovalChainStep {
  step_order: number;
  approver_role: string;
  approver_user_id: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  min_amount: number;
  max_amount: number | null;
  escalate_after_days: number;
  fallback_role: string | null;
  decided_at?: string | null;
  decided_by?: string | null;
  comment?: string | null;
}

// ----------------------------------------------------------------------------
// Issue ticket (grievance_tickets row, with B.1 additions)
// ----------------------------------------------------------------------------

/**
 * List-shape projection over grievance_tickets. Mirrors GrievanceTicket but
 * adds:
 *   - issue_type          B.1 discriminator
 *   - requirement_id      back-reference to a Requirement (when issue_type='requirement_link')
 *   - migrated_from_subdomain / legacy_external_id (Insta Solver migration markers)
 */
export interface IssueTicket {
  id: string;
  ticket_number: string;
  category_id: string;
  institution_id: string;
  subject: string;
  priority: GrievancePriority | null;
  status: GrievanceStatus | null;
  issue_type: IssueType;
  requirement_id: string | null;
  raised_by_type: RaisedByType;
  raised_by_name: string | null;
  sla_deadline: string;
  sla_status: SlaStatus | null;
  resolved_at: string | null;
  is_emergency: boolean;
  is_anonymous: boolean;
  is_icc_only: boolean;
  escalation_level: number;
  assigned_to: string | null;
  migrated_from_subdomain: boolean;
  legacy_external_id: string | null;
  created_at: string | null;
}

/** Detail-shape projection — full row including description, resolution, attachments. */
export interface IssueTicketDetail extends IssueTicket {
  description: string;
  raised_by_id: string | null;
  raised_by_email: string | null;
  raised_by_phone: string | null;
  assigned_at: string | null;
  department_id: string | null;
  sla_hours: number;
  resolution: string | null;
  resolved_by: string | null;
  satisfaction_rating: number | null;
  satisfaction_feedback: string | null;
  sla_breached_at: string | null;
  withdrawn_at: string | null;
  withdrawn_reason: string | null;
  acknowledgment_pdf_url: string | null;
  resolution_letter_pdf_url: string | null;
  attachments: IssueAttachment[];
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
}

/**
 * Single attachment entry stored in `grievance_tickets.attachments` jsonb.
 * Shape locked by R1.1 (max 5 files × 10MB, MIME whitelist).
 */
export interface IssueAttachment {
  storage_path: string; // e.g. 'issues/attachments/<ticket_id>/<filename>'
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
}

// ----------------------------------------------------------------------------
// Requirement category (clone of GrievanceCategory)
// ----------------------------------------------------------------------------

/**
 * Per-institution requirement category. Mirrors `requirement_categories`
 * (DDL: `LIKE public.grievance_categories INCLUDING ALL`).
 *
 * Includes `allow_anonymous` from the B.1 ALTER on grievance_categories.
 */
export interface RequirementCategory extends GrievanceCategory {
  // requirement_categories inherits the same column set; no additions in B.1.
  // Re-declared as an interface to give the type a distinct name for callers.
  allow_anonymous?: boolean;
}

// ----------------------------------------------------------------------------
// Requirement request (full row per DDL plan)
// ----------------------------------------------------------------------------

/**
 * Full shape of a requirement_requests row. See INSTASOLVER-MODULE-SPEC.md
 * §DDL Plan — Phase B.1 for the canonical column list.
 */
export interface RequirementRequest {
  id: string;
  request_number: string; // REQ-YYYY-NNNN
  category_id: string;
  institution_id: string;
  subject: string;
  description: string;
  estimated_budget: number | null;
  raised_by_type: RaisedByType;
  raised_by_id: string | null;
  raised_by_name: string | null;
  status: RequirementStatus;
  voting_opens_at: string | null;
  voting_closes_at: string | null;
  vote_count_yes: number;
  vote_count_no: number;
  approved_at: string | null;
  approved_by: string | null;
  budgeted_amount: number | null;
  budgeted_at: string | null;
  budgeted_by: string | null;
  fulfilled_at: string | null;
  rejection_reason: string | null;
  approval_chain: ApprovalChainStep[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Light projection used by list views (omits long text fields + chain). */
export interface RequirementRequestSummary {
  id: string;
  request_number: string;
  category_id: string;
  institution_id: string;
  subject: string;
  estimated_budget: number | null;
  raised_by_type: RaisedByType;
  raised_by_name: string | null;
  status: RequirementStatus;
  voting_opens_at: string | null;
  voting_closes_at: string | null;
  vote_count_yes: number;
  vote_count_no: number;
  budgeted_amount: number | null;
  created_at: string | null;
}

// ----------------------------------------------------------------------------
// Requirement vote
// ----------------------------------------------------------------------------

/**
 * One ballot. Privacy lock (R2.1): voter_id is captured for unique-constraint
 * enforcement and never exposed via VotingService.getTally(). The only
 * service method that returns voter_id is VotingService.getMyVote(self).
 */
export interface RequirementVote {
  id: string;
  requirement_id: string;
  voter_id: string;
  vote: VoteChoice;
  created_at: string | null;
}

/** Public-shape tally — never includes voter identities. */
export interface RequirementTally {
  yes: number;
  no: number;
}

/** Eligibility resolver result. */
export interface VoterEligibility {
  eligible: boolean;
  reason: string | null;
}

// ----------------------------------------------------------------------------
// Input types — service-layer create/update payloads
// ----------------------------------------------------------------------------

/** Create-issue input (subset of grievance_tickets columns + B.1 additions). */
export interface CreateIssueInput {
  institution_id: string;
  category_id: string;
  subject: string;
  description: string;
  priority?: GrievancePriority;
  issue_type?: IssueType; // defaults to 'grievance'
  requirement_id?: string | null;
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
  attachments?: IssueAttachment[];
  metadata?: Record<string, unknown>;
}

/** Update-status input — used by triagers/resolvers. */
export interface UpdateIssueStatusInput {
  status: GrievanceStatus;
  note?: string;
  resolution?: string;
  resolved_by?: string;
}

/** Create-requirement input. */
export interface CreateRequirementInput {
  institution_id: string;
  category_id: string;
  subject: string;
  description: string;
  estimated_budget?: number | null;
  raised_by_type: RaisedByType;
  raised_by_id?: string | null;
  raised_by_name?: string | null;
  metadata?: Record<string, unknown>;
}

/** Cast-vote input. */
export interface CastVoteInput {
  requirement_id: string;
  voter_id: string;
  vote: VoteChoice;
}

/** Approve-requirement input. Callable only by the current chain step's actor. */
export interface ApproveRequirementInput {
  requirement_id: string;
  approver_id: string;
  budgeted_amount?: number;
  comment?: string;
}

/** Reject-requirement input. */
export interface RejectRequirementInput {
  requirement_id: string;
  approver_id: string;
  reason: string;
}

/** Build-chain input. Inputs to approval-chain-service.buildApprovalChain. */
export interface BuildChainInput {
  requirement_id: string;
  estimated_budget: number;
  institution_id: string;
}

// ----------------------------------------------------------------------------
// List-query parameters
// ----------------------------------------------------------------------------

export interface ListIssuesParams {
  issueType?: IssueType;
  page?: number;
  limit?: number;
  status?: GrievanceStatus;
  priority?: GrievancePriority;
  institutionId?: string;
  isEmergency?: boolean;
  isIccOnly?: boolean;
}

export interface ListRequirementsParams {
  page?: number;
  limit?: number;
  status?: RequirementStatus;
  institutionId?: string;
  categoryId?: string;
}
