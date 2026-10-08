// lib/services/hr/pay-bands/candidate-salary-suggestion-service.ts
// ============================================================================
// One candidate's suggested starting salary, worked out on the SERVER.
// ============================================================================
//
// SERVER ONLY (`import 'server-only'`), for the same reason as
// salary-suggestion-service.ts beside it: the band and the Director's amounts
// are rupee figures in platform_policies, and anything a 'use client' file
// imports ships in a public /_next/static chunk. The inputs come from
// hr_candidate_salary_suggestion_inputs() (20271008200600), which checks
// `hr.payroll.salary.view` in Postgres and returns the candidate only when the
// caller may already see them (the candidate table's own SELECT predicate).
// The client passed in MUST be the caller's own session client.
//
// What leaves the server: the worked-out lines, the figure, the "above band by"
// amount and the reasons. Not the band, not the rule, not another
// department's amount.
//
// READ ONLY. Nothing here writes; a figure reaches a package only through the
// Propose Package dialog, saved by a person.
// ============================================================================

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { parsePayBandPolicy } from '@/lib/services/hr/pay-bands/pay-band-policy-service';
import {
  suggestCandidateSalary,
  type CandidateSalarySuggestion,
} from '@/lib/hr/candidate-salary-suggestion';

export const CANDIDATE_SALARY_SUGGESTION_RPC = 'hr_candidate_salary_suggestion_inputs' as const;

/** Postgres' insufficient_privilege, raised by the RPC when the key is missing. */
const INSUFFICIENT_PRIVILEGE = '42501';

/** The database refused the key: the route answers 403. */
export class CandidateSalarySuggestionAccessError extends Error {}
/** No such candidate, or not one the caller may see: 404. */
export class CandidateSalarySuggestionNotFoundError extends Error {}

/** The route's response body. */
export interface CandidateSalarySuggestionResponse {
  suggestion: CandidateSalarySuggestion;
  /** When the Director last changed the amounts. null = never published. */
  ruleUpdatedAt: string | null;
}

/** One row of hr_candidate_salary_suggestion_inputs(). */
export interface CandidateSalarySuggestionInputsRow {
  candidate_uuid: string;
  institution_id: string | null;
  designation_id: string | null;
  designation: string | null;
  department_id: string | null;
  department_name: string | null;
  prior_experience_years: number | string | null;
  band: unknown;
  rule_rate: number | string | null;
  rule_round_to: number | string | null;
  rule_updated_at: string | null;
}

/** numeric arrives over PostgREST as a string. Unusable becomes null, never NaN. */
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Pure: one RPC row → the suggestion. Exported so it is testable without a database. */
export function candidateSuggestionFromRow(
  row: CandidateSalarySuggestionInputsRow
): CandidateSalarySuggestionResponse {
  const suggestion = suggestCandidateSalary({
    institutionId: row.institution_id ?? null,
    designation: row.designation ?? null,
    department: {
      id: row.department_id ?? null,
      name: row.department_name ?? null,
      perYear: toNumber(row.rule_rate),
    },
    priorExperienceYears: toNumber(row.prior_experience_years),
    band: parsePayBandPolicy(row.band),
    roundTo: toNumber(row.rule_round_to),
  });
  return { suggestion, ruleUpdatedAt: row.rule_updated_at ?? null };
}

export const CandidateSalarySuggestionService = {
  async forCandidate(
    supabase: SupabaseClient,
    candidateId: string
  ): Promise<CandidateSalarySuggestionResponse> {
    const { data, error } = await supabase.rpc(CANDIDATE_SALARY_SUGGESTION_RPC, {
      p_candidate_id: candidateId,
    });
    if (error) {
      if (error.code === INSUFFICIENT_PRIVILEGE) throw new CandidateSalarySuggestionAccessError(error.message);
      throw new Error(error.message);
    }
    const rows = (data ?? []) as CandidateSalarySuggestionInputsRow[];
    if (rows.length !== 1) {
      throw new CandidateSalarySuggestionNotFoundError('This candidate is not one you can see.');
    }
    return candidateSuggestionFromRow(rows[0]);
  },
};
