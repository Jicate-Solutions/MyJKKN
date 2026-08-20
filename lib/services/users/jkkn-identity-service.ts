import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * JKKN permanent identity — client service.
 *
 * The JKKN ID is a permanent number a person keeps for life: six digits, a
 * dash, then a Damm check digit (348295-7). One shared pool covers learners
 * and team members, so someone who studies here and later joins the team
 * keeps the number they already had.
 *
 * The register SHIPS DORMANT. Nothing here issues anything — `issue` is
 * deliberately absent from this service, because issuance is a considered act
 * taken at confirmed admission or hire, not something a page offers.
 */

export type PersonKind = 'learner' | 'team_member' | 'both';

export interface ResolvedPerson {
  person_kind: PersonKind;
  person_id: string;
  /** Which identifier actually matched — roll_number, team_code, phone, name… */
  matched_on: string;
  full_name: string;
  photo_url: string | null;
  institution_name: string | null;
  /** Programme for a learner; designation for a team member. */
  programme: string | null;
  admission_year: number | null;
  status: string | null;
  /** null until a number has been issued to this person. */
  jkkn_id: string | null;
  roll_number?: string | null;
  register_number?: string | null;
  application_number?: string | null;
  team_code?: string | null;
}

export interface ResolveResult {
  query: string;
  ok: boolean;
  results: ResolvedPerson[];
  count?: number;
  /** Present when the query was a JKKN ID whose check digit did not match. */
  error?: 'invalid_check_digit';
  message?: string;
  /** Says whether the search covered the whole cluster or only the caller's institutions. */
  scope_note?: string;
  note?: string;
}

export interface DuplicateFinding {
  matched_on: 'name_and_dob' | 'phone';
  person_kind: PersonKind;
  person_id: string;
  full_name: string;
  jkkn_id: string | null;
  status?: string | null;
  roll_number?: string | null;
  team_code?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
}

export interface DuplicateCheckResult {
  verdict: 'clear' | 'review' | 'block';
  /** Always false. This guard reports; a human decides. */
  auto_merge: false;
  auto_merge_note: string;
  /** False today: MyJKKN stores no Aadhaar, so that dimension is unknown, not clear. */
  aadhaar_checked: boolean;
  aadhaar_note: string | null;
  checked: { name_and_dob: boolean; phone: boolean };
  findings: DuplicateFinding[];
}

/** Mirrors fn_jkkn_id_validate. Kept in step with the database on purpose:
 *  the database is the authority, this is only so the box can say "that is
 *  not a valid number" without a round trip. */
const DAMM: readonly number[][] = [
  [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
  [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
  [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
  [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
  [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
  [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
  [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
  [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
];

export function jkknIdCheckDigit(sixDigits: string): string | null {
  if (!/^[0-9]{6}$/.test(sixDigits)) return null;
  let interim = 0;
  for (const ch of sixDigits) interim = DAMM[interim][Number(ch)];
  return String(interim);
}

/** True only for a well-formed JKKN ID whose check digit is correct. */
export function isValidJkknId(id: string): boolean {
  const v = (id ?? '').trim();
  if (!/^[0-9]{6}-[0-9]$/.test(v)) return false;
  return jkknIdCheckDigit(v.slice(0, 6)) === v.slice(7);
}

/** True when the text looks like someone is typing a JKKN ID at all. */
export function looksLikeJkknId(query: string): boolean {
  return /^[0-9]{6}-[0-9]$/.test((query ?? '').trim());
}

export class JkknIdentityService {
  private static supabase = createClientSupabaseClient();

  /**
   * Universal lookup. Accepts a JKKN ID, roll number, Team Code, university
   * register number, application number, name fragment, phone or email.
   */
  static async resolvePerson(query: string): Promise<ResolveResult> {
    const q = (query ?? '').trim();
    if (q.length < 2) {
      return { query: q, ok: true, results: [], count: 0 };
    }

    const { data, error } = await (this.supabase as any).rpc('fn_resolve_person', {
      p_query: q,
    });

    if (error) {
      console.error('[users/jkkn-id] resolve failed:', error);
      throw new Error(error.message ?? 'Lookup failed');
    }

    const payload = (data ?? {}) as Partial<ResolveResult>;
    return {
      query: payload.query ?? q,
      ok: payload.ok ?? true,
      results: (payload.results ?? []) as ResolvedPerson[],
      count: payload.count ?? (payload.results?.length ?? 0),
      error: payload.error,
      message: payload.message,
      scope_note: payload.scope_note,
      note: payload.note,
    };
  }

  /**
   * Duplicate guard, run BEFORE a person is created.
   * Never merges anything — it returns evidence for a human to judge.
   */
  static async checkDuplicatePerson(input: {
    aadhaar?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    dateOfBirth?: string | null;
    phone?: string | null;
  }): Promise<DuplicateCheckResult> {
    const { data, error } = await (this.supabase as any).rpc('fn_check_duplicate_person', {
      p_aadhaar: input.aadhaar ?? null,
      p_first_name: input.firstName ?? null,
      p_last_name: input.lastName ?? null,
      p_dob: input.dateOfBirth ?? null,
      p_phone: input.phone ?? null,
    });

    if (error) {
      console.error('[users/jkkn-id] duplicate check failed:', error);
      throw new Error(error.message ?? 'Duplicate check failed');
    }

    return data as DuplicateCheckResult;
  }
}
