/**
 * HR Recruitment Service (Phase 1A)
 *
 * Static class — SupabaseClient passed as first argument (mirrors LeaveService pattern).
 * Spec: specs/hr-recruitment-module-spec.md
 * Pattern: lib/services/hr/leave-service.ts
 *
 * Methods:
 *   listCandidates     — paginated list with filters
 *   getCandidate       — single record by id
 *   submitCandidate    — create + build frozen approval_chain snapshot
 *   approveCandidate   — advance current_step; finalise on last step
 *   rejectCandidate    — terminal rejection with reason
 *   withdrawCandidate  — R2.1 soft-status change
 *   markNoShow         — R2.4
 *   updateStatus       — joined / offer_rescinded / offer_issued transitions
 *   assertMayUpdateStatus — the permission + HR-organisation gate the status
 *                        route now runs BEFORE any of those transitions
 *   buildApprovalChain — reads hr_approval_flows, freezes snapshot
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeaveApprovalStep } from '@/types/hr';
import type {
  HRRecruitmentCandidate,
  HRRecruitmentCandidateInsert,
  HRRecruitmentCandidateUpdate,
  HRRecruitmentCandidateComment,
  HRRecruitmentJob,
  HRRecruitmentJobNote,
  HRJobApplication,
  JobApplicationStatus,
  PurgeRejectedApplicantResult,
  ApprovalsJobOverviewRow,
  ApprovalFlowStepTemplate,
  HRApprovalFlow,
  JobAnalytics,
  CandidateFilters as BaseCandidateFilters,
  CandidateListResponse,
  CandidateStatus,
  RoleCategory,
  MonthlySalaryBand,
} from '@/types/hr-recruitment';

// =====================================================================================
// Extended list filters (Phase 1A follow-up)
// Server-side filters that remove the need for client-side filtering in the inbox UI.
// =====================================================================================

export interface CandidateFilters extends BaseCandidateFilters {
  /** Filter by the user who submitted the candidate (profiles.id UUID). */
  submitted_by?: string;
  /**
   * Approver-inbox mode. When true, only returns rows where:
   *   status IN ('submitted','pending_approval')
   *   AND approval_chain -> current_step ->> 'approver_user_id' = approver_id
   * Requires `approver_id` to be set — `listCandidates` throws otherwise.
   */
  pending_for_me?: boolean;
  /** UUID of the approver whose inbox we're computing. Required when `pending_for_me=true`. */
  approver_id?: string;
}

// =====================================================================================
// Recruitment Service
// =====================================================================================
// NOTE (2026-07-06): the platform_policies-driven viewer-scoping engine
// (resolveViewerScope + /hr/admin/recruitment-approvals-scope) was REMOVED —
// it conflicted with the dynamic approval-flow builder, which is now the
// single source of truth for who acts at each step. RLS still bounds rows.

/**
 * Strip PostgREST filter meta-characters before interpolating a user-supplied
 * search term into a `.or()` string — `,`/`(`/`)` etc. would otherwise be
 * parsed as filter syntax (RLS still bounds rows, but the filter logic could
 * be altered or the query broken).
 */
function sanitizeSearchTerm(search: string): string {
  return search.replace(/[,()"\\:*%]/g, ' ').trim();
}

/**
 * A refusal that is a PERMISSION refusal, not a bad request.
 *
 * Carried as its own class so a route can answer 403 with a machine-readable
 * `reason` instead of folding the refusal into the same 400 that a malformed
 * body produces. `reason` is a stable key for the UI; `message` is the sentence
 * a person reads.
 */
export type RecruitmentRefusalReason =
  | 'missing_permission'
  | 'outside_your_organisation'
  /** The route's own gate admitted the caller and the DATABASE then refused. */
  | 'refused_by_database';

export class RecruitmentForbiddenError extends Error {
  readonly reason: RecruitmentRefusalReason;
  /** PostgREST/Postgres code when the refusal came from the database, else null. */
  readonly dbCode: string | null;
  constructor(reason: RecruitmentRefusalReason, message: string, dbCode: string | null = null) {
    super(message);
    this.name = 'RecruitmentForbiddenError';
    this.reason = reason;
    this.dbCode = dbCode;
  }
}

/**
 * A write that reached the database and came back refused, translated into a
 * named refusal instead of being re-thrown as-is.
 *
 * WHY THIS EXISTS (review round 1, P3). `assertMayUpdateStatus` below and the
 * RLS UPDATE policy are NOT the same predicate, and cannot be:
 *
 *   gate:   hr_organization_id ∈ fn_my_hr_organization_ids()
 *   policy: role_has_institution_access(institution_id)
 *
 * A `.edit` + `.view` holder who is active staff of the candidate's institution
 * passes the gate; if their ROLE's scope does not reach that institution the
 * policy still refuses. The gate is therefore necessary but not sufficient, and
 * the residue has to be named rather than leaked.
 *
 * `throw error` on a PostgrestError is not enough: postgrest-js returns a PLAIN
 * OBJECT, so `err instanceof Error` is false and a route catch that reads
 * `err.message` off an `Error` answered **400 "Unknown error"** — the exact
 * signature PR #3418 fixed for approve/reject. Worse, an RLS-filtered
 * `.update().select().single()` matches ZERO rows, which PostgREST reports as
 * `PGRST116` ("JSON object requested, multiple (or no) rows returned") — a
 * refusal that looks like a 404 and reads like a parse error.
 *
 * Mapping (CLAUDE.md #27 — a permission failure is NAMED, never silent):
 *   PGRST116 / 42501 / PGRST301 → 403 `refused_by_database`
 *   23xxx (constraint)          → 409, surfaced by the route
 *   anything else               → re-thrown untouched, so a real bug stays loud
 */
function isPostgrestError(
  err: unknown
): err is { code?: string; message?: string; details?: string; hint?: string } {
  return typeof err === 'object' && err !== null && 'code' in err && !(err instanceof Error);
}

/** Postgres/PostgREST codes that mean "you were refused", not "your input was bad". */
const DB_REFUSAL_CODES = new Set(['PGRST116', 'PGRST301', '42501']);

export class RecruitmentDbConflictError extends Error {
  readonly dbCode: string;
  constructor(message: string, dbCode: string) {
    super(message);
    this.name = 'RecruitmentDbConflictError';
    this.dbCode = dbCode;
  }
}

/**
 * Translate a PostgREST failure on a candidate write into a named refusal.
 *
 * `what` names the act in the sentence a person reads, e.g. "change this
 * candidate's status".
 */
function translateCandidateWriteError(err: unknown, what: string): never {
  if (isPostgrestError(err)) {
    const code = String(err.code ?? '');
    if (DB_REFUSAL_CODES.has(code)) {
      throw new RecruitmentForbiddenError(
        'refused_by_database',
        `The database refused to ${what}. Your permissions allow the action, but this ` +
          'candidate belongs to an institution your role is not scoped to reach ' +
          '(the row-level policy requires role_has_institution_access on their institution). ' +
          'Ask an HR administrator to widen your role’s institution scope, or ask the ' +
          'candidate’s own HR team to act.',
        code || null
      );
    }
    if (code.startsWith('23')) {
      throw new RecruitmentDbConflictError(
        `The database rejected the attempt to ${what} because it conflicts with an ` +
          `existing record (${code}). Reload the candidate and try again.`,
        code
      );
    }
  }
  throw err;
}

/**
 * A zero-row UPDATE that PostgREST did NOT report as an error.
 *
 * `.update().select()` without `.single()` returns `{ data: [], error: null }`
 * when RLS filtered every row — success-shaped, and silent. Named here for the
 * same reason as above.
 */
function assertWriteLanded(rows: unknown[] | null, what: string): void {
  if (!rows || rows.length === 0) {
    throw new RecruitmentForbiddenError(
      'refused_by_database',
      `The database refused to ${what} — no row was changed. This is a row-level ` +
        'permission refusal, not a missing candidate. Ask an HR administrator to widen ' +
        'your role’s institution scope, or ask the candidate’s own HR team to act.',
      'zero_rows'
    );
  }
}

/**
 * The forward-transition map `updateStatus` enforces. Hoisted out of the method
 * so the Issue Offer predicate below can be proven to agree with it.
 */
export const CANDIDATE_FORWARD_TRANSITIONS: Partial<Record<CandidateStatus, CandidateStatus[]>> = {
  approved:       ['package_fixed', 'offer_issued'],
  package_fixed:  ['offer_issued'],
  offer_issued:   ['joined', 'no_show', 'offer_rescinded'],
};

export class RecruitmentService {
  // ----- List / Get -----

  static async listCandidates(
    supabase: SupabaseClient,
    filters: CandidateFilters = {}
  ): Promise<CandidateListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // pending_for_me: short-circuit to SECURITY DEFINER RPC.
    //
    // The old PostgREST `.contains('approval_chain', [{approver_user_id}])` filter
    // returned 0 rows for everyone (chain entries are seeded with approver_user_id=null
    // at submit-time) AND threw HTTP 500 for super-admin auth context. The correct
    // matching is approval_chain[current_step].approver_role vs the caller's role_key,
    // which PostgREST cannot express. See migration
    // 20260516170000_fn_list_my_pending_recruitment.sql for the function definition.
    //
    // We bypass the regular query builder entirely on this path — viewer-scope and
    // other filters are not applied here. Approver-inbox semantics already encode
    // the only scope that matters: "rows where I am the named approver at the
    // current step", which is a stricter filter than any viewer-scope rule.
    if (filters.pending_for_me) {
      if (!filters.approver_id) {
        throw new Error('approver_id is required when pending_for_me=true');
      }
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'fn_list_my_pending_recruitment',
        { p_user_id: filters.approver_id }
      );
      if (rpcError) throw rpcError;
      const all = (rpcData ?? []) as HRRecruitmentCandidate[];
      const total = all.length;
      const sliced = all.slice(from, to + 1);
      return {
        data: sliced,
        metadata: {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    }

    let q = supabase
      .from('hr_recruitment_candidates')
      .select('*', { count: 'exact' })
      .order('submitted_at', { ascending: false })
      .range(from, to);

    if (filters.hr_organization_id) {
      q = q.eq('hr_organization_id', filters.hr_organization_id);
    }
    if (filters.institution_id) {
      q = q.eq('institution_id', filters.institution_id);
    }
    if (filters.role_category) {
      q = q.eq('role_category', filters.role_category);
    }
    if (filters.is_emergency !== undefined) {
      q = q.eq('is_emergency', filters.is_emergency);
    }
    if (filters.source) {
      q = q.eq('source', filters.source);
    }
    if (filters.submitted_by) {
      q = q.eq('submitted_by', filters.submitted_by);
    }

    // pending_for_me was handled above via SECURITY DEFINER RPC short-circuit.
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in('status', statuses);
    }
    if (filters.search) {
      const s = sanitizeSearchTerm(filters.search);
      if (s) {
        q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,role_title.ilike.%${s}%`);
      }
    }

    const { data, count, error } = await q;
    if (error) throw error;

    return {
      data: (data ?? []) as HRRecruitmentCandidate[],
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    };
  }

  static async getCandidate(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRRecruitmentCandidate | null> {
    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as HRRecruitmentCandidate | null;
  }

  // ----- Submit -----

  /**
   * Build the approval_chain snapshot from hr_approval_flows at submit-time.
   * Frozen-snapshot pattern (R1.4) — if HR later edits the flow,
   * in-flight candidates keep their original approval rules.
   *
   * Matching logic: conditions jsonb is matched against roleCategory + monthlySalaryBand.
   * Most-specific match wins (role_category + monthly_salary_band > role_category only).
   */
  static async buildApprovalChain(
    supabase: SupabaseClient,
    hrOrgId: string,
    roleCategory: RoleCategory,
    monthlySalaryBand: MonthlySalaryBand | null
  ): Promise<LeaveApprovalStep[]> {
    // hr_approval_flows is read-only configuration data, not per-user PII.
    // The table's RLS (hr_organization_id = auth_hr_organization_id()) hid
    // rows from any user lacking a user_hr_access mapping, surfacing as a
    // misleading "No recruitment approval flows configured" error even when
    // flows exist. fn_list_active_approval_flows is a SECURITY DEFINER helper
    // that bypasses RLS for this read (see migration
    // 20260514090000_create_fn_list_active_approval_flows.sql).
    const { data: flows, error } = await supabase.rpc(
      'fn_list_active_approval_flows',
      { p_hr_org_id: hrOrgId, p_flow_for: 'recruitment_approval' }
    );

    if (error) throw error;
    if (!flows || flows.length === 0) {
      throw new Error(
        'No recruitment approval flows configured for this organisation yet. ' +
        'Open /hr/admin/recruitment-approval-flows (HR Admin → Recruitment Approval Flows) ' +
        'to seed at least one flow with flow_for=recruitment_approval. ' +
        'If you need a quick band-agnostic Teaching Faculty fallback, the ' +
        '/hr/admin/recruitment-maintenance page can guide you.'
      );
    }

    // `steps` holds the flow TEMPLATE shape (chain_order, approver_role, …);
    // toChainSteps is what turns it into the frozen LeaveApprovalStep chain.
    type ApprovalFlowRow = {
      conditions: Record<string, string> | null;
      steps: ApprovalFlowStepTemplate[] | null;
    };

    const chosen = this.matchRecruitmentFlow(
      flows as ApprovalFlowRow[],
      roleCategory,
      monthlySalaryBand
    );

    if (!chosen) {
      throw new Error(
        `No approval flow matches this candidate — nothing routes the role ` +
        `category '${roleCategory}' in this organisation yet. ` +
        `Open /hr/admin/recruitment-approval-flows, add an active flow for ` +
        `'${roleCategory}', then promote again. ` +
        `If several candidates are stuck the same way, ` +
        `/hr/admin/recruitment-maintenance can backfill them once the flow exists.`
      );
    }

    return this.toChainSteps((chosen.steps ?? []) as ApprovalFlowStepTemplate[]);
  }

  /**
   * Pick the flow that routes a candidate. Most-specific match wins:
   * role_category + monthly_salary_band beats role_category alone.
   *
   * Kept separate from buildApprovalChain so the workspace preview and the
   * promote-time freeze resolve the SAME flow. A preview that disagrees with
   * the chain actually frozen is the failure this split exists to prevent.
   */
  static matchRecruitmentFlow<T extends { conditions: Record<string, string> | null }>(
    flows: T[],
    roleCategory: RoleCategory,
    monthlySalaryBand: MonthlySalaryBand | null
  ): T | null {
    const exact = flows.filter((f) => {
      const cond = f.conditions ?? {};
      return (
        cond.role_category === roleCategory &&
        cond.monthly_salary_band === (monthlySalaryBand ?? '')
      );
    });
    if (exact.length > 0) return exact[0];

    const categoryOnly = flows.filter((f) => {
      const cond = f.conditions ?? {};
      return cond.role_category === roleCategory && !cond.monthly_salary_band;
    });
    return categoryOnly.length > 0 ? categoryOnly[0] : null;
  }

  /**
   * Map a flow's jsonb `steps` to the frozen LeaveApprovalStep shape.
   * Dynamic-flow fields (2026-07-06) are carried into the snapshot too:
   * step_type (review|final), pinned approver_user_id, interview_required.
   */
  private static toChainSteps(steps: ApprovalFlowStepTemplate[]): LeaveApprovalStep[] {
    return steps.map((s, idx) => ({
      step_order: s.chain_order ?? idx + 1,
      approver_role: s.approver_role,
      // Pinned user routes directly; null = resolved by role at approve-time.
      approver_user_id: s.approver_user_id ?? null,
      status: 'pending' as const,
      escalate_after_hours: s.escalate_after_hours ?? 72, // R3.3: 3-day default
      step_type: s.step_type ?? (idx === steps.length - 1 ? 'final' : 'review'),
      interview_required: s.interview_required ?? false,
      interview_id: null,
    }));
  }

  /**
   * The chain an applicant WOULD get if promoted right now — same RPC, same
   * matcher and same mapping as buildApprovalChain, but it reports failure as
   * data instead of throwing, because the workspace renders this for people
   * who may never be promoted.
   *
   * `reason` lets the UI say which of the two setup gaps applies rather than
   * showing an empty box: 'no_flows' = nothing configured for the org at all,
   * 'no_match' = flows exist but none routes this role category.
   */
  static async previewApprovalChain(
    supabase: SupabaseClient,
    hrOrgId: string,
    roleCategory: RoleCategory,
    monthlySalaryBand: MonthlySalaryBand | null = null
  ): Promise<{ steps: LeaveApprovalStep[]; reason: 'ok' | 'no_flows' | 'no_match' }> {
    const { data: flows, error } = await supabase.rpc(
      'fn_list_active_approval_flows',
      { p_hr_org_id: hrOrgId, p_flow_for: 'recruitment_approval' }
    );
    if (error) throw error;
    if (!flows || flows.length === 0) return { steps: [], reason: 'no_flows' };

    const chosen = this.matchRecruitmentFlow(
      flows as Array<{
        conditions: Record<string, string> | null;
        steps: ApprovalFlowStepTemplate[] | null;
      }>,
      roleCategory,
      monthlySalaryBand
    );
    if (!chosen) return { steps: [], reason: 'no_match' };

    return {
      steps: this.toChainSteps((chosen.steps ?? []) as ApprovalFlowStepTemplate[]),
      reason: 'ok',
    };
  }

  /**
   * Submit a new candidate. Validates required fields, builds approval chain snapshot,
   * inserts the row with status='pending_approval'.
   */
  static async submitCandidate(
    supabase: SupabaseClient,
    payload: HRRecruitmentCandidateInsert
  ): Promise<HRRecruitmentCandidate> {
    if (!payload.cvviz_url) {
      throw new Error('CV link (cvviz_url) is mandatory per R3.4.');
    }
    if (!payload.name || !payload.email) {
      throw new Error('Candidate name and email are required.');
    }

    // Build frozen approval chain from hr_approval_flows
    const approval_chain = await this.buildApprovalChain(
      supabase,
      payload.hr_organization_id,
      payload.role_category,
      payload.proposed_monthly_salary_band ?? null
    );

    const insertPayload: Record<string, unknown> = {
      hr_organization_id: payload.hr_organization_id,
      institution_id: payload.institution_id ?? null,
      name: payload.name,
      email: payload.email,
      phone: payload.phone ?? null,
      cvviz_url: payload.cvviz_url,
      role_category: payload.role_category,
      role_title: payload.role_title,
      proposed_monthly_salary_band: payload.proposed_monthly_salary_band ?? null,
      role_specific_details: payload.role_specific_details ?? {},
      status: payload.status ?? 'pending_approval',
      is_emergency: payload.is_emergency ?? false,
      is_internal_transfer: payload.is_internal_transfer ?? false,
      source_staff_id: payload.source_staff_id ?? null,
      source: payload.source ?? 'hr_submission',
      approval_chain,
      current_step: 0,
      expected_joining_date: payload.expected_joining_date ?? null,
      submitted_by: payload.submitted_by,
      submitted_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  // ----- Approve / Reject -----

  /**
   * Approve the candidate's current approval-chain step.
   *
   * Delegates to the SECURITY DEFINER RPC `fn_decide_recruitment_candidate`, which
   * self-authorizes against the frozen `approval_chain` and performs the write.
   *
   * This used to authorize in TypeScript and then UPDATE through the caller's own
   * RLS-bound client. That UPDATE policy requires `hr.recruitment.edit`, which the
   * approver roles `hod`, `board` and `medical_superintendent` do not hold — they
   * hold `hr.recruitment.approve` only. So the service said "authorized", the policy
   * matched zero rows, `.single()` raised PGRST116, and the route turned a
   * PostgrestError (not an `Error` instance) into `{"error":"Unknown error"}`. Every
   * teaching_faculty chain opens on a `hod` step, so no HOD could ever approve.
   * `updateStepComment` below already had to solve exactly this for the review
   * comment; the decision itself was left behind.
   *
   * The authorization rules (pinned approver / role holder / super admin / override
   * key, and the comment an override must carry) now live in the function body, in
   * SQL — a definer function that wrote a chain handed to it by the client would let
   * any caller approve themselves. See the migration for the full rationale.
   *
   * @param _approverId — unused: the RPC resolves the actor from `auth.uid()`, which
   *   is the same user the route authenticated. Kept so callers need no change.
   */
  static async approveCandidate(
    supabase: SupabaseClient,
    id: string,
    _approverId: string,
    comment?: string
  ): Promise<HRRecruitmentCandidate> {
    const { data, error } = await supabase.rpc('fn_decide_recruitment_candidate', {
      p_candidate_id: id,
      p_decision: 'approve',
      p_comment: comment ?? null,
    });
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  /**
   * Reject the candidate outright, stamping the current step with the reason.
   *
   * Same RPC, same reason as `approveCandidate`. Note the RPC also applies the
   * step-approver gate to rejection, which the old implementation never did — it
   * was bounded only by the `hr.recruitment.edit` RLS predicate the function now
   * bypasses, so leaving rejection ungated would have opened a hole.
   *
   * @param _approverId — unused; see `approveCandidate`.
   */
  static async rejectCandidate(
    supabase: SupabaseClient,
    id: string,
    _approverId: string,
    reason: string
  ): Promise<HRRecruitmentCandidate> {
    const { data, error } = await supabase.rpc('fn_decide_recruitment_candidate', {
      p_candidate_id: id,
      p_decision: 'reject',
      p_comment: reason,
    });
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  // ----- Edit a decided step's review comment -----

  /**
   * Edit the review comment on an already-decided approval step. Delegates to
   * the SECURITY DEFINER RPC fn_update_recruitment_step_comment, which
   * self-authorizes (author / super-admin / hr.recruitment.approve.override)
   * and bypasses the candidate UPDATE RLS — the author may be an approver role
   * (e.g. hod) that can approve but not edit the candidate row.
   */
  static async updateStepComment(
    supabase: SupabaseClient,
    candidateId: string,
    stepIndex: number,
    comment: string
  ): Promise<HRRecruitmentCandidate> {
    const { data, error } = await supabase.rpc('fn_update_recruitment_step_comment', {
      p_candidate_id: candidateId,
      p_step_index: stepIndex,
      p_comment: comment,
    });
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  // ----- Withdraw (R2.1 — soft-status, pre-offer only) -----

  static async withdrawCandidate(
    supabase: SupabaseClient,
    id: string,
    reason: string
  ): Promise<HRRecruitmentCandidate> {
    const candidate = await this.getCandidate(supabase, id);
    if (!candidate) throw new Error('Candidate not found');

    const withdrawableStatuses: CandidateStatus[] = [
      'submitted',
      'pending_approval',
      'approved',
    ];
    if (!withdrawableStatuses.includes(candidate.status)) {
      throw new Error(
        `Cannot withdraw candidate in status '${candidate.status}'. ` +
        'Withdrawal is only allowed before offer is issued.'
      );
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .update({
        status: 'withdrawn',
        cancellation_reason: reason,
        final_decided_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  // ----- No-show (R2.4) -----

  static async markNoShow(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRRecruitmentCandidate> {
    const candidate = await this.getCandidate(supabase, id);
    if (!candidate) throw new Error('Candidate not found');

    const noShowEligible: CandidateStatus[] = ['offer_issued', 'approved', 'package_fixed'];
    if (!noShowEligible.includes(candidate.status)) {
      throw new Error(
        `Cannot mark no-show for candidate in status '${candidate.status}'.`
      );
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .update({
        status: 'no_show',
        cancellation_reason: 'Candidate did not join on expected date',
        final_decided_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    // Same named refusal as updateStatus: this method is reached through the
    // same route, so an RLS refusal here must not answer 400 "Unknown error".
    if (error) translateCandidateWriteError(error, 'mark this candidate as a no-show');
    assertWriteLanded(data ? [data] : [], 'mark this candidate as a no-show');
    return data as HRRecruitmentCandidate;
  }

  // ----- Status transitions (joined / offer_rescinded / offer_issued) -----

  /**
   * Who may move a candidate's status, checked BEFORE the write is attempted.
   *
   * WHAT THIS FIXES. The status route
   * (app/api/hr/recruitment/candidates/[id]/status/route.ts) authenticated the
   * caller and then went straight into updateStatus, whose only test is the
   * forward-transition map. The write itself was not unguarded — the UPDATE
   * policy on hr_recruitment_candidates requires
   * `hr.recruitment.edit AND role_has_institution_access(institution_id)` — but
   * an RLS refusal on an `.update().select().single()` matches zero rows and
   * raises PGRST116, which is not an `Error` instance, so the route's catch
   * reported **HTTP 400 "Unknown error"**. That is the exact failure signature
   * PR #3418 spent a fix on for the approve/reject paths: the caller is told
   * nothing, and the refusal is indistinguishable from a bad payload.
   *
   * This PR is the first to put a UI control on this transition, so the refusal
   * is made explicit here (CLAUDE.md #27 — a permission failure is a named
   * refusal, never a silent bounce) and, because it runs before the write, it
   * also holds if a future caller ever reaches updateStatus through a
   * service-role client, which RLS would not stop at all.
   *
   * WHAT IS CHECKED
   *   0. is_admin() — the bypass the RLS UPDATE policy itself carries. See the
   *      note below: omitting it was a REGRESSION, not a hardening.
   *   1. hr.recruitment.edit — the module's own management key.
   *   2. hr.recruitment.view — required alongside, defence in depth. In the
   *      live catalogue every `.edit` holder also holds `.view` (0 exceptions),
   *      so this removes nobody's access today.
   *   3. hr_organization_id ∈ fn_my_hr_organization_ids() — the same predicate
   *      the rest of the HR module scopes by, skipped for a super admin (who
   *      bypasses every other branch of the module too).
   *
   * WHY is_admin() IS HERE (review round 1, P5). The UPDATE policy on
   * hr_recruitment_candidates (supabase/setup/03_policies.sql ~5353) reads:
   *
   *   is_super_admin() OR is_admin()
   *   OR (user_has_permission('hr.recruitment.edit')
   *       AND role_has_institution_access(institution_id))
   *
   * `user_has_permission()` bypasses for `profiles.is_super_admin = true` ONLY —
   * it does NOT bypass for `profiles.role IN ('admin','administrator',
   * 'super_admin')`, which is what `is_admin()` adds. So without this branch a
   * profile whose ROLE is admin but whose `is_super_admin` is false, holding
   * neither recruitment key, could update a candidate's status yesterday through
   * RLS and would get a 403 today. `canMarkJoined` on the candidate page carries
   * no permission gate at all, so that person sees "Mark as Joined", clicks it,
   * and the button breaks. A gate in front of a policy must not be NARROWER than
   * the policy for an existing, working path — it may only name refusals the
   * policy would also make. This route matches the policy now.
   *
   * The org test is skipped for both bypasses for the same reason: `is_admin()`
   * is cluster-wide in the policy too, so applying HR-organisation scoping to it
   * here would re-introduce exactly the narrowing this fixes.
   *
   * Throws {@link RecruitmentForbiddenError}; the route maps it to 403 plus the
   * machine-readable `reason`.
   */
  static async assertMayUpdateStatus(
    supabase: SupabaseClient,
    candidate: Pick<HRRecruitmentCandidate, 'hr_organization_id'>
  ): Promise<void> {
    // The policy's own two bypasses, read FIRST. They must be tested before the
    // permission-key refusal below, or an admin-role profile holding neither key
    // is thrown out before its bypass is ever consulted.
    const [{ data: isSuperAdmin }, { data: isAdmin }] = await Promise.all([
      supabase.rpc('is_super_admin'),
      supabase.rpc('is_admin'),
    ]);
    if (isSuperAdmin || isAdmin) return;

    const [{ data: canEdit }, { data: canView }] = await Promise.all([
      supabase.rpc('user_has_permission', { permission_name: 'hr.recruitment.edit' }),
      supabase.rpc('user_has_permission', { permission_name: 'hr.recruitment.view' }),
    ]);
    if (!canEdit || !canView) {
      throw new RecruitmentForbiddenError(
        'missing_permission',
        'You do not have permission to change a candidate’s status ' +
          '(needs hr.recruitment.edit and hr.recruitment.view). ' +
          'Ask an HR administrator to grant it.'
      );
    }

    const { data: myOrgs } = await supabase.rpc('fn_my_hr_organization_ids');
    const orgs = Array.isArray(myOrgs) ? (myOrgs as unknown[]).map(String) : [];
    if (!candidate.hr_organization_id || !orgs.includes(String(candidate.hr_organization_id))) {
      throw new RecruitmentForbiddenError(
        'outside_your_organisation',
        'This candidate belongs to an HR organisation you are not part of, ' +
          'so you cannot change their status. Ask their own HR team to act.'
      );
    }
  }

  static async updateStatus(
    supabase: SupabaseClient,
    id: string,
    newStatus: CandidateStatus
  ): Promise<HRRecruitmentCandidate> {
    const candidate = await this.getCandidate(supabase, id);
    if (!candidate) throw new Error('Candidate not found');

    // Valid forward transitions only — see CANDIDATE_FORWARD_TRANSITIONS.
    const allowed = CANDIDATE_FORWARD_TRANSITIONS[candidate.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Transition '${candidate.status}' → '${newStatus}' is not allowed. ` +
        `Allowed: [${allowed.join(', ')}]`
      );
    }

    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'joined') {
      updatePayload.actual_joining_date = new Date().toISOString().split('T')[0];
    }
    // Stamp WHEN the offer went out and WHO sent it (review round 1, P6).
    //
    // Without these two columns the only trace of the click was the status
    // itself, and fn_my_desk_waiting's offer branch kept `waiting_since =
    // submitted_at` — so the Director's desk still read "162 days" and climbing
    // after HR acted, with one sentence of `detail` changed. That reads as
    // "nothing happened" and defeats the queue the button exists to serve. The
    // migration in this PR uses COALESCE(offer_issued_at, submitted_at) as
    // waiting_since, so an issued offer's age restarts from the day it was
    // issued; these writes are what makes that COALESCE ever fire.
    //
    // offer_issued_by is resolved from the caller's own session, never from a
    // client-supplied id.
    if (newStatus === 'offer_issued') {
      updatePayload.offer_issued_at = new Date().toISOString();
      const { data: auth } = await supabase.auth.getUser();
      updatePayload.offer_issued_by = auth?.user?.id ?? null;
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    // A refusal that came from the DATABASE is named, not re-thrown raw: the
    // gate above and the RLS policy are different predicates, so a caller the
    // gate admits can still be refused here (see translateCandidateWriteError).
    if (error) translateCandidateWriteError(error, 'change this candidate’s status');
    // PGRST116 covers the zero-row case for `.single()`, but assert the row
    // anyway — a future caller dropping `.single()` must not get silence.
    assertWriteLanded(data ? [data] : [], 'change this candidate’s status');
    return data as HRRecruitmentCandidate;
  }

  // ----- Job applications (screening → promote bridge, 2026-07-03) -----
  //
  // The apply wizard writes hr_job_applications (flat applicant records).
  // HR screens them here and promotes shortlisted ones into
  // hr_recruitment_candidates, where the frozen approval chain takes over.

  static async listJobApplications(
    supabase: SupabaseClient,
    filters: {
      job_id?: string;
      status?: JobApplicationStatus[];
      search?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<{ data: HRJobApplication[]; metadata: { total: number; page: number; pageSize: number } }> {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 50, 100);

    let query = supabase
      .from('hr_job_applications')
      .select('*, job:hr_recruitment_jobs(id, title, role_category, institution_id, hr_organization_id)', { count: 'exact' })
      .order('submitted_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (filters.job_id) query = query.eq('job_id', filters.job_id);
    if (filters.status && filters.status.length > 0) query = query.in('status', filters.status);
    if (filters.search) {
      const s = sanitizeSearchTerm(filters.search);
      if (s) {
        query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%`);
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return {
      data: (data ?? []) as unknown as HRJobApplication[],
      metadata: { total: count ?? 0, page, pageSize },
    };
  }

  /**
   * One application for the screening detail page. Mirrors the list's job embed
   * so the page gets its job context without a second round-trip.
   *
   * maybeSingle, not single: a row hidden by RLS (or already purged) must render
   * "not found" rather than surface a PGRST116 as a 500.
   */
  static async getJobApplication(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRJobApplication | null> {
    const { data, error } = await supabase
      .from('hr_job_applications')
      .select('*, job:hr_recruitment_jobs(id, title, role_category, institution_id, hr_organization_id)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as unknown as HRJobApplication) ?? null;
  }

  /**
   * Screening decision: shortlist / reject / mark reviewed, with optional notes.
   *
   * `reviewNotes` is deliberately tri-state. `undefined` means "the caller had
   * no opinion about the note" and leaves the stored note alone — only an
   * explicit `null` clears it. Writing `?? null` here used to blank the
   * screening note on every shortlist/reviewed action (only the reject dialog
   * collects one), silently destroying notes authored on the detail page.
   */
  static async reviewJobApplication(
    supabase: SupabaseClient,
    id: string,
    reviewerId: string,
    status: Extract<JobApplicationStatus, 'reviewed' | 'shortlisted' | 'rejected'>,
    reviewNotes?: string | null
  ): Promise<HRJobApplication> {
    const { data: existing, error: fetchError } = await supabase
      .from('hr_job_applications')
      .select('id, status')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    if (existing.status === 'promoted') {
      throw new Error('This application is already in the approval pipeline and can no longer be screened.');
    }

    const { data, error } = await supabase
      .from('hr_job_applications')
      .update({
        status,
        ...(reviewNotes === undefined ? {} : { review_notes: reviewNotes }),
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRJobApplication;
  }

  /**
   * Edit ONLY the screening note, from the application detail page.
   *
   * Separate from reviewJobApplication on purpose: annotating an applicant is
   * not a screening decision, so this must not touch `status`, `reviewed_by` or
   * `reviewed_at` (which would stamp a false review date and force a status
   * change on a still-pending applicant). It also carries no promoted-row
   * guard — a promoted applicant is exactly the one HR most wants to annotate,
   * and no decision is being recorded.
   *
   * Writes are gated by the "HR can update application status" RLS policy
   * (hr.recruitment.edit AND role_has_institution_access), so a caller without
   * edit rights gets zero rows back rather than a silent success.
   */
  static async updateApplicationNotes(
    supabase: SupabaseClient,
    id: string,
    reviewNotes: string | null
  ): Promise<HRJobApplication> {
    const { data, error } = await supabase
      .from('hr_job_applications')
      .update({ review_notes: reviewNotes })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // RLS filtered the row out of the UPDATE, or the id doesn't exist.
      throw new Error(
        'Could not save the note — the application no longer exists, or you do not have permission to edit it.'
      );
    }
    return data as HRJobApplication;
  }

  /**
   * Promote a shortlisted application into the approval pipeline:
   * creates an hr_recruitment_candidates row via submitCandidate (which builds
   * the frozen approval chain from hr_approval_flows using the JOB's role
   * category), then links the application (status='promoted').
   */
  static async promoteJobApplication(
    supabase: SupabaseClient,
    applicationId: string,
    promotedBy: string,
    options?: { monthly_salary_band?: MonthlySalaryBand | null; is_emergency?: boolean }
  ): Promise<{ application: HRJobApplication; candidate: HRRecruitmentCandidate }> {
    const { data: application, error: appError } = await supabase
      .from('hr_job_applications')
      .select('*, job:hr_recruitment_jobs(id, title, role_category, institution_id, hr_organization_id)')
      .eq('id', applicationId)
      .single();
    if (appError) throw appError;

    if (application.promoted_candidate_id) {
      throw new Error('This application has already been promoted to the approval pipeline.');
    }
    if (application.status !== 'shortlisted') {
      throw new Error('Only shortlisted applications can be promoted. Shortlist it first.');
    }
    const job = application.job as {
      id: string; title: string; role_category: RoleCategory;
      institution_id: string | null; hr_organization_id: string;
    } | null;
    if (!job) throw new Error('The job posting for this application no longer exists.');

    const candidate = await this.submitCandidate(supabase, {
      hr_organization_id: job.hr_organization_id,
      institution_id: application.institution_id ?? job.institution_id ?? null,
      name: `${application.first_name} ${application.last_name}`.trim(),
      email: application.email,
      phone: application.phone,
      cvviz_url: application.resume_url,
      role_category: job.role_category,
      role_title: job.title,
      proposed_monthly_salary_band: options?.monthly_salary_band ?? null,
      role_specific_details: {
        job_id: job.id,
        application_id: application.id,
        qualification: application.qualification,
        experience_months: application.experience_months,
      },
      is_emergency: options?.is_emergency ?? false,
      source: application.applicant_user_id ? 'public_careers_page' : 'hr_submission',
      submitted_by: promotedBy,
    } as HRRecruitmentCandidateInsert);

    const { data: updated, error: updateError } = await supabase
      .from('hr_job_applications')
      .update({
        status: 'promoted',
        promoted_candidate_id: candidate.id,
        reviewed_by: promotedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', applicationId)
      .select()
      .single();
    if (updateError) throw updateError;

    return { application: updated as HRJobApplication, candidate };
  }

  // ----- Purge a rejected applicant (super-admin only, 2026-08-05) -----------------
  //
  // Erases the person entirely: the application row, the promoted candidate row
  // (interviews / scorecards / packages / comments cascade), and — via the caller —
  // the resume in Google Drive. Delegated to a SECURITY DEFINER RPC because:
  //   * hr_job_applications has NO delete policy, so a PostgREST .delete() would
  //     silently affect 0 rows rather than error;
  //   * promoted_candidate_id is ON DELETE NO ACTION, so the application must be
  //     deleted before the candidate, and both in one transaction;
  //   * the RPC self-authorizes on is_super_admin() and refuses non-rejected rows.

  /**
   * Permanently delete a REJECTED applicant. Pass whichever id the UI has —
   * the RPC follows the link to the other side itself.
   *
   * Returns the Drive file ids the caller must delete, each paired with the
   * purge-log row to clear once the file is confirmed gone.
   */
  static async purgeRejectedApplicant(
    supabase: SupabaseClient,
    target: { applicationId?: string | null; candidateId?: string | null }
  ): Promise<PurgeRejectedApplicantResult> {
    if (!target.applicationId && !target.candidateId) {
      throw new Error('Provide an application id or a candidate id.');
    }

    const { data, error } = await supabase.rpc('fn_purge_rejected_recruitment_applicant', {
      p_application_id: target.applicationId ?? null,
      p_candidate_id: target.candidateId ?? null,
    });
    if (error) throw error;
    return data as PurgeRejectedApplicantResult;
  }

  /** Record that a purged applicant's Drive resume is confirmed deleted. */
  static async clearPurgedResumeRef(
    supabase: SupabaseClient,
    logId: string
  ): Promise<void> {
    const { error } = await supabase.rpc('fn_clear_recruitment_purge_drive_ref', {
      p_log_id: logId,
    });
    if (error) throw error;
  }

  // ----- Candidate discussion thread (hr_recruitment_candidate_comments) -----

  static async listCandidateComments(
    supabase: SupabaseClient,
    candidateId: string
  ): Promise<HRRecruitmentCandidateComment[]> {
    const { data, error } = await supabase
      .from('hr_recruitment_candidate_comments')
      .select('*, commenter:profiles(full_name, email)')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as HRRecruitmentCandidateComment[];
  }

  static async addCandidateComment(
    supabase: SupabaseClient,
    candidateId: string,
    commenterId: string,
    comment: string,
    parentCommentId?: string | null
  ): Promise<HRRecruitmentCandidateComment> {
    if (!comment.trim()) throw new Error('Comment cannot be empty.');

    const candidate = await this.getCandidate(supabase, candidateId);
    if (!candidate) throw new Error('Candidate not found.');

    const { data, error } = await supabase
      .from('hr_recruitment_candidate_comments')
      .insert({
        candidate_id: candidateId,
        hr_organization_id: candidate.hr_organization_id,
        commenter_id: commenterId,
        comment: comment.trim(),
        parent_comment_id: parentCommentId ?? null,
      })
      .select('*, commenter:profiles(full_name, email)')
      .single();
    if (error) throw error;
    return data as unknown as HRRecruitmentCandidateComment;
  }

  // ----- Job-first approvals workspace (2026-07-06) --------------------------------
  //
  // /hr/recruitment/approvals shows JOBS with pipeline counts; clicking through
  // opens the per-job workspace (Candidates / Job Details / Notes / Analytics).
  // Application counts ride the real FK; candidate counts ride the soft
  // role_specific_details->>'job_id' link stamped by promoteJobApplication.

  /**
   * Jobs + grouped pipeline counts for the approvals overview.
   * Counts come from fn_recruitment_approvals_counts (SECURITY INVOKER — RLS
   * bounds rows); awaiting-me counts reuse fn_list_my_pending_recruitment.
   */
  static async getApprovalsJobOverview(
    supabase: SupabaseClient,
    viewerId: string | null,
    options?: { search?: string }
  ): Promise<ApprovalsJobOverviewRow[]> {
    let jobsQuery = supabase
      .from('hr_recruitment_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (options?.search) {
      const s = sanitizeSearchTerm(options.search);
      if (s) jobsQuery = jobsQuery.or(`title.ilike.%${s}%,job_code.ilike.%${s}%`);
    }

    const [jobsRes, countsRes, mineRes] = await Promise.all([
      jobsQuery,
      supabase.rpc('fn_recruitment_approvals_counts'),
      viewerId
        ? supabase.rpc('fn_list_my_pending_recruitment', { p_user_id: viewerId })
        : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
    ]);
    if (jobsRes.error) throw jobsRes.error;
    if (countsRes.error) throw countsRes.error;
    if (mineRes.error) throw mineRes.error;

    type CountRow = { kind: 'application' | 'candidate'; job_id: string | null; status: string; cnt: number };
    const counts = (countsRes.data ?? []) as CountRow[];

    // awaiting-me per job — group my pending inbox by its soft job link.
    const awaitingByJob = new Map<string, number>();
    for (const c of (mineRes.data ?? []) as HRRecruitmentCandidate[]) {
      const jobId = (c.role_specific_details as Record<string, unknown> | null)?.job_id;
      if (typeof jobId === 'string') {
        awaitingByJob.set(jobId, (awaitingByJob.get(jobId) ?? 0) + 1);
      }
    }

    const IN_APPROVAL: string[] = ['submitted', 'pending_approval'];
    const APPROVED: string[] = ['approved', 'package_fixed', 'offer_issued'];

    return ((jobsRes.data ?? []) as HRRecruitmentJob[]).map((job) => {
      const row: ApprovalsJobOverviewRow = {
        job,
        applications_total: 0,
        applications_pending: 0,
        applications_reviewed: 0,
        applications_shortlisted: 0,
        applications_rejected: 0,
        applications_promoted: 0,
        in_approval: 0,
        approved: 0,
        joined: 0,
        awaiting_me: awaitingByJob.get(job.id) ?? 0,
      };
      for (const c of counts) {
        if (c.job_id !== job.id) continue;
        if (c.kind === 'application') {
          row.applications_total += c.cnt;
          if (c.status === 'pending') row.applications_pending += c.cnt;
          else if (c.status === 'reviewed') row.applications_reviewed += c.cnt;
          else if (c.status === 'shortlisted') row.applications_shortlisted += c.cnt;
          else if (c.status === 'rejected') row.applications_rejected += c.cnt;
          else if (c.status === 'promoted') row.applications_promoted += c.cnt;
        } else {
          if (IN_APPROVAL.includes(c.status)) row.in_approval += c.cnt;
          else if (APPROVED.includes(c.status)) row.approved += c.cnt;
          else if (c.status === 'joined') row.joined += c.cnt;
        }
      }
      return row;
    });
  }

  /** Promoted candidates linked to a job via role_specific_details->>'job_id'. */
  static async listCandidatesForJob(
    supabase: SupabaseClient,
    jobId: string
  ): Promise<HRRecruitmentCandidate[]> {
    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .select('*')
      .eq('role_specific_details->>job_id', jobId)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as HRRecruitmentCandidate[];
  }

  // ----- Job notes (hr_recruitment_job_notes) -----

  static async listJobNotes(
    supabase: SupabaseClient,
    jobId: string
  ): Promise<HRRecruitmentJobNote[]> {
    const { data, error } = await supabase
      .from('hr_recruitment_job_notes')
      .select('*, author:profiles(full_name, email)')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as HRRecruitmentJobNote[];
  }

  static async addJobNote(
    supabase: SupabaseClient,
    jobId: string,
    authorId: string,
    note: string
  ): Promise<HRRecruitmentJobNote> {
    if (!note.trim()) throw new Error('Note cannot be empty.');

    const { data: job, error: jobError } = await supabase
      .from('hr_recruitment_jobs')
      .select('id, hr_organization_id')
      .eq('id', jobId)
      .single();
    if (jobError) throw jobError;

    const { data, error } = await supabase
      .from('hr_recruitment_job_notes')
      .insert({
        job_id: jobId,
        hr_organization_id: (job as { hr_organization_id: string }).hr_organization_id,
        author_id: authorId,
        note: note.trim(),
      })
      .select('*, author:profiles(full_name, email)')
      .single();
    if (error) throw error;
    return data as unknown as HRRecruitmentJobNote;
  }

  // ----- Per-job analytics (funnel + timing) -----

  static async getJobAnalytics(
    supabase: SupabaseClient,
    jobId: string
  ): Promise<JobAnalytics> {
    const [appsRes, candidates] = await Promise.all([
      supabase
        .from('hr_job_applications')
        .select('id, status, submitted_at, reviewed_at, applicant_user_id')
        .eq('job_id', jobId)
        .limit(1000),
      this.listCandidatesForJob(supabase, jobId),
    ]);
    if (appsRes.error) throw appsRes.error;

    type AppRow = {
      status: JobApplicationStatus;
      submitted_at: string;
      reviewed_at: string | null;
      applicant_user_id: string | null;
    };
    const apps = (appsRes.data ?? []) as AppRow[];

    const byApp: Record<JobApplicationStatus, number> = {
      pending: 0, reviewed: 0, shortlisted: 0, rejected: 0, promoted: 0,
    };
    let withAccount = 0;
    const screenDays: number[] = [];
    for (const a of apps) {
      byApp[a.status] += 1;
      if (a.applicant_user_id) withAccount += 1;
      if (a.reviewed_at) {
        const days =
          (new Date(a.reviewed_at).getTime() - new Date(a.submitted_at).getTime()) / 86400000;
        if (Number.isFinite(days) && days >= 0) screenDays.push(days);
      }
    }

    const byCandidate: Partial<Record<CandidateStatus, number>> = {};
    const approvalDays: number[] = [];
    const now = Date.now();
    for (const c of candidates) {
      byCandidate[c.status] = (byCandidate[c.status] ?? 0) + 1;
      const start = new Date(c.submitted_at).getTime();
      const end = c.final_decided_at ? new Date(c.final_decided_at).getTime() : now;
      const days = (end - start) / 86400000;
      if (Number.isFinite(days) && days >= 0) approvalDays.push(days);
    }

    const avg = (xs: number[]) =>
      xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

    return {
      applications_total: apps.length,
      by_application_status: byApp,
      by_candidate_status: byCandidate,
      source_split: { with_account: withAccount, anonymous: apps.length - withAccount },
      avg_days_to_screen: avg(screenDays),
      avg_days_in_approval: avg(approvalDays),
    };
  }

  // ----- Dynamic approval flows (builder, 2026-07-06) -------------------------------

  /** Validate a step-template list for the flow builder. Throws on invalid shape. */
  static validateFlowSteps(steps: ApprovalFlowStepTemplate[]): void {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error('A flow needs at least one step.');
    }
    steps.forEach((s, idx) => {
      if (!s.approver_role && !s.approver_user_id) {
        throw new Error(`Step ${idx + 1}: pick an approver role or a specific user.`);
      }
      const isLast = idx === steps.length - 1;
      const type = s.step_type ?? (isLast ? 'final' : 'review');
      if (isLast && type !== 'final') {
        throw new Error('The last step must be the final approval step.');
      }
      if (!isLast && type !== 'review') {
        throw new Error(`Step ${idx + 1}: only the last step can be the final approval.`);
      }
    });
  }

  /**
   * Create-or-update the band-less flow for each given org × role category.
   * Multi-category (2026-07-06): the same chain can be applied to several
   * role categories in one save — each (org, category) pair keeps its own row
   * so later per-category edits stay independent.
   * RLS on hr_approval_flows already allows super-admin / HR-admin to write
   * any org (tenant policy has is_super_admin() OR fn_is_hr_admin() arms).
   */
  static async upsertRecruitmentFlow(
    supabase: SupabaseClient,
    payload: {
      flow_name: string;
      role_categories: RoleCategory[];
      steps: ApprovalFlowStepTemplate[];
      hr_organization_ids: string[];
      is_active?: boolean;
    }
  ): Promise<{ updated: number; created: number }> {
    this.validateFlowSteps(payload.steps);
    if (!payload.hr_organization_ids.length) {
      throw new Error('Pick at least one organization.');
    }
    if (!payload.role_categories.length) {
      throw new Error('Pick at least one role category.');
    }

    // Normalize: sequential chain_order, explicit step_type.
    const steps = payload.steps.map((s, idx) => ({
      ...s,
      chain_order: idx + 1,
      step_type: s.step_type ?? (idx === payload.steps.length - 1 ? 'final' : 'review'),
      interview_required: s.interview_required ?? false,
      escalate_after_hours: s.escalate_after_hours ?? 72,
    }));

    let updated = 0;
    let created = 0;
    for (const roleCategory of payload.role_categories) {
      for (const orgId of payload.hr_organization_ids) {
        const { data: existing, error: findErr } = await supabase
          .from('hr_approval_flows')
          .select('id, conditions')
          .eq('flow_for', 'recruitment_approval')
          .eq('hr_organization_id', orgId)
          .eq('conditions->>role_category', roleCategory)
          .eq('is_active', true);
        if (findErr) throw findErr;

        // Band-less template only (conditions carry role_category alone).
        const bandless = (existing ?? []).find(
          (f) => !(f.conditions as Record<string, string> | null)?.monthly_salary_band
        );

        if (bandless) {
          const { error } = await supabase
            .from('hr_approval_flows')
            .update({
              flow_name: payload.flow_name,
              steps,
              is_active: payload.is_active ?? true,
            })
            .eq('id', bandless.id);
          if (error) throw error;
          updated += 1;
        } else {
          const { error } = await supabase
            .from('hr_approval_flows')
            .insert({
              flow_name: payload.flow_name,
              flow_for: 'recruitment_approval',
              conditions: { role_category: roleCategory },
              steps,
              is_active: payload.is_active ?? true,
              hr_organization_id: orgId,
            });
          if (error) throw error;
          created += 1;
        }
      }
    }
    return { updated, created };
  }

  /**
   * Activate/deactivate a recruitment flow. Deactivating removes it from
   * promote-time matching; in-flight candidates keep their frozen chains.
   */
  static async setRecruitmentFlowActive(
    supabase: SupabaseClient,
    flowId: string,
    isActive: boolean
  ): Promise<void> {
    const { data, error } = await supabase
      .from('hr_approval_flows')
      .update({ is_active: isActive })
      .eq('id', flowId)
      .eq('flow_for', 'recruitment_approval')
      .select('id');
    if (error) throw error;
    // RLS hides out-of-scope rows as a silent 0-row update — surface that.
    if (!data || data.length === 0) {
      throw new Error('Flow not found, or you lack access to its organization.');
    }
  }

  static async deleteRecruitmentFlow(
    supabase: SupabaseClient,
    flowId: string
  ): Promise<void> {
    const { data, error } = await supabase
      .from('hr_approval_flows')
      .delete()
      .eq('id', flowId)
      .eq('flow_for', 'recruitment_approval')
      .select('id');
    if (error) throw error;
    // Idempotent: 0 rows = already deleted (duplicate click / stale table /
    // second session). The table's single ALL-command RLS policy makes SELECT
    // and DELETE visibility identical, so any row the user saw is deletable —
    // a miss can only mean the row is already gone, not an access denial.
    if (!data || data.length === 0) {
      console.warn(
        `[RecruitmentService] deleteRecruitmentFlow: flow ${flowId} already absent — treating as success`
      );
    }
  }

  // ----- Step-linked interview scheduling (dynamic flows, 2026-07-06) ----------------

  /**
   * Schedule (or reschedule) the interview for the candidate's CURRENT chain
   * step and stamp its id onto that step. Only the step's approver (pinned
   * user, role holder, super-admin, or hr.recruitment.approve.override holder)
   * may schedule.
   */
  static async scheduleStepInterview(
    supabase: SupabaseClient,
    candidateId: string,
    callerId: string,
    payload: {
      scheduled_at: string;
      duration_minutes?: number;
      mode: 'in_person' | 'phone' | 'video' | 'walk_in';
      location_or_link?: string | null;
      panel_member_ids?: string[];
    }
  ): Promise<{ candidate: HRRecruitmentCandidate; interview_id: string }> {
    const candidate = await this.getCandidate(supabase, candidateId);
    if (!candidate) throw new Error('Candidate not found');
    if (!['submitted', 'pending_approval'].includes(candidate.status)) {
      throw new Error(`Cannot schedule a step interview in status '${candidate.status}'.`);
    }

    const chain = [...(candidate.approval_chain ?? [])];
    const step = chain[candidate.current_step];
    if (!step) throw new Error('No pending approval step found.');

    // Authorization: pinned user, role holder, super-admin, or override-key
    // holder (hr_head / hr_admin / coo). The override mirrors approveCandidate —
    // someone allowed to act on any approver's step may also schedule that
    // step's interview. Both RPCs resolve against auth.uid() = callerId.
    const pinned = step.approver_user_id ?? null;
    let authorized = pinned ? pinned === callerId : false;
    if (!authorized && !pinned) {
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('custom_roles!inner(role_key)')
        .eq('user_id', callerId);
      const keys = ((roleRows ?? []) as unknown as Array<{ custom_roles?: { role_key?: string } }>)
        .map((r) => r.custom_roles?.role_key?.toLowerCase())
        .filter(Boolean);
      authorized = keys.includes((step.approver_role ?? '').toLowerCase());
    }
    if (!authorized) {
      const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
      const { data: hasOverride } = await supabase.rpc('user_has_permission', {
        permission_name: 'hr.recruitment.approve.override',
      });
      authorized = !!isSuperAdmin || !!hasOverride;
    }
    if (!authorized) {
      throw new Error('Only the current step’s approver can schedule this interview.');
    }

    const jobId =
      ((candidate.role_specific_details as Record<string, unknown> | null)?.job_id as
        | string
        | undefined) ?? null;
    const roundNumber = candidate.current_step + 1;
    const roundName = `Step ${roundNumber} — ${step.approver_role}`;
    const panel = payload.panel_member_ids?.length ? payload.panel_member_ids : [callerId];

    // Reschedule when the step already has a live sitting; otherwise create new.
    const { RecruitmentInterviewsService } = await import('./recruitment-interviews-service');
    let interviewId: string;
    let existingStatus: string | null = null;
    if (step.interview_id) {
      const existing = await RecruitmentInterviewsService.getInterview(supabase, step.interview_id);
      existingStatus = existing?.status ?? null;
    }
    if (step.interview_id && existingStatus === 'scheduled') {
      const next = await RecruitmentInterviewsService.rescheduleInterview(supabase, step.interview_id, {
        scheduled_at: payload.scheduled_at,
        duration_minutes: payload.duration_minutes,
        mode: payload.mode,
        location_or_link: payload.location_or_link ?? null,
        panel_member_ids: panel,
        created_by: callerId,
      });
      interviewId = next.id;
    } else {
      const created = await RecruitmentInterviewsService.scheduleInterview(supabase, {
        candidate_id: candidateId,
        job_id: jobId,
        round_number: roundNumber,
        round_name: roundName,
        scheduled_at: payload.scheduled_at,
        duration_minutes: payload.duration_minutes ?? 30,
        mode: payload.mode,
        location_or_link: payload.location_or_link ?? null,
        panel_member_ids: panel,
        created_by: callerId,
      });
      interviewId = created.id;
    }

    // Stamp the sitting onto the current step (re-pointed on reschedule).
    chain[candidate.current_step] = { ...step, interview_id: interviewId };
    const { data: updatedCandidate, error: updateErr } = await supabase
      .from('hr_recruitment_candidates')
      .update({ approval_chain: chain })
      .eq('id', candidateId)
      .select()
      .single();
    if (updateErr) throw updateErr;

    return { candidate: updatedCandidate as HRRecruitmentCandidate, interview_id: interviewId };
  }
}
