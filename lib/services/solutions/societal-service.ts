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
import type {
  AddParticipantsOutcome,
  CommunityClusterTotals,
  CommunityCollegeEngagementRow,
  CommunityEngagementParticipant,
  ParticipantConfirmationStatus,
} from '@/types/community-collaboration';

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
// TIME
// ============================================

/**
 * Today, as YYYY-MM-DD in the reader's own timezone.
 *
 * Deliberately NOT `new Date().toISOString().slice(0, 10)`, which is the UTC
 * date: between 00:00 and 05:30 IST that string is YESTERDAY, so a camp run this
 * morning would be refused as "in the future" and the form's own max would
 * forbid today. `engagement_date` is a plain `date` column with no timezone, so
 * the calendar day the reader is living in is the one to compare against.
 */
export function todayLocalISO(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * One sentence, used by the form and by the service, so the two cannot drift
 * into telling a reader different things about the same refusal.
 */
export const FUTURE_ENGAGEMENT_DATE_MESSAGE =
  'Community work cannot be recorded before it happens. Pick today or an earlier date.';

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

/** The four states sh_solution_departments.status is CHECK-constrained to. */
export type SolutionDepartmentStatus = 'pending_approval' | 'active' | 'at_risk' | 'dormant';

export const DEPARTMENT_STATUS_LABELS: Record<SolutionDepartmentStatus, string> = {
  pending_approval: 'waiting for approval',
  active: 'active',
  at_risk: 'at risk',
  dormant: 'dormant',
};

/**
 * What the department's activity clock says AFTER a decision — read back rather
 * than assumed.
 *
 * An approval does NOT reliably make a department active, and saying it does is
 * a claim the database frequently does not honour. `on_societal_activity_touch_department()`
 * returns early when the department has no `sh_solution_departments` row at all;
 * it moves `last_activity_at` with GREATEST, so a backdated entry can move
 * nothing; and it only sets `status = 'active'` when the previous status was
 * `at_risk` or `dormant` AND the engagement date is inside 30 days. Three of
 * those four paths leave the department exactly where it was.
 */
export type DepartmentActivityReadout =
  | { kind: 'read'; status: SolutionDepartmentStatus | string; last_activity_at: string | null }
  /** The department is not registered as a solution department, so no clock exists. */
  | { kind: 'not_a_solution_department' }
  /** The row could not be read from here — claim nothing about it. */
  | { kind: 'unreadable' }
  /**
   * Nobody asked. A rejection cannot move the clock — the trigger's WHEN clause
   * is `NEW.approval_status = 'approved'` — so there is nothing to read back,
   * which is a different fact from having tried and failed.
   */
  | { kind: 'not_read' };

/** What `decide()` hands back: the row it changed, and what that changed. */
export interface EngagementDecisionOutcome {
  engagement: CommunityEngagement;
  department_activity: DepartmentActivityReadout;
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
/** A referenced row is gone — solution_id, department_id or institution_id. */
const FK_VIOLATION = '23503';
/** A NOT NULL column arrived empty. */
const NOT_NULL_VIOLATION = '23502';
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

  // 42501 does NOT prove the caller lacks the write key, on EITHER action, and
  // neither message may say it does. PostgREST asks for the affected row back,
  // so `INSERT ... RETURNING` and `UPDATE ... RETURNING` both filter that row
  // through the SELECT policy: a caller can pass the write policy, fail SELECT
  // on the row being returned, and get 42501 with the whole statement rolled
  // back.
  //
  // On RECORD that is live today — a submit-only Senior Learner hits it on every
  // attempt, and the old text sent them to request `solutions.societal.submit`,
  // the permission they already hold. The worst kind of refusal message:
  // confidently wrong, and it makes the reader doubt their own grid.
  //
  // On DECIDE it is unreachable under the CURRENT grid, because every `approve`
  // holder also holds `view` — which is precisely the "theoretical gap meets a
  // changed permission grid" that 20261120143000's own comment (b) warns about,
  // and how the four lockouts in this feature happened. Both branches therefore
  // name what was refused and let an administrator work out which half, rather
  // than asserting which key is missing.
  //
  // 20261120143000 adds the missing own-row SELECT branch; until it is applied
  // these messages are the only thing standing between a submitter and a wild
  // goose chase.
  if (error.code === RLS_DENIED) {
    return new Error(
      action === 'record'
        ? 'Nothing was recorded — the database refused the save. Saving has to ' +
          'write the row AND read it back, and this register grants those two ' +
          'separately, so this means either your role cannot record community ' +
          'work for this institution, or it can record but cannot read the entry ' +
          'back. Show this to your Solutions Hub administrator: writing needs ' +
          'solutions.societal.submit or solutions.societal.record, reading back ' +
          'needs solutions.societal.view.'
        : 'The decision was not saved — the database refused it. Deciding has to ' +
          'update the row AND read it back, and this register grants those two ' +
          'separately, so this means either your role cannot approve or reject ' +
          'engagements for this institution, or it can decide but cannot read the ' +
          'entry back. Show this to your Solutions Hub administrator: deciding ' +
          'needs solutions.societal.approve, reading back needs ' +
          'solutions.societal.view.'
    );
  }

  if (error.code === CHECK_VIOLATION) {
    return new Error(
      'The database rejected these values. Hours and people reached cannot be ' +
        'negative, and the approval state must be one of pending, approved or rejected.'
    );
  }

  // 23503 and 23502 are reachable from a form that was open while something
  // moved underneath it: a linked solution deleted, a department retired, an
  // institution unset. Postgres answers both with a sentence naming a
  // constraint ("violates foreign key constraint
  // sh_community_engagements_solution_id_fkey"), which tells a head of
  // department nothing they can act on.
  if (error.code === FK_VIOLATION) {
    return new Error(
      'This entry points at a record that no longer exists — most likely the ' +
        'linked solution or the department was removed while this form was open. ' +
        'Reload the page and record it again.'
    );
  }

  if (error.code === NOT_NULL_VIOLATION) {
    return new Error(
      'A value the register requires arrived empty, so nothing was saved. Check ' +
        'that the title and the date are filled in, then try again.'
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
function refusedSilently(action: 'record' | 'decide'): Error {
  if (action === 'record') {
    return new Error(
      'The engagement was not saved. The database accepted the request and then ' +
        'returned no row. Nothing was recorded — show this to your Solutions Hub ' +
        'administrator, who can check the register\'s insert and select rules for ' +
        'your role on this institution.'
    );
  }
  return new Error(
    'That decision was not saved. Either the entry has already been decided ' +
      'by someone else, or your role cannot approve engagements for this ' +
      "institution. Reload the list to see the entry's current state."
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
// JOINT DEPARTMENTS — the participants half
// ============================================

/**
 * Thrown when `sh_community_engagement_participants` is not present in the
 * environment the browser is talking to — i.e. 20261226113000 has not been
 * applied there, although the register itself has.
 *
 * A SEPARATE error from `EngagementRegisterMissingError` because it is a
 * separate fact and has a separate remedy. The two migrations ship apart, so
 * "the register exists but cannot yet record joint work" is a real state of a
 * real environment, and reporting it as "the register does not exist" would
 * send an administrator to apply a migration that is already applied.
 */
export class EngagementParticipantsMissingError extends Error {
  constructor() {
    super(
      'Joint departments have not been set up in this environment yet — the ' +
        'community engagement register is here, but the table that records which ' +
        'departments took part is not.'
    );
    this.name = 'EngagementParticipantsMissingError';
  }
}

/** A row already exists for this (engagement, department) pair. */
const UNIQUE_VIOLATION = '23505';

type ParticipantAction = 'name' | 'confirm' | 'decline' | 'link';

/**
 * Rule 27 again, for the participant writes. The same reasoning as
 * `describeWriteFailure`: Postgres answers an RLS denial with 42501 and a
 * sentence naming a policy, which tells a head of department nothing they can
 * act on.
 */
function describeParticipantFailure(
  error: PostgrestLikeError,
  action: ParticipantAction
): Error {
  if (isRelationMissing(error)) {
    // `link` writes to the parent register, so a missing relation there means
    // the register itself is absent; the other three write to the participants
    // table. Getting this backwards would name the wrong migration.
    return action === 'link'
      ? new EngagementRegisterMissingError()
      : new EngagementParticipantsMissingError();
  }

  if (error.code === RAISED_BY_TRIGGER && error.message) return new Error(error.message);

  if (error.code === UNIQUE_VIOLATION) {
    return new Error(
      'That department is already named on this initiative. Reload the list to ' +
        'see where its confirmation has got to.'
    );
  }

  if (error.code === RLS_DENIED) {
    switch (action) {
      case 'name':
        return new Error(
          'No departments were added — the database refused it. Naming another ' +
            'department on an initiative needs the same standing as editing the ' +
            'initiative itself: approving for this institution, or being the ' +
            'person who recorded it while it is still waiting for approval.'
        );
      case 'confirm':
      case 'decline':
        return new Error(
          'That answer was not saved — the database refused it. Only your own ' +
            "department's approver can answer for your department, and it needs the " +
            'Confirm Community Participation permission. Show this to your ' +
            'Solutions Hub administrator: the key is solutions.societal.confirm.'
        );
      case 'link':
        return new Error(
          'The link was not saved — the database refused it. Linking an ' +
            'initiative to an event changes the initiative, so it needs the same ' +
            'standing as editing it.'
        );
    }
  }

  if (error.code === FK_VIOLATION) {
    return new Error(
      action === 'link'
        ? 'That event no longer exists — it was most likely removed while this ' +
          'page was open. Reload and pick again.'
        : 'This points at a record that no longer exists — most likely the ' +
          'department or the initiative was removed while this page was open. ' +
          'Reload the page and try again.'
    );
  }

  if (error.code === CHECK_VIOLATION) {
    return new Error(
      'The database rejected these values. Hours cannot be negative, and a ' +
        'department can only be pending, confirmed or declined.'
    );
  }

  return new Error(error.message || 'The change could not be saved.');
}

/**
 * The silent half, again — and it bites harder here than anywhere else in this
 * file. The UPDATE policy on the participants table is what decision D3 is made
 * of, and an RLS USING clause does not raise, it filters: an answer the policy
 * refuses comes back as HTTP 200 and an empty array. Without this, a department
 * head would press Confirm, see no error, and their department would still be
 * counted nowhere.
 */
function participantRefusedSilently(action: ParticipantAction): Error {
  switch (action) {
    case 'name':
      return new Error(
        'No departments were added. The database accepted the request and then ' +
          'returned no rows, which means nothing was written — show this to your ' +
          "Solutions Hub administrator, who can check the register's rules for " +
          'your role on this institution.'
      );
    case 'confirm':
    case 'decline':
      return new Error(
        'Nothing was changed. Your department does not appear to be named on ' +
          'this initiative — whoever recorded it has to name your department ' +
          'before you can answer for it. If you believe it was named, reload the ' +
          'page to see the current list.'
      );
    case 'link':
      return new Error(
        'The link was not saved. Either the initiative has been changed by ' +
          'someone else, or your role cannot edit it. Reload to see its current ' +
          'state.'
      );
  }
}

/**
 * PostgREST/Postgres codes that mean "this function does not exist".
 *
 * Distinct from `RELATION_MISSING_CODES`: a missing FUNCTION and a missing
 * TABLE arrive with different codes, and the read functions are the only thing
 * in this feature that can be missing while the table is present — that is
 * exactly what a half-applied migration looks like.
 */
const FUNCTION_MISSING_CODES = new Set(['42883', 'PGRST202']);

/**
 * Both read functions RAISE EXCEPTION rather than returning an empty result
 * when the caller lacks `solutions.societal.view`, and the sentence they raise
 * is already written for a human. Pass it through instead of replacing it with
 * a worse paraphrase — and never let it become an empty totals object, which
 * would render as "the cluster has done no community work".
 */
function describeTotalsFailure(error: PostgrestLikeError): Error {
  if (FUNCTION_MISSING_CODES.has(error.code ?? '') || isRelationMissing(error)) {
    return new EngagementParticipantsMissingError();
  }
  if (error.code === RAISED_BY_TRIGGER && error.message) return new Error(error.message);
  return new Error(error.message || 'The community engagement totals could not be read.');
}

const PARTICIPANT_SELECT = `
  id, engagement_id, department_id, institution_id, hours_contributed, is_lead,
  confirmation_status, confirmed_by, confirmed_at, decline_note,
  created_at, updated_at,
  department:departments!department_id(department_name, display_name),
  institution:institutions!institution_id(name, display_name),
  confirmer:profiles!confirmed_by(full_name)
`;

interface JoinedParticipantRow {
  id: string;
  engagement_id: string;
  department_id: string;
  institution_id: string | null;
  hours_contributed: number | string | null;
  is_lead: boolean | null;
  confirmation_status: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  decline_note: string | null;
  created_at: string;
  updated_at: string;
  department: { department_name: string | null; display_name: string | null } | null;
  institution: { name: string | null; display_name: string | null } | null;
  confirmer: { full_name: string | null } | null;
}

/**
 * Like `toNumber`, but NULL survives.
 *
 * `hours_contributed` is nullable on purpose — "confirmed without stating
 * hours" is a different fact from "confirmed zero hours" — so the 0 that
 * `toNumber` returns for an absent value would invent a claim the department
 * never made.
 */
function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isParticipantStatus(value: string): value is ParticipantConfirmationStatus {
  return value === 'pending' || value === 'confirmed' || value === 'declined';
}

function mapParticipantRow(row: JoinedParticipantRow): CommunityEngagementParticipant {
  return {
    id: row.id,
    engagement_id: row.engagement_id,
    department_id: row.department_id,
    institution_id: row.institution_id,
    hours_contributed: toNullableNumber(row.hours_contributed),
    is_lead: row.is_lead === true,
    // The CHECK constraint makes anything else unreachable. If it were reached,
    // reporting it as 'confirmed' would add a department to the shared-credit
    // totals on the strength of a value nobody understands, so an unknown state
    // reads as the one that counts nowhere.
    confirmation_status: isParticipantStatus(row.confirmation_status)
      ? row.confirmation_status
      : 'pending',
    confirmed_by: row.confirmed_by,
    confirmed_at: row.confirmed_at,
    decline_note: row.decline_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // `display_name` first, then the formal name — the same order
    // fn_community_college_totals() uses for a college, so a department reads
    // the same on this list as its college does on the totals. Null when the
    // join returned nothing, which under RLS means "not readable from here" and
    // is a different fact from "unnamed": no placeholder is invented for it.
    department_name: row.department?.display_name || row.department?.department_name || null,
    institution_name: row.institution?.display_name || row.institution?.name || null,
    confirmed_by_name: row.confirmer?.full_name ?? null,
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

    // This used to `return []` on any error. An empty picker is a STATEMENT —
    // "this department leads no solutions" — and a failed read is not entitled
    // to make it. The link is still optional: the form catches this, says the
    // list could not be loaded, and lets the entry be saved unlinked.
    if (error) {
      if (isRelationMissing(error)) throw new EngagementRegisterMissingError();
      throw new Error(
        error.message
          ? `The list of this department's solutions could not be read: ${error.message}`
          : "The list of this department's solutions could not be read."
      );
    }
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
    // A future date is not a typo with cosmetic consequences. `engagement_date`
    // is what `on_societal_activity_touch_department()` writes into
    // `last_activity_at`, and `update_department_statuses()` measures dormancy
    // from that column — so one entry dated 2030 holds the department out of
    // dormancy until 2030, and the sweep that exists to catch silent departments
    // never fires for it again.
    //
    // LIMIT, STATED RATHER THAN IMPLIED: this service runs in the browser (the
    // static `createClientSupabaseClient()` singleton), so this and the form's
    // `max` are the same trust boundary — anyone posting straight to PostgREST
    // clears both. The only control that cannot be walked around is a CHECK on
    // the column, which needs a migration this change is not authorised to write.
    if (input.engagement_date > todayLocalISO()) {
      throw new Error(FUTURE_ENGAGEMENT_DATE_MESSAGE);
    }
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
    if (!data) throw refusedSilently('record');

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
  ): Promise<EngagementDecisionOutcome> {
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

    const engagement = mapRow(rows[0]);

    // Read what the decision actually did, instead of announcing what it was
    // supposed to do. The trigger runs inside the UPDATE's own transaction, so
    // by the time that statement has returned this read sees the committed
    // result — including the common case where it committed no change at all.
    // A rejection is not read back because it cannot move anything.
    const department_activity: DepartmentActivityReadout =
      decision === 'approved'
        ? await this.readDepartmentActivity(engagement.department_id)
        : { kind: 'not_read' };

    return { engagement, department_activity };
  }

  /**
   * The department's activity clock, read back so the caller can report what
   * happened rather than assert it.
   *
   * This one DOES collapse its failures, and that is the opposite of the defect
   * fixed in `listDepartmentSolutions`: there, a swallowed error became a claim
   * ("no solutions"); here, every failure resolves to `unreadable`, which is the
   * instruction to claim NOTHING. `sh_solution_departments` is readable by every
   * authenticated user (`USING (true)`), so `unreadable` in practice means
   * `last_activity_at` is absent — the environment is behind on
   * 20261013000000 — and that is precisely when a confident sentence would lie.
   */
  static async readDepartmentActivity(departmentId: string): Promise<DepartmentActivityReadout> {
    const { data, error } = await this.supabase
      .from('sh_solution_departments')
      .select('status, last_activity_at')
      .eq('department_id', departmentId)
      .maybeSingle();

    if (error) return { kind: 'unreadable' };
    // uq_solution_department makes department_id unique, so no row here means
    // the department was never activated as a solution department — nothing in
    // the schema is tracking its dormancy, and approving work cannot change that.
    if (!data) return { kind: 'not_a_solution_department' };

    const row = data as { status?: string | null; last_activity_at?: string | null };
    if (typeof row.status !== 'string') return { kind: 'unreadable' };

    return {
      kind: 'read',
      status: row.status,
      last_activity_at: row.last_activity_at ?? null,
    };
  }

  // ==========================================
  // JOINT DEPARTMENTS
  // ==========================================

  /**
   * Every department named on one initiative, with where its confirmation has
   * got to. Lead first, then in the order they were named.
   *
   * An empty array is ambiguous in exactly the way `listByDepartment`'s is: the
   * SELECT policy filters rather than raising, so "nobody has been named" and
   * "you cannot read this initiative" both arrive as `[]`. The caller should
   * say so rather than claim the initiative was run by nobody.
   */
  static async listParticipants(engagementId: string): Promise<CommunityEngagementParticipant[]> {
    const { data, error } = await this.supabase
      .from('sh_community_engagement_participants')
      .select(PARTICIPANT_SELECT)
      .eq('engagement_id', engagementId)
      .order('is_lead', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      if (isRelationMissing(error)) throw new EngagementParticipantsMissingError();
      throw new Error(
        error.message
          ? `The list of participating departments could not be read: ${error.message}`
          : 'The list of participating departments could not be read.'
      );
    }

    return ((data ?? []) as unknown as JoinedParticipantRow[]).map(mapParticipantRow);
  }

  /**
   * Name departments as having taken part. They land `pending` — naming a
   * department is a CLAIM, and only that department can turn it into a fact.
   *
   * This never writes `confirmed`, and could not if it tried: the BEFORE INSERT
   * trigger demotes a client-supplied `confirmed` back to `pending`. It decides
   * that from `current_setting('role')` — the role PostgREST sets per request —
   * together with the lead trigger's own transaction-local stamp, NOT from
   * `current_user`, which inside a SECURITY DEFINER body is the function owner
   * on every path and made the first version of that guard dead code.
   * `institution_id` is not sent either — the same trigger sets it from the
   * department's own college, so sending it would be a claim the database
   * overwrites.
   *
   * Departments already on the initiative are LEFT EXACTLY AS THEY ARE and
   * reported back separately. Re-inserting them would either fail the unique
   * constraint or, with an upsert, reset a confirmation somebody already gave —
   * and their existing row is the truth.
   */
  static async addParticipants(
    engagementId: string,
    departmentIds: string[]
  ): Promise<AddParticipantsOutcome> {
    const wanted = Array.from(
      new Set(departmentIds.map((id) => id.trim()).filter((id) => id.length > 0))
    );
    if (wanted.length === 0) throw new Error('Pick at least one department.');

    // Read first, so "already named" can be reported as itself instead of
    // arriving as a unique-constraint failure that reads like a system fault.
    const existing = await this.listParticipants(engagementId);
    const existingIds = new Set(existing.map((p) => p.department_id));
    const alreadyNamed = wanted.filter((id) => existingIds.has(id));
    const fresh = wanted.filter((id) => !existingIds.has(id));

    if (fresh.length === 0) return { added: [], alreadyNamed };

    const { data, error } = await this.supabase
      .from('sh_community_engagement_participants')
      .insert(
        fresh.map((department_id) => ({
          engagement_id: engagementId,
          department_id,
          confirmation_status: 'pending',
        }))
      )
      .select(PARTICIPANT_SELECT);

    if (error) throw describeParticipantFailure(error as PostgrestLikeError, 'name');

    const rows = (data ?? []) as unknown as JoinedParticipantRow[];
    if (rows.length === 0) throw participantRefusedSilently('name');
    if (rows.length !== fresh.length) {
      // A multi-row insert is one statement, so this should be unreachable. It
      // is checked anyway because the alternative to checking is returning a
      // shorter list than was asked for and letting the caller announce every
      // department as added.
      throw new Error(
        `Only ${rows.length} of ${fresh.length} departments were added. Reload the ` +
          'list to see which ones are actually on this initiative.'
      );
    }

    return { added: rows.map(mapParticipantRow), alreadyNamed };
  }

  /**
   * The caller's OWN department, derived from the session by the database.
   *
   * WHY THIS EXISTS AT ALL, and why neither answer method takes a
   * `departmentId`. Deriving WHO from `auth.uid()` while accepting WHAT as an
   * argument is still forgeable — PostgREST exposes every function and table
   * granted to `authenticated`, so this service is never the only caller.
   * Beyond that, the UPDATE policy's first two branches are
   * `is_super_admin() OR is_admin()`, which pass for EVERY row on the
   * initiative: an administrator running an update filtered only by
   * `engagement_id` would confirm every named department in one statement, on
   * behalf of departments that never agreed. That is precisely the thing the
   * confirmation column exists to prevent, so the department is pinned here and
   * the policy is treated as the second lock, not the first.
   *
   * `sh_user_department_id()` is the policy's own derivation, so it cannot
   * disagree with it. The fallback runs that function's exact body — the
   * signed-in user's own `profiles.department_id` — for environments where the
   * helper is not exposed over PostgREST; both paths read the department from
   * the session and neither accepts one from the caller.
   */
  private static async callerDepartmentId(): Promise<string> {
    const { data, error } = await this.supabase.rpc('sh_user_department_id');
    if (!error && typeof data === 'string' && data.length > 0) return data;

    const { data: authData } = await this.supabase.auth.getUser();
    const userId: string | null = authData?.user?.id ?? null;
    if (!userId) {
      throw new Error('Your session has expired. Sign in again to answer for your department.');
    }

    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('department_id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      throw new Error(
        'Your department could not be worked out from your account, so nothing ' +
          'was changed. Reload the page and try again.'
      );
    }

    const departmentId = (profile as { department_id?: string | null } | null)?.department_id;
    if (!departmentId) {
      throw new Error(
        'Your account is not attached to a department, so there is no department ' +
          'for you to answer for. Ask your administrator to set your department.'
      );
    }
    return departmentId;
  }

  /**
   * The one write both answers share. Filtered by the caller's own derived
   * department, never by one supplied to it.
   *
   * `confirmed_by` and `confirmed_at` are not sent: the BEFORE UPDATE trigger
   * sets them from `auth.uid()` and pins `engagement_id`, `department_id` and
   * `is_lead` to their old values, so sending them would be a claim the
   * database overwrites. `updated_at` likewise.
   */
  private static async answerAsOwnDepartment(
    engagementId: string,
    action: 'confirm' | 'decline',
    patch: Record<string, unknown>
  ): Promise<CommunityEngagementParticipant> {
    const departmentId = await this.callerDepartmentId();

    const { data, error } = await this.supabase
      .from('sh_community_engagement_participants')
      .update(patch)
      .eq('engagement_id', engagementId)
      .eq('department_id', departmentId)
      .select(PARTICIPANT_SELECT);

    if (error) throw describeParticipantFailure(error as PostgrestLikeError, action);

    const rows = (data ?? []) as unknown as JoinedParticipantRow[];
    if (rows.length === 0) throw participantRefusedSilently(action);

    return mapParticipantRow(rows[0]);
  }

  /**
   * The caller's own department confirms that it took part, and says for how
   * many hours.
   *
   * Hours are THIS department's, not the initiative's total — the per-college
   * read sums them, while reach stays shared and undivided. `null` is allowed
   * and means "confirmed without stating hours", which is a different fact from
   * zero and is stored as a different value.
   */
  static async confirmParticipation(
    engagementId: string,
    hoursContributed: number | null
  ): Promise<CommunityEngagementParticipant> {
    if (hoursContributed !== null) {
      if (!Number.isFinite(hoursContributed) || hoursContributed < 0) {
        throw new Error('Hours contributed cannot be negative.');
      }
    }

    return this.answerAsOwnDepartment(engagementId, 'confirm', {
      confirmation_status: 'confirmed',
      hours_contributed: hoursContributed,
    });
  }

  /**
   * The caller's own department says it did not take part.
   *
   * A note is required, mirroring the rejection half of `decide()`: a bare
   * "no" leaves whoever recorded the initiative unable to tell a mistaken name
   * from a genuine non-participation, and the row is deliberately kept rather
   * than deleted precisely so that distinction survives.
   */
  static async declineParticipation(
    engagementId: string,
    note: string
  ): Promise<CommunityEngagementParticipant> {
    const trimmed = note?.trim() ?? '';
    if (!trimmed) {
      throw new Error(
        'Say why your department did not take part, so whoever recorded this can ' +
          'correct it.'
      );
    }

    return this.answerAsOwnDepartment(engagementId, 'decline', {
      confirmation_status: 'declined',
      decline_note: trimmed,
    });
  }

  /**
   * Point an initiative at the event it was run as, or clear that link.
   *
   * The returning clause names `id, event_id` explicitly rather than reusing
   * `ENGAGEMENT_SELECT`. `event_id` does not exist until 20261226113000 is
   * applied, and adding it to the shared select would make every EXISTING read
   * in this file fail on any environment that is behind — a link nobody has
   * used yet is not worth breaking the register that is already live.
   */
  private static async setEngagementEvent(
    engagementId: string,
    eventId: string | null
  ): Promise<{ engagement_id: string; event_id: string | null }> {
    const { data, error } = await this.supabase
      .from('sh_community_engagements')
      .update({ event_id: eventId })
      .eq('id', engagementId)
      .select('id, event_id');

    if (error) throw describeParticipantFailure(error as PostgrestLikeError, 'link');

    const rows = (data ?? []) as unknown as Array<{ id: string; event_id: string | null }>;
    if (rows.length === 0) throw participantRefusedSilently('link');

    return { engagement_id: rows[0].id, event_id: rows[0].event_id ?? null };
  }

  /** Record that this initiative and this event are the same piece of work. */
  static async linkEngagementToEvent(
    engagementId: string,
    eventId: string
  ): Promise<{ engagement_id: string; event_id: string | null }> {
    if (!eventId?.trim()) throw new Error('Pick an event to link this initiative to.');
    return this.setEngagementEvent(engagementId, eventId.trim());
  }

  /**
   * Break the link. The initiative itself is untouched — unlinking says the
   * calendar entry was the wrong one, never that the work did not happen.
   */
  static async unlinkEngagementFromEvent(
    engagementId: string
  ): Promise<{ engagement_id: string; event_id: string | null }> {
    return this.setEngagementEvent(engagementId, null);
  }

  /**
   * The cluster's own totals: every approved initiative counted exactly once,
   * however many colleges ran it.
   *
   * Reports FEWER beneficiaries than `getCollegeTotals()` summed over every
   * college, by exactly the joint initiatives. That gap is the decision, not a
   * bug — see the file header on `types/community-collaboration.ts`.
   */
  static async getClusterTotals(): Promise<CommunityClusterTotals> {
    const { data, error } = await this.supabase.rpc('fn_community_cluster_totals');

    if (error) throw describeTotalsFailure(error as PostgrestLikeError);

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
    // The function aggregates, so it returns exactly one row even over an empty
    // register — zeros and NULL averages. No row at all is therefore not "the
    // cluster has done nothing"; it is a read that did not work, and rendering
    // it as a page full of zeros would put a false number in front of a reader.
    if (!row) {
      throw new Error(
        'The cluster community totals could not be read — the database answered ' +
          'with no figures at all. Nothing on this page is safe to read as a total.'
      );
    }

    return {
      initiatives: toNumber(row.initiatives as number | string | null),
      total_beneficiaries: toNumber(row.total_beneficiaries as number | string | null),
      total_hours: toNumber(row.total_hours as number | string | null),
      joint_initiatives: toNumber(row.joint_initiatives as number | string | null),
      solo_initiatives: toNumber(row.solo_initiatives as number | string | null),
      // NULL survives on purpose: "nothing recorded yet" must not become a 0
      // that reads as "joint initiatives reach nobody".
      avg_reach_joint: toNullableNumber(row.avg_reach_joint as number | string | null),
      avg_reach_solo: toNullableNumber(row.avg_reach_solo as number | string | null),
    };
  }

  /**
   * One row per (college, approved initiative) where that college has at least
   * one CONFIRMED participating department — NOT one row per college, despite
   * the name this method is called by elsewhere.
   *
   * An empty array here is genuinely "nothing confirmed yet", not an RLS
   * silence: the function is SECURITY DEFINER and RAISES when the caller may
   * not read the register, so a refusal arrives as an error rather than as an
   * empty list.
   */
  static async getCollegeTotals(): Promise<CommunityCollegeEngagementRow[]> {
    const { data, error } = await this.supabase.rpc('fn_community_college_totals');

    if (error) throw describeTotalsFailure(error as PostgrestLikeError);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      institution_id: String(row.institution_id ?? ''),
      institution_name: (row.institution_name as string | null) ?? '',
      engagement_id: String(row.engagement_id ?? ''),
      title: (row.title as string | null) ?? '',
      engagement_date: (row.engagement_date as string | null) ?? '',
      beneficiaries_count: toNumber(row.beneficiaries_count as number | string | null),
      hours_contributed: toNumber(row.hours_contributed as number | string | null),
      is_shared: row.is_shared === true,
      shared_with: toNumber(row.shared_with as number | string | null),
    }));
  }
}
