/**
 * Sprint 3 — Leave Service
 *
 * Handles the staff leave workflow: apply / approve / reject / cancel (supersede) /
 * withdraw (soft-delete) / comment / calendar / balance.
 *
 * Design decisions locked in specs/myjkkn-hr-sprint-03-plan.md (28 decisions across 7 rounds).
 * DB schema live on production as of 2026-04-15 (Phase A).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { leaveDocumentRequirement } from '@/lib/hr/leave-document-rule';
import { applyDecision, buildChain, readApprovers } from '@/lib/hr/leave/approval-chain';
import type {
  HRLeaveApplication,
  HRLeaveApplicationInsert,
  HRLeaveBalance,
  HRLeaveBalanceWithType,
  HRLeaveEncashment,
  HRLeaveApplicationComment,
  HRCalendarEntry,
  LeaveApplicationStatus,
  LeaveApprovalStep,
} from '@/types/hr';
import type {
  LeaveApprovalFlowStep,
  LeaveApproverEntry,
  LeaveFlowRunMode,
  LeaveFlowStepSource,
} from '@/types/hr-leave-types';

// =====================================================================================
// List filters
// =====================================================================================

export interface LeaveApplicationFilters {
  hr_organization_id?: string;
  employee_id?: string;
  status?: LeaveApplicationStatus | LeaveApplicationStatus[];
  start_from?: string; // ISO date
  start_to?: string;
  // For approver inbox: only return apps currently waiting on this approver
  pending_approver_id?: string;
  page?: number;
  pageSize?: number;
}

// =====================================================================================
// Leave Service
// =====================================================================================

export class LeaveService {
  // ----- List / Get -----

  static async listApplications(
    supabase: SupabaseClient,
    filters: LeaveApplicationFilters = {}
  ) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Embed the type so lists can show a name and be split across the Time Off
    // tabs by request_category. LEFT join, not !inner: an inner join would drop
    // any row whose type the caller cannot read under RLS, silently hiding
    // their own applications rather than showing them with a blank label.
    let q = supabase
      .from('hr_leave_applications')
      .select(
        `*,
         hr_leave_types:leave_type_id (
           leave_type_name,
           leave_type_code,
           request_category,
           color_code
         )`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.hr_organization_id) q = q.eq('hr_organization_id', filters.hr_organization_id);
    if (filters.employee_id) q = q.eq('employee_id', filters.employee_id);
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in('status', statuses);
    }
    if (filters.start_from) q = q.gte('start_date', filters.start_from);
    if (filters.start_to) q = q.lte('start_date', filters.start_to);

    // Approver inbox scoping. This filter was declared on the type and sent by
    // useApprovalInbox but NEVER applied here, so /hr/leave/approve listed every
    // pending application in the organisation with live Approve/Reject buttons
    // rather than the caller's own queue.
    //
    // JSONB containment matches an application whose approval_chain names this
    // approver in ANY step. It deliberately does not pin to current_step:
    // PostgREST cannot index into a JSONB array by a sibling column's value, and
    // an approver wants their whole queue anyway, not just steps that happen to
    // be current right now.
    //
    // CAVEAT — until Phase 2 seeds flows with pinned approver_ids, every chain
    // carries approver_user_id = null, so this filter matches NOTHING. That is
    // why it is applied only when the caller explicitly asks for it: an inbox
    // that silently returns empty is the exact failure mode this module already
    // suffered from. Authorisation does NOT rest on this filter — RLS
    // (hla_select) and assertCanDecide() are the enforcement points.
    // REPLACED THE CONTAINMENT FILTER (2026-08-31). The `.contains()` above
    // matched only a PINNED approver_user_id, so a step routed to a ROLE — which
    // is every step a role ladder produces — returned an empty inbox. An HOD
    // could be the current approver of 40 requests and see none of them, which is
    // the same silent-empty failure the caveat below was written about.
    //
    // hr_leave_my_approval_queue() answers "which applications am I the current
    // approver of", using fn_leave_step_admits — the SAME rule the RLS helper and
    // the gate trigger use, so the inbox cannot list a row the approver is then
    // refused on, nor hide one they could act on. It returns ids only; the rows
    // themselves still come back through this RLS'd select.
    if (filters.pending_approver_id) {
      const { data: queue, error: queueError } = await (supabase as any).rpc(
        'hr_leave_my_approval_queue',
        { p_hr_organization_id: filters.hr_organization_id ?? null }
      );
      if (queueError) throw queueError;

      const ids = ((queue ?? []) as Array<{ application_id: string }>).map(
        (r) => r.application_id
      );
      // `.in('id', [])` is a valid empty result; without this short-circuit
      // PostgREST would be asked for `id=in.()`, which is a syntax error.
      if (ids.length === 0) {
        return {
          data: [],
          metadata: { total: 0, page, pageSize, totalPages: 1 },
        };
      }
      q = q.in('id', ids);
    }

    const { data, count, error } = await q;
    if (error) throw error;
    return {
      data: (data ?? []) as HRLeaveApplication[],
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    };
  }

  static async getApplication(supabase: SupabaseClient, id: string): Promise<HRLeaveApplication | null> {
    const { data, error } = await supabase
      .from('hr_leave_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as HRLeaveApplication | null;
  }

  // ----- Apply -----

  /**
   * Build the approval_chain snapshot from hr_approval_flows at apply-time.
   * Frozen-snapshot pattern (decision 3) — if HR later edits the flow,
   * in-flight applications keep their original rules.
   */
  static async buildApprovalChain(
    supabase: SupabaseClient,
    hrOrgId: string,
    leaveTypeId: string,
    departmentId: string | null,
    /**
     * staff.id of the person the leave is FOR — not the caller. Only read when
     * the flow is a role ladder, where the chain is "everyone above this person"
     * and so differs per applicant. Optional so the recruitment-shaped callers
     * and any older positional call keep working.
     */
    employeeId: string | null = null
  ): Promise<LeaveApprovalStep[]> {
    // SCHEMA NOTE (fixed 2026-07-21). This previously queried
    // hr_approval_flows for leave_type_id / scope_level / chain_order /
    // approver_role / approver_scope. NONE of those five columns exist on that
    // table — they belong to leave_approval_chains, which serves the
    // institution holiday calendar. Almost certainly a copy-paste from the
    // wrong engine. Every call would have raised PostgREST 42703 before
    // reaching the insert, so this was a second hard block on leave submission
    // sitting behind the RLS one.
    //
    // The real shape is one flow row per (organization, flow_for) carrying a
    // JSONB `steps` array. `conditions` is a free-form JSONB matcher — the
    // recruitment flows key it on role_category; leave keys it on
    // leave_type_id, or leaves it empty for a catch-all.
    const { data: flows, error } = await supabase
      .from('hr_approval_flows')
      .select(
        'flow_name, conditions, steps, escalate_after_hours, ' +
          'step_source, run_mode, role_ladder, fallback_approver'
      )
      .eq('hr_organization_id', hrOrgId)
      .eq('flow_for', 'leave_approval')
      .eq('is_active', true)
      .is('valid_until', null);

    if (error) throw error;

    type FlowRow = {
      flow_name: string | null;
      conditions: Record<string, unknown> | null;
      steps: Array<Record<string, unknown>> | null;
      escalate_after_hours: number | null;
      step_source: LeaveFlowStepSource | null;
      run_mode: LeaveFlowRunMode | null;
      role_ladder: string[] | null;
      fallback_approver: LeaveApproverEntry | null;
    };
    const candidates = (flows ?? []) as FlowRow[];

    // Most-specific wins: a flow naming this leave type beats the catch-all.
    // departmentId is accepted for signature stability and future
    // department-scoped flows; no seeded flow keys on it today.
    const chosen =
      candidates.find((f) => f.conditions?.leave_type_id === leaveTypeId) ??
      candidates.find((f) => !f.conditions?.leave_type_id);

    if (!chosen) {
      // Name the exact screen. "Ask HR to add one" left the admin hunting —
      // leave flows are set from the Leave Types list, not from a page called
      // anything like "approval flows", which is where everyone looks first
      // (that one is recruitment-only). Same treatment the recruitment path
      // already got.
      throw new Error(
        'No leave approval flow is configured for your organisation. ' +
        'Open HR → Admin → Leave Types, use the row menu on the leave type and pick ' +
        '"Who approves this" to add one. A flow with no leave type set acts as the ' +
        'catch-all for every type.'
      );
    }

    // A ROLE LADDER IS RESOLVED IN POSTGRES, NEVER HERE. The rungs above the
    // applicant depend on the roles they hold, and user_roles / custom_roles are
    // not readable by an ordinary member of staff — a browser-side lookup comes
    // back empty for exactly the people applying, which is the silent
    // false-negative this module has shipped twice (see assertCanDecide).
    let rungsAbove: string[] = [];
    if ((chosen.step_source ?? 'explicit') === 'role_ladder') {
      const ladder = Array.isArray(chosen.role_ladder) ? chosen.role_ladder : [];
      const { data: rungs, error: ladderError } = await (supabase as any).rpc(
        'hr_resolve_leave_ladder',
        { p_employee_id: employeeId, p_ladder: ladder }
      );
      if (ladderError) throw ladderError;
      rungsAbove = (rungs ?? []) as string[];
    }

    const steps = buildChain({
      flow: {
        steps: (chosen.steps ?? []) as unknown as LeaveApprovalFlowStep[],
        escalate_after_hours: chosen.escalate_after_hours ?? 48,
        step_source: chosen.step_source ?? 'explicit',
        run_mode: chosen.run_mode ?? 'sequential',
        fallback_approver: chosen.fallback_approver ?? null,
      },
      rungsAbove,
    });

    if (steps.length === 0) {
      // A LADDER THAT RESOLVED TO NOBODY IS A DIFFERENT PROBLEM from a flow with
      // no steps, and telling someone to "add an approver" when the real cause is
      // that they sit at the top of the ladder sends them to the wrong screen.
      if ((chosen.step_source ?? 'explicit') === 'role_ladder') {
        throw new Error(
          `The approval ladder on "${chosen.flow_name ?? 'this leave type'}" has nobody above ` +
          'you, so there is no one to send this request to. Open HR → Admin → Leave Types → ' +
          '"Who approves this" and set a fallback approver for people at the top of the ladder.'
        );
      }
      throw new Error(
        `The leave approval flow "${chosen.flow_name ?? 'for this type'}" exists but has no ` +
        'approval steps, so there is nobody to send the request to. Open HR → Admin → ' +
        'Leave Types → "Who approves this" and add at least one approver.'
      );
    }

    // The chain is fully built by buildChain() — one place that knows the shape,
    // shared with the editor's preview and covered by
    // __tests__/hr/leave-approval-chain.test.ts.
    return steps;
  }

  /**
   * Apply for leave. Validates balance + blackout + advance-notice + max-continuous
   * BEFORE inserting. Insert trigger will compute total_days via hr_calc_leave_days.
   */
  static async applyLeave(
    supabase: SupabaseClient,
    payload: Omit<HRLeaveApplicationInsert, 'approval_chain'> & {
      department_id?: string | null;
    }
  ) {
    // 1. Fetch leave type from the HR catalog. The table is staff-only by
    //    construction, so the old .eq('scope','staff') filter is gone.
    const { data: leaveType, error: ltErr } = await supabase
      .from('hr_leave_types')
      .select('*')
      .eq('id', payload.leave_type_id)
      .maybeSingle();
    if (ltErr) throw ltErr;
    if (!leaveType) throw new Error('Leave type not found');

    // 2. Blackout check (decision 12)
    // `error` must be destructured and thrown. Discarding it makes a failed
    // query indistinguishable from "no blackouts configured", which silently
    // PERMITS leave inside a blackout window — a fail-open check.
    const { data: blackouts, error: blackoutError } = await supabase
      .from('hr_leave_blackouts')
      .select('*')
      .eq('hr_organization_id', payload.hr_organization_id)
      .lte('start_date', payload.end_date)
      .gte('end_date', payload.start_date);
    if (blackoutError) throw blackoutError;

    const blocked = (blackouts ?? []).find(
      (b) => b.leave_type_ids === null || b.leave_type_ids.includes(payload.leave_type_id)
    );
    if (blocked) {
      throw new Error(`Leave blocked by blackout: ${blocked.title} (${blocked.start_date} → ${blocked.end_date})`);
    }

    // 3. Min advance notice (decision 20) — bypassed if is_emergency (decision 27)
    if (!payload.is_emergency && leaveType.min_advance_notice_days > 0) {
      const todayIso = new Date().toISOString().split('T')[0];
      const noticeDays = Math.floor(
        (new Date(payload.start_date).getTime() - new Date(todayIso).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (noticeDays < leaveType.min_advance_notice_days) {
        // A NEGATIVE figure means the start date is in the past, and reporting
        // it as "you gave -38" reads like a system fault rather than an
        // instruction. Say what happened and what to do instead.
        throw new Error(
          noticeDays < 0
            ? `${leaveType.leave_type_name} cannot be applied for a past date — ${payload.start_date} was ${Math.abs(noticeDays)} day(s) ago. It needs ${leaveType.min_advance_notice_days} day(s) notice, or tick Emergency leave if this could not have been filed in time.`
            : `${leaveType.leave_type_name} needs ${leaveType.min_advance_notice_days} day(s) advance notice; ${payload.start_date} is only ${noticeDays} day(s) away. Pick a later date, or tick Emergency leave.`
        );
      }
    }

    // 4. Max continuous duration (decision 20)
    const durationDays = Math.ceil(
      (new Date(payload.end_date).getTime() - new Date(payload.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;
    if (leaveType.max_continuous_days && durationDays > leaveType.max_continuous_days) {
      throw new Error(
        `This leave type allows max ${leaveType.max_continuous_days} continuous days. Requested ${durationDays}.`
      );
    }

    // 4b. Supporting document (decision: On-Duty and Half Pay Leave carry
    // requires_documents). THE authority — the drawer runs the same predicate
    // to decide whether to show the field, but this call is reachable directly
    // and a client check alone would gate nothing.
    //
    // The 0.5/0.125 duration factors are deliberately NOT applied here: the
    // threshold in document_required_after_days is about how long somebody is
    // away, and a five-day half-day request is five days away from their desk.
    // The balance checks below use the factored figure because that is about
    // how much entitlement is consumed — a different question.
    const documentRule = leaveDocumentRequirement(
      {
        requires_documents: leaveType.requires_documents ?? false,
        document_required_after_days: leaveType.document_required_after_days ?? null,
      },
      durationDays,
      payload.is_emergency ?? false,
    );
    if (documentRule.required && (payload.documents?.length ?? 0) === 0) {
      throw new Error(
        `${leaveType.leave_type_name} requires a supporting document. Attach one and submit again.`
      );
    }

    // 5. Build approval chain (frozen snapshot)
    const approval_chain = await this.buildApprovalChain(
      supabase,
      payload.hr_organization_id,
      payload.leave_type_id,
      payload.department_id ?? null,
      // The chain belongs to the person the leave is FOR. On a role-ladder flow
      // this is what decides where they enter it.
      payload.employee_id ?? null
    );

    // 6. Balance check (decision 18 — reject at apply-time on exhaustion)
    // Compute estimated total_days client-side for the check (DB trigger will recompute authoritative value)
    const estimatedDays =
      payload.duration_type === 'hourly' ? 0.125 :
      payload.duration_type === 'first_half' || payload.duration_type === 'second_half' ? 0.5 :
      durationDays;

    // Two bugs previously stacked here and cancelled the over-draw check out
    // entirely, silently:
    //   1. `.eq('academic_year_id', payload.academic_year_id ?? '')` — the ''
    //      is sent as a uuid and Postgres raises 22P02.
    //   2. `error` was not destructured, so that 22P02 was swallowed, `balance`
    //      came back undefined, and `if (balance)` skipped the whole check.
    // Net effect once the module became reachable: employees could exceed
    // their entitlement with no error at all. Never reintroduce a `?? ''`
    // here, and keep the error destructured.
    //
    // hr_leave_balances.hr_academic_year_id is part of the primary key and so
    // is never null. When the caller omits the year, resolve the same one
    // trg_hla_aa_default_hr_ay will stamp on the row — from start_date. Without
    // this the trigger would file the application under a year whose balance
    // this check never looked at, and the over-draw guard would be skipped for
    // exactly the requests that most need it.
    let resolvedYearId = payload.hr_academic_year_id ?? null;

    if (!resolvedYearId) {
      const { data: yearRow, error: yearError } = await supabase
        .from('hr_academic_years')
        .select('id')
        .eq('is_active', true)
        .lte('start_date', payload.start_date)
        .gte('end_date', payload.start_date)
        .maybeSingle();

      if (yearError) throw yearError;
      resolvedYearId = yearRow?.id ?? null;
    }

    let balance: {
      entitled?: number;
      carried_forward?: number;
      used?: number;
      accrued?: number;
      pending?: number;
      available?: number;
    } | null = null;

    if (resolvedYearId) {
      const { data, error: balanceError } = await supabase
        .from('v_hr_leave_balance')
        // `available` is now authoritative and is read rather than recomputed.
        // The view nets off BOTH what has been taken and what is awaiting a
        // decision, and caps at what has actually accrued — three rules this
        // service would otherwise have to restate and could get wrong.
        .select('entitled, carried_forward, used, accrued, pending, available')
        .eq('employee_id', payload.employee_id)
        .eq('leave_type_id', payload.leave_type_id)
        .eq('hr_academic_year_id', resolvedYearId)
        .maybeSingle();

      if (balanceError) throw balanceError;
      balance = data;
    }

    // Unconditional, deliberately. This used to be `if (balance) { ... }`,
    // so a staff member with no ledger row had NO over-draw check at all --
    // fail-open, and exactly the people most likely to have one (new
    // joiners, nobody having run the generator for them). The view always
    // returns a row for an eligible employee, so a null here now means
    // genuinely ineligible for this type, which is its own refusal.
    if (!balance) {
      throw new Error(
        `You are not eligible for ${leaveType.leave_type_name}. Ask HR if this is wrong.`
      );
    }

    // The DAY COMPARISON, unlike the eligibility check above, applies to
    // request_category='leave' ONLY. This mirrors hr_trig_update_leave_balance()'s
    // own early return:
    //
    //   IF v_category IN ('compensatory_off', 'short_time_off') THEN RETURN NEW;
    //
    // Those two categories never have `used` incremented by anything, anywhere —
    // verified in production: sum(used) = 0 across every comp-off and STO balance
    // row. So this comparison was measuring a number that means nothing, and
    // refusing on it:
    //   * Short Time Off — 101 staff (Matric 55, Nattraja CBSE 33, Jicate 13) got
    //     "Insufficient balance. You have 0.0 day(s)…" on every submit, because
    //     their Permission type sat at default_entitled_days = 0 (the leave-type
    //     form's default) and an hourly request prices at 0.125.
    //   * Compensatory Off — all 504 cells resolve to available <= 0, so this line
    //     refused 100% of comp-off claims. Zero were ever filed.
    //
    // Each category keeps its own real budget, enforced where the currency lives:
    // STO by hr_trig_sto_enforce_limits (minutes per period), comp off by its
    // credit ledger — the drawer blocks at zero credits and the database refuses
    // an approval with no credit behind it.
    const tracksDayEntitlement = leaveType.request_category === 'leave';

    // READ, NOT RECOMPUTED. This used to be entitled + carried - used, which
    // could not see an unapproved request: apply for two days, apply again, and
    // the second request saw the full balance. 354 applications / 371 days were
    // invisible to it. The view's `available` now subtracts pending too.
    const pending = balance.pending ?? 0;
    const available =
      balance.available ??
      (balance.accrued ?? balance.entitled ?? 0) +
        (balance.carried_forward ?? 0) -
        (balance.used ?? 0) -
        pending;

    if (tracksDayEntitlement && estimatedDays > available) {
      // hr_leave_types has no `name` column — it is `leave_type_name`.
      // The pending figure is named: "you have 10 left" is baffling when the
      // person believes they have 12, and the two days they cannot see are the
      // ones they filed themselves an hour ago.
      const pendingNote =
        pending > 0 ? ` (${pending.toFixed(1)} day(s) already awaiting approval)` : '';
      throw new Error(
        `Insufficient balance. You have ${available.toFixed(1)} day(s) of ${leaveType.leave_type_name} available${pendingNote}; requested ${estimatedDays}.`
      );
    }

    // 7. Insert (trigger populates total_days; status trigger does NOT fire on pending)
    const insertPayload: Record<string, unknown> = {
      hr_organization_id: payload.hr_organization_id,
      employee_id: payload.employee_id,
      leave_type_id: payload.leave_type_id,
      // Resolved above from start_date when the caller omitted it, so the row
      // is filed under the same year the balance check just examined. Still
      // safe if null — trg_hla_aa_default_hr_ay stamps it before the
      // period-cap triggers read it.
      hr_academic_year_id: resolvedYearId,
      start_date: payload.start_date,
      end_date: payload.end_date,
      duration_type: payload.duration_type,
      start_time: payload.start_time ?? null,
      end_time: payload.end_time ?? null,
      reason: payload.reason,
      documents: payload.documents ?? [],
      is_emergency: payload.is_emergency ?? false,
      approval_chain,
      current_step: 0,
      applied_by: payload.applied_by,
      status: payload.status ?? 'pending',
    };

    const { data, error } = await supabase
      .from('hr_leave_applications')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveApplication;
  }

  // ----- Approve / Reject -----

  /**
   * Guard every approve/reject decision.
   *
   * Until 2026-07-21 neither method checked WHO was calling: the API route
   * verified only that a session existed and passed `user.id` straight through
   * as the approver. Combined with an RLS policy that let an applicant UPDATE
   * their own row, any employee could POST to
   * /api/hr/leave/applications/{own-id}/approve and approve their own leave.
   * It was unreachable only because the tenancy gate locked everyone out — so
   * the Phase 0b retrofit would have opened it.
   *
   * RLS now also refuses to let a non-approver land a row in approved/rejected
   * (hla_update's WITH CHECK). This service check is the other half, and it
   * catches the case RLS cannot: an HR manager who legitimately holds
   * hr.leave.approve deciding on their OWN application.
   */
  private static async assertCanDecide(
    supabase: SupabaseClient,
    app: HRLeaveApplication,
    approverId: string
  ) {
    // Super admins are exempt from BOTH checks below, exactly as
    // hr_trig_leave_enforce_approver is: that trigger returns NEW on
    // is_super_admin() before it reaches either test. Without this the service
    // refused what the database would have allowed — a super admin could not
    // decide their own request, and could not act on a step pinned to somebody
    // else, despite hla_update permitting both.
    //
    // Resolved through the caller's own client, so is_super_admin() reads
    // profiles for the real auth.uid() rather than trusting approverId.
    const { data: isSuperAdmin, error: saError } = await supabase.rpc('is_super_admin');
    if (saError) throw saError;
    if (isSuperAdmin === true) return;

    const { data: myStaff, error } = await supabase
      .from('staff')
      .select('id')
      .eq('profile_id', approverId);
    if (error) throw error;

    if ((myStaff ?? []).some((s) => s.id === app.employee_id)) {
      throw new Error('You cannot decide on your own leave application.');
    }

    // Honour a pinned approver. Chains built before flows named concrete people
    // carry approver_user_id = null, so this is a no-op for them rather than a
    // hard block.
    //
    // MULTI-APPROVER STEPS ARE CHECKED AS A SET. A step is only refused here if
    // EVERY slot on it pins a person and none of them is the caller — one
    // unpinned (role) slot means the database is the one that can answer, and it
    // does so in trg_hla_approver_gate where user_roles is readable.
    const step = app.approval_chain?.[app.current_step];
    if (step) {
      const entries = readApprovers(step);
      const allPinned = entries.length > 0 && entries.every((e) => e.approver_user_id !== null);
      const namesCaller = entries.some((e) => e.approver_user_id === approverId);
      if (allPinned && !namesCaller) {
        throw new Error('This approval step is assigned to a different approver.');
      }
    }

    // A step routed to a ROLE is deliberately NOT checked here. custom_roles and
    // user_roles are not readable by an ordinary member of staff, so a
    // client-side lookup would come back empty for exactly the people it is
    // meant to admit and block them — the silent-false-negative failure this
    // module has already shipped twice. trg_hla_approver_gate performs that
    // check in the database, where the tables are readable, and raises a
    // message naming the required role. Duplicating it here would add a second
    // answer that can disagree with the enforced one.
  }

  static async approveApplication(
    supabase: SupabaseClient,
    applicationId: string,
    approverId: string,
    comment?: string
  ) {
    const app = await this.getApplication(supabase, applicationId);
    if (!app) throw new Error('Application not found');
    if (!['pending', 'escalated'].includes(app.status)) {
      throw new Error(`Cannot approve application in status ${app.status}`);
    }
    await this.assertCanDecide(supabase, app, approverId);

    const chain = [...app.approval_chain];
    const step = chain[app.current_step];
    if (!step) throw new Error('Approval chain exhausted');

    const now = new Date().toISOString();

    // QUORUM DECIDES WHETHER THE STEP ADVANCES, not the fact that someone acted.
    // On a quorum='all' step this records the decision and leaves current_step
    // where it is, so the request stays with the remaining approvers.
    const { step: decided, satisfied } = applyDecision(step, {
      by: approverId,
      at: now,
      decision: 'approved',
      comment: comment ?? null,
    });

    // approver_user_id was previously stamped with whoever acted, which on a
    // multi-approver step would rewrite the step to name one person and lock the
    // others out of a quorum they still have to complete. Only stamp it when the
    // step is a single pinned slot, which is the case that behaviour was for.
    const entries = readApprovers(step);
    const singlePinnedSlot = entries.length === 1 && entries[0].approver_user_id !== null;
    chain[app.current_step] = singlePinnedSlot
      ? { ...decided, approver_user_id: approverId }
      : decided;

    const nextStep = satisfied ? app.current_step + 1 : app.current_step;
    const isFinal = satisfied && nextStep >= chain.length;

    const update: Record<string, unknown> = {
      approval_chain: chain,
      current_step: nextStep,
    };
    if (isFinal) {
      update.status = 'approved';
      update.final_approver_id = approverId;
      update.final_decided_at = now;
    }

    const { data, error } = await supabase
      .from('hr_leave_applications')
      .update(update)
      .eq('id', applicationId)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveApplication;
  }

  static async rejectApplication(
    supabase: SupabaseClient,
    applicationId: string,
    approverId: string,
    rejection_reason: string
  ) {
    const app = await this.getApplication(supabase, applicationId);
    if (!app) throw new Error('Application not found');
    if (!['pending', 'escalated'].includes(app.status)) {
      throw new Error(`Cannot reject application in status ${app.status}`);
    }
    await this.assertCanDecide(supabase, app, approverId);

    const chain = [...app.approval_chain];
    const step = chain[app.current_step];
    if (step) {
      // Terminal at any step, including a parallel one where colleagues had
      // already approved — the decision the user confirmed was "reject", and
      // letting a pending quorum outvote it would be a surprise.
      const { step: decided } = applyDecision(step, {
        by: approverId,
        at: new Date().toISOString(),
        decision: 'rejected',
        comment: rejection_reason,
      });
      chain[app.current_step] = decided;
    }

    const { data, error } = await supabase
      .from('hr_leave_applications')
      .update({
        status: 'rejected',
        approval_chain: chain,
        final_approver_id: approverId,
        final_decided_at: new Date().toISOString(),
        rejection_reason,
      })
      .eq('id', applicationId)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveApplication;
  }

  // ----- Cancel (post-approval, supersede pattern per decision 6) -----

  static async cancelApplication(
    supabase: SupabaseClient,
    applicationId: string,
    cancelledBy: string
  ) {
    const app = await this.getApplication(supabase, applicationId);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'approved') {
      throw new Error(`Only approved applications can be cancelled. Use withdraw for pending. Status: ${app.status}`);
    }

    // Clone the row with status=cancelled, link back via superseded_by
    const clone: Record<string, unknown> = {
      hr_organization_id: app.hr_organization_id,
      employee_id: app.employee_id,
      leave_type_id: app.leave_type_id,
      hr_academic_year_id: app.hr_academic_year_id,
      start_date: app.start_date,
      end_date: app.end_date,
      duration_type: app.duration_type,
      start_time: app.start_time,
      end_time: app.end_time,
      reason: `[CANCELLED] ${app.reason}`,
      documents: app.documents,
      is_emergency: app.is_emergency,
      approval_chain: app.approval_chain,
      current_step: app.current_step,
      final_approver_id: app.final_approver_id,
      final_decided_at: app.final_decided_at,
      applied_by: cancelledBy,
      status: 'cancelled',
    };

    const { data: newRow, error: insertErr } = await supabase
      .from('hr_leave_applications')
      .insert(clone)
      .select()
      .single();
    if (insertErr) throw insertErr;

    // Link original to the cancellation row
    const { error: updateErr } = await supabase
      .from('hr_leave_applications')
      .update({ superseded_by: newRow.id })
      .eq('id', applicationId);
    if (updateErr) throw updateErr;

    // DB trigger on status-change-to-cancelled restores the balance delta
    return newRow as HRLeaveApplication;
  }

  // ----- Withdraw (pre-approval, soft-delete per decision 5) -----

  static async withdrawApplication(
    supabase: SupabaseClient,
    applicationId: string,
    employeeUserId: string
  ) {
    const app = await this.getApplication(supabase, applicationId);
    if (!app) throw new Error('Application not found');
    if (!['pending', 'escalated'].includes(app.status)) {
      throw new Error(`Only pending applications can be withdrawn. Use cancel for approved. Status: ${app.status}`);
    }

    const { data, error } = await supabase
      .from('hr_leave_applications')
      .update({
        status: 'withdrawn',
        final_decided_at: new Date().toISOString(),
        final_approver_id: employeeUserId,
      })
      .eq('id', applicationId)
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveApplication;
  }

  // ----- Comments -----

  static async listComments(supabase: SupabaseClient, applicationId: string) {
    const { data, error } = await supabase
      .from('hr_leave_application_comments')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as HRLeaveApplicationComment[];
  }

  /**
   * COLUMN DRIFT (fixed 2026-07-21). This inserted
   * `{ application_id, author_id, body }`. The table has neither `author_id`
   * nor `body` — the real columns are `commenter_id` and `comment` — and it
   * additionally omitted the NOT NULL `hr_organization_id`. Every POST failed
   * with 42703/PGRST204. It was never caught because no application had ever
   * been created, so nobody could reach a detail page to comment on.
   *
   * hr_organization_id is read off the parent application rather than passed
   * in: it must match the application's org for RLS to accept the row, and
   * deriving it here removes the chance of a caller supplying a mismatched one.
   */
  static async addComment(
    supabase: SupabaseClient,
    applicationId: string,
    authorId: string,
    body: string
  ) {
    const { data: parent, error: parentError } = await supabase
      .from('hr_leave_applications')
      .select('hr_organization_id')
      .eq('id', applicationId)
      .single();
    if (parentError) throw parentError;

    const { data, error } = await supabase
      .from('hr_leave_application_comments')
      .insert({
        application_id: applicationId,
        hr_organization_id: parent.hr_organization_id,
        commenter_id: authorId,
        comment: body,
      })
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveApplicationComment;
  }

  // ----- Balance -----

  /**
   * Balances for one person and year.
   *
   * Reads v_hr_leave_balance, not hr_leave_balances: the view returns a row
   * for every leave type the employee is eligible for whether or not a
   * ledger row exists. Under the old table read, a staff member created
   * after the last "Generate" run got an empty array here, which the apply
   * drawer rendered as "No leave balance is configured for you this
   * academic year" -- a hard block with no admin recourse.
   */
  static async getBalance(
    supabase: SupabaseClient,
    employeeId: string,
    hrAcademicYearId: string
  ): Promise<HRLeaveBalanceWithType[]> {
    const { data, error } = await supabase
      .from('v_hr_leave_balance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('hr_academic_year_id', hrAcademicYearId)
      .order('display_order', { ascending: true });
    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => ({
      employee_id: row.employee_id as string,
      leave_type_id: row.leave_type_id as string,
      hr_academic_year_id: row.hr_academic_year_id as string,
      hr_organization_id: row.hr_organization_id as string,
      entitled: Number(row.entitled),
      used: Number(row.used),
      carried_forward: Number(row.carried_forward),
      accrued: Number(row.accrued ?? row.entitled ?? 0),
      pending: Number(row.pending ?? 0),
      available: Number(row.available ?? 0),
      // Null for a derived row that has no ledger row behind it yet.
      created_at: (row.created_at ?? null) as string,
      updated_at: (row.updated_at ?? null) as string,
      leave_type_name: (row.leave_type_name ?? '') as string,
      leave_type_code: (row.leave_type_code ?? '') as string,
      duration_type: (row.duration_type ?? 'full') as HRLeaveBalanceWithType['duration_type'],
      allow_half_day: (row.allow_half_day ?? false) as boolean,
      allow_hourly: (row.allow_hourly ?? false) as boolean,
      request_category:
        (row.request_category ?? 'leave') as HRLeaveBalanceWithType['request_category'],
      max_continuous_days: (row.max_continuous_days ?? null) as number | null,
      min_advance_notice_days: Number(row.min_advance_notice_days ?? 0),
      requires_documents: (row.requires_documents ?? false) as boolean,
      document_required_after_days:
        (row.document_required_after_days ?? null) as number | null,
      entitlement_source:
        (row.entitlement_source ?? 'policy') as HRLeaveBalanceWithType['entitlement_source'],
    }));
  }

  // ----- Calendar (org-wide, decision 14 — with type-hiding per decision 23) -----

  static async getCalendar(
    supabase: SupabaseClient,
    hrOrgId: string,
    startDate: string,
    endDate: string
  ): Promise<HRCalendarEntry[]> {
    const { data, error } = await supabase
      .from('hr_leave_applications')
      .select(`
        id,
        employee_id,
        start_date,
        end_date,
        duration_type,
        status,
        staff:employee_id ( first_name, last_name )
      `)
      .eq('hr_organization_id', hrOrgId)
      .eq('status', 'approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate);
    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const staff = row.staff as { first_name: string; last_name: string | null } | null;
      const name = staff
        ? `${staff.first_name}${staff.last_name ? ' ' + staff.last_name : ''}`
        : 'Unknown';
      return {
        application_id: row.id as string,
        employee_id: row.employee_id as string,
        employee_name: name,
        start_date: row.start_date as string,
        end_date: row.end_date as string,
        duration_type: row.duration_type as HRCalendarEntry['duration_type'],
        display_label: 'On Leave' as const, // Type hidden per decision 23
        status: row.status as HRCalendarEntry['status'],
      };
    });
  }

  // ----- Encashment -----

  static async requestEncashment(
    supabase: SupabaseClient,
    payload: {
      hr_organization_id: string;
      employee_id: string;
      hr_academic_year_id: string;
      leave_type_id: string;
      days_encashed: number;
      per_diem_rate: number;
    }
  ) {
    const total_amount = payload.days_encashed * payload.per_diem_rate;
    const { data, error } = await supabase
      .from('hr_leave_encashments')
      .insert({ ...payload, total_amount, status: 'pending' })
      .select()
      .single();
    if (error) throw error;
    return data as HRLeaveEncashment;
  }

  static async listEncashments(
    supabase: SupabaseClient,
    filters: { hr_organization_id?: string; employee_id?: string; status?: string } = {}
  ) {
    let q = supabase
      .from('hr_leave_encashments')
      .select('*')
      .order('created_at', { ascending: false });
    if (filters.hr_organization_id) q = q.eq('hr_organization_id', filters.hr_organization_id);
    if (filters.employee_id) q = q.eq('employee_id', filters.employee_id);
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as HRLeaveEncashment[];
  }
}

// =====================================================================================
// Blackout Service (thin CRUD; admin-only route)
// =====================================================================================

export class LeaveBlackoutService {
  static async list(supabase: SupabaseClient, hrOrgId: string) {
    const { data, error } = await supabase
      .from('hr_leave_blackouts')
      .select('*')
      .eq('hr_organization_id', hrOrgId)
      .order('start_date', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  static async create(
    supabase: SupabaseClient,
    payload: {
      hr_organization_id: string;
      title: string;
      start_date: string;
      end_date: string;
      leave_type_ids?: string[] | null;
      reason?: string;
      created_by: string;
    }
  ) {
    const { data, error } = await supabase
      .from('hr_leave_blackouts')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async delete(supabase: SupabaseClient, id: string) {
    const { error } = await supabase.from('hr_leave_blackouts').delete().eq('id', id);
    if (error) throw error;
  }
}
