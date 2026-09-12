// lib/services/admission/consultant-course-rate-service.ts
//
// Per-consultant, per-course referral rates and the promise they are tied to.
// Backs `consultant_commission_structures` (extended by migration
// 20261203100000) and `fn_resolve_consultant_course_rate`.
//
// Shape deliberately mirrors ReferralRateService (referral-rate-service.ts):
// session/browser client, RLS applies, static methods, errors re-thrown as
// Error(message). This file is mapping only — every rule lives in SQL, in one
// place, so the screen and the generator can never drift apart.
//
// Director's rules this serves:
//   13 — a rate is per course AND per consultant
//   16 — a promise is BOTH yearly and per-course
//   17 — miss the promise and the consultant is still paid, at the normal amount
//   20 — each promise is judged on its own; the yearly promise never rescues a
//        missed course
//   14 — every amount here is PRE-TAX; MyJKKN applies no TDS
//
// NOTE ON AMOUNTS: this file writes no default and no example amount. A scope
// with no amount set is `null`, which means "not decided", never zero.

import { createClientSupabaseClient } from '@/lib/supabase/client';

/** One promise/rate scope row. program_id null = the YEARLY scope. */
export interface ConsultantScopeRate {
  id: string;
  institution_id: string;
  consultant_id: string;
  name: string;
  academic_year: number | null;
  program_id: string | null;
  applies_to_all_programs: boolean | null;
  /** How many learners were promised at this scope. null = no promise made. */
  promised_count: number | null;
  /** PRE-TAX per learner when this scope's promise is MET. null = not set. */
  promised_amount: number | null;
  /** PRE-TAX per learner otherwise — the normal amount. null = not set. */
  base_amount: number | null;
  clawback_enabled: boolean | null;
  clawback_period_days: number | null;
  clawback_percentage: number | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  program?: { id: string; program_name: string } | null;
}

export interface UpsertConsultantScopeRateInput {
  /** Omit to create, supply to update an existing scope row. */
  id?: string;
  institution_id: string;
  consultant_id: string;
  academic_year: number;
  /** null = the yearly scope (every course with no row of its own). */
  program_id: string | null;
  /** null clears the promise at this scope. */
  promised_count: number | null;
  /** null leaves the amount undecided. Never defaulted. */
  promised_amount: number | null;
  /** null leaves the amount undecided. Never defaulted. */
  base_amount: number | null;
}

/** What fn_resolve_consultant_course_rate returns for one learner's scope. */
export interface ResolvedConsultantRate {
  scope: 'course' | 'yearly' | 'none';
  structure_id: string | null;
  /** PRE-TAX per learner. null means NO RATE SET — it does not mean zero. */
  resolved_amount: number | null;
  normal_amount: number | null;
  promised_amount: number | null;
  promised_count: number | null;
  delivered_count: number | null;
  /** null when no promise was made at the deciding scope. */
  promise_met: boolean | null;
  /** One sentence a non-coder can read. Never recompute this on the client. */
  decision_reason: string;
}

export class ConsultantCourseRateService {
  /** Every promise/rate scope this consultant has for one academic year. */
  static async listByConsultantYear(
    consultantId: string,
    academicYear: number,
  ): Promise<ConsultantScopeRate[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('consultant_commission_structures')
      .select('*, program:programs(id, program_name)')
      .eq('consultant_id', consultantId)
      .eq('academic_year', academicYear)
      .eq('is_active', true)
      .order('program_id', { ascending: true, nullsFirst: true });
    if (error) throw new Error(error.message);
    return (data || []) as ConsultantScopeRate[];
  }

  /**
   * Create or update ONE scope row. Two active rows for the same
   * (consultant, year, scope) are rejected by the database — a learner must
   * never have two rates.
   */
  static async upsertScope(
    input: UpsertConsultantScopeRateInput,
  ): Promise<ConsultantScopeRate> {
    const supabase = createClientSupabaseClient();
    const payload = {
      institution_id: input.institution_id,
      consultant_id: input.consultant_id,
      academic_year: input.academic_year,
      program_id: input.program_id,
      applies_to_all_programs: input.program_id === null,
      promised_count: input.promised_count,
      promised_amount: input.promised_amount,
      base_amount: input.base_amount,
      commission_type: 'flat',
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { data, error } = await (supabase as any)
        .from('consultant_commission_structures')
        .update(payload)
        .eq('id', input.id)
        .select('*, program:programs(id, program_name)')
        .single();
      if (error) throw new Error(error.message);
      return data as ConsultantScopeRate;
    }

    const { data, error } = await (supabase as any)
      .from('consultant_commission_structures')
      .insert({
        ...payload,
        // `name` is NOT NULL on the table and predates this feature. It is a
        // label only — never a rule input — so it is derived, not asked for.
        name:
          input.program_id === null
            ? `Yearly promise ${input.academic_year}`
            : `Course promise ${input.academic_year}`,
      })
      .select('*, program:programs(id, program_name)')
      .single();
    if (error) throw new Error(error.message);
    return data as ConsultantScopeRate;
  }

  /** Retire a scope row. Kept, not deleted — money config is an audit trail. */
  static async deactivateScope(id: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('consultant_commission_structures')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  /**
   * The decision for ONE learner's (consultant, course, year): which amount,
   * which scope decided it, and why. The rules live in SQL — never re-derive
   * this answer on the client.
   */
  static async resolve(
    academicYear: number,
    consultantId: string,
    programId: string,
  ): Promise<ResolvedConsultantRate | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc(
      'fn_resolve_consultant_course_rate',
      {
        p_year: academicYear,
        p_consultant_id: consultantId,
        p_program_id: programId,
      },
    );
    if (error) throw new Error(error.message);
    const rows = (data || []) as ResolvedConsultantRate[];
    return rows.length ? rows[0] : null;
  }
}
