// Client-safe constant (NO server imports) — shared by the roster service and
// the attendance-marking UI. Its SQL counterpart is
// supabase/migrations/20260821010000_attendance_roster_provisional_freshers.sql.
// Spec: specs/provisional-freshers-spec-2026-08-05.md (§7.1–7.2)
//
// A PROVISIONAL learner has reserved or been offered a seat for the CURRENT
// intake but has not yet cleared the fee gate that promotes them to `active`.
// Director decision (2026-08-05): they may be marked present from day one, and
// once on a roster they are never removed from it.
//
// This is deliberately NOT a new `lifecycle_status` enum value and NOT a new
// boolean column — it is a derived condition over statuses that already exist.
// The reasoning is in the migration header; the short form is that a new enum
// value would change the meaning of all 88 existing lifecycle_status filters at
// once, and would drop the learner out of the exact-string guard in
// `evaluate_learner_status_after_payment`, leaving them unpromotable.
//
// RELATIONSHIP TO THE INDUCTION TIER. This is a strict SUBSET of
// INDUCTION_ELIGIBLE_LIFECYCLE_STATUSES in ./induction-access.ts, which also
// admits `enquiry`, `enquiry_submitted` and `account`. Those three must NOT
// reach an attendance roster: an enquiry is not a seat. Import the right list
// for the question being asked — the two lists widen for different reasons and
// are not interchangeable.
export const PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES = [
  'reserved',
  'admitted',
] as const;

export type ProvisionalAttendanceStatus =
  (typeof PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES)[number];

// Every lifecycle status that may appear on an attendance roster. `active` is
// first and unchanged, so widening can only ever add rows.
export const ATTENDANCE_ROSTER_LIFECYCLE_STATUSES = [
  'active',
  ...PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES,
] as const;

/**
 * Is this learner on the roster provisionally rather than as a settled member?
 *
 * Status alone — it does NOT re-check that the intake is current. Callers get
 * this value from a query that has already applied the admission-year term
 * (fn_attendance_roster, or the service filter built by
 * lib/utils/academic/provisional-roster-filter.ts), so re-testing it here would
 * need a second round trip to say something already known.
 *
 * Used to decide whether to render the provisional chip. Unknown, null and
 * undefined all answer false: a missing status is not evidence of provisional
 * standing, and a wrongly-drawn chip on a fully-enrolled learner is a worse
 * error than a missing one.
 */
export function isProvisionalAttendanceStatus(
  lifecycleStatus: string | null | undefined
): boolean {
  if (!lifecycleStatus) return false;
  return (PROVISIONAL_ATTENDANCE_LIFECYCLE_STATUSES as readonly string[]).includes(
    lifecycleStatus
  );
}
