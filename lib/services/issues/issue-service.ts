// lib/services/issues/issue-service.ts
// ============================================================================
// Insta Solver core module — IssueService.
//
// Client-side query layer over `grievance_tickets`, filtered by `issue_type`.
// Pattern source: lib/services/grievance/grievance-service.ts (static class,
// singleton supabase client, throws on errors, NO {data, error} wrapper).
//
// Wave B.1 substrate. Routes under /issues/* and the future B2A endpoints
// at /api/b2a/issues/* should consume this service rather than reaching into
// grievance-service.ts directly — even though both ultimately query the same
// table — because:
//
//   1. issue_type filtering is enforced here (callers can't accidentally
//      surface the requirement_link rows to the grievance UI).
//   2. The legacy /accreditation/naac/grievance route stays on
//      GrievanceService until soft-deprecation (R1.4) — keeping the two
//      service surfaces lets us migrate/redirect without touching either.
//
// Strategic spec:    docs/INSTASOLVER-MODULE-SPEC.md
// Implementation:    specs/instasolver-core-module-spec.md
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  CreateIssueInput,
  IssueTicket,
  IssueTicketDetail,
  IssueType,
  ListIssuesParams,
  UpdateIssueStatusInput,
} from '@/lib/types/issues';
import type {
  GrievancePriority,
  GrievanceStatus,
} from '@/lib/types/grievance';

// Column projections mirror grievance-service.ts exactly so cached query
// shapes line up across the two services.
const LIST_COLS =
  'id, ticket_number, category_id, institution_id, subject, priority, status, ' +
  'issue_type, requirement_id, raised_by_type, raised_by_name, sla_deadline, ' +
  'sla_status, resolved_at, is_emergency, is_anonymous, is_icc_only, ' +
  'escalation_level, assigned_to, migrated_from_subdomain, legacy_external_id, ' +
  'created_at';

export class IssueService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // List / Get
  // --------------------------------------------------------------------------

  /**
   * Paginated list of issues. RLS scopes to caller's institution + ICC gating.
   *
   * Default issue_type is 'grievance' (the most common /issues/grievances
   * surface). Pass `issueType: 'requirement_link'` to fetch the auto-created
   * promotion mirrors. Pass undefined to skip the filter (admin-only views).
   */
  static async listIssues(
    params: ListIssuesParams = {}
  ): Promise<{ items: IssueTicket[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.supabase as any)
      .from('grievance_tickets')
      .select(LIST_COLS, { count: 'exact' });

    if (params.issueType) query = query.eq('issue_type', params.issueType);
    if (params.institutionId) query = query.eq('institution_id', params.institutionId);
    if (params.status) query = query.eq('status', params.status);
    if (params.priority) query = query.eq('priority', params.priority);
    if (typeof params.isEmergency === 'boolean') {
      query = query.eq('is_emergency', params.isEmergency);
    }
    if (typeof params.isIccOnly === 'boolean') {
      query = query.eq('is_icc_only', params.isIccOnly);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return { items: (data ?? []) as IssueTicket[], total: count ?? 0 };
  }

  /** Detail view — full row including description, attachments, metadata. */
  static async getIssueById(id: string): Promise<IssueTicketDetail> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('grievance_tickets')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as IssueTicketDetail;
  }

  // --------------------------------------------------------------------------
  // Create
  // --------------------------------------------------------------------------

  /**
   * Insert a new issue (grievance OR requirement_link). The DB BEFORE-INSERT
   * trigger generates ticket_number (GRV-YYYYMMDD-NNNN). Caller must compute
   * sla_deadline (e.g. via GrievanceService.calculateSlaDeadline RPC).
   *
   * Attachments shape (R1.1): max 5 files × 10MB, MIME-whitelisted upstream.
   * Service layer trusts the caller — Zod validation + storage upload happens
   * in the form/route layer before we land here.
   */
  static async createIssue(input: CreateIssueInput): Promise<IssueTicket> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.supabase as any)
      .from('grievance_tickets')
      .insert({
        institution_id: input.institution_id,
        category_id: input.category_id,
        subject: input.subject,
        description: input.description,
        priority: input.priority ?? 'medium',
        status: 'open',
        issue_type: input.issue_type ?? 'grievance',
        requirement_id: input.requirement_id ?? null,
        raised_by_type: input.raised_by_type,
        raised_by_id: input.raised_by_id ?? null,
        raised_by_name: input.raised_by_name ?? null,
        raised_by_email: input.raised_by_email ?? null,
        raised_by_phone: input.raised_by_phone ?? null,
        is_anonymous: input.is_anonymous ?? false,
        anonymous_token: input.is_anonymous
          ? `anon_${crypto.randomUUID()}`
          : null,
        filed_by: input.filed_by ?? null,
        is_emergency: input.is_emergency ?? false,
        is_icc_only: input.is_icc_only ?? false,
        sla_hours: input.sla_hours,
        sla_deadline: input.sla_deadline,
        attachments: input.attachments ?? [],
        metadata: input.metadata ?? {},
      })
      .select(LIST_COLS)
      .single();

    if (error) throw error;
    return data as IssueTicket;
  }

  // --------------------------------------------------------------------------
  // Update (status / assignment / escalation / withdrawal)
  // --------------------------------------------------------------------------

  /**
   * Update issue status + optional resolution payload. When status='resolved',
   * resolved_at and resolved_by are stamped automatically (mirrors
   * grievance-service.ts behaviour).
   */
  static async updateIssueStatus(
    id: string,
    input: UpdateIssueStatusInput
  ): Promise<void> {
    const patch: Record<string, unknown> = { status: input.status };
    if (input.status === 'resolved') {
      patch.resolution = input.resolution ?? null;
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = input.resolved_by ?? null;
    }
    if (input.note) {
      // Free-form note attached as metadata; the grievance_history audit
      // entry is captured by the AFTER-UPDATE trigger.
      patch.metadata = { last_status_note: input.note };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('grievance_tickets')
      .update(patch)
      .eq('id', id);

    if (error) throw error;
  }

  /** Convenience: status change without a note/resolution payload. */
  static async setStatus(id: string, status: GrievanceStatus): Promise<void> {
    return this.updateIssueStatus(id, { status });
  }

  /**
   * Assign the issue to a triager/resolver. Stamps assigned_at to allow
   * SLA-against-assignment dashboards to compute time-to-first-touch.
   */
  static async assignTo(id: string, userId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('grievance_tickets')
      .update({
        assigned_to: userId,
        assigned_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Escalate one tier. Reads `issue_escalation_rules` (Pattern B config table
   * cloned from counselor_routing_config) for the next assignee role and
   * stamps escalation_level + assigned_to atomically.
   *
   * NOTE: For B.1 substrate this is a thin wrapper that ONLY bumps the level
   * + clears assignment. The full role-resolution lives in
   * `fn_escalate_issue` (SQL — sibling agent scope). Once that fn ships,
   * swap this body for an RPC call.
   */
  static async escalate(id: string): Promise<void> {
    // Step 1: read current level
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error: readErr } = await (this.supabase as any)
      .from('grievance_tickets')
      .select('escalation_level')
      .eq('id', id)
      .single();
    if (readErr) throw readErr;

    const currentLevel = (row?.escalation_level ?? 0) as number;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('grievance_tickets')
      .update({
        escalation_level: currentLevel + 1,
        // assigned_to cleared so the next-tier role's queue picks it up
        assigned_to: null,
        assigned_at: null,
      })
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Withdraw a ticket (filer-initiated). Sets status='closed', stamps
   * withdrawn_at + withdrawn_reason. Mirrors the supersede-on-withdrawal
   * pattern referenced in grievance-service.ts header (still TODO upstream).
   */
  static async withdrawIssue(id: string, reason: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any)
      .from('grievance_tickets')
      .update({
        status: 'closed',
        withdrawn_at: new Date().toISOString(),
        withdrawn_reason: reason,
      })
      .eq('id', id);

    if (error) throw error;
  }

  // --------------------------------------------------------------------------
  // Counts (used by dashboard cards before the dedicated stats RPC ships)
  // --------------------------------------------------------------------------

  /**
   * Per-issue-type total. Cheap COUNT — no row payload returned.
   * Useful for the /issues landing dashboard split tabs.
   */
  static async getCount(
    institutionId: string,
    issueType?: IssueType,
    status?: GrievanceStatus,
    priority?: GrievancePriority
  ): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.supabase as any)
      .from('grievance_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId);

    if (issueType) query = query.eq('issue_type', issueType);
    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);

    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }
}
