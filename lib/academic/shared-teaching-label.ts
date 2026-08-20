// lib/academic/shared-teaching-label.ts
// ============================================================================
// The two things a college may say about teaching it receives from a sibling
// college — and the third state, which is saying nothing yet.
//
// This file is deliberately free of any Supabase or React import so the rules
// below can be exercised without a database or a rendered tree. Everything that
// decides what a label MEANS lives here; the hook fetches, the component draws.
//
// THE THIRD STATE IS THE POINT. `null` is not "neither" and not "no". It is
// "this college has not said". Every helper below returns it as its own named
// state rather than collapsing it into one of the two values or into a zero,
// because a college that has not been asked yet must not be shown as having
// answered.
// ============================================================================

/**
 * Exactly two values. The database enforces the same pair with a CHECK
 * constraint in 20260908010000_shared_teaching_relationship_labels.sql; this
 * array is what stops the screen from offering a third.
 */
export const SHARED_TEACHING_LABELS = [
  'planned_partnership',
  'covering_a_shortage'
] as const;

export type SharedTeachingLabel = (typeof SHARED_TEACHING_LABELS)[number];

/** True only for the two stored values. Anything else — including null, '' and
 *  a value invented later — is not a label. */
export function isSharedTeachingLabel(
  value: unknown
): value is SharedTeachingLabel {
  return (
    typeof value === 'string' &&
    (SHARED_TEACHING_LABELS as readonly string[]).includes(value)
  );
}

/**
 * What each value says, in the college's own terms.
 *
 * No value carries a rank, a colour meaning "good", or a number. Covering a
 * shortage is not a worse answer than a planned partnership; it is a different
 * fact, and the reason this control exists is that a count alone cannot tell
 * them apart.
 */
export const SHARED_TEACHING_LABEL_COPY: Record<
  SharedTeachingLabel,
  { title: string; help: string }
> = {
  planned_partnership: {
    title: 'Planned partnership',
    help: 'We arranged this with the other college on purpose.'
  },
  covering_a_shortage: {
    title: 'Covering a shortage',
    help: 'We could not cover these sessions from our own college.'
  }
};

/** What the screen prints when nobody has answered yet. Never a blank, never a
 *  dash, never a zero. */
export const NOT_YET_LABELLED_COPY = {
  title: 'Not yet labelled',
  help: 'This college has not said which of the two this is.'
} as const;

export type SharedTeachingLabelState =
  | { state: 'not-yet-labelled'; label: null; title: string; help: string }
  | {
      state: 'labelled';
      label: SharedTeachingLabel;
      title: string;
      help: string;
    };

/**
 * Read a stored value into something a screen can print.
 *
 * An unrecognised string resolves to 'not-yet-labelled', not to a guess. If a
 * third value ever reaches the client — a hand-written row, an older release —
 * the honest report is that this college has not said one of the two things this
 * control asks about.
 */
export function describeSharedTeachingLabel(
  value: unknown
): SharedTeachingLabelState {
  if (!isSharedTeachingLabel(value)) {
    return {
      state: 'not-yet-labelled',
      label: null,
      title: NOT_YET_LABELLED_COPY.title,
      help: NOT_YET_LABELLED_COPY.help
    };
  }

  return {
    state: 'labelled',
    label: value,
    title: SHARED_TEACHING_LABEL_COPY[value].title,
    help: SHARED_TEACHING_LABEL_COPY[value].help
  };
}

/** Which side of a relationship the viewing college is on. Only the receiving
 *  college answers the question. */
export type SharedTeachingDirection = 'incoming' | 'outgoing';

export interface SharedTeachingWriteContext {
  /** Platform super admin — bypasses the key and the scope, as everywhere else. */
  isSuperAdmin: boolean;
  /** Holds `academic.shared_teaching.label.manage`. */
  canManage: boolean;
  /** 'incoming' means this college is the one receiving the teaching. */
  direction: SharedTeachingDirection;
}

/**
 * May this viewer set the label on this relationship?
 *
 * Mirrors the RLS write policies rather than replacing them — the database
 * refuses regardless of what this returns. It exists so a college that cannot
 * answer is not shown a control that will fail silently: an RLS denial comes
 * back as zero rows with no error, which on screen is indistinguishable from
 * success.
 *
 * 'outgoing' is false for everyone but a super admin, including a college with
 * the manage key: "we are covering a shortage" is the receiving college's
 * sentence about its own staffing, and the lending college does not get to write
 * it for them.
 */
export function canSetSharedTeachingLabel(
  ctx: SharedTeachingWriteContext
): boolean {
  if (ctx.isSuperAdmin) return true;
  if (!ctx.canManage) return false;
  return ctx.direction === 'incoming';
}

/**
 * A relationship as the read function returns it.
 *
 * `label` is `string | null` and not `SharedTeachingLabel | null` on purpose —
 * it arrives from the network, so it is untrusted until
 * `describeSharedTeachingLabel` has looked at it.
 */
export interface SharedTeachingRelationship {
  giver_institution_id: string;
  giver_name: string | null;
  receiver_institution_id: string;
  receiver_name: string | null;
  academic_year_id: string;
  academic_year_name: string | null;
  assignments: number;
  people: number;
  direction: SharedTeachingDirection;
  label: string | null;
  label_set_at: string | null;
  label_set_by_name: string | null;
}

export interface SharedTeachingRelationshipsPayload {
  relationships: SharedTeachingRelationship[];
  /** Cross-campus teaching involving the central office. Counted, never
   *  labelled — "partnership or shortage" is not a question about the office. */
  hub_assignments: number;
}

/**
 * How many relationships are still waiting on an answer.
 *
 * Returned alongside the total so a caller can print "3 of 5 still to label"
 * rather than a bare number that reads as a result.
 */
export function summariseSharedTeachingLabels(
  rows: SharedTeachingRelationship[]
): { total: number; labelled: number; notYetLabelled: number } {
  const labelled = rows.filter((r) => isSharedTeachingLabel(r.label)).length;
  return {
    total: rows.length,
    labelled,
    notYetLabelled: rows.length - labelled
  };
}
