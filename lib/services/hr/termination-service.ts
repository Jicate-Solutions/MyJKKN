/**
 * HR Termination Service (T6.3 — Termination Workflow, Wave 4-B).
 *
 * Backs the Director-approved termination flow on top of the
 * hr_offboarding_cases substrate (PR #890 + #920 + #925).
 *
 * Termination is distinct from resignation:
 *   - Director-initiated (separation_type='termination')
 *   - Requires documented grounds (>20 chars)
 *   - Walks a 3-step approval chain: SEDC -> Legal -> Director
 *   - Optional notice-period waiver
 *
 * Methods:
 *   - initiateTermination       Director creates the case + 3-step chain.
 *                               Optionally pre-fills grounds from a linked
 *                               hr_disciplinary_cases row (forward-compat
 *                               with T6.2 — falls back to manual grounds
 *                               if disciplinary table isn't installed yet).
 *   - advanceApprovalChain      Approver signs off on their step (or rejects);
 *                               flips chain entry status + keeps
 *                               legal_review_status in sync.
 *   - listTerminations          List cases with separation_type='termination'
 *                               (RLS narrows what the caller sees).
 *   - getCanonicalChainTemplate Returns the canonical [sedc, legal, director]
 *                               step list used at initiation.
 *
 * Static class. SupabaseClient passed as first arg (mirrors OffboardingService).
 *
 * Spec: hr-module-decomposition-2026-05-09.md (T6.3)
 * Companions:
 *   - supabase/migrations/20260624_hr_termination_workflow.sql
 *   - app/(routes)/hr/admin/terminations/page.tsx
 *   - app/(routes)/hr/admin/terminations/[id]/initiate/page.tsx
 *   - app/(routes)/hr/admin/terminations/[id]/review/page.tsx
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TerminationApprovalStep = 'sedc' | 'legal' | 'director';

export type TerminationApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface TerminationApprovalChainEntry {
  step: TerminationApprovalStep;
  approver_id: string | null;
  status: TerminationApprovalStatus;
  acted_at: string | null;
  notes: string | null;
}

export interface TerminationCase {
  id: string;
  staff_id: string;
  institution_id: string;
  initiated_by: string | null;
  initiated_at: string;
  reason: string;
  recommended_last_day: string | null;
  current_step_index: number;
  status: 'open' | 'withdrawn' | 'completed';
  separation_type: 'resignation' | 'retirement' | 'termination' | 'death';
  termination_approval_chain: TerminationApprovalChainEntry[];
  legal_review_status: TerminationApprovalStatus | 'not_required' | null;
  termination_grounds: string | null;
  notice_period_waived: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InitiateTerminationInput {
  staffId: string;
  institutionId: string;
  reason: string;
  /** Documented basis. Must be > 20 chars OR a disciplinaryCaseId must be supplied. */
  grounds?: string;
  /** Forward-compat with T6.2. When set, grounds is auto-populated from the case. */
  disciplinaryCaseId?: string | null;
  recommendedLastDay?: string | null;
  noticePeriodWaived?: boolean;
  noticeWaiverReason?: string | null;
  /** Pre-assigned approver per step. null = unassigned at initiation. */
  approvers?: Partial<Record<TerminationApprovalStep, string | null>>;
}

export interface AdvanceChainInput {
  caseId: string;
  step: TerminationApprovalStep;
  status: 'approved' | 'rejected';
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Canonical 3-step approval chain.
 *
 * Order matters: SEDC reviews the disciplinary substrate first, Legal
 * confirms the basis is defensible, Director gives the final sign-off.
 * A 'rejected' at any step closes the case (status='withdrawn').
 */
export const CANONICAL_APPROVAL_CHAIN: ReadonlyArray<TerminationApprovalStep> = [
  'sedc',
  'legal',
  'director',
] as const;

export const APPROVAL_STEP_LABEL: Record<TerminationApprovalStep, string> = {
  sedc: 'SEDC (Staff Empowerment & Disciplinary Committee)',
  legal: 'Legal Review',
  director: 'Director Sign-off',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyChain(
  approvers?: Partial<Record<TerminationApprovalStep, string | null>>,
): TerminationApprovalChainEntry[] {
  return CANONICAL_APPROVAL_CHAIN.map((step) => ({
    step,
    approver_id: approvers?.[step] ?? null,
    status: 'pending' as TerminationApprovalStatus,
    acted_at: null,
    notes: null,
  }));
}

function legalEntryStatus(
  chain: TerminationApprovalChainEntry[],
): TerminationApprovalStatus | null {
  return chain.find((c) => c.step === 'legal')?.status ?? null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TerminationService {
  /** Canonical [sedc, legal, director] template for UI consumers. */
  static getCanonicalChainTemplate(): TerminationApprovalChainEntry[] {
    return emptyChain();
  }

  /**
   * Initiate a termination case.
   *
   * Validates that either explicit grounds (>20 chars) OR a
   * disciplinaryCaseId is provided. When a disciplinaryCaseId is supplied AND
   * the hr_disciplinary_cases table exists (T6.2), grounds is auto-populated
   * from the case summary; if T6.2 hasn't shipped yet the caller must supply
   * grounds directly.
   *
   * Inserts a new hr_offboarding_cases row with separation_type='termination',
   * populates the 3-step approval chain, and stamps legal_review_status='pending'.
   */
  static async initiateTermination(
    supabase: SupabaseClient,
    input: InitiateTerminationInput,
  ): Promise<TerminationCase> {
    // Resolve grounds — explicit OR auto-populated from disciplinary case.
    let grounds = input.grounds?.trim() ?? '';

    if (!grounds && input.disciplinaryCaseId) {
      grounds = await this.tryLoadGroundsFromDisciplinary(
        supabase,
        input.disciplinaryCaseId,
      );
    }

    if (!grounds || grounds.length <= 20) {
      throw new Error(
        'Termination grounds must be > 20 characters. Provide a documented basis or link a disciplinary case with a summary.',
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const chain = emptyChain(input.approvers);

    const metadata: Record<string, unknown> = {};
    if (input.disciplinaryCaseId) {
      metadata.disciplinary_case_id = input.disciplinaryCaseId;
    }
    if (input.noticePeriodWaived) {
      metadata.termination_notice_waiver_reason =
        input.noticeWaiverReason ?? null;
    }

    const { data, error } = await supabase
      .from('hr_offboarding_cases')
      .insert({
        staff_id: input.staffId,
        institution_id: input.institutionId,
        initiated_by: user?.id ?? null,
        reason: input.reason,
        recommended_last_day: input.recommendedLastDay ?? null,
        separation_type: 'termination',
        termination_approval_chain: chain,
        legal_review_status: 'pending',
        termination_grounds: grounds,
        notice_period_waived: input.noticePeriodWaived ?? false,
        metadata,
        status: 'open',
      })
      .select(
        'id, staff_id, institution_id, initiated_by, initiated_at, reason, recommended_last_day, current_step_index, status, separation_type, termination_approval_chain, legal_review_status, termination_grounds, notice_period_waived, metadata, created_at, updated_at',
      )
      .single();

    if (error) throw error;
    return this.coerceCaseRow(data);
  }

  /**
   * Advance (or reject) one step in the termination approval chain.
   *
   * - status='approved': flips the named step to approved, stamps acted_at,
   *   advances current_step_index if this was the active step.
   * - status='rejected': flips the named step to rejected, closes the case
   *   (status='withdrawn'), legal_review_status mirrors the rejection.
   *
   * Keeps legal_review_status in sync with the legal-step entry on every
   * mutation so list-view filtering stays cheap.
   */
  static async advanceApprovalChain(
    supabase: SupabaseClient,
    input: AdvanceChainInput,
  ): Promise<TerminationCase> {
    // Read the current chain so we can mutate just the named entry.
    const { data: current, error: readErr } = await supabase
      .from('hr_offboarding_cases')
      .select(
        'id, separation_type, termination_approval_chain, current_step_index',
      )
      .eq('id', input.caseId)
      .single();

    if (readErr) throw readErr;
    if (!current) {
      throw new Error('Termination case not found.');
    }
    if (current.separation_type !== 'termination') {
      throw new Error(
        `Cannot advance approval chain on a ${current.separation_type} case — only termination cases use this workflow.`,
      );
    }

    const chain = (current.termination_approval_chain ??
      []) as TerminationApprovalChainEntry[];

    const stepIndex = chain.findIndex((c) => c.step === input.step);
    if (stepIndex === -1) {
      throw new Error(
        `Step "${input.step}" not present in approval chain. Did initiation complete?`,
      );
    }

    // Enforce order: must approve previous steps first.
    if (input.status === 'approved') {
      for (let i = 0; i < stepIndex; i += 1) {
        if (chain[i].status !== 'approved') {
          throw new Error(
            `Cannot approve "${input.step}" — previous step "${chain[i].step}" is ${chain[i].status}.`,
          );
        }
      }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const updatedChain: TerminationApprovalChainEntry[] = chain.map((c, i) => {
      if (i === stepIndex) {
        return {
          ...c,
          approver_id: c.approver_id ?? user?.id ?? null,
          status: input.status,
          acted_at: new Date().toISOString(),
          notes: input.notes ?? null,
        };
      }
      return c;
    });

    const nextLegal = legalEntryStatus(updatedChain);

    const allApproved = updatedChain.every((c) => c.status === 'approved');
    const anyRejected = updatedChain.some((c) => c.status === 'rejected');

    const update: Record<string, unknown> = {
      termination_approval_chain: updatedChain,
      legal_review_status: nextLegal,
    };

    if (input.status === 'approved' && stepIndex + 1 > current.current_step_index) {
      update.current_step_index = stepIndex + 1;
    }

    if (anyRejected) {
      update.status = 'withdrawn';
    } else if (allApproved) {
      update.status = 'completed';
      update.completed_at = new Date().toISOString();
    }

    const { data: updated, error: updateErr } = await supabase
      .from('hr_offboarding_cases')
      .update(update)
      .eq('id', input.caseId)
      .select(
        'id, staff_id, institution_id, initiated_by, initiated_at, reason, recommended_last_day, current_step_index, status, separation_type, termination_approval_chain, legal_review_status, termination_grounds, notice_period_waived, metadata, created_at, updated_at',
      )
      .single();

    if (updateErr) throw updateErr;
    return this.coerceCaseRow(updated);
  }

  /**
   * List all termination cases (separation_type='termination').
   *
   * RLS narrows what each caller sees (super_admin / admin -> all,
   * HR officer -> their institution, staff -> own case only). Caller can
   * pass an optional legalStatus filter to narrow further.
   */
  static async listTerminations(
    supabase: SupabaseClient,
    args: {
      legalStatus?: TerminationApprovalStatus | 'not_required' | null;
      status?: 'open' | 'withdrawn' | 'completed' | null;
      institutionId?: string | null;
    } = {},
  ): Promise<TerminationCase[]> {
    let q = supabase
      .from('hr_offboarding_cases')
      .select(
        'id, staff_id, institution_id, initiated_by, initiated_at, reason, recommended_last_day, current_step_index, status, separation_type, termination_approval_chain, legal_review_status, termination_grounds, notice_period_waived, metadata, created_at, updated_at',
      )
      .eq('separation_type', 'termination')
      .order('initiated_at', { ascending: false });

    if (args.legalStatus !== undefined && args.legalStatus !== null) {
      q = q.eq('legal_review_status', args.legalStatus);
    }
    if (args.status) {
      q = q.eq('status', args.status);
    }
    if (args.institutionId) {
      q = q.eq('institution_id', args.institutionId);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => this.coerceCaseRow(r));
  }

  /** Single-case fetch — list view links to /[id]/review using this. */
  static async getTerminationCase(
    supabase: SupabaseClient,
    caseId: string,
  ): Promise<TerminationCase | null> {
    const { data, error } = await supabase
      .from('hr_offboarding_cases')
      .select(
        'id, staff_id, institution_id, initiated_by, initiated_at, reason, recommended_last_day, current_step_index, status, separation_type, termination_approval_chain, legal_review_status, termination_grounds, notice_period_waived, metadata, created_at, updated_at',
      )
      .eq('id', caseId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    if (data.separation_type !== 'termination') {
      throw new Error(
        `Case ${caseId} is a ${data.separation_type}, not a termination.`,
      );
    }
    return this.coerceCaseRow(data);
  }

  // -------------------------------------------------------------------------
  // Internal — disciplinary-case grounds loader (forward-compat with T6.2)
  // -------------------------------------------------------------------------
  // T6.2 may or may not have shipped hr_disciplinary_cases yet. We try the
  // read; on PostgreSQL "undefined_table" (42P01) we return '' so the caller
  // gets the "grounds must be >20 chars" error rather than a confusing
  // table-missing trace. Any other error propagates.
  // -------------------------------------------------------------------------
  private static async tryLoadGroundsFromDisciplinary(
    supabase: SupabaseClient,
    disciplinaryCaseId: string,
  ): Promise<string> {
    const { data, error } = await supabase
      .from('hr_disciplinary_cases')
      .select('summary, allegations, final_decision_notes')
      .eq('id', disciplinaryCaseId)
      .maybeSingle();

    if (error) {
      // PostgREST surfaces missing-table as code PGRST116/PGRST205 or
      // postgres code 42P01 depending on the deployment. We treat any of
      // those as "T6.2 not installed yet" rather than failing initiation.
      const code = (error as { code?: string }).code ?? '';
      const message = error.message ?? '';
      const tableMissing =
        code === '42P01' ||
        code === 'PGRST205' ||
        message.toLowerCase().includes('does not exist');
      if (tableMissing) {
        return '';
      }
      throw error;
    }

    if (!data) return '';

    // Concatenate available fields in priority order. Each field that exists
    // gets a labelled line so the resulting grounds text is auditable.
    const parts: string[] = [];
    if (data.summary) {
      parts.push(`Summary: ${data.summary}`);
    }
    if (Array.isArray(data.allegations) && data.allegations.length) {
      parts.push(`Allegations: ${data.allegations.join('; ')}`);
    }
    if (data.final_decision_notes) {
      parts.push(`Decision: ${data.final_decision_notes}`);
    }
    return parts.join('\n\n');
  }

  // -------------------------------------------------------------------------
  // Internal — coerce a raw row to the typed TerminationCase shape.
  // -------------------------------------------------------------------------
  private static coerceCaseRow(row: Record<string, unknown>): TerminationCase {
    return {
      id: row.id as string,
      staff_id: row.staff_id as string,
      institution_id: row.institution_id as string,
      initiated_by: (row.initiated_by as string | null) ?? null,
      initiated_at: row.initiated_at as string,
      reason: row.reason as string,
      recommended_last_day: (row.recommended_last_day as string | null) ?? null,
      current_step_index: (row.current_step_index as number) ?? 1,
      status: row.status as TerminationCase['status'],
      separation_type: row.separation_type as TerminationCase['separation_type'],
      termination_approval_chain: (Array.isArray(row.termination_approval_chain)
        ? (row.termination_approval_chain as TerminationApprovalChainEntry[])
        : []),
      legal_review_status:
        (row.legal_review_status as TerminationCase['legal_review_status']) ??
        null,
      termination_grounds: (row.termination_grounds as string | null) ?? null,
      notice_period_waived: Boolean(row.notice_period_waived),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
