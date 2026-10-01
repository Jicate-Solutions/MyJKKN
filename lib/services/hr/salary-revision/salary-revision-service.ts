// lib/services/hr/salary-revision/salary-revision-service.ts
// ============================================================================
// Salary revisions on the SERVER: ask, check, decide, and the figures shown
// beside each request.
// ============================================================================
//
// TWO CLIENTS, ON PURPOSE.
//   - `supabase` is ALWAYS the caller's own session client. Every read and
//     every write goes through a SECURITY DEFINER function in
//     20270519090000_hr_salary_revision_requests.sql that decides, from the
//     caller's own keys and college/department, what they may see and do.
//   - The suggested figure (#4119) and the band warning (#4103) need the raw
//     pay band and suggestion rule, which must never reach a principal's or an
//     HOD's browser (#4111). hr_salary_revision_suggestion_inputs() is granted
//     to service_role ONLY, and this file calls it with a service-role client
//     for exactly the staff ids the caller's own scoped read has just
//     returned — never for an id taken from the request.
//
// What leaves the server: the suggested figure (or "rule not set"), and — for
// the Director only — "above the band by ₹X". Never the rule or the band.
// ============================================================================

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { parsePayBandPolicy } from '@/lib/services/hr/pay-bands/pay-band-policy-service';
import {
  suggestionFromRow,
  todayInIST,
  type SalarySuggestionInputsRow,
} from '@/lib/services/hr/pay-bands/salary-suggestion-service';
import { bandWarning, toAmount, type HeldApprovalRow, type SalaryRevisionRow } from '@/lib/hr/salary-revision';

export const RPC = {
  people: 'fn_hr_salary_revision_people',
  list: 'fn_hr_salary_revision_list',
  get: 'fn_hr_salary_revision_get',
  propose: 'fn_hr_salary_revision_propose',
  comment: 'fn_hr_salary_revision_comment',
  collegeDecide: 'fn_hr_salary_revision_college_decide',
  directorDecide: 'fn_hr_salary_revision_director_decide',
  approveMany: 'fn_hr_salary_revision_director_approve_many',
  applyDue: 'fn_hr_salary_revision_apply_due',
  held: 'fn_hr_salary_revision_held_approvals',
  inputs: 'hr_salary_revision_suggestion_inputs',
} as const;

export const OUTCOMES_TABLE = 'hr_salary_revision_outcomes' as const;

export type ListView = 'mine' | 'college' | 'director' | 'all';

/** A refusal from the database, carried to the route with its HTTP status. */
export class SalaryRevisionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly openRequestId: string | null = null,
  ) {
    super(message);
  }
}

/** Postgres SQLSTATE → HTTP status. Anything else is a 500. */
export function statusForCode(code: string | undefined): number {
  switch (code) {
    case '42501': return 403; // not allowed
    case 'P0002': return 404; // no such person / request
    case '22023': return 400; // bad figure or missing reason
    case '23505': return 409; // a request for this person is already waiting
    case '55000': return 409; // no longer waiting for this step
    default: return 500;
  }
}

function fail(error: { code?: string; message?: string; details?: string | null }): never {
  const status = statusForCode(error.code);
  const openId = error.code === '23505' && error.details && /^[0-9a-f-]{36}$/i.test(error.details)
    ? error.details : null;
  throw new SalaryRevisionError(error.message ?? 'Something went wrong', status, openId);
}

/** What the asker and the Director see beside a figure (ruling 13). */
export interface SuggestionNote {
  verdict: 'suggested' | 'rule_not_set' | 'no_suggestion';
  figure: number | null;
  /** One plain sentence when there is no figure. */
  note: string | null;
}

export interface EnrichedRow extends SalaryRevisionRow {
  suggestion: SuggestionNote;
  /** RULING 6. Only filled for the Director; null for everyone else. */
  band_warning: string | null;
}

/**
 * One row of hr_salary_revision_suggestion_inputs(): the same columns, in the
 * same order, as #4119's hr_salary_suggestion_inputs(). The rule arrives
 * already reduced to this person's department (rule_rate, rule_round_to);
 * the other departments' amounts never reach this code (30 Sep, per-department
 * ruling).
 */
type InputsRow = SalarySuggestionInputsRow;

/** Pure: #4119's worked-out suggestion, reduced to what may be shown. */
export function suggestionNote(inputs: InputsRow | undefined, today: string): SuggestionNote {
  if (!inputs) return { verdict: 'no_suggestion', figure: null, note: 'No suggestion for this person.' };
  const { suggestion } = suggestionFromRow(inputs, today);
  if (suggestion.verdict === 'suggested' && suggestion.suggested !== null) {
    return { verdict: 'suggested', figure: suggestion.suggested, note: null };
  }
  if (suggestion.verdict === 'rule_not_set') {
    return { verdict: 'rule_not_set', figure: null, note: 'Rule not set' };
  }
  return {
    verdict: 'no_suggestion',
    figure: null,
    note: suggestion.reasons[0]?.text ?? 'No suggestion for this person.',
  };
}

/** Pure: the Director's red warning for one request, from its inputs. */
export function bandWarningFor(row: SalaryRevisionRow, inputs: InputsRow | undefined): string | null {
  if (!inputs) return null;
  const figure = toAmount(row.final_monthly_gross) ?? toAmount(row.asked_monthly_gross);
  return bandWarning(row.designation, figure, parsePayBandPolicy(inputs.band));
}

type AdminClient = Pick<SupabaseClient, 'rpc'>;

/** The service-role read, for ids the caller's own scoped read returned. */
async function inputsFor(staffIds: string[], admin?: AdminClient): Promise<Map<string, InputsRow>> {
  const out = new Map<string, InputsRow>();
  const ids = Array.from(new Set(staffIds)).filter(Boolean);
  if (ids.length === 0) return out;
  const client = admin ?? (createServiceRoleClient() as unknown as AdminClient);
  const { data, error } = await client.rpc(RPC.inputs, { p_staff_ids: ids });
  if (error) throw new Error(`Could not work out the suggested figures: ${error.message}`);
  for (const r of (data ?? []) as InputsRow[]) out.set(r.staff_uuid, r);
  return out;
}

export async function enrich(
  rows: SalaryRevisionRow[],
  opts: { forDirector: boolean; admin?: AdminClient; today?: string },
): Promise<EnrichedRow[]> {
  const inputs = await inputsFor(rows.map((r) => r.staff_id), opts.admin);
  const today = opts.today ?? todayInIST();
  return rows.map((r) => ({
    ...r,
    suggestion: suggestionNote(inputs.get(r.staff_id), today),
    band_warning: opts.forDirector ? bandWarningFor(r, inputs.get(r.staff_id)) : null,
  }));
}

export interface PersonRow {
  staff_uuid: string;
  person_name: string;
  staff_code: string | null;
  designation: string | null;
  institution_id: string;
  institution_name: string | null;
  department_id: string | null;
  department_name: string | null;
  monthly_gross: number | string;
  is_self: boolean;
  open_request_id: string | null;
  open_request_status: string | null;
}

export const SalaryRevisionService = {
  /** The people the caller may ask for, with their pay now (ruling 8). */
  async people(supabase: SupabaseClient): Promise<PersonRow[]> {
    const { data, error } = await supabase.rpc(RPC.people);
    if (error) fail(error);
    return (data ?? []) as PersonRow[];
  },

  /** One person from the caller's own list, with #4119's figure beside it. */
  async person(supabase: SupabaseClient, staffId: string, admin?: AdminClient) {
    const people = await this.people(supabase);
    const person = people.find((p) => p.staff_uuid === staffId);
    if (!person) throw new SalaryRevisionError('This person is not in the list you can ask for.', 404);
    const inputs = await inputsFor([staffId], admin);
    return { person, suggestion: suggestionNote(inputs.get(staffId), todayInIST()) };
  },

  async list(supabase: SupabaseClient, view: ListView, admin?: AdminClient): Promise<EnrichedRow[]> {
    const { data, error } = await supabase.rpc(RPC.list, { p_view: view });
    if (error) fail(error);
    const rows = (data ?? []) as SalaryRevisionRow[];
    return enrich(rows, { forDirector: view === 'director', admin });
  },

  async get(supabase: SupabaseClient, id: string, forDirector: boolean, admin?: AdminClient) {
    const { data, error } = await supabase.rpc(RPC.get, { p_request_id: id });
    if (error) fail(error);
    if (!data) throw new SalaryRevisionError('No such request, or you cannot see it.', 404);
    const body = data as {
      request: SalaryRevisionRow;
      decision_note: { kind: 'stopped' | 'refused'; reason: string; created_at: string } | null;
      comments: Array<{ id: string; body: string; created_at: string; author_name: string }>;
    };
    const [request] = await enrich([body.request], { forDirector, admin });
    return { request, decisionNote: body.decision_note, comments: body.comments ?? [] };
  },

  async propose(supabase: SupabaseClient, input: { staffId: string; monthlyGross: number; reason: string }) {
    const { data, error } = await supabase.rpc(RPC.propose, {
      p_staff_id: input.staffId,
      p_monthly_gross: input.monthlyGross,
      p_reason: input.reason,
    });
    if (error) fail(error);
    return data as string;
  },

  async comment(supabase: SupabaseClient, id: string, body: string) {
    const { error } = await supabase.rpc(RPC.comment, { p_request_id: id, p_body: body });
    if (error) fail(error);
  },

  async collegeDecide(supabase: SupabaseClient, id: string, agree: boolean, reason: string | null) {
    const { data, error } = await supabase.rpc(RPC.collegeDecide, {
      p_request_id: id,
      p_agree: agree,
      p_reason: reason,
    });
    if (error) fail(error);
    return data as string;
  },

  async directorDecide(
    supabase: SupabaseClient,
    id: string,
    input: { approve: boolean; finalMonthlyGross: number | null; reason: string | null },
  ) {
    const { data, error } = await supabase.rpc(RPC.directorDecide, {
      p_request_id: id,
      p_approve: input.approve,
      p_final_monthly_gross: input.finalMonthlyGross,
      p_reason: input.reason,
    });
    if (error) fail(error);
    return data as string;
  },

  async approveMany(supabase: SupabaseClient, ids: string[]) {
    const { data, error } = await supabase.rpc(RPC.approveMany, { p_request_ids: ids });
    if (error) fail(error);
    return data as number;
  },

  /** 1 Oct 2026: yeses given before the rules that break them. Director list only (42501 otherwise). */
  async held(supabase: Pick<SupabaseClient, 'rpc'>) {
    const { data, error } = await supabase.rpc(RPC.held);
    if (error) fail(error);
    return (data ?? []) as HeldApprovalRow[];
  },

  /** Writes any approved raise whose start date has come. Idempotent. */
  async applyDue(supabase: Pick<SupabaseClient, 'rpc'>) {
    const { data, error } = await supabase.rpc(RPC.applyDue);
    if (error) fail(error);
    return (data ?? 0) as number;
  },

  /** The person's own outcomes — RLS returns only theirs, only after a yes. */
  async myOutcomes(supabase: SupabaseClient) {
    const { data, error } = await supabase
      .from(OUTCOMES_TABLE)
      .select('id, previous_monthly_gross, new_monthly_gross, is_cut, starts_on, created_at')
      .order('created_at', { ascending: false });
    if (error) fail(error);
    return (data ?? []) as Array<{
      id: string;
      previous_monthly_gross: number | string;
      new_monthly_gross: number | string;
      is_cut: boolean;
      starts_on: string;
      created_at: string;
    }>;
  },
};
