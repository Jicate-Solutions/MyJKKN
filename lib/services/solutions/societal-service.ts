// lib/services/solutions/societal-service.ts
// ---------------------------------------------------------------------------
// The community-engagement register: where a solution department records work
// it did for the community that produced no invoice.
//
// WHY THIS FILE EXISTS. The database half of this feature has been live and
// completely unreachable. `sh_community_engagements` was created by
// 20261013000000_societal_capture_and_activity_clock.sql, given an approval
// workflow by 20261019000000_societal_approval_and_status_review.sql, and has
// full RLS, four registered permission keys and two triggers — and zero rows,
// because nothing in the application could ever write one. The trigger
// `trg_community_engagement_touches_dept` sets
// `sh_solution_departments.last_activity_at` when an engagement is APPROVED,
// and nothing else in the schema writes that column. So an approval here is
// the only event in the entire platform that can keep a department out of
// dormancy on non-revenue work. Without this file, all 44 activated solution
// departments are permanently dormant by construction.
//
// NO API ROUTE SITS IN FRONT OF THIS, deliberately, and for two reasons. A
// route would run as the server client and hide the per-institution scoping
// the RLS policies exist to apply — the same reasoning as
// hooks/use-department-capabilities.ts. And Vercel route headroom on this
// project is 19; this feature adds no pages and no routes.
//
// THE STATE MACHINE IS THE DATABASE'S, NOT THIS FILE'S. `approval_status` is
// CHECK-constrained to exactly ('pending','approved','rejected') with DEFAULT
// 'pending' (20261019000000, section 1). There is no separate "submitted"
// state: creating the row IS the submission, and the INSERT policy hard-refuses
// any other starting value. Inventing a fourth value here would be rejected by
// the constraint at runtime.
// ---------------------------------------------------------------------------

import { BaseService } from '../base-service';

// ============================================
// THE VALUE LIST
// ============================================

/**
 * The 17 UN Sustainable Development Goals.
 *
 * `sdg_goals` is a text[] with no FK and no CHECK — Postgres cannot constrain
 * an element of an array — so this list is the only thing standing between the
 * column and free-text spelling drift. Codes are stored, not titles: a title
 * can be reworded, and `sdg_goals_addressed` counts DISTINCT stored entries,
 * so two spellings of goal 4 would count as two goals.
 *
 * Zero-padded so the stored array sorts in goal order as plain text.
 */
export const SDG_GOALS: ReadonlyArray<{ code: string; number: number; title: string }> = [
  { code: 'SDG_01', number: 1, title: 'No Poverty' },
  { code: 'SDG_02', number: 2, title: 'Zero Hunger' },
  { code: 'SDG_03', number: 3, title: 'Good Health and Well-being' },
  { code: 'SDG_04', number: 4, title: 'Quality Education' },
  { code: 'SDG_05', number: 5, title: 'Gender Equality' },
  { code: 'SDG_06', number: 6, title: 'Clean Water and Sanitation' },
  { code: 'SDG_07', number: 7, title: 'Affordable and Clean Energy' },
  { code: 'SDG_08', number: 8, title: 'Decent Work and Economic Growth' },
  { code: 'SDG_09', number: 9, title: 'Industry, Innovation and Infrastructure' },
  { code: 'SDG_10', number: 10, title: 'Reduced Inequalities' },
  { code: 'SDG_11', number: 11, title: 'Sustainable Cities and Communities' },
  { code: 'SDG_12', number: 12, title: 'Responsible Consumption and Production' },
  { code: 'SDG_13', number: 13, title: 'Climate Action' },
  { code: 'SDG_14', number: 14, title: 'Life Below Water' },
  { code: 'SDG_15', number: 15, title: 'Life on Land' },
  { code: 'SDG_16', number: 16, title: 'Peace, Justice and Strong Institutions' },
  { code: 'SDG_17', number: 17, title: 'Partnerships for the Goals' },
];

const SDG_BY_CODE = new Map(SDG_GOALS.map((g) => [g.code, g]));

/** Render a stored code for a reader. Unknown codes are shown as-is, never dropped. */
export function describeSdgGoal(code: string): string {
  const goal = SDG_BY_CODE.get(code);
  return goal ? `SDG ${goal.number} — ${goal.title}` : code;
}

/** Short form for a chip: "SDG 4". Unknown codes fall back to the raw value. */
export function shortSdgLabel(code: string): string {
  const goal = SDG_BY_CODE.get(code);
  return goal ? `SDG ${goal.number}` : code;
}

// ============================================
// TYPES
// ============================================

/** Exactly the values chk on sh_community_engagements.approval_status allows. */
export type EngagementApprovalStatus = 'pending' | 'approved' | 'rejected';

export const ENGAGEMENT_STATUS_LABELS: Record<EngagementApprovalStatus, string> = {
  pending: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Not approved',
};

export interface CommunityEngagement {
  id: string;
  department_id: string;
  institution_id: string | null;
  solution_id: string | null;
  title: string;
  description: string | null;
  engagement_date: string;
  hours_spent: number;
  beneficiaries_count: number;
  sdg_goals: string[];
  approval_status: EngagementApprovalStatus;
  review_note: string | null;
  approved_at: string | null;
  created_at: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  approved_by_name: string | null;
  solution_title: string | null;
}

export interface RecordEngagementInput {
  department_id: string;
  institution_id: string | null;
  solution_id?: string | null;
  title: string;
  description?: string | null;
  engagement_date: string;
  hours_spent: number;
  beneficiaries_count: number;
  sdg_goals: string[];
}

/** A solution this department leads, offered as an optional link on the form. */
export interface DepartmentSolutionOption {
  id: string;
  title: string;
  solution_code: string | null;
}

// ============================================
// FAILURE TRANSLATION — CLAUDE.md rule 27
// ============================================

/**
 * Thrown when `sh_community_engagements` is not present in the environment the
 * browser is talking to — i.e. 20261013000000 has not been applied there. The
 * panel turns this into an explicit "not installed yet" message rather than an
 * empty list, because an empty list and a missing table look identical to a
 * reader and mean completely different things.
 */
export class EngagementRegisterMissingError extends Error {
  constructor() {
    super('The community engagement register has not been created in this environment yet.');
    this.name = 'EngagementRegisterMissingError';
  }
}

/** PostgREST/Postgres codes that mean "this relation does not exist". */
const RELATION_MISSING_CODES = new Set(['42P01', 'PGRST205', 'PGRST106']);

function isRelationMissing(error: { code?: string | null } | null | undefined): boolean {
  return !!error?.code && RELATION_MISSING_CODES.has(error.code);
}

const RLS_DENIED = '42501';
const CHECK_VIOLATION = '23514';
/** A RAISE EXCEPTION from a trigger — guard_societal_self_approval uses this. */
const RAISED_BY_TRIGGER = 'P0001';

interface PostgrestLikeError {
  code?: string | null;
  message?: string;
}

/**
 * Rule 27: a refusal must say so in words the reader can act on. Postgres
 * answers an RLS denial with 42501 and "new row violates row-level security
 * policy for table ...", which tells a head of department nothing.
 */
function describeWriteFailure(error: PostgrestLikeError, action: 'record' | 'decide'): Error {
  if (isRelationMissing(error)) return new EngagementRegisterMissingError();

  // The self-approval guard raises its own sentence, already written for a
  // human ("Only a head of department can approve or reject..."). Pass it on
  // verbatim rather than replacing it with a worse paraphrase.
  if (error.code === RAISED_BY_TRIGGER && error.message) {
    return new Error(error.message);
  }

  if (error.code === RLS_DENIED) {
    return new Error(
      action === 'record'
        ? 'You do not have permission to record a community engagement for this ' +
          'department. Ask your Solutions Hub administrator for ' +
          'solutions.societal.submit on this institution.'
        : 'You do not have permission to approve or reject engagements for this ' +
          'department. Ask your Solutions Hub administrator for ' +
          'solutions.societal.approve on this institution.'
    );
  }

  if (error.code === CHECK_VIOLATION) {
    return new Error(
      'The database rejected these values. Hours and people reached cannot be ' +
        'negative, and the approval state must be one of pending, approved or rejected.'
    );
  }

  return new Error(error.message || 'The change could not be saved.');
}

/**
 * The silent half of rule 27, and the reason every write below asks for its row
 * back. An RLS *USING* clause does not raise — it filters. An UPDATE the
 * policy refuses returns HTTP 200 with an empty array, so the caller sees
 * success and the reader sees nothing change. Zero rows returned from a write
 * that named one row is a refusal, and has to be reported as one.
 */
function refusedSilently(action: 'decide'): Error {
  return new Error(
    action === 'decide'
      ? 'That decision was not saved. Either the entry has already been decided ' +
        'by someone else, or your role cannot approve engagements for this ' +
        "institution. Reload the list to see the entry's current state."
      : 'The change was not saved.'
  );
}

// Row shape PostgREST returns for the select below.
interface JoinedEngagementRow {
  id: string;
  department_id: string;
  institution_id: string | null;
  solution_id: string | null;
  title: string;
  description: string | null;
  engagement_date: string;
  hours_spent: number | string | null;
  beneficiaries_count: number | null;
  sdg_goals: unknown;
  approval_status: string;
  review_note: string | null;
  approved_at: string | null;
  created_at: string;
  recorded_by: string | null;
  recorder: { full_name: string | null } | null;
  approver: { full_name: string | null } | null;
  solution: { title: string | null } | null;
}

/** `hours_spent` is numeric(8,2); PostgREST hands numerics back as strings. */
function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** text[] with a DEFAULT '{}' can still hold NULL on a hand-written row. */
function readSdgCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function isKnownStatus(value: string): value is EngagementApprovalStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected';
}

const ENGAGEMENT_SELECT = `
  id, department_id, institution_id, solution_id, title, description,
  engagement_date, hours_spent, beneficiaries_count, sdg_goals,
  approval_status, review_note, approved_at, created_at, recorded_by,
  recorder:profiles!recorded_by(full_name),
  approver:profiles!approved_by(full_name),
  solution:sh_solutions!solution_id(title)
`;

function mapRow(row: JoinedEngagementRow): CommunityEngagement {
  return {
    id: row.id,
    department_id: row.department_id,
    institution_id: row.institution_id,
    solution_id: row.solution_id,
    title: row.title,
    description: row.description,
    engagement_date: row.engagement_date,
    hours_spent: toNumber(row.hours_spent),
    beneficiaries_count: row.beneficiaries_count ?? 0,
    sdg_goals: readSdgCodes(row.sdg_goals),
    approval_status: isKnownStatus(row.approval_status)
      ? row.approval_status
      : // A value outside the CHECK cannot exist today, but reporting an unknown
        // state as "pending" would be a lie with consequences — it drives who
        // may act on the row. Surface it as pending-shaped only after the panel
        // has been given the raw string is not worth the complexity; the CHECK
        // makes this branch unreachable.
        'pending',
    review_note: row.review_note,
    approved_at: row.approved_at,
    created_at: row.created_at,
    recorded_by: row.recorded_by,
    recorded_by_name: row.recorder?.full_name ?? null,
    approved_by_name: row.approver?.full_name ?? null,
    solution_title: row.solution?.title ?? null,
  };
}

// ============================================
// SERVICE
// ============================================

export class SocietalService extends BaseService {
  /**
   * Every engagement recorded against one department that the caller's RLS
   * scope allows them to see. Newest work first.
   *
   * An empty array here is genuinely ambiguous under RLS — a SELECT policy
   * filters rather than raising, so "no engagements recorded" and "you cannot
   * see this department's engagements" both arrive as `[]`. The panel says so
   * rather than claiming the register is empty.
   */
  static async listByDepartment(departmentId: string): Promise<CommunityEngagement[]> {
    const { data, error } = await this.supabase
      .from('sh_community_engagements')
      .select(ENGAGEMENT_SELECT)
      .eq('department_id', departmentId)
      .order('engagement_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (isRelationMissing(error)) throw new EngagementRegisterMissingError();
      throw new Error(error.message || 'The engagement register could not be read.');
    }

    return ((data ?? []) as unknown as JoinedEngagementRow[]).map(mapRow);
  }

  /**
   * Solutions this department leads, offered as the optional link on the form.
   * Optional is the point: most community work has no hub solution behind it,
   * which is exactly why the column is nullable.
   */
  static async listDepartmentSolutions(departmentId: string): Promise<DepartmentSolutionOption[]> {
    const { data, error } = await this.supabase
      .from('sh_solutions')
      .select('id, title, solution_code')
      .eq('lead_department_id', departmentId)
      .order('created_at', { ascending: false })
      .limit(100);

    // A failure here must not block recording — the link is optional. Return an
    // empty option list and let the form save without one.
    if (error) return [];
    return (data ?? []) as DepartmentSolutionOption[];
  }

  /**
   * Record an engagement. It is created `pending` because the INSERT policy
   * refuses any other starting value, and because only an APPROVED engagement
   * moves the department's activity clock — an unreviewed entry that could
   * clear a dormant flag would make the review decorative.
   */
  static async record(input: RecordEngagementInput): Promise<CommunityEngagement> {
    const title = input.title.trim();
    if (!title) throw new Error('Give the engagement a title.');
    if (!input.engagement_date) throw new Error('Give the engagement a date.');
    if (!Number.isFinite(input.hours_spent) || input.hours_spent < 0) {
      throw new Error('Hours spent cannot be negative.');
    }
    if (!Number.isInteger(input.beneficiaries_count) || input.beneficiaries_count < 0) {
      throw new Error('People reached must be a whole number and cannot be negative.');
    }

    const unknownGoals = input.sdg_goals.filter((code) => !SDG_BY_CODE.has(code));
    if (unknownGoals.length > 0) {
      throw new Error(`Not a UN Sustainable Development Goal: ${unknownGoals.join(', ')}.`);
    }

    // recorded_by is what the UPDATE policy uses to let a submitter correct
    // their own pending entry, so it has to be the signed-in user and not a
    // value the form supplies.
    const { data: authData } = await this.supabase.auth.getUser();
    const userId: string | null = authData?.user?.id ?? null;
    if (!userId) {
      throw new Error('Your session has expired. Sign in again to record an engagement.');
    }

    const { data, error } = await this.supabase
      .from('sh_community_engagements')
      .insert({
        department_id: input.department_id,
        institution_id: input.institution_id,
        solution_id: input.solution_id ?? null,
        title,
        description: input.description?.trim() || null,
        engagement_date: input.engagement_date,
        hours_spent: input.hours_spent,
        beneficiaries_count: input.beneficiaries_count,
        sdg_goals: Array.from(new Set(input.sdg_goals)).sort(),
        recorded_by: userId,
        approval_status: 'pending',
      })
      .select(ENGAGEMENT_SELECT)
      .single();

    if (error) throw describeWriteFailure(error as PostgrestLikeError, 'record');
    if (!data) throw refusedSilently('decide');

    return mapRow(data as unknown as JoinedEngagementRow);
  }

  /**
   * Approve or reject a pending engagement.
   *
   * `approved_by` and `approved_at` are NOT sent: the BEFORE UPDATE trigger
   * `guard_societal_self_approval` sets them from `auth.uid()` itself, and it
   * refuses the status change outright for anyone without
   * `solutions.societal.approve`. Sending them here would be a claim the
   * database is about to overwrite anyway.
   *
   * The `.select()` is load-bearing. A row the UPDATE policy filters out comes
   * back as an empty array with no error, which without this check would render
   * as a successful decision that changed nothing.
   */
  static async decide(
    engagementId: string,
    decision: Extract<EngagementApprovalStatus, 'approved' | 'rejected'>,
    reviewNote?: string | null
  ): Promise<CommunityEngagement> {
    if (decision === 'rejected' && !reviewNote?.trim()) {
      throw new Error('Say why it was not approved, so the person who recorded it can fix it.');
    }

    const { data, error } = await this.supabase
      .from('sh_community_engagements')
      .update({
        approval_status: decision,
        review_note: reviewNote?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', engagementId)
      .eq('approval_status', 'pending')
      .select(ENGAGEMENT_SELECT);

    if (error) throw describeWriteFailure(error as PostgrestLikeError, 'decide');

    const rows = (data ?? []) as unknown as JoinedEngagementRow[];
    if (rows.length === 0) throw refusedSilently('decide');

    return mapRow(rows[0]);
  }
}
