/**
 * The UGC readiness checklist, as data.
 *
 * Source: University Grants Commission, "Guidelines for Transforming Higher
 * Education Institutions into Multidisciplinary Institutions", September 2022,
 * section 6.3 — the section describing a cluster of institutions and the
 * Academic Council that runs one.
 *
 * ⚠ WHAT THIS IS NOT. JKKN is NOT pursuing formal cluster status and there is
 * no submission, no assessor and no date by which any of this must be true
 * (Director decision, 2026-08-14). JKKN applies the guidance to itself because
 * the guidance describes something worth having, and the only reader of this
 * checklist is JKKN. Every string below is written on that footing: nothing
 * here may imply a deadline, an inspection or a consequence, because inventing
 * one would invent an authority that does not exist.
 *
 * ── THE FINDING THIS EXISTS TO MAKE VISIBLE ─────────────────────────────────
 *
 * JKKN already does the cluster BEHAVIOUR — rooms booked across college
 * boundaries, Senior Learners teaching on another college's plan — and files
 * none of the cluster GOVERNANCE. Neither half is visible from the other, and
 * neither half has ever been on one screen. That asymmetry is the whole output
 * of this file; the rows are ordered so a reader meets it rather than has to
 * assemble it.
 *
 * ── FIVE RULES, EACH LOAD-BEARING ───────────────────────────────────────────
 *
 *   1. NO SCORE, NO RANKING, NO PROPORTION OF A MAXIMUM. Not a total, not
 *      "four of six", not a share. The moment a checklist carries a fraction it
 *      is a rating, and a rating implies somebody entitled to award it. Nobody
 *      is. `isSatisfied` exists so a caller can style one row; there is
 *      deliberately no helper that counts satisfied rows, because the only use
 *      for such a count is the total this file refuses to produce.
 *
 *   2. NO BARE ZERO, ANYWHERE. A zero on a screen reads as a measured bad
 *      result and would libel a college for a gap in the platform. `figure()`
 *      maps 0 to `null`, and a null value is rendered as the REASON it is
 *      empty. This mirrors the `Figure` component the collaboration section
 *      beside this one already uses, so the two read as one page.
 *
 *   3. TWO KINDS OF EMPTY, NEVER INTERCHANGEABLE. "The platform holds a place
 *      for this and nobody has filled it in" (`awaiting-entry`) and "nothing
 *      anywhere records this at all" (`not-expressible`) are different facts
 *      about different problems — the first is answered by someone typing, the
 *      second is not answerable by typing at all. Collapsing them is how a
 *      screen ends up telling a reader to go and enter data into a column that
 *      does not exist.
 *
 *   4. NO COUNT IS EVER WRITTEN INTO PROSE. `asks` and `reading` carry no
 *      digits, and a test asserts it. Eleven hardcoded counts had to be
 *      stripped out of this module once already when the data moved and the
 *      sentences did not.
 *
 *   5. A RED ROW OFFERS THE ROUTE THAT FIXES IT, where one exists. A finding
 *      with no next click is a complaint.
 *
 * ── WHY THE COUNTS ARE PASSED IN RATHER THAN READ HERE ──────────────────────
 *
 * No Supabase import, so this module loads under vitest — the same reason
 * `cluster-scope.ts` and `cac-metric-catalog.ts` sit beside it. The caller
 * supplies the live figures from reads the CAC page already makes, so this file
 * adds no request and holds no number of its own.
 */

/** The permission that opens this section. Named in the refusal, so the reader
 *  is told what to ask for rather than being bounced. */
export const CAC_READINESS_PERMISSION = 'accreditation.cac.readiness.view';

/** Where the checklist comes from, printed so a reader can go and read it. */
export const UGC_GUIDANCE = {
  issuer: 'University Grants Commission',
  document:
    'Guidelines for Transforming Higher Education Institutions into Multidisciplinary Institutions',
  issued: 'September 2022',
  section: '6.3',
} as const;

/**
 * How true a line of the guidance is of JKKN today.
 *
 * `in-place`        — it is happening, and the platform can show it happening.
 * `awaiting-entry`  — the platform holds a place for this and nobody has used
 *                     it yet. A statement about adoption, never about quality.
 * `not-expressible` — nothing anywhere on the platform records this. No amount
 *                     of data entry changes it; the shape of the record would
 *                     have to change.
 *                     ⚠ NO ROW CARRIES THIS TODAY, and that is the point rather
 *                     than dead code. The inter-college agreement was the last
 *                     one, until the agreements register gained a column that
 *                     can hold the second college (migration 20260921040000).
 *                     The state stays in the vocabulary because the distinction
 *                     in rule 3 is what stops a future row being filed under
 *                     `awaiting-entry` and telling a reader to go and type into
 *                     a column that does not exist.
 * `blocked`         — it cannot exist until an earlier line does. Not a failing
 *                     of its own, and it must not be dressed as one.
 * `elsewhere`       — real, recorded, and read on another surface rather than
 *                     counted again here.
 */
export type ReadinessState =
  | 'in-place'
  | 'awaiting-entry'
  | 'not-expressible'
  | 'blocked'
  | 'elsewhere';

/** A figure, or the reason there is not one. `value` is never 0. */
export interface ReadinessFigure {
  label: string;
  /** Null whenever there is nothing to print — including when the count is 0. */
  value: number | null;
  /** Printed in place of the value. Never "0", never "none" without a subject. */
  reason: string;
  /** Printed after the value. Empty when the label already carries the unit. */
  unit: string;
}

export interface ReadinessRow {
  id: string;
  /** What the guidance describes a cluster as having. Carries no digits. */
  asks: string;
  /** What is true of JKKN today, and how it is known. Carries no digits. */
  reading: string;
  state: ReadinessState;
  /** May be empty — a row with nothing countable prints no figures at all. */
  figures: ReadinessFigure[];
  /** Where to go to change this, or null when no single route does. */
  fix: { href: string; label: string } | null;
}

/** The live counts this checklist reads. Every one comes from a cluster-wide,
 *  definer-scoped read the CAC page already makes, so two council members
 *  looking at this section see the same thing. */
export interface ReadinessInput {
  /**
   * Agreements in the register naming a JKKN college as the other signatory —
   * one record joining two colleges, not two records each naming the other in
   * free text. Cluster-wide, read as definer, so every council member sees the
   * same figure rather than their own college's slice.
   */
  internalAgreements: number;
  /** Councils on record with committee_type = 'cluster'. */
  councilsConstituted: number;
  /** Bookings where one college booked another college. */
  peerBookings: number;
  /** Bookings between a college and the central office. Shared infrastructure,
   *  reported apart from the line above and never folded into it. */
  hubBookings: number;
  /** Cross-campus teaching assignments, and the people behind them. */
  teachingAssignments: number;
  teachingPeople: number;
  /** Publications recorded against an institution. */
  publications: number;
}

const AGREEMENTS_REGISTER = '/accreditation/manage/collaborations';
const COMMITTEES_HUB = '/accreditation/naac/committees';

/** 0 is not a figure here — it is the absence of one, and it prints as a reason. */
function figure(
  label: string,
  value: number,
  reason: string,
  unit = '',
): ReadinessFigure {
  return { label, value: value > 0 ? value : null, reason, unit };
}

/**
 * The checklist, derived at read time from the counts supplied.
 *
 * Ordered as the guidance orders it — what is written down first, what is
 * practised second — which is also the order that makes the finding legible:
 * the written half is empty and the practised half is not.
 */
export function buildUgcReadiness(input: ReadinessInput): ReadinessRow[] {
  const hasCouncil = input.councilsConstituted > 0;

  return [
    {
      id: 'written-agreement',
      asks: 'A written agreement binding the colleges to one another.',
      reading:
        'The agreements register can now name the other signatory as a JKKN college rather than as free text, so an agreement between two colleges is held as one record joining them and both colleges see it. Until that column existed, no record anywhere could hold the fact and typing did not help. It does now: what is missing is the first agreement, not the means of keeping one.',
      state: input.internalAgreements > 0 ? 'in-place' : 'awaiting-entry',
      figures: [
        figure(
          'Agreements between colleges',
          input.internalAgreements,
          'nothing recorded yet',
        ),
      ],
      fix: {
        href: AGREEMENTS_REGISTER,
        label: 'Open the agreements register',
      },
    },
    {
      id: 'council-constituted',
      asks:
        'An Academic Council constituted, with the member colleges represented on it.',
      reading:
        'Councils live in the shared committees table under the cluster type, and this reads that table live. Forming one happens on the committees hub, which owns the roster and the rule that a council spans more than one institution.',
      state: hasCouncil ? 'in-place' : 'awaiting-entry',
      figures: [
        figure(
          'Councils constituted',
          input.councilsConstituted,
          'none constituted yet',
        ),
      ],
      fix: { href: COMMITTEES_HUB, label: 'Open committees and councils' },
    },
    {
      id: 'council-decisions',
      asks:
        'The Council meeting on a record, with what it decided written down and carried forward.',
      reading: hasCouncil
        ? 'Minutes and resolutions are held against each council and read on that council’s own page, so they are linked here rather than counted again across councils.'
        : 'Minutes are recorded against a council. Until one is constituted there is nothing for this line to read — which is a consequence of the line above, not a separate failing.',
      state: hasCouncil ? 'elsewhere' : 'blocked',
      figures: [],
      fix: { href: COMMITTEES_HUB, label: 'Open committees and councils' },
    },
    {
      id: 'shared-research-agenda',
      asks:
        'A research agenda held in common, with published work recorded against it.',
      reading:
        'The platform holds a place for a published paper against an institution, and this reads it live. What is missing is the first record, not the means of keeping it — a paper is recorded when it is submitted through the innovation module.',
      state: input.publications > 0 ? 'in-place' : 'awaiting-entry',
      figures: [
        figure(
          'Publications recorded',
          input.publications,
          'nothing recorded yet',
        ),
      ],
      fix: null,
    },
    {
      id: 'pooled-facilities',
      asks: 'Rooms and equipment used across the boundary between colleges.',
      reading:
        'Read live from resource bookings that cross an institution boundary. College-to-college traffic and traffic with the central office are counted apart, because only the first is two colleges choosing to share — the second is shared central infrastructure, which is worth having and is not the same thing.',
      state: input.peerBookings > 0 ? 'in-place' : 'awaiting-entry',
      figures: [
        figure(
          'College to college',
          input.peerBookings,
          'no college has booked from another',
          'bookings',
        ),
        figure(
          'With the central office',
          input.hubBookings,
          'nothing recorded yet',
          'bookings',
        ),
      ],
      fix: null,
    },
    {
      id: 'shared-teaching',
      asks: 'Teaching shared across the colleges rather than held inside one.',
      reading:
        'Read live from Senior Learners whose home college is one institution and who are scheduled onto another college’s plan. This is the strongest cluster behaviour JKKN already has, and none of it rests on anything written down.',
      state: input.teachingAssignments > 0 ? 'in-place' : 'awaiting-entry',
      figures: [
        figure(
          'Cross-campus assignments',
          input.teachingAssignments,
          'nothing recorded yet',
        ),
        figure(
          'Senior Learners involved',
          input.teachingPeople,
          'nobody recorded yet',
        ),
      ],
      fix: null,
    },
  ];
}

/** True when the guidance's line is already true of JKKN. Deliberately the only
 *  predicate exported: there is no companion that counts how many rows satisfy
 *  it, because the only use for that number is a score. */
export function isSatisfied(row: ReadinessRow): boolean {
  return row.state === 'in-place';
}

/** Whether the row's emptiness is answerable by somebody entering data. False
 *  for `not-expressible`, which is the distinction rule 3 protects. */
export function isFixableByEntry(row: ReadinessRow): boolean {
  return row.state === 'awaiting-entry' || row.state === 'blocked';
}
