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

/**
 * Decision 6 — a correction leaves a mark.
 *
 * Shown beside an answer that has been changed since it was first given. Not a
 * warning and not a count of revisions: only the fact that the college revisited
 * it, which is the difference between a standing answer and a settled one.
 */
export const EDITED_COPY = {
  title: 'Edited',
  help: 'This college changed this answer after first giving it.'
} as const;

/**
 * Decision 9 — when only one side has answered, show that answer AND say the
 * other is still pending.
 *
 * Silence from the other college is a real state and must be printed as one.
 * Leaving the space blank reads as agreement with whoever did answer, which is
 * the one thing a two-sided label must never imply.
 */
export function otherSideNotYetLabelledNote(
  otherCollegeName: string | null | undefined
): string {
  return `${otherCollegeName?.trim() || 'The other college'} has not labelled this yet.`;
}

/**
 * Decision 8 — a carried-forward answer says so, never passes as this year's.
 *
 * The year is named when it is known. When it is not, the note still fires: "we
 * cannot name the year" is not a reason to print a carried-forward answer as
 * fresh (decision 12 — nothing records this yet, never a silent substitute).
 */
export function carriedForwardNote(
  fromAcademicYearName: string | null | undefined
): string {
  const year = fromAcademicYearName?.trim();
  return year ? `Carried forward from ${year}` : 'Carried forward from last year';
}

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

/** Which side of a relationship the viewing college is on. Both sides answer;
 *  the direction decides WHICH answer is theirs, not whether they get one. */
export type SharedTeachingDirection = 'incoming' | 'outgoing';

/** The two seats at a relationship. The viewer occupies exactly one. */
export type SharedTeachingSide = 'giver' | 'receiver';

export interface SharedTeachingWriteContext {
  /** Platform super admin — bypasses the key and the scope, as everywhere else. */
  isSuperAdmin: boolean;
  /** Holds `academic.shared_teaching.label.manage`. */
  canManage: boolean;
  /** 'incoming' means this college is the one receiving the teaching. */
  direction: SharedTeachingDirection;
}

/**
 * May this viewer set THEIR OWN side's label on this relationship?
 *
 * Mirrors the RLS write policies rather than replacing them — the database
 * refuses regardless of what this returns. It exists so a college that cannot
 * answer is not shown a control that will fail silently: an RLS denial comes
 * back as zero rows with no error, which on screen is indistinguishable from
 * success.
 *
 * DIRECTION NO LONGER GATES THIS (Director decision 5, 2026-08-18). Both the
 * lending and the receiving college answer, each in its own row, and the two
 * answers are shown together. The earlier rule — receiver only — made the
 * lending college a subject of a statement rather than a party to it, and
 * quietly discarded the disagreement between the two readings, which is the
 * most useful thing either of them says.
 *
 * What direction still decides is WHICH row is the viewer's: see
 * `sharedTeachingSideFor`. Nobody writes the other college's side, and the
 * database CHECK confines a row's author to the two colleges named in it.
 */
export function canSetSharedTeachingLabel(
  ctx: SharedTeachingWriteContext
): boolean {
  if (ctx.isSuperAdmin) return true;
  return ctx.canManage;
}

/** Which seat the viewing college occupies. Receiving the teaching puts them in
 *  the receiver's seat; lending it puts them in the giver's. */
export function sharedTeachingSideFor(
  direction: SharedTeachingDirection
): SharedTeachingSide {
  return direction === 'incoming' ? 'receiver' : 'giver';
}

/**
 * One college's answer, as the read function returns it.
 *
 * `label` is `string | null` and not `SharedTeachingLabel | null` on purpose —
 * it arrives from the network, so it is untrusted until
 * `describeSharedTeachingLabel` has looked at it.
 */
export interface SharedTeachingLabelSide {
  label: string | null;
  set_at: string | null;
  set_by_name: string | null;
  edited_at: string | null;
  carried_forward_from_academic_year_id: string | null;
  carried_forward_from_academic_year_name: string | null;
}

/**
 * A relationship as the read function returns it.
 *
 * TWO ANSWERS, EITHER OF WHICH MAY BE ABSENT. A side is `null` when that college
 * has not spoken — not an object of nulls and not a zero, so "they said nothing"
 * stays distinguishable from "they said neither" (decision 12). The two are
 * allowed to disagree; a disagreement is a finding, not a data error.
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
  /** The lending college's own answer, or null if it has not given one. */
  giver_label: SharedTeachingLabelSide | null;
  /** The receiving college's own answer, or null if it has not given one. */
  receiver_label: SharedTeachingLabelSide | null;
}

/** The label row belonging to the college doing the viewing. */
export function ownSideOf(
  row: SharedTeachingRelationship
): SharedTeachingLabelSide | null {
  return sharedTeachingSideFor(row.direction) === 'receiver'
    ? row.receiver_label
    : row.giver_label;
}

/** The label row belonging to the college at the other end. */
export function otherSideOf(
  row: SharedTeachingRelationship
): SharedTeachingLabelSide | null {
  return sharedTeachingSideFor(row.direction) === 'receiver'
    ? row.giver_label
    : row.receiver_label;
}

/** The other college's name, for the pending note (decision 9). */
export function otherCollegeNameOf(
  row: SharedTeachingRelationship
): string | null {
  return sharedTeachingSideFor(row.direction) === 'receiver'
    ? row.giver_name
    : row.receiver_name;
}

/**
 * The institution id that goes in `labelled_by_institution_id` when this viewer
 * writes. The database CHECK admits only the two colleges named in the row, so
 * getting this wrong fails loudly with 23514 rather than filing a stray opinion.
 */
export function labellingInstitutionIdFor(
  row: SharedTeachingRelationship
): string {
  return sharedTeachingSideFor(row.direction) === 'receiver'
    ? row.receiver_institution_id
    : row.giver_institution_id;
}

/**
 * A stable identity for one relationship line.
 *
 * Used to tell which row a pending write belongs to, so one row's save does not
 * grey out every other row's buttons.
 */
export function sharedTeachingRelationshipKey(parts: {
  giverInstitutionId: string;
  receiverInstitutionId: string;
  academicYearId: string;
}): string {
  return `${parts.giverInstitutionId}|${parts.receiverInstitutionId}|${parts.academicYearId}`;
}

/** Everything the screen needs about one side, resolved in one place. */
export interface SharedTeachingSideReading {
  state: SharedTeachingLabelState['state'];
  label: SharedTeachingLabel | null;
  title: string;
  help: string;
  setByName: string | null;
  setAt: string | null;
  edited: boolean;
  editedAt: string | null;
  carriedForward: boolean;
  carriedForwardNote: string | null;
}

/**
 * Read one side into something a screen can print.
 *
 * An absent side and a side carrying an unrecognised value both resolve to
 * 'not-yet-labelled', because in neither case has that college said one of the
 * two things this control asks about.
 */
export function readSharedTeachingSide(
  side: SharedTeachingLabelSide | null | undefined
): SharedTeachingSideReading {
  const described = describeSharedTeachingLabel(side?.label);
  const carriedForward = Boolean(side?.carried_forward_from_academic_year_id);

  return {
    state: described.state,
    label: described.label,
    title: described.title,
    help: described.help,
    setByName: side?.set_by_name ?? null,
    setAt: side?.set_at ?? null,
    edited: Boolean(side?.edited_at),
    editedAt: side?.edited_at ?? null,
    carriedForward,
    carriedForwardNote: carriedForward
      ? carriedForwardNote(side?.carried_forward_from_academic_year_name)
      : null
  };
}

export interface SharedTeachingRelationshipsPayload {
  relationships: SharedTeachingRelationship[];
  /** Cross-campus teaching involving the central office. Counted, never
   *  labelled — "partnership or shortage" is not a question about the office. */
  hub_assignments: number;
}

/**
 * How many relationships are still waiting on THIS college's answer.
 *
 * Counts the viewer's own side only. Counting both sides would tell a college it
 * has work outstanding on rows where the only silence is the other college's,
 * which it cannot act on — and since decision 5 gave each side its own row, a
 * combined count is a number nobody can move.
 *
 * `awaitingOtherCollege` is reported separately rather than folded in, so the
 * screen can say what is actually true of each: work for us, and silence from
 * them (decision 9).
 */
export function summariseSharedTeachingLabels(rows: SharedTeachingRelationship[]): {
  total: number;
  labelled: number;
  notYetLabelled: number;
  awaitingOtherCollege: number;
} {
  const labelled = rows.filter((r) =>
    isSharedTeachingLabel(ownSideOf(r)?.label)
  ).length;
  const awaitingOtherCollege = rows.filter(
    (r) => !isSharedTeachingLabel(otherSideOf(r)?.label)
  ).length;

  return {
    total: rows.length,
    labelled,
    notYetLabelled: rows.length - labelled,
    awaitingOtherCollege
  };
}
