// types/community-collaboration.ts
// ---------------------------------------------------------------------------
// The shapes behind "several departments ran one community initiative together".
//
// WHY THIS FILE EXISTS. `sh_community_engagements` carries exactly one
// `department_id`, so the register can only record one department per
// initiative. JKKN is one walkable campus and a health camp run jointly by
// Pharmacy, Nursing and Dental is the ordinary case, not the exotic one — so
// under that shape whoever types it in must either name one department and
// erase the other two from the record, or type the same camp three times and
// turn one camp into three in every total that reads the table. The joint
// substrate (migration 20261226113000, PR #3898) adds a participants table and
// two read functions to fix that, and these are the TypeScript shapes for it.
//
// WHY THE TYPES ARE HAND-WRITTEN RATHER THAN REGENERATED. That migration is
// not on `main` yet, so `types/supabase.ts` does not know any of this exists.
// Every interface below was transcribed from the migration's own DDL and
// `RETURNS TABLE` clauses, not from the prose that described it — the prose and
// the DDL disagreed, and the DDL is what the database will actually answer with.
// When the migration lands and `types/supabase.ts` is regenerated, these should
// be checked against it and this comment deleted.
//
// THE TWO READ FUNCTIONS DISAGREE ON PURPOSE. Summing
// `fn_community_college_totals()` over every college reports MORE beneficiaries
// than `fn_community_cluster_totals()` does, by exactly the joint initiatives
// counted in more than one college. That gap IS the Director's decision of
// 2026-09-18: a college that ran a camp reaching 400 people reports 400, and so
// does its partner, and the cluster still says 400. Both database functions
// carry a COMMENT saying so. Do not "reconcile" them here either — a reader who
// makes these two agree has deleted the decision, not fixed a bug.
// ---------------------------------------------------------------------------

/**
 * Exactly the three values
 * `sh_community_engagement_participants.confirmation_status` is
 * CHECK-constrained to.
 *
 * A participant row is a CLAIM until its own department confirms it. Only
 * `'confirmed'` counts in either read function, and that is the whole reason
 * the column exists: without it, shared credit could be manufactured by naming
 * departments that did nothing.
 */
export type ParticipantConfirmationStatus = 'pending' | 'confirmed' | 'declined';

/**
 * Words for a reader, not the stored codes.
 *
 * 'pending' is deliberately not called "waiting" on its own: what is waiting is
 * the named department, not the person reading the screen, and a lead who sees
 * "waiting" tends to believe it is their move.
 */
export const PARTICIPANT_STATUS_LABELS: Record<ParticipantConfirmationStatus, string> = {
  pending: 'Has not confirmed yet',
  confirmed: 'Confirmed',
  declined: 'Says it did not take part',
};

/**
 * One department taking part in one community initiative.
 *
 * `UNIQUE (engagement_id, department_id)` in the database, so a department
 * appears on an initiative at most once.
 */
export interface CommunityEngagementParticipant {
  id: string;
  engagement_id: string;
  /**
   * A `public.departments(id)` — the same key space as
   * `sh_community_engagements.department_id` and `profiles.department_id`,
   * NOT a `sh_solution_departments(id)`. The lead-row trigger copies the
   * former and the confirmation policy compares against the latter, so this
   * column could not have been the solution-department surrogate key and still
   * worked.
   */
  department_id: string;
  /**
   * The department's college, denormalised at insert time by a trigger so the
   * per-college read does not depend on a department never moving. Whatever a
   * client sends here is overwritten.
   */
  institution_id: string | null;
  /**
   * Hours THIS department put in, not the initiative's total. NULL means the
   * department confirmed without stating hours — which is a different fact from
   * zero hours, and is why the column is nullable rather than defaulted to 0.
   */
  hours_contributed: number | null;
  /**
   * The department that recorded the initiative. Carries no power to confirm
   * anybody else's participation.
   */
  is_lead: boolean;
  confirmation_status: ParticipantConfirmationStatus;
  /** Set by the server from `auth.uid()`, never from anything a caller sends. */
  confirmed_by: string | null;
  confirmed_at: string | null;
  decline_note: string | null;
  created_at: string;
  updated_at: string;

  // ---- Joined for display. Null means "not readable from here", which under
  // ---- RLS is a different fact from "not set", so neither is invented.
  department_name: string | null;
  institution_name: string | null;
  confirmed_by_name: string | null;
}

/**
 * What naming departments on an initiative actually did.
 *
 * Two outcomes are reported separately because they mean different things to
 * whoever pressed the button: rows that were created, and departments that were
 * already on the initiative and so were left exactly as they were. Collapsing
 * them into one count would let "all three were already named, nothing happened"
 * render as "three departments added".
 */
export interface AddParticipantsOutcome {
  added: CommunityEngagementParticipant[];
  /** `department_id`s that already had a row, whatever its confirmation state. */
  alreadyNamed: string[];
}

/**
 * The cluster's own view of community work: one row, the whole institution
 * group.
 *
 * Each APPROVED initiative counts exactly ONCE here however many colleges ran
 * it. Field names are the database function's, not prettier ones — renaming
 * them in TypeScript would make the two halves of this feature describable only
 * by reading both.
 */
export interface CommunityClusterTotals {
  /** Approved initiatives, counted once each. */
  initiatives: number;
  /**
   * Named `total_beneficiaries`, not `beneficiaries`, because that is what the
   * function's `RETURNS TABLE` says and a TypeScript field that disagrees with
   * it reads `undefined` at runtime with no error anywhere. The name is also a
   * cross-lane contract:
   * `app/(routes)/accreditation/cac/_lib/community-collaboration.ts` reads the
   * same key off the same row.
   *
   * The CAC lane shipped both halves of that failure, and they had DIFFERENT
   * causes — matching the names here only fixes one. Two figures were a NAMING
   * error, which a rename catches. Four more, plus the whole shared-versus-
   * divided paragraph, were a GRAIN error, which no rename catches:
   * `fn_community_college_totals()` returns one row per (college, initiative)
   * and the panel read it as one aggregated row per college. See
   * `CommunityCollegeEngagementRow` below, which is named for its real grain
   * for that reason.
   */
  total_beneficiaries: number;
  /** Hours across every approved initiative, each counted once. */
  total_hours: number;
  /** Approved initiatives with more than one CONFIRMED department. */
  joint_initiatives: number;
  /** Approved initiatives with one confirmed department, or none. */
  solo_initiatives: number;
  /**
   * Reach per initiative, joint against solo — the number this whole feature
   * exists to make answerable.
   *
   * NULL, never 0, when there is nothing to average. A 0 would read as "joint
   * initiatives reach nobody"; NULL renders as "none recorded yet", which is
   * the true statement on the day this ships into an empty register.
   */
  avg_reach_joint: number | null;
  avg_reach_solo: number | null;
}

/**
 * One row per (college, approved initiative) where that college has at least
 * one CONFIRMED participating department.
 *
 * NOT one row per college. The database function returns the initiative grain
 * and lets the reader aggregate, because the headline number a college wants
 * — "we reached this many people" — is a sum over these rows, while the list a
 * principal wants is the rows themselves. Naming this type `...Totals` would
 * have been a lie about its grain, which is why it is not.
 */
export interface CommunityCollegeEngagementRow {
  institution_id: string;
  institution_name: string;
  engagement_id: string;
  title: string;
  engagement_date: string;
  /**
   * THE FULL number the initiative reached, not this college's share of it.
   * Every partner college's row carries the same figure, on purpose.
   */
  beneficiaries_count: number;
  /**
   * This college's OWN confirmed hours, not the initiative's total. Reach is
   * shared; effort is not, because effort is the thing each department
   * separately confirmed.
   */
  hours_contributed: number;
  /**
   * True when a confirmed department from ANOTHER college also took part. A
   * two-department initiative inside one college therefore reads false — it is
   * shared between departments, but not between colleges, and this row's grain
   * is the college.
   */
  is_shared: boolean;
  /** How many confirmed participating departments belong to other colleges. */
  shared_with: number;
}
