/**
 * The provisional-fresher roster predicate, as a PostgREST filter expression.
 *
 * Spec: specs/provisional-freshers-spec-2026-08-05.md (§6.4 surface 2)
 *
 * The roster RPC (fn_attendance_roster) can express this in SQL directly. The
 * service path that queries `learners_profiles` through PostgREST cannot — it
 * has no subquery — so the current-intake identifiers are resolved first (via
 * fn_current_admission_year_ids) and folded into an `.or()` expression here.
 *
 * This lives in its own pure function for one reason: it decides WHO APPEARS on
 * an attendance roster, and a malformed expression does not throw — PostgREST
 * either rejects the request or, worse, applies a filter that means something
 * other than what was intended. Neither shows up as a visibly broken screen.
 * Keeping it pure makes it testable without a database.
 */

import { PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES } from '@/lib/constants/provisional-access';

// A PostgREST `in.(…)` list is comma-delimited and unquoted, so a value
// containing a comma, a parenthesis or a quote would change the meaning of the
// expression rather than be rejected by it. These identifiers come from the
// database and are uuid-typed at source, but this function is the boundary and
// validates rather than assumes.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The lifecycle filter that reproduces today's behaviour exactly. */
export const ACTIVE_ONLY_LIFECYCLE_FILTER = 'lifecycle_status.eq.active';

/**
 * Build the `.or()` expression admitting active learners plus provisional
 * freshers of the current intake.
 *
 * FAILS CLOSED. When no usable current-intake identifier survives validation —
 * an empty list, or a list of malformed values — the result is the active-only
 * filter, which is precisely the behaviour that shipped before this feature.
 * The provisional half then simply does not appear, which is a visible,
 * diagnosable outcome; the alternative (emitting `in.()` with an empty list)
 * produces a request PostgREST reads as something else entirely.
 *
 * @param currentAdmissionYearIds ids of admission_years rows flagged is_current
 */
export function buildRosterLifecycleFilter(
  currentAdmissionYearIds: readonly (string | null | undefined)[] | null | undefined
): string {
  if (!currentAdmissionYearIds || currentAdmissionYearIds.length === 0) {
    return ACTIVE_ONLY_LIFECYCLE_FILTER;
  }

  const usable = Array.from(
    new Set(
      currentAdmissionYearIds.filter(
        (id): id is string => typeof id === 'string' && UUID_RE.test(id)
      )
    )
  );

  if (usable.length === 0) return ACTIVE_ONLY_LIFECYCLE_FILTER;

  // Statuses come from the shared constant, never a literal — this expression
  // and the SQL in 20260821010000 must always name the same set, and a copy here
  // is exactly how the induction tier's mirrored list is warned about drifting.
  const statuses = PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES.join(',');

  return `${ACTIVE_ONLY_LIFECYCLE_FILTER},and(lifecycle_status.in.(${statuses}),admission_year_id.in.(${usable.join(',')}))`;
}
