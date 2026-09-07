// app/api/foundation/onemark/results/_shared.ts
//
// Server-side helpers shared by the OneMark results routes. Not a route
// (no HTTP verb exported) — Next.js ignores it.
//
// WHO MAY READ A COHORT SHEET is Lane S3's decision, not this file's.
//
// WAVE 3 RULING #1, verbatim from `specs/onemark-wave3-2026-09-06.md`,
// "## Rulings of 2026-09-06 01:20 IST (Director interview, 15 answers)", row 1
// ("Principal sees every cohort sheet of his school?"): "**Yes** — an active
// `school_jkkn_owners` row alone grants read of every results sheet for that
// school, with no `assessments.manage` required." Lane column: "S3 (RPC gate)
// + A". The gate that enforces it belongs inside `fn_onemark_cohort_results`;
// this file must therefore admit BOTH shapes of caller and never add a stricter
// check of its own. What it does add is the LIST filter — which papers to show
// on the index — and that filter is the same disjunction: papers this caller
// created, or papers whose cohort belongs to a school this caller owns.
//
// ⚠️ CARRIED, BUT NOT YET DELIVERED BY THE OTHER HALF. Lane S3's own item 3
// still specifies `fn_onemark_cohort_results` as "caller must hold
// `foundation.assessments.manage` AND `fn_fp_manages_cohort_school(cohort_id)`"
// — no owner-row door (only item 10's `fn_onemark_source_analytics` carries
// one). The ruling post-dates that sentence and overrides it, but if S3 builds
// to the older wording an owner-only principal will pass this file's gate and
// then take a 42501 from the database. Named in the PR body for the Wave 3
// coordinator; it cannot be fixed from this lane, which owns no SQL.
//
// ANY ACTIVE OWNER ROW OPENS IT, NOT PRINCIPALS ONLY. The ruling's own words
// are "an active `school_jkkn_owners` row alone", and the canonical platform
// predicates `fn_fp_manages_school` / `fn_fp_can_view_student` already admit
// every `school_owner_role` value. Narrowing to `principal` here would make
// this route diverge from the predicate the rest of the estate uses.
//
// One client, the session client. RLS decides every row; the answer key is
// not in scope here at all — no route under this folder reads fp_items.

import type { SupabaseClient } from '@supabase/supabase-js';
import { MIN_LEARNERS_FOR_ITEM_STATS_DEFAULT } from '@/lib/services/onemark/results-service';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The platform policy that hides per-item statistics on a small cohort
 *  (Wave 3 ruling #9 — "Hide per-question numbers below 3 learners
 *  (`onemark.results.min_learners_for_item_stats = 3`) … This OVERRIDES the 5
 *  written in Lane S3 item 6"). Seeded by Lane S3 at 3; the code default backs
 *  it until then, so both paths land on the ruling's number. */
export const MIN_LEARNERS_POLICY_KEY = 'onemark.results.min_learners_for_item_stats';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export interface ResultsGate {
  userId: string;
  /** Holds foundation.assessments.manage. */
  canManage: boolean;
  /** schools this caller owns through an active school_jkkn_owners row. */
  ownedSchoolIds: string[];
}

/** Null when there is no session. A caller with neither the permission nor an
 *  owner row is returned all the same — the route decides the 403, so the
 *  message can say which of the two doors was missing. */
export async function resultsGate(supabase: AnyClient): Promise<ResultsGate | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [manageRes, ownerRes] = await Promise.all([
    supabase.rpc('user_has_permission', { permission_name: 'foundation.assessments.manage' }),
    supabase
      .from('school_jkkn_owners')
      .select('school_id')
      .eq('jkkn_user_id', user.id)
      .eq('is_active', true),
  ]);
  if (manageRes.error) throw new Error(`Permission check failed: ${manageRes.error.message}`);
  // An owner-row read that RLS refuses is not fatal: such a caller simply has
  // no owned schools, and the permission alone decides.
  const ownedSchoolIds = ownerRes.error
    ? []
    : Array.from(
        new Set(
          ((ownerRes.data ?? []) as Array<{ school_id: string | null }>)
            .map((r) => r.school_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      );

  return { userId: user.id, canManage: manageRes.data === true, ownedSchoolIds };
}

export function hasResultsAccess(gate: ResultsGate): boolean {
  return gate.canManage || gate.ownedSchoolIds.length > 0;
}

export const NO_ACCESS_MESSAGE =
  'You do not have access to OneMark results. Ask the Foundation programme lead for the assessment-builder permission, or to be recorded as a JKKN owner for the school.';

/** Read the min-learners policy through the standard config mechanism. */
export async function readMinLearners(supabase: AnyClient): Promise<number> {
  const { data, error } = await supabase.rpc('fn_get_policy_int', {
    p_key: MIN_LEARNERS_POLICY_KEY,
    p_default: MIN_LEARNERS_FOR_ITEM_STATS_DEFAULT,
  });
  if (error || typeof data !== 'number') return MIN_LEARNERS_FOR_ITEM_STATS_DEFAULT;
  return data;
}

/** A PostgREST error raised because Lane S3's migration has not been applied
 *  yet. The routes turn this into an explicit 503 rather than a 500, so the
 *  screen can say "not switched on yet" instead of "something went wrong"
 *  (CLAUDE.md #27 — a permission or readiness failure is never silent). */
/** NARROW ON PURPOSE. A bare "does not exist" test matched anything an RPC
 *  raises with that wording — `RAISE EXCEPTION 'paper % does not exist'` is
 *  SQLSTATE P0001 and would have been answered 503 "not switched on yet"
 *  instead of 404. The message fallback now needs the word "function" as well,
 *  which is the shape Postgres uses for a genuine 42883
 *  ("function fn_x(uuid) does not exist"). */
export function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (code === '42883' || code === 'PGRST202') return true;
  const message = (error.message ?? '').toLowerCase();
  if (message.includes('could not find the function')) return true;
  return message.includes('function') && message.includes('does not exist');
}

export const NOT_READY_MESSAGE =
  'Cohort results are not switched on yet. The results functions arrive with the OneMark Wave 3 database change; this screen starts working the moment it is applied.';
