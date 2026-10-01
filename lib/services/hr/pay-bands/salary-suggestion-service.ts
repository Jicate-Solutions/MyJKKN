// lib/services/hr/pay-bands/salary-suggestion-service.ts
// ============================================================================
// One person's salary suggestion, worked out on the SERVER.
// ============================================================================
//
// SERVER ONLY (`import 'server-only'`), for the same reason as the pay band
// service beside it: the suggestion rule and the band are rupee figures in
// platform_policies, whose SELECT policy on main admits anyone signed in. The
// inputs come from hr_salary_suggestion_inputs() (20270512090000), which checks
// `hr.payroll.salary.view` in Postgres and returns the person only when their
// college passes role_has_institution_access() for the CALLER. The client
// passed in MUST be the caller's own session client — never a service-role one.
//
// The rule never leaves the database whole: the function hands back only the
// amount for THIS person's department (and the rounding step), and the route
// returns the worked-out suggestion (its lines, figure and reasons) for one
// person the caller may already see on Employee Salaries, not the rule itself.
//
// READ ONLY. Nothing here writes; a figure reaches a salary only through the
// Edit Salary dialog, saved by a person.
// ============================================================================

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { parsePayBandPolicy } from '@/lib/services/hr/pay-bands/pay-band-policy-service';
import { suggestSalary, type SalarySuggestion } from '@/lib/hr/salary-suggestion';

export const SALARY_SUGGESTION_RPC = 'hr_salary_suggestion_inputs' as const;

/** Postgres' insufficient_privilege, raised by the RPC when the key is missing. */
const INSUFFICIENT_PRIVILEGE = '42501';

/** The database refused the key: the route answers 403, not 500. */
export class SalarySuggestionAccessError extends Error {}
/** No such person in the caller's colleges (or not on the HR roster): 404. */
export class SalarySuggestionNotFoundError extends Error {}

/** The route's response body. */
export interface SalarySuggestionResponse {
  suggestion: SalarySuggestion;
  /** When the Director last changed the amounts. null = never published. */
  ruleUpdatedAt: string | null;
}

/**
 * One row of hr_salary_suggestion_inputs(). The rule arrives already reduced
 * to THIS person's department: `rule_rate` (rupees per year at JKKN, null when
 * the Director left the department empty) and `rule_round_to` — never the
 * other departments' amounts.
 */
export interface SalarySuggestionInputsRow {
  staff_uuid: string;
  institution_id: string;
  department_id: string | null;
  department_name: string | null;
  designation: string | null;
  date_of_joining: string | null;
  experience_years: number | null;
  has_extended_profile: boolean | null;
  monthly_gross: number | string | null;
  band: unknown;
  rule_rate: number | string | null;
  rule_round_to: number | string | null;
  rule_updated_at: string | null;
}

/** Today in India, as yyyy-MM-dd. The server decides the day, not the browser. */
export function todayInIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** numeric(12,2) arrives over PostgREST as a string. Unusable becomes null, never NaN. */
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Pure: one RPC row → the suggestion. Exported so it is testable without a database. */
export function suggestionFromRow(row: SalarySuggestionInputsRow, today: string): SalarySuggestionResponse {
  const suggestion = suggestSalary({
    person: {
      designation: row.designation,
      dateOfJoining: row.date_of_joining,
      experienceYears: toNumber(row.experience_years),
      hasExtendedProfile: row.has_extended_profile === true,
      currentMonthlyPay: toNumber(row.monthly_gross),
    },
    band: parsePayBandPolicy(row.band),
    department: {
      id: row.department_id ?? null,
      name: row.department_name ?? null,
      perYearAtJkkn: toNumber(row.rule_rate),
    },
    roundTo: toNumber(row.rule_round_to),
    today,
  });
  return { suggestion, ruleUpdatedAt: row.rule_updated_at ?? null };
}

export const SalarySuggestionService = {
  async forPerson(
    supabase: SupabaseClient,
    staffId: string,
    today: string = todayInIST()
  ): Promise<SalarySuggestionResponse> {
    const { data, error } = await supabase.rpc(SALARY_SUGGESTION_RPC, { p_staff_id: staffId });
    if (error) {
      if (error.code === INSUFFICIENT_PRIVILEGE) throw new SalarySuggestionAccessError(error.message);
      throw new Error(error.message);
    }
    const rows = (data ?? []) as SalarySuggestionInputsRow[];
    if (rows.length !== 1) {
      throw new SalarySuggestionNotFoundError(
        'This person is not on the HR roster of a college you can see.'
      );
    }
    return suggestionFromRow(rows[0], today);
  },
};
