// lib/types/issues.ts
// ============================================================================
// InstaSolver — types for the complaint lane and the purchase approval chain.
//
// REWRITTEN 2026-09-14 (specs/instasolver-2026-09-14.md). The original version
// of this file typed a `requirement_requests` island — its own categories,
// votes and status machine — and an `issue_type` discriminator on
// grievance_tickets. Neither ever reached production, and both were reversed:
//
//   - I4: broken things go to Campus Walk (project_tasks under CAMPUS-OPS),
//     never into grievance_tickets. Nothing reads `issue_type`, so a
//     discriminator could not have kept them out of the NAAC and UGC counts.
//   - I3/I5: purchases go to Procurement. The approval TIERS survive, as
//     `procurement_approval_thresholds`; the request itself becomes a
//     procurement_purchase_requests row.
//
// What remains here is what still has a table behind it:
//   - `RaisedByType`        who may file (I1: everyone with a login)
//   - `IssueTicket` / `IssueTicketDetail` / `IssueAttachment`
//                           projections over grievance_tickets
//   - `ApprovalChainStep` / `BuildChainInput`
//                           the purchase approval chain, built from
//                           procurement_approval_thresholds
//   - create/update input types for the complaint lane
//
// Spec:      specs/instasolver-2026-09-14.md
// Migration: supabase/migrations/20261212110000_instasolver_substrate_v2.sql
// Pattern source: lib/types/grievance.ts
// ============================================================================

import type {
  GrievancePriority,
  GrievanceStatus,
  RaisedByType as GrievanceRaisedByType,
  SlaStatus,
} from '@/lib/types/grievance';

// ----------------------------------------------------------------------------
// Re-export the underlying grievance enum primitives so InstaSolver callers can
// import everything from `@/lib/types/issues` without reaching into
// grievance.ts directly.
// ----------------------------------------------------------------------------
export type { GrievancePriority, GrievanceStatus, SlaStatus };

/**
 * Who may raise an InstaSolver item. I1 locks this to everyone with a login —
 * learners, teaching and non-teaching staff, and parents — which is wider than
 * the Learners Council route allowed.
 *
 * The production column is plain `text`, not a pg_enum, so widening this union
 * needs no migration.
 */
export type RaisedByType = GrievanceRaisedByType | 'faculty' | 'admin';

// ----------------------------------------------------------------------------
// Purchase approval chain — snapshot pattern cloned from leave-service.ts
// ----------------------------------------------------------------------------

/**
 * One step in a purchase approval chain (I5).
 *
 * The chain is built at request time from `procurement_approval_thresholds`
 * (frozen-snapshot semantics, so a later threshold edit does not disturb an
 * in-flight request) and then persisted by the Procurement caller alongside
 * its purchase request.
 *
 * `approver_user_id` is null when the chain is built and resolved at decide
 * time by role lookup — mirroring LeaveApprovalStep in
 * lib/services/hr/leave-service.ts.
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

/** Inputs to ApprovalChainService.buildApprovalChain. */
export interface BuildChainInput {
  estimated_budget: number;
  institution_id: string;
}

// ----------------------------------------------------------------------------
// Complaint ticket (grievance_tickets projections)
// ----------------------------------------------------------------------------

/**
 * List-shape projection over grievance_tickets, plus the two InstaSolver
 * cutover markers added by 20261212110000 (I9).
 *
 * There is deliberately no `issue_type` and no `requirement_id`: this table
 * holds complaints and nothing else, which is what keeps the accreditation
 * counts honest.
 */
export interface IssueTicket {
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
// Input types — service-layer create/update payloads
// ----------------------------------------------------------------------------

/** Create-complaint input (subset of grievance_tickets columns). */
export interface CreateIssueInput {
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

// ----------------------------------------------------------------------------
// List-query parameters
// ----------------------------------------------------------------------------

export interface ListIssuesParams {
  page?: number;
  limit?: number;
  status?: GrievanceStatus;
  priority?: GrievancePriority;
  institutionId?: string;
  isEmergency?: boolean;
  isIccOnly?: boolean;
}
