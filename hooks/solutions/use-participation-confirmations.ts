'use client';

/**
 * Solutions Hub — "confirm the part our department played"
 * ---------------------------------------------------------------------------
 * Director decision D3 (2026-09-18). One community initiative can be run by
 * several departments across colleges. The department that records it names the
 * others; each named department lands `pending` in
 * `sh_community_engagement_participants` and its OWN head must answer — confirm
 * with the hours their people actually gave, or decline with a note.
 *
 * A named-but-unconfirmed department counts for NOTHING. That is the whole
 * defence against decision D2 (every participating college shows the full
 * beneficiary count) being gamed by typing names into a form.
 *
 * NO API ROUTE, deliberately, for the two reasons the register itself gives
 * (lib/services/solutions/societal-service.ts): a route would run as the server
 * client and hide the per-institution scoping the RLS policies exist to apply,
 * and this feature is under a hard instruction to add no new routes.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TWO WRITES LIVE HERE AND NOT IN societal-service.ts
 * ---------------------------------------------------------------------------
 * `SocietalService.confirmParticipation` / `.declineParticipation` are owned by
 * a PARALLEL lane that had not pushed a branch when this screen was built
 * (checked: `git ls-remote --heads jicate` carried no participation-service
 * branch). Importing names that do not exist yet would not compile, and
 * `npm run build` is a hard gate on this route.
 *
 * So `ParticipationClient` below carries EXACTLY those signatures — same names,
 * same argument order, and the same deliberate ABSENCE of a `departmentId`
 * argument. When the service lane lands, the swap is mechanical: delete
 * `ParticipationClient`, import `SocietalService`, change the two call sites.
 *
 * The lane's third method, `listParticipants(engagementId)`, is NOT duplicated
 * here — the queue read below already returns every department named on each
 * initiative, in one round trip rather than one per row.
 *
 * The screen's own reason to exist — "which initiatives has MY department been
 * named on" — has no counterpart in that lane's named set at all, so
 * `listForDepartment` has nothing to converge with.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { solutionsHubKeys } from '@/lib/query-keys';
import {
  EngagementRegisterMissingError,
  describeSdgGoal,
  shortSdgLabel,
} from '@/lib/services/solutions/societal-service';

export { describeSdgGoal, shortSdgLabel, EngagementRegisterMissingError };

// ============================================
// TYPES
// ============================================

/** Exactly the values `confirmation_status` is CHECK-constrained to. */
export type ParticipationStatus = 'pending' | 'confirmed' | 'declined';

export const PARTICIPATION_STATUS_LABELS: Record<ParticipationStatus, string> = {
  pending: 'Waiting for your answer',
  confirmed: 'Confirmed by your department',
  declined: 'Declined by your department',
};

/** One department's part in one initiative, joined to the initiative itself. */
export interface ParticipationRow {
  id: string;
  engagement_id: string;
  department_id: string;
  institution_id: string | null;
  hours_contributed: number | null;
  is_lead: boolean;
  confirmation_status: ParticipationStatus;
  confirmed_at: string | null;
  decline_note: string | null;
  created_at: string;

  /** What the initiative was. */
  title: string;
  description: string | null;
  engagement_date: string;
  /** How many people it served — the FULL figure, shared not divided (D2). */
  beneficiaries_count: number;
  /** Hours the initiative took in total, as the lead recorded it. */
  hours_spent: number;
  sdg_goals: string[];
  /** 'pending' | 'approved' | 'rejected' on the parent register. */
  approval_status: string;
  /** The person who typed the initiative in. */
  recorded_by_name: string | null;

  /** The department that recorded it, and its college — our "who leads it". */
  lead_department_name: string | null;
  lead_institution_name: string | null;
  /** Every other department named on the same initiative, and where each stands. */
  co_participants: Array<{
    department_id: string;
    department_name: string | null;
    confirmation_status: ParticipationStatus;
    is_lead: boolean;
  }>;
}

/**
 * What a read of the queue actually established.
 *
 * `rows: []` on its own is ambiguous and must never be printed as "nothing to
 * confirm". An RLS SELECT policy FILTERS, it does not raise — so "your
 * department has been named on nothing" and "you were named but cannot read the
 * initiative" both arrive as an empty array. `visibility` is how the screen
 * tells those two apart instead of guessing.
 */
export interface ParticipationQueue {
  rows: ParticipationRow[];
  /**
   * 'ok'                  — the read succeeded and the list is the truth.
   * 'no_department'       — the viewer's profile carries no department, so
   *                         there is nothing this screen could ever be about.
   */
  visibility: 'ok' | 'no_department';
  /**
   * Which SUPPLEMENTARY lookups failed, in words a head of department can read.
   *
   * The three reads that decorate the queue — department names, college names,
   * and who else was named — used to drop their errors on the floor. Each
   * failure then rendered as a confident statement of fact: a failed department
   * read printed "department not readable from here", which means RLS and sends
   * someone to ask for a permission; a failed college read printed "college not
   * recorded", which says the register holds no college; and a failed siblings
   * read simply omitted the "Also named" line, so a head concluded nobody else
   * was on the initiative.
   *
   * None of those is knowable from an empty result. An empty answer is not
   * proof of absence, so the failures are carried out to the screen and named
   * instead of being dressed up as findings.
   */
  degraded: string[];
  /**
   * How many rows naming this department were dropped because the INITIATIVE
   * behind them could not be read.
   *
   * This is the feature's central known gap made countable. The participants
   * SELECT policy reads through the parent register, and the parent is scoped
   * to the recording college — so a Nursing head named on a Pharmacy camp has
   * a participant row and cannot read the camp. Such a row carries no title, no
   * date and no beneficiary count, so it is dropped rather than rendered blank.
   *
   * Dropping it SILENTLY is the problem. The panel's empty state explains this
   * situation, but it only appears when the queue is entirely empty — a head
   * with two readable initiatives and three unreadable ones would have seen two
   * and been told nothing. The count is carried out so the screen can say that
   * something is being withheld and why, whether the queue is empty or not.
   */
  hiddenByScope: number;
}

// ============================================
// FAILURE TRANSLATION — CLAUDE.md rule 27
// ============================================

const RELATION_MISSING_CODES = new Set(['42P01', 'PGRST205', 'PGRST106']);
const RLS_DENIED = '42501';
const CHECK_VIOLATION = '23514';

interface PostgrestLikeError {
  code?: string | null;
  message?: string;
}

function isRelationMissing(error: PostgrestLikeError | null | undefined): boolean {
  return !!error?.code && RELATION_MISSING_CODES.has(error.code);
}

/**
 * A refusal has to say something a head of department can act on. Postgres
 * answers an RLS denial with 42501 and "new row violates row-level security
 * policy for table ...", which tells them nothing.
 *
 * 42501 here does NOT prove the caller lacks `solutions.societal.confirm`.
 * PostgREST asks for the affected row back, so `UPDATE ... RETURNING` filters
 * that row through the SELECT policy as well: a caller can pass the UPDATE
 * policy, fail SELECT on the row being returned, and get 42501 with the whole
 * statement rolled back. This message therefore names what was refused and
 * lets an administrator work out which half — it never asserts which key is
 * missing. (That exact wrong assertion is what sent submit-only team members
 * chasing a permission they already held, twice; see 20261120143000.)
 */
function describeConfirmFailure(error: PostgrestLikeError): Error {
  if (isRelationMissing(error)) return new EngagementRegisterMissingError();

  if (error.code === RLS_DENIED) {
    return new Error(
      'Your answer was not saved — the database refused it. Answering has to ' +
        'update the row AND read it back, and this register grants those two ' +
        'separately, so this means either your role cannot confirm your ' +
        "department's part, or it can confirm but cannot read the initiative " +
        'back. Show this to your Solutions Hub administrator: answering needs ' +
        'solutions.societal.confirm on your OWN department, reading the ' +
        'initiative needs solutions.societal.view for the college that recorded it.'
    );
  }

  if (error.code === CHECK_VIOLATION) {
    // 23514 is not one fact. THREE different CHECK constraints on this table
    // raise it, and they have three different remedies:
    //
    //   sh_ce_participants_hours_non_negative   the hours figure
    //   confirmation_status IN (...)            the answer value
    //   sh_ce_participants_confirmation_paired  a confirmation that could not
    //                                           be stamped with WHO confirmed
    //                                           it — i.e. no auth.uid(), a
    //                                           dead session, nothing to do
    //                                           with hours at all
    //
    // Saying "hours cannot be negative" for all three is the same
    // confidently-wrong refusal `explainRefusedAnswer` below exists to avoid.
    // Postgres names the constraint it violated in the message, so branch on
    // it where it is there and ENUMERATE, never assert, where it is not.
    const detail = `${error.message ?? ''}`;

    if (detail.includes('hours_non_negative')) {
      return new Error(
        'Hours cannot be negative. Enter the hours your department actually ' +
          'gave, or leave the box blank to confirm without stating a figure.'
      );
    }

    if (detail.includes('confirmation_paired')) {
      return new Error(
        'Your answer was not saved, because the database could not record WHO ' +
          'confirmed it. That is a signed-out session, not a problem with what ' +
          'you typed. Reload the page, sign in again, and answer once more.'
      );
    }

    if (detail.includes('confirmation_status')) {
      return new Error(
        'Your answer was not saved: the database did not recognise it as either ' +
          'a confirmation or a decline. Reload the page and answer again; if it ' +
          'happens twice, report it with the red bug button at the bottom right.'
      );
    }

    return new Error(
      'The database rejected these values, and did not say which rule was ' +
        'broken. It is one of: hours that cannot be negative, an answer that ' +
        'must be a confirmation or a decline, or a confirmation that could not ' +
        'be stamped with who made it. Reload the page and try once more, then ' +
        'report it with the red bug button at the bottom right.'
    );
  }

  return new Error(error.message || 'Your answer could not be saved.');
}

/**
 * The caller's session carries no department, so there is no row this answer
 * could belong to. Said out loud rather than sent to the database to fail
 * opaquely — and never widened into "answer for everyone", which is what an
 * unfiltered UPDATE would do for an admin.
 */
function noDepartmentToAnswerFor(): Error {
  return new Error(
    'Your account is not attached to a department, so there is nothing for it ' +
      'to answer here. This screen answers for one department at a time, and ' +
      'deliberately will not answer on behalf of all of them. Ask whoever ' +
      'manages accounts for your institution to set your department under ' +
      'Users, then your profile.'
  );
}

/**
 * The silent half of rule 27 — and then the same question asked once more, of
 * the answer itself.
 *
 * An RLS `USING` clause does not raise, it filters. An UPDATE the policy
 * refuses comes back HTTP 200 with an empty array, so the caller sees success
 * and the reader sees nothing change. Zero rows from a write that named exactly
 * one row IS a refusal and has to be reported as one.
 *
 * WHY THIS READS THE ROW BACK INSTEAD OF EXPLAINING. THREE different situations
 * produce that same empty array here, and the write's OWN filter is one of
 * them:
 *
 *   • no row — your department is not named on this initiative, or the
 *     initiative belongs to a college your roles cannot read;
 *   • a row that is already answered — `.eq('confirmation_status','pending')`
 *     in the write excludes it, which any stale list or a second tab reaches;
 *   • a row still pending — then the UPDATE policy refused it, and that means
 *     `solutions.societal.confirm`.
 *
 * Naming one of those as "most likely" is the confidently-wrong refusal this
 * file's own 42501 handling exists to avoid — and the first version of this
 * function did exactly that, telling a head of department their own department
 * was not the one named. So the row is read back and the answer established.
 * Where the read itself comes back empty the two cases it genuinely cannot
 * separate are BOTH named, rather than one of them being picked.
 */
async function explainRefusedAnswer(
  supabase: ReturnType<typeof createClientSupabaseClient>,
  engagementId: string,
  ownDepartmentId: string
): Promise<Error> {
  const { data, error } = await (supabase as any)
    .from('sh_community_engagement_participants')
    // UNIQUE (engagement_id, department_id) on the table, so at most one row
    // can match and maybeSingle() cannot throw on a multiple-rows result.
    .select('confirmation_status')
    .eq('engagement_id', engagementId)
    .eq('department_id', ownDepartmentId)
    .maybeSingle();

  if (error) {
    return new Error(
      'Your answer was not saved, and the reason could not be read back either. ' +
        'Reload the page to see where this initiative stands; if it still shows ' +
        'as waiting for you, report it with the red bug button at the bottom ' +
        'right.'
    );
  }

  const status = (data as { confirmation_status?: string } | null)?.confirmation_status ?? null;

  if (status === 'confirmed' || status === 'declined') {
    return new Error(
      `Your answer was not saved, because your department has already answered ` +
        `this initiative — the record says ${status}. Somebody else with the same ` +
        'permission may have answered it while this page was open. Reload to see ' +
        'the answer that stands. An answer cannot be changed from this screen.'
    );
  }

  if (status === 'pending') {
    return new Error(
      'Your answer was not saved — the database refused it, even though the row ' +
        'is still waiting for an answer. Answering your department\'s own part ' +
        'needs the permission solutions.societal.confirm. Show this to your ' +
        'Solutions Hub administrator, who can add it under Users, then Role ' +
        'Management.'
    );
  }

  return new Error(
    'Your answer was not saved, and no row for your department could be read on ' +
      'this initiative. That is either because your department is not named on ' +
      'it, or because the initiative was recorded by a college your roles cannot ' +
      'read — the two are indistinguishable from here, so neither is claimed. ' +
      'Reload the page; if it is still listed as waiting for you, report it with ' +
      'the red bug button at the bottom right.'
  );
}

// ============================================
// THE SERVICE-SHAPED PRIMITIVES
// ============================================

const PARTICIPANT_COLUMNS =
  'id, engagement_id, department_id, institution_id, hours_contributed, is_lead, ' +
  'confirmation_status, confirmed_at, decline_note, created_at';

interface RawParticipant {
  id: string;
  engagement_id: string;
  department_id: string;
  institution_id: string | null;
  /** `numeric` — PostgREST hands it over as a string. Always run it through toNumber. */
  hours_contributed: number | string | null;
  is_lead: boolean;
  confirmation_status: ParticipationStatus;
  confirmed_at: string | null;
  decline_note: string | null;
  created_at: string;
}

interface RawEngagement {
  id: string;
  department_id: string;
  institution_id: string | null;
  title: string;
  description: string | null;
  engagement_date: string;
  /** `numeric` — a string over the wire. */
  hours_spent: number | string | null;
  beneficiaries_count: number | null;
  sdg_goals: string[] | null;
  approval_status: string;
  recorder?: { full_name: string | null } | null;
}

/**
 * The caller's OWN department, resolved from the session — never taken as an
 * argument, exactly as `sh_user_department_id()` does it
 * (`SELECT department_id FROM profiles WHERE id = auth.uid()`, 20260205000002).
 *
 * WHY THE WRITES BELOW NEED THIS AT ALL, when RLS already narrows to the
 * caller's department. The UPDATE policy is a disjunction: its first two
 * branches are `is_super_admin()` and `is_admin()`. For an ordinary head of
 * department the third branch pins the row to their own department and an
 * `engagement_id`-only UPDATE touches exactly one row. For an ADMIN it pins
 * nothing — so the same statement would move EVERY pending participant on that
 * initiative and confirm every named department in one click. That is the exact
 * hole decision D3 exists to close, reopened from the client side.
 *
 * Resolving it here closes that: an admin answers only for the department they
 * actually belong to, and an admin with no department matches no row and is
 * told so, rather than silently answering for everybody.
 */
async function callerDepartmentId(): Promise<string> {
  const supabase = createClientSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) {
    throw new Error(
      'Your session could not be read, so this answer was not sent. Reload the ' +
        'page and sign in again.'
    );
  }

  const { data, error } = await (supabase as any)
    .from('profiles')
    .select('department_id')
    .eq('id', userId)
    .maybeSingle();

  // A FAILED READ IS NOT AN ANSWER. Collapsing it to null would make the next
  // line tell someone their account has no department when in fact we never
  // found out — the same confidently-wrong refusal this file's 42501 handling
  // exists to avoid.
  if (error) {
    throw new Error(
      'Your department could not be looked up, so nothing was sent. This looks ' +
        'like a connection problem rather than a permission problem. Reload the ' +
        'page and try again.'
    );
  }

  const departmentId = (data?.department_id as string | null) ?? null;
  if (!departmentId) throw noDepartmentToAnswerFor();
  return departmentId;
}

/**
 * `numeric` arrives from PostgREST as a STRING, not a number. The register hits
 * this too and coerces for the same reason (`toNumber` in societal-service.ts):
 * rendered raw it looks right, but `hours > 0` and any arithmetic on it quietly
 * do the wrong thing.
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The service lane's third method, `listParticipants(engagementId)`, is
 * deliberately NOT reimplemented here. This screen already gets every
 * department named on each initiative from the queue read below, in one
 * round trip instead of one per row, so a second implementation of a method
 * this file never calls would be dead code to keep in sync for nothing.
 */
export const ParticipationClient = {
  /**
   * Confirm OUR department's part, with the hours our people actually gave.
   *
   * NO `departmentId` ARGUMENT, deliberately and permanently. The row that
   * moves is chosen by the UPDATE policy's own predicate,
   * `department_id = sh_user_department_id()`, which is derived from
   * `auth.uid()` and cannot be influenced by anything sent from here. Adding a
   * department argument would invite a caller to believe they can answer for
   * somebody else; the filter below narrows to the caller's own department for
   * the sake of a single-row update, it does not authorise one.
   */
  async confirmParticipation(
    engagementId: string,
    hoursContributed: number | null
  ): Promise<RawParticipant> {
    if (
      hoursContributed !== null &&
      (!Number.isFinite(hoursContributed) || hoursContributed < 0)
    ) {
      throw new Error('Hours cannot be negative.');
    }

    const ownDepartmentId = await callerDepartmentId();

    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('sh_community_engagement_participants')
      .update({
        confirmation_status: 'confirmed',
        hours_contributed: hoursContributed,
        decline_note: null,
      })
      .eq('engagement_id', engagementId)
      .eq('department_id', ownDepartmentId)
      .eq('confirmation_status', 'pending')
      .select(PARTICIPANT_COLUMNS);

    if (error) throw describeConfirmFailure(error);
    const rows = (data ?? []) as RawParticipant[];
    if (rows.length === 0) throw await explainRefusedAnswer(supabase, engagementId, ownDepartmentId);
    return rows[0]!;
  },

  /**
   * Decline our department's part, with a note saying why. A decline is a
   * better record than a vanished row: it says the department was asked and
   * answered. Like `confirmParticipation`, it takes no department argument.
   */
  async declineParticipation(engagementId: string, note: string): Promise<RawParticipant> {
    const trimmed = note.trim();
    if (!trimmed) {
      throw new Error('Say briefly why your department is declining, so the record explains itself.');
    }

    const ownDepartmentId = await callerDepartmentId();

    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('sh_community_engagement_participants')
      .update({
        confirmation_status: 'declined',
        decline_note: trimmed,
        hours_contributed: null,
      })
      .eq('engagement_id', engagementId)
      .eq('department_id', ownDepartmentId)
      .eq('confirmation_status', 'pending')
      .select(PARTICIPANT_COLUMNS);

    if (error) throw describeConfirmFailure(error);
    const rows = (data ?? []) as RawParticipant[];
    if (rows.length === 0) throw await explainRefusedAnswer(supabase, engagementId, ownDepartmentId);
    return rows[0]!;
  },
};

// ============================================
// THE QUEUE READ
// ============================================

/**
 * Every initiative this department has been named on — answered or not.
 *
 * `departmentId` is a FILTER, not an authorisation. It is read from the
 * viewer's own profile, which is the same value `sh_user_department_id()`
 * returns (`SELECT department_id FROM profiles WHERE id = auth.uid()`,
 * 20260205000002), so the filter and the policy can never disagree. RLS still
 * decides every row that comes back.
 */
async function listForDepartment(departmentId: string | null): Promise<ParticipationQueue> {
  if (!departmentId) return { rows: [], visibility: 'no_department', degraded: [], hiddenByScope: 0 };

  const supabase = createClientSupabaseClient();

  const { data: mineRaw, error: mineError } = await (supabase as any)
    .from('sh_community_engagement_participants')
    .select(PARTICIPANT_COLUMNS)
    .eq('department_id', departmentId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (mineError) {
    if (isRelationMissing(mineError)) throw new EngagementRegisterMissingError();
    throw new Error(
      mineError.message || 'The list of initiatives naming your department could not be read.'
    );
  }

  const mine = (mineRaw ?? []) as RawParticipant[];
  if (mine.length === 0) return { rows: [], visibility: 'ok', degraded: [], hiddenByScope: 0 };

  // What could not be looked up, named rather than swallowed. See the doc on
  // `ParticipationQueue.degraded`.
  const degraded: string[] = [];

  const engagementIds = Array.from(new Set(mine.map((p) => p.engagement_id)));

  const { data: engRaw, error: engError } = await (supabase as any)
    .from('sh_community_engagements')
    .select(
      'id, department_id, institution_id, title, description, engagement_date, ' +
        'hours_spent, beneficiaries_count, sdg_goals, approval_status, ' +
        // Same embed spelling the register itself uses (ENGAGEMENT_SELECT in
        // societal-service.ts) — the FK-name form resolves, the constraint-name
        // form does not.
        'recorder:profiles!recorded_by(full_name)'
    )
    .in('id', engagementIds);

  if (engError) {
    if (isRelationMissing(engError)) throw new EngagementRegisterMissingError();
    throw new Error(engError.message || 'The initiatives themselves could not be read.');
  }

  const engagements = new Map<string, RawEngagement>(
    ((engRaw ?? []) as RawEngagement[]).map((e) => [e.id, e])
  );

  // Every department named on the same initiatives — so a head can see who else
  // was asked and where each of them stands, not just their own row.
  const { data: siblingsRaw, error: siblingsError } = await (supabase as any)
    .from('sh_community_engagement_participants')
    .select('engagement_id, department_id, confirmation_status, is_lead')
    .in('engagement_id', engagementIds);

  // Not fatal — the rows themselves are already read, and losing the "Also
  // named" line is worth less than losing the queue. But it must not read as
  // "nobody else was named", which is what an empty list looks like.
  if (siblingsError) degraded.push('the other departments named on these initiatives');

  const siblings = (siblingsRaw ?? []) as Array<{
    engagement_id: string;
    department_id: string;
    confirmation_status: ParticipationStatus;
    is_lead: boolean;
  }>;

  const departmentIds = Array.from(
    new Set([...siblings.map((s) => s.department_id), ...mine.map((m) => m.department_id)])
  );
  const institutionIds = Array.from(
    new Set(
      Array.from(engagements.values())
        .map((e) => e.institution_id)
        .filter((v): v is string => !!v)
    )
  );

  const departmentNames = new Map<string, string | null>();
  if (departmentIds.length > 0) {
    // `display_name` first, then the formal name — the order `mapParticipantRow`
    // uses in societal-service.ts, which is where these reads land once
    // `ParticipationClient` is swapped out for `SocietalService`. Reading only
    // `department_name` would print one name here and another there for the
    // same department, across a swap that is meant to be mechanical.
    //
    // Stated exactly, because it is not unanimous: there is no SQL precedent
    // for DEPARTMENT names (fn_community_college_totals() renders colleges,
    // not departments), and the record-side picker on
    // feat/community-collab-record-ui still renders `department_name` alone.
    // That lane has been told. The service mapper is the one this file
    // converges on.
    const { data: deptRaw, error: deptError } = await (supabase as any)
      .from('departments')
      .select('id, department_name, display_name')
      .in('id', departmentIds);
    for (const d of (deptRaw ?? []) as Array<{
      id: string;
      department_name: string | null;
      display_name: string | null;
    }>) {
      departmentNames.set(d.id, d.display_name || d.department_name);
    }
    // Without this the card prints "department not readable from here", which
    // means RLS and sends a head off to ask for a permission they already hold.
    if (deptError) degraded.push('department names');
  }

  const institutionNames = new Map<string, string | null>();
  if (institutionIds.length > 0) {
    // Colleges are unambiguous: fn_community_college_totals() itself renders
    // COALESCE(i.display_name, i.name) (20261226113000, §6), and the service
    // mapper agrees. Reading `name` alone would print a different college here
    // than the totals this screen's confirmations feed.
    const { data: instRaw, error: instError } = await (supabase as any)
      .from('institutions')
      .select('id, name, display_name')
      .in('id', institutionIds);
    for (const i of (instRaw ?? []) as Array<{
      id: string;
      name: string | null;
      display_name: string | null;
    }>) {
      institutionNames.set(i.id, i.display_name || i.name);
    }
    // Without this the card prints "college not recorded", asserting something
    // about the register that the failed read never established.
    if (instError) degraded.push('college names');
  }

  const rows: ParticipationRow[] = [];
  let hiddenByScope = 0;
  for (const p of mine) {
    const eng = engagements.get(p.engagement_id);
    // The parent is unreadable from here, so there is nothing truthful to show
    // about this row. Dropping it is correct; claiming a blank initiative is
    // not. Dropping it SILENTLY is also not — counted, and surfaced by the
    // panel whether or not anything else survived.
    if (!eng) {
      hiddenByScope += 1;
      continue;
    }

    const others = siblings
      .filter((s) => s.engagement_id === p.engagement_id && s.department_id !== p.department_id)
      .map((s) => ({
        department_id: s.department_id,
        department_name: departmentNames.get(s.department_id) ?? null,
        confirmation_status: s.confirmation_status,
        is_lead: s.is_lead,
      }));

    rows.push({
      id: p.id,
      engagement_id: p.engagement_id,
      department_id: p.department_id,
      institution_id: p.institution_id,
      hours_contributed: toNumber(p.hours_contributed),
      is_lead: p.is_lead,
      confirmation_status: p.confirmation_status,
      confirmed_at: p.confirmed_at,
      decline_note: p.decline_note,
      created_at: p.created_at,
      title: eng.title,
      description: eng.description,
      engagement_date: eng.engagement_date,
      beneficiaries_count: eng.beneficiaries_count ?? 0,
      hours_spent: toNumber(eng.hours_spent) ?? 0,
      sdg_goals: eng.sdg_goals ?? [],
      approval_status: eng.approval_status,
      recorded_by_name: eng.recorder?.full_name ?? null,
      lead_department_name: departmentNames.get(eng.department_id) ?? null,
      lead_institution_name: eng.institution_id
        ? institutionNames.get(eng.institution_id) ?? null
        : null,
      co_participants: others,
    });
  }

  // Oldest unanswered first — the thing that has been waiting longest is the
  // thing to answer next. Answered rows are ordered newest first by the panel.
  rows.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return { rows, visibility: 'ok', degraded, hiddenByScope };
}

// ============================================
// QUERY KEYS
// ============================================

export const participationKeys = {
  all: ['solutions-hub', 'community-participation'] as const,
  forDepartment: (departmentId: string) =>
    ['solutions-hub', 'community-participation', 'department', departmentId] as const,
};

// ============================================
// HOOKS
// ============================================

/** The department's confirmation queue: named-and-unanswered, plus answered. */
export function useParticipationQueue(departmentId: string | null | undefined) {
  return useQuery({
    queryKey: participationKeys.forDepartment(departmentId ?? 'none'),
    queryFn: () => listForDepartment(departmentId ?? null),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Confirm our part. A confirmation is what makes this department count in
 * `fn_community_college_totals()` and in the cluster's joint/solo split, so the
 * paradigm-shift figures are invalidated alongside the queue itself.
 */
export function useConfirmParticipation(departmentId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      engagementId,
      hoursContributed,
    }: {
      engagementId: string;
      hoursContributed: number | null;
    }) => ParticipationClient.confirmParticipation(engagementId, hoursContributed),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: participationKeys.forDepartment(departmentId ?? 'none'),
      });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.paradigmShift.all });
    },
  });
}

/** Decline our part, with a note. Same invalidation: a decline changes totals too. */
export function useDeclineParticipation(departmentId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ engagementId, note }: { engagementId: string; note: string }) =>
      ParticipationClient.declineParticipation(engagementId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: participationKeys.forDepartment(departmentId ?? 'none'),
      });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.paradigmShift.all });
    },
  });
}
