/**
 * Eligibility for a gated leave type.
 * Created: 2026-09-19.
 *
 * A gated type (PH.D and its like) is invisible in Apply Leave until the staff
 * member holds an approved row in hr_leave_eligibilities. They request it once
 * with the supporting document, the approvers decide it, and afterwards the
 * type simply appears and never asks for that document again.
 *
 * WHO DECIDES (2026-09-21). The people who read the proof are usually not the
 * people who approve the leave — the HR Head checks a PH.D enrolment once, the
 * HOD → Principal chain then approves each leave. So a leave type may carry an
 * ELIGIBILITY flow of its own (hr_approval_flows, flow_for='leave_eligibility',
 * set under "Who approves eligibility"), with an institution catch-all behind
 * it. A gated type with neither falls back to its LEAVE flow — the behaviour
 * every gated type had before eligibility flows existed.
 *
 * NO SECOND APPROVAL ENGINE. Whichever flow is picked, the chain is built by
 * the same LeaveService.buildChainFromFlow the leave itself uses, and decide()
 * advances it with the same pure applyDecision(), so quorum, multi-approver
 * steps and "the last step grants" behave identically. Anything else would be
 * a second set of rules to keep in step with the first.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { applyDecision, isFinalStep, pickLeaveFlow } from '@/lib/hr/leave/approval-chain';
import { LeaveApprovalFlowService } from '@/lib/services/hr/leave-approval-flow-service';
import { LeaveService, type LeaveFlowRow } from '@/lib/services/hr/leave-service';
import { getErrorMessage } from '@/lib/utils';
import type { LeaveApprovalStep, LeaveDocument } from '@/types/hr';
import type {
  LeaveEligibility,
  LeaveEligibilityRow,
  LeaveEligibilityStatus,
} from '@/types/hr-leave-types';

const TABLE = 'hr_leave_eligibilities';
const SELECT =
  'id, employee_id, leave_type_id, hr_organization_id, status, documents, reason, ' +
  'approval_chain, current_step, entitled_days, valid_from, valid_until, ' +
  'decided_by, decided_at, decision_note, revoked_by, revoked_at, revoke_reason, ' +
  'granted_directly, created_by, created_at, updated_at';

export interface RequestEligibilityInput {
  employeeId: string;
  leaveTypeId: string;
  hrOrgId: string;
  departmentId: string | null;
  documents: LeaveDocument[];
  reason: string | null;
  /**
   * profiles.id of the person filing — the decision notification's recipient.
   * Set by the server route from the session, never trusted from the body.
   */
  createdBy: string;
}

export interface GrantEligibilityInput {
  employeeId: string;
  leaveTypeId: string;
  hrOrgId: string;
  entitledDays?: number | null;
  validUntil?: string | null;
  reason: string | null;
}

export class LeaveEligibilityService {
  /**
   * What this staff member holds, for every gated type.
   *
   * Includes rejected and revoked rows: the Apply Leave drawer has to tell
   * "never asked" from "asked and turned down", and the second needs the
   * reason shown rather than an invitation to ask again blindly.
   */
  static async listForStaff(
    supabase: SupabaseClient,
    employeeId: string
  ): Promise<LeaveEligibility[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(SELECT)
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as LeaveEligibility[];
  }

  /** The admin list for one organisation, newest first. */
  static async listForOrg(
    supabase: SupabaseClient,
    hrOrgId: string,
    status?: LeaveEligibilityStatus
  ): Promise<LeaveEligibilityRow[]> {
    let q = supabase
      .from(TABLE)
      .select(
        `${SELECT}, staff:employee_id ( first_name, last_name, staff_id ), ` +
          'hr_leave_types:leave_type_id ( leave_type_name )'
      )
      .eq('hr_organization_id', hrOrgId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw error;

    // `as unknown as` because PostgREST cannot infer a type for an ALIASED
    // embed (`staff:employee_id ( … )`) and hands back GenericStringError.
    // The same limitation already sits on the flow service's selects.
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
      // PostgREST returns an embed as an object or a one-element array
      // depending on the relationship it inferred; normalise both.
      const emb = <T,>(v: unknown): T | null =>
        (Array.isArray(v) ? (v[0] as T) : (v as T)) ?? null;
      const s = emb<{ first_name?: string; last_name?: string; staff_id?: string }>(r.staff);
      const t = emb<{ leave_type_name?: string }>(r.hr_leave_types);
      return {
        ...(r as unknown as LeaveEligibility),
        staff_name: [s?.first_name, s?.last_name].filter(Boolean).join(' ').trim() || null,
        staff_code: s?.staff_id ?? null,
        leave_type_name: t?.leave_type_name ?? null,
      };
    });
  }

  /** Everything still awaiting a decision that this caller is next on. */
  static async listPendingForApprover(
    supabase: SupabaseClient
  ): Promise<LeaveEligibilityRow[]> {
    // RLS already limits SELECT to rows the caller owns, approves or manages,
    // so "pending" is the only filter needed here — asking the database again
    // who the approver is would duplicate the policy.
    const { data, error } = await supabase
      .from(TABLE)
      .select(
        `${SELECT}, staff:employee_id ( first_name, last_name, staff_id ), ` +
          'hr_leave_types:leave_type_id ( leave_type_name )'
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;

    // `as unknown as` because PostgREST cannot infer a type for an ALIASED
    // embed (`staff:employee_id ( … )`) and hands back GenericStringError.
    // The same limitation already sits on the flow service's selects.
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
      const emb = <T,>(v: unknown): T | null =>
        (Array.isArray(v) ? (v[0] as T) : (v as T)) ?? null;
      const s = emb<{ first_name?: string; last_name?: string; staff_id?: string }>(r.staff);
      const t = emb<{ leave_type_name?: string }>(r.hr_leave_types);
      return {
        ...(r as unknown as LeaveEligibility),
        staff_name: [s?.first_name, s?.last_name].filter(Boolean).join(' ').trim() || null,
        staff_code: s?.staff_id ?? null,
        leave_type_name: t?.leave_type_name ?? null,
      };
    });
  }

  /**
   * The chain an eligibility request freezes.
   *
   * Eligibility flow for this type → institution eligibility catch-all → the
   * leave flow. pickLeaveFlow with no group IS that precedence (type beats
   * catch-all, and eligibility flows carry no group), so the rule is not
   * re-implemented here. The fallback goes through buildApprovalChain untouched,
   * so a gated type nobody has configured behaves exactly as it did before
   * eligibility flows existed — including its Teaching / Non-teaching split.
   */
  static async buildEligibilityChain(
    supabase: SupabaseClient,
    hrOrgId: string,
    leaveTypeId: string,
    departmentId: string | null,
    employeeId: string
  ): Promise<LeaveApprovalStep[]> {
    const flows = await LeaveApprovalFlowService.listForOrg(
      supabase,
      hrOrgId,
      'leave_eligibility'
    );
    const chosen = pickLeaveFlow(flows, leaveTypeId, null);

    if (!chosen) {
      return LeaveService.buildApprovalChain(
        supabase,
        hrOrgId,
        leaveTypeId,
        departmentId,
        employeeId
      );
    }

    const steps = await LeaveService.buildChainFromFlow(
      supabase,
      chosen as unknown as LeaveFlowRow,
      employeeId
    );

    // An eligibility flow that resolves to nobody is a configuration fault on
    // THIS screen, not the leave one, and the message has to send the admin
    // to the right menu item.
    if (steps.length === 0) {
      if ((chosen.step_source ?? 'explicit') === 'role_ladder') {
        throw new Error(
          `The eligibility approval ladder on "${chosen.flow_name}" has nobody above you, so ` +
            'there is no one to send this request to. Ask HR to set a fallback approver under ' +
            'HR → Admin → Leave Types → "Who approves eligibility".'
        );
      }
      throw new Error(
        `The eligibility approval flow "${chosen.flow_name}" has no approval steps, so there ` +
          'is nobody to send this request to. Ask HR to add one under HR → Admin → Leave Types → ' +
          '"Who approves eligibility".'
      );
    }
    return steps;
  }

  /**
   * File a request. The document is compulsory — it is the entire evidence the
   * approver has, and a gated type exists precisely because somebody must see
   * proof before the leave is opened up.
   */
  static async request(
    supabase: SupabaseClient,
    input: RequestEligibilityInput
  ): Promise<LeaveEligibility> {
    if (input.documents.length === 0) {
      throw new Error(
        'Attach the supporting document. It is what the approver reads, and it is asked for only this once.'
      );
    }

    const chain = await this.buildEligibilityChain(
      supabase,
      input.hrOrgId,
      input.leaveTypeId,
      input.departmentId,
      input.employeeId
    );

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        employee_id: input.employeeId,
        leave_type_id: input.leaveTypeId,
        hr_organization_id: input.hrOrgId,
        status: 'pending',
        documents: input.documents,
        reason: input.reason,
        approval_chain: chain,
        current_step: 0,
        created_by: input.createdBy,
      })
      .select(SELECT)
      .single();

    if (error) {
      // The live-row unique index is the friendly case: somebody already has a
      // request in flight or a grant in hand for this type.
      if ((error as { code?: string }).code === '23505') {
        throw new Error(
          'You already have a request or an approved eligibility for this leave type.'
        );
      }
      throw new Error(getErrorMessage(error));
    }
    return data as unknown as LeaveEligibility;
  }

  /**
   * Approve or reject one step.
   *
   * Advances the frozen chain with the shared applyDecision, so a step needing
   * every approver waits for every approver here too. Only the FINAL step
   * flips the row to approved — a review step just moves the pointer.
   */
  static async decide(
    supabase: SupabaseClient,
    input: {
      eligibilityId: string;
      approve: boolean;
      note: string | null;
      deciderProfileId: string;
    }
  ): Promise<LeaveEligibility> {
    const { data: row, error: readErr } = await supabase
      .from(TABLE)
      .select(SELECT)
      .eq('id', input.eligibilityId)
      .single();
    if (readErr) throw new Error(getErrorMessage(readErr));

    const current = row as unknown as LeaveEligibility;
    if (current.status !== 'pending') {
      throw new Error(`This request is already ${current.status}.`);
    }

    const chain = [...current.approval_chain];
    const step = chain[current.current_step];
    if (!step) throw new Error('This request has no step awaiting a decision.');

    const now = new Date().toISOString();

    // QUORUM DECIDES WHETHER THE STEP ADVANCES, not the fact that somebody
    // acted — the same rule as a leave decision, from the same function. On a
    // quorum='all' step this records the decision and leaves current_step
    // where it is, so the request stays with the remaining approvers.
    const { step: decided, satisfied } = applyDecision(step, {
      by: input.deciderProfileId,
      at: now,
      decision: input.approve ? 'approved' : 'rejected',
      comment: input.note,
    });
    chain[current.current_step] = decided;

    const wasFinal = isFinalStep(current.approval_chain, current.current_step);
    // A rejection is terminal at any step. An approval only grants when the
    // step is both satisfied AND the last one — clearing a review step just
    // moves the pointer on.
    const status: LeaveEligibilityStatus = !input.approve
      ? 'rejected'
      : satisfied && wasFinal
        ? 'approved'
        : 'pending';
    const nextStep =
      input.approve && satisfied && !wasFinal ? current.current_step + 1 : current.current_step;

    const { data, error } = await supabase
      .from(TABLE)
      .update({
        approval_chain: chain,
        current_step: nextStep,
        status,
        decided_by: input.deciderProfileId,
        decided_at: now,
        decision_note: input.note,
        updated_at: now,
      })
      .eq('id', input.eligibilityId)
      .select(SELECT)
      .single();
    if (error) throw new Error(getErrorMessage(error));

    const saved = data as unknown as LeaveEligibility;
    if (saved.status === 'approved') await this.applyEntitlement(supabase, saved);
    return saved;
  }

  /** HR records a grant with no request behind it. */
  static async grant(
    supabase: SupabaseClient,
    input: GrantEligibilityInput
  ): Promise<LeaveEligibility> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        employee_id: input.employeeId,
        leave_type_id: input.leaveTypeId,
        hr_organization_id: input.hrOrgId,
        status: 'approved',
        granted_directly: true,
        entitled_days: input.entitledDays ?? null,
        valid_until: input.validUntil ?? null,
        reason: input.reason,
        decided_at: new Date().toISOString(),
      })
      .select(SELECT)
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new Error('This person already has a request or grant for that leave type.');
      }
      throw new Error(getErrorMessage(error));
    }
    const saved = data as unknown as LeaveEligibility;
    await this.applyEntitlement(supabase, saved);
    return saved;
  }

  /**
   * Withdraw a grant. The type stops appearing from the next page load.
   *
   * LEAVE ALREADY APPROVED IS NOT TOUCHED, and neither are applications in
   * flight — a revoke closes the door, it does not reach back through it.
   */
  static async revoke(
    supabase: SupabaseClient,
    eligibilityId: string,
    reason: string,
    revokerProfileId: string
  ): Promise<void> {
    if (!reason.trim()) throw new Error('Give a reason for withdrawing this eligibility.');
    const { error } = await supabase
      .from(TABLE)
      .update({
        status: 'revoked',
        revoked_by: revokerProfileId,
        revoked_at: new Date().toISOString(),
        revoke_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', eligibilityId);
    if (error) throw new Error(getErrorMessage(error));
  }

  /**
   * Write the grant's day count where the balance view already looks.
   *
   * hr_leave_entitlement_overrides is FIRST in that view's COALESCE and makes
   * entitlement_source read 'override', so using it means no screen, report or
   * accrual calculation has to learn that eligibility exists.
   *
   * SCOPED TO THE CURRENT ACADEMIC YEAR, because that table is keyed on one.
   * A multi-year grant needs an override per year; HR sets the next one when
   * the year rolls, the same as any other override.
   *
   * Non-fatal: the grant itself is the thing that matters, and a failed
   * override should not roll back an approval the approver has already given.
   */
  private static async applyEntitlement(
    supabase: SupabaseClient,
    row: LeaveEligibility
  ): Promise<void> {
    if (row.entitled_days == null) return;
    try {
      const { data: year } = await supabase
        .from('hr_academic_years')
        .select('id')
        .is('frozen_at', null)
        .lte('start_date', new Date().toISOString().slice(0, 10))
        .gte('end_date', new Date().toISOString().slice(0, 10))
        .maybeSingle();
      if (!year) return;

      await supabase.from('hr_leave_entitlement_overrides').upsert(
        {
          employee_id: row.employee_id,
          leave_type_id: row.leave_type_id,
          hr_academic_year_id: (year as { id: string }).id,
          hr_organization_id: row.hr_organization_id,
          entitled_days: row.entitled_days,
          reason: 'Set by an approved leave eligibility',
        },
        { onConflict: 'employee_id,leave_type_id,hr_academic_year_id' }
      );
    } catch (err) {
      console.error('[leave-eligibility] entitlement override failed:', err);
    }
  }
}
