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
 *   buildApprovalChain — reads hr_approval_flows, freezes snapshot
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeaveApprovalStep } from '@/types/hr';
import type {
  HRRecruitmentCandidate,
  HRRecruitmentCandidateInsert,
  HRRecruitmentCandidateUpdate,
  CandidateFilters as BaseCandidateFilters,
  CandidateListResponse,
  CandidateStatus,
  RoleCategory,
  MonthlySalaryBand,
} from '@/types/hr-recruitment';
import { POLICY_KEYS } from '@/lib/policies/keys';

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
// Viewer-scope policy types (platform_policies-driven, 2026-05-11)
// Seeded by migration 20260511110000_seed_hr_recruitment_approvals_scope_policies.sql
// Director toggles enforce_scoping + edits scope_rules via
// /hr/admin/recruitment-approvals-scope (Agent B sister PR).
// =====================================================================================

export type ScopeOption = 'all' | 'institution' | 'department' | 'hr_organization' | 'self';

export interface ScopeRule {
  scope: ScopeOption;
}

/** JSONB shape of platform_policies row `hr.recruitment.approvals.scope_rules`. */
export type ScopeRules = Record<string, ScopeRule> & { _default?: ScopeRule };

export interface ResolvedViewerScope {
  /** False when master toggle hr.recruitment.approvals.enforce_scoping is off. */
  enforced: boolean;
  /** Resolved scope-rule value for the current viewer's role. */
  scope: ScopeOption;
  /** Viewer's institution_id (from staff). Null when no staff record. */
  institution_id: string | null;
  /** Viewer's department_id (from staff). Null when no staff record or candidates table lacks the column. */
  department_id: string | null;
  /** Viewer's hr_organization_id (from hr_employees). Null when not linked. */
  hr_organization_id: string | null;
  /** Viewer profiles.id (= auth.uid). */
  viewer_id: string | null;
}

// =====================================================================================
// Recruitment Service
// =====================================================================================

export class RecruitmentService {
  // ----- Viewer-scope resolver (platform_policies-driven) -----

  /**
   * Resolves the viewer's scope from platform_policies + their role/staff record.
   * Returns enforced=false when the master toggle is off (back-compat path).
   *
   * SQL functions READ at runtime: fn_get_policy_bool + fn_get_policy.
   * No hardcoded scope decisions in this file — the platform_policies table
   * is the single source of truth (edited via /hr/admin/recruitment-approvals-scope).
   *
   * Seeded keys (migration 20260511110000_seed_hr_recruitment_approvals_scope_policies.sql):
   *   - hr.recruitment.approvals.enforce_scoping  (boolean, default false)
   *   - hr.recruitment.approvals.scope_rules       (object, per-role scope mapping)
   */
  static async resolveViewerScope(
    supabase: SupabaseClient
  ): Promise<ResolvedViewerScope> {
    const fallback: ResolvedViewerScope = {
      enforced: false,
      scope: 'all',
      institution_id: null,
      department_id: null,
      hr_organization_id: null,
      viewer_id: null,
    };

    // Step 1: master toggle. If off, behave exactly as pre-2026-05-11.
    const { data: enforceData, error: enforceErr } = await supabase.rpc(
      'fn_get_policy_bool',
      {
        p_key: POLICY_KEYS.HR_RECRUITMENT_APPROVALS_ENFORCE_SCOPING,
        p_default: false,
        p_scope_id: null,
      }
    );
    if (enforceErr || !enforceData) return fallback;

    // Step 2: who is the viewer?
    const { data: userData } = await supabase.auth.getUser();
    const viewerId = userData?.user?.id ?? null;
    if (!viewerId) return fallback;

    // Step 3: viewer's role_key (first match; multi-role is rare for staff).
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('custom_roles!inner(role_key)')
      .eq('user_id', viewerId)
      .limit(1)
      .maybeSingle();
    const roleKey =
      (roleRow as unknown as { custom_roles?: { role_key?: string } } | null)
        ?.custom_roles?.role_key ?? null;

    // Step 4: scope_rules → scope for this role (or _default fallback).
    const { data: rulesData } = await supabase.rpc('fn_get_policy', {
      p_key: POLICY_KEYS.HR_RECRUITMENT_APPROVALS_SCOPE_RULES,
      p_scope_id: null,
    });
    const rules = (rulesData ?? {}) as ScopeRules;
    const scope: ScopeOption =
      (roleKey && rules[roleKey]?.scope) ?? rules._default?.scope ?? 'self';

    // Step 5: viewer's institution / department (from staff) + hr_organization
    // (from hr_employees). Best-effort: missing rows → null → scope falls back
    // to '_default' rule via the safety filter in listCandidates.
    const { data: staffRow } = await supabase
      .from('staff')
      .select('institution_id, department_id')
      .eq('user_id', viewerId)
      .limit(1)
      .maybeSingle();
    const { data: empRow } = await supabase
      .from('hr_employees')
      .select('hr_organization_id')
      .eq('user_id', viewerId)
      .limit(1)
      .maybeSingle();

    return {
      enforced: true,
      scope,
      institution_id:
        (staffRow as { institution_id?: string } | null)?.institution_id ?? null,
      department_id:
        (staffRow as { department_id?: string } | null)?.department_id ?? null,
      hr_organization_id:
        (empRow as { hr_organization_id?: string } | null)?.hr_organization_id ?? null,
      viewer_id: viewerId,
    };
  }

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

    // Apply viewer-scope policy BEFORE user-provided filters.
    // User filters narrow further (intersection); never widen.
    // No-op when hr.recruitment.approvals.enforce_scoping policy is false (default).
    const viewerScope = await this.resolveViewerScope(supabase);
    if (viewerScope.enforced) {
      // Sentinel to lock the query to zero rows when viewer has no scope id
      // for the required field — fail-closed (better than over-disclosure).
      const NO_MATCH = '00000000-0000-0000-0000-000000000000';
      switch (viewerScope.scope) {
        case 'all':
          break;
        case 'institution':
          q = q.eq('institution_id', viewerScope.institution_id ?? NO_MATCH);
          break;
        case 'department':
          // hr_recruitment_candidates may not carry department_id; fall back
          // to institution scope so HODs don't get a blanket all-or-none.
          // TODO: add department_id to hr_recruitment_candidates when role
          // requisitions become department-typed (T3.2 Interviews work).
          q = q.eq('institution_id', viewerScope.institution_id ?? NO_MATCH);
          break;
        case 'hr_organization':
          q = q.eq('hr_organization_id', viewerScope.hr_organization_id ?? NO_MATCH);
          break;
        case 'self':
          q = q.eq('submitted_by', viewerScope.viewer_id ?? NO_MATCH);
          break;
      }
    }

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
      q = q.or(
        `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,role_title.ilike.%${filters.search}%`
      );
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
        'Open /hr/admin/policies/hr_approval_flows (or /hr/admin → HR Policies) ' +
        'to seed at least one flow with flow_for=recruitment_approval. ' +
        'If you need a quick band-agnostic Teaching Faculty fallback, the ' +
        '/hr/admin/recruitment-maintenance page can guide you.'
      );
    }

    // Parse conditions jsonb and find best match
    // Priority: role_category + monthly_salary_band match > role_category-only match
    type ApprovalFlowRow = {
      conditions: Record<string, string> | null;
      steps: LeaveApprovalStep[] | null;
    };

    const exactMatches = (flows as ApprovalFlowRow[]).filter((f) => {
      const cond = f.conditions ?? {};
      return (
        cond.role_category === roleCategory &&
        cond.monthly_salary_band === (monthlySalaryBand ?? '')
      );
    });

    const categoryMatches = (flows as ApprovalFlowRow[]).filter((f) => {
      const cond = f.conditions ?? {};
      return (
        cond.role_category === roleCategory &&
        !cond.monthly_salary_band
      );
    });

    const chosen = exactMatches.length > 0
      ? exactMatches[0]
      : categoryMatches.length > 0
        ? categoryMatches[0]
        : null;

    if (!chosen) {
      throw new Error(
        `No approval flow matches this candidate. ` +
        `role_category='${roleCategory}', monthly_salary_band='${monthlySalaryBand ?? 'none (unset)'}'. ` +
        `Either: (a) set this candidate's salary band so an existing flow matches, ` +
        `or (b) open /hr/admin/policies/hr_approval_flows and add a flow whose ` +
        `conditions JSONB matches '${roleCategory}' (with or without a band). ` +
        `If you have several legacy candidates stuck the same way, ` +
        `/hr/admin/recruitment-maintenance can backfill them after the matching flow is created.`
      );
    }

    // steps is stored as a jsonb array in the flow; map to LeaveApprovalStep shape
    const steps = (chosen.steps ?? []) as Array<{
      chain_order?: number;
      approver_role: string;
      escalate_after_hours?: number;
    }>;

    return steps.map((s, idx) => ({
      step_order: s.chain_order ?? idx + 1,
      approver_role: s.approver_role,
      approver_user_id: null,         // resolved at approve-time by role lookup
      status: 'pending' as const,
      escalate_after_hours: s.escalate_after_hours ?? 72, // R3.3: 3-day default
    }));
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

  static async approveCandidate(
    supabase: SupabaseClient,
    id: string,
    approverId: string,
    comment?: string
  ): Promise<HRRecruitmentCandidate> {
    const candidate = await this.getCandidate(supabase, id);
    if (!candidate) throw new Error('Candidate not found');

    // ---------------------------------------------------------------------
    // Role-match enforcement (config-driven via platform_policies, 2026-05-16).
    // Master toggle: hr.recruitment.approvals.enforce_role_match (bool, default FALSE).
    // Override list: hr.recruitment.approvals.override_roles    (array).
    // When master toggle is OFF, behavior is unchanged from pre-2026-05-16.
    // ---------------------------------------------------------------------
    const { data: enforceData } = await supabase.rpc('fn_get_policy_bool', {
      p_key: POLICY_KEYS.HR_RECRUITMENT_APPROVALS_ENFORCE_ROLE_MATCH,
      p_default: false,
      p_scope_id: null,
    });
    if (enforceData === true) {
      const chainForCheck = candidate.approval_chain ?? [];
      const stepForCheck = chainForCheck[candidate.current_step];
      const expectedRole = (stepForCheck?.approver_role ?? '').toLowerCase();

      // Caller's role_keys (may be multiple).
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('custom_roles!inner(role_key)')
        .eq('user_id', approverId);
      const userRoles = (
        (roleRows ?? []) as unknown as Array<{ custom_roles?: { role_key?: string } }>
      )
        .map((r) => r.custom_roles?.role_key?.toLowerCase())
        .filter((k): k is string => !!k);

      // Override roles (always-allowed admins / break-glass).
      const { data: overrideData } = await supabase.rpc('fn_get_policy', {
        p_key: POLICY_KEYS.HR_RECRUITMENT_APPROVALS_OVERRIDE_ROLES,
        p_scope_id: null,
      });
      const overrideRoles = (Array.isArray(overrideData) ? overrideData : [])
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.toLowerCase());

      // is_super_admin RPC bypass (always allowed).
      const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');

      const roleMatches = expectedRole && userRoles.includes(expectedRole);
      const isOverride = userRoles.some((r) => overrideRoles.includes(r));
      if (!isSuperAdmin && !roleMatches && !isOverride) {
        throw new Error(
          `Only users with role '${expectedRole}' can approve this step. ` +
            `You have roles: [${userRoles.join(', ') || 'none'}]. ` +
            `Director can change this policy at /hr/admin/recruitment-approvals-scope.`
        );
      }
    }

    if (!['pending_approval', 'submitted'].includes(candidate.status)) {
      throw new Error(`Cannot approve candidate in status '${candidate.status}'`);
    }

    const chain = [...(candidate.approval_chain ?? [])];
    const step = chain[candidate.current_step];
    if (!step) {
      // BUG-003310 / BUG-003302 — Friendlier wording when the chain is already complete
      // (covers stale React Query cache showing the candidate as pending after a previous
      // approver finished the chain, OR a re-click on an already-fully-approved candidate).
      if (candidate.status === 'approved' || candidate.current_step >= chain.length) {
        throw new Error('This candidate has already been fully approved.');
      }
      throw new Error('Approval chain exhausted — no pending step found');
    }

    step.status = 'approved';
    step.decided_at = new Date().toISOString();
    step.decided_by = approverId;
    step.comment = comment ?? null;
    step.approver_user_id = approverId;

    const nextStep = candidate.current_step + 1;
    const isFinal = nextStep >= chain.length;

    const update: HRRecruitmentCandidateUpdate & Record<string, unknown> = {
      approval_chain: chain,
      current_step: nextStep,
    };
    if (isFinal) {
      update.status = 'approved';
      update.final_approver_id = approverId;
      update.final_decided_at = new Date().toISOString();
    } else {
      update.status = 'pending_approval';
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  static async rejectCandidate(
    supabase: SupabaseClient,
    id: string,
    approverId: string,
    reason: string
  ): Promise<HRRecruitmentCandidate> {
    const candidate = await this.getCandidate(supabase, id);
    if (!candidate) throw new Error('Candidate not found');
    if (!['pending_approval', 'submitted'].includes(candidate.status)) {
      throw new Error(`Cannot reject candidate in status '${candidate.status}'`);
    }

    const chain = [...(candidate.approval_chain ?? [])];
    const step = chain[candidate.current_step];
    if (step) {
      step.status = 'rejected';
      step.decided_at = new Date().toISOString();
      step.decided_by = approverId;
      step.comment = reason;
      step.approver_user_id = approverId;
    }

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .update({
        status: 'rejected',
        approval_chain: chain,
        rejection_reason: reason,
        final_approver_id: approverId,
        final_decided_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
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
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }

  // ----- Status transitions (joined / offer_rescinded / offer_issued) -----

  static async updateStatus(
    supabase: SupabaseClient,
    id: string,
    newStatus: CandidateStatus
  ): Promise<HRRecruitmentCandidate> {
    const candidate = await this.getCandidate(supabase, id);
    if (!candidate) throw new Error('Candidate not found');

    // Define valid forward transitions only
    const validTransitions: Partial<Record<CandidateStatus, CandidateStatus[]>> = {
      approved:       ['package_fixed', 'offer_issued'],
      package_fixed:  ['offer_issued'],
      offer_issued:   ['joined', 'no_show', 'offer_rescinded'],
    };

    const allowed = validTransitions[candidate.status] ?? [];
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

    const { data, error } = await supabase
      .from('hr_recruitment_candidates')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentCandidate;
  }
}
