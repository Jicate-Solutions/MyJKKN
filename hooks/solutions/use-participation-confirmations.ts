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
    return new Error(
      'The database rejected these values. Hours cannot be negative, and the ' +
        'answer must be either a confirmation or a decline.'
    );
  }

  return new Error(error.message || 'Your answer could not be saved.');
}

/**
 * The silent half of rule 27. An RLS `USING` clause does not raise — it
 * filters. An UPDATE the policy refuses comes back HTTP 200 with an empty
 * array, so the caller sees success and the reader sees nothing change. Zero
 * rows returned from a write that named exactly one row IS a refusal and has to
 * be reported as one.
 */
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

function refusedSilently(): Error {
  return new Error(
    'Your answer was not saved. The database accepted the request and then ' +
      'changed nothing, which is how it refuses a row you may not touch. The ' +
      "most likely reason is that this initiative names a different department " +
      'than yours — only the named department itself can answer for its own ' +
      'part. Reload the page; if the row is still there, report it with the red ' +
      'bug button at the bottom right.'
  );
}

// ============================================
// THE THREE SERVICE-SHAPED PRIMITIVES
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
async function callerDepartmentId(): Promise<string | null> {
  const supabase = createClientSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return null;

  const { data, error } = await (supabase as any)
    .from('profiles')
    .select('department_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) return null;
  return (data?.department_id as string | null) ?? null;
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
    if (!ownDepartmentId) throw noDepartmentToAnswerFor();

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
    if (rows.length === 0) throw refusedSilently();
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
    if (!ownDepartmentId) throw noDepartmentToAnswerFor();

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
    if (rows.length === 0) throw refusedSilently();
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
  if (!departmentId) return { rows: [], visibility: 'no_department' };

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
  if (mine.length === 0) return { rows: [], visibility: 'ok' };

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
  const { data: siblingsRaw } = await (supabase as any)
    .from('sh_community_engagement_participants')
    .select('engagement_id, department_id, confirmation_status, is_lead')
    .in('engagement_id', engagementIds);

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
    const { data: deptRaw } = await (supabase as any)
      .from('departments')
      .select('id, department_name')
      .in('id', departmentIds);
    for (const d of (deptRaw ?? []) as Array<{ id: string; department_name: string | null }>) {
      departmentNames.set(d.id, d.department_name);
    }
  }

  const institutionNames = new Map<string, string | null>();
  if (institutionIds.length > 0) {
    const { data: instRaw } = await (supabase as any)
      .from('institutions')
      .select('id, name')
      .in('id', institutionIds);
    for (const i of (instRaw ?? []) as Array<{ id: string; name: string | null }>) {
      institutionNames.set(i.id, i.name);
    }
  }

  const rows: ParticipationRow[] = [];
  for (const p of mine) {
    const eng = engagements.get(p.engagement_id);
    // The parent is unreadable from here, so there is nothing truthful to show
    // about this row. Dropping it is correct; claiming a blank initiative is not.
    if (!eng) continue;

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

  return { rows, visibility: 'ok' };
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
