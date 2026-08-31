import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * JKKN permanent identity — client service.
 *
 * The JKKN ID is a permanent number a person keeps for life: six digits, a
 * dash, then a Damm check digit (348295-7). One shared pool covers learners
 * and team members, so someone who studies here and later joins the team
 * keeps the number they already had.
 *
 * Nothing here issues anything — `issue` is deliberately absent from this
 * service. Since 2026-08-27 issuance is automatic (database triggers fire at
 * confirmed admission, at hire/activation, and at a custom-role grant —
 * migration 20260827110000); manual issuance stays behind fn_issue_jkkn_id
 * and the users.jkkn_id.issue key, and is not something a page offers.
 */

export type PersonKind =
  | 'learner'
  | 'team_member'
  | 'both'
  | 'associate'
  | 'external_participant';

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

/** One kind per directory call — the three populations have different columns. */
export type DirectoryKind = 'learner' | 'team_member' | 'associate';

/** Uniform row shape from fn_jkkn_directory; fields absent for a kind are null. */
export interface DirectoryRow {
  id: string;
  kind: PersonKind;
  name: string;
  photo_url: string | null;
  email: string | null;
  /** null until a number has been issued to this person. */
  jkkn_id: string | null;
  roll_number: string | null;
  register_number: string | null;
  team_code: string | null;
  designation: string | null;
  program: string | null;
  institution_name: string | null;
  admission_year: number | null;
  status: string | null;
  /** Index signature so DataTable's ExportableData constraint accepts rows. */
  [key: string]: string | number | boolean | null | undefined;
}

export interface DirectoryFilters {
  kind: DirectoryKind;
  institutionId?: string | null;
  /** learner: lifecycle_status value; team_member: 'active' | 'inactive'. */
  status?: string | null;
  issued?: 'issued' | 'not_issued' | null;
  /** learners only. */
  admissionYear?: number | null;
}

export interface DirectoryResult {
  rows: DirectoryRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface JkknKindStats {
  eligible: number;
  issued: number;
  pending: number;
  /** Learners only: unissued people phone-matching an unlinked team-member
   *  identity — the set every backfill withheld for a human. */
  review?: number;
}

export interface JkknStats {
  learners: JkknKindStats;
  team_members: JkknKindStats;
  associates: JkknKindStats;
  register: { total: number; both: number; external_participants: number; retired: number };
}

export interface ManualIssueResult {
  /** 'issued' = fresh number; 'linked_existing' = the other-kind identity was
   *  upgraded to 'both' (one person, one number); 'already_held' = no-op. */
  action: 'issued' | 'linked_existing' | 'already_held';
  jkkn_id: string;
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
   * Paginated, filterable directory — the default table on /users/jkkn-id.
   * Server-side everything (filter, sort, page) via fn_jkkn_directory, which
   * is gated on users.jkkn_id.view and institution-scoped for non-admins.
   */
  static async listDirectory(
    params: DirectoryFilters & {
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    }
  ): Promise<DirectoryResult> {
    const { data, error } = await (this.supabase as any).rpc('fn_jkkn_directory', {
      p_kind: params.kind,
      p_institution_id: params.institutionId ?? null,
      p_status: params.status ?? null,
      p_issued: params.issued ?? null,
      p_admission_year: params.admissionYear ?? null,
      p_search: params.search?.trim() || null,
      p_sort_by: params.sortBy || 'name',
      p_sort_order: params.sortOrder || 'asc',
      p_page: params.page ?? 1,
      p_limit: params.limit ?? 25,
    });

    if (error) {
      console.error('[users/jkkn-id] directory failed:', error);
      throw new Error(error.message ?? 'Directory failed');
    }

    const payload = (data ?? {}) as Partial<DirectoryResult>;
    return {
      rows: (payload.rows ?? []) as DirectoryRow[],
      total: Number(payload.total ?? 0),
      page: Number(payload.page ?? 1),
      limit: Number(payload.limit ?? params.limit ?? 25),
      total_pages: Number(payload.total_pages ?? 1),
    };
  }

  /**
   * The active JKKN ID for one person, or null. Backed by fn_jkkn_id_of,
   * which is open to ALL authenticated users on purpose — it returns only the
   * card-printed number for a row id the caller already reached through a
   * detail page's own authorisation. Kinds: learner (learners_profiles.id),
   * team_member (staff.id), profile (profiles.id — resolves learner/staff
   * bridges itself).
   */
  static async getIdOf(
    kind: 'learner' | 'team_member' | 'profile',
    refId: string
  ): Promise<string | null> {
    const { data, error } = await (this.supabase as any).rpc('fn_jkkn_id_of', {
      p_kind: kind,
      p_ref_id: refId,
    });
    if (error) {
      console.error('[identity] jkkn id lookup failed:', error);
      return null; // A detail page must render even if the chip cannot.
    }
    const value = ((data as string | null) ?? '').trim();
    return value === '' ? null : value;
  }

  /** Kind-wise issued/pending counts for the analytics cards. */
  static async getStats(): Promise<JkknStats> {
    const { data, error } = await (this.supabase as any).rpc('fn_jkkn_stats');
    if (error) {
      console.error('[users/jkkn-id] stats failed:', error);
      throw new Error(error.message ?? 'Stats failed');
    }
    return data as JkknStats;
  }

  /**
   * Manual "Issue ID". Server-gated on users.jkkn_id.issue; carries the same
   * email guard as the auto-issue triggers, so a graduate-turned-staff gets
   * LINKED to their existing number, never a duplicate.
   */
  static async issueManual(
    kind: DirectoryKind,
    refId: string
  ): Promise<ManualIssueResult> {
    const { data, error } = await (this.supabase as any).rpc('fn_jkkn_issue_manual', {
      p_kind: kind,
      p_ref_id: refId,
    });
    if (error) {
      console.error('[users/jkkn-id] manual issue failed:', error);
      throw new Error(error.message ?? 'Issue failed');
    }
    return data as ManualIssueResult;
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
