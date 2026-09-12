/**
 * Which (campus × awarding body) pairs have nobody accountable — across every
 * campus the reader can see, not one at a time.
 *
 * WHY THIS EXISTS
 * The owners desk answers one campus at a time. That is the right shape for
 * assigning, and the wrong shape for NOTICING: 21 of the 35 declared pairs on
 * production have no owner at all, and three colleges — Allied Health Sciences,
 * Arts & Science (Aided) and the College of Education — have no owner for ANY
 * body they answer to. A reader would have to select each campus in turn and
 * remember what the last one said to learn that. Absence spread across ten
 * dropdown selections is absence nobody sees.
 *
 * THE DENOMINATOR IS THE DECLARED MATRIX, NEVER A GUESS
 * `institution_accreditation_bodies` records which bodies a campus actually
 * answers to (migration 20260816010000, applied 2026-08-06, 35 active rows).
 * That table is the only source used here. Nothing infers a body from a
 * college's name or type: a nursing college does not answer to DCI, and a
 * screen that guessed it did would invent a gap and then ask somebody to fill
 * it.
 *
 * WHAT AN ABSENT MAPPING MEANS — the same rule as institution-body-scope.ts
 * A campus with no mapping rows is UNKNOWN, not "answers to nobody". Four of
 * the fourteen institutions carry no mapping (offices and companies among
 * them), and they are simply not counted: they contribute no declared pair, so
 * they can contribute no gap. Counting them as gaps would manufacture work; the
 * `unmappedInstitutions` list names them instead so the screen can say the
 * denominator is short rather than pretend it is complete.
 *
 * WHY THE BODY-LEVEL SLOT IS THE QUESTION
 * `accreditation_metric_owners` stores ownership at two scopes in one table
 * (see owner-inheritance.ts). "Who is accountable for NAAC at this campus" is
 * the body-level row — `metric_code IS NULL AND programme_id IS NULL` — and
 * that is the row the invitation, the digest and the accept/decline buttons all
 * act on. Metric-level exceptions override individual metrics; they do not make
 * somebody accountable for the body. Production carries 14 owner rows and all
 * 14 are body-level, so today the two readings coincide, but the distinction is
 * what keeps this honest if that changes.
 *
 * NO NAMES ARE PROPOSED HERE, EVER
 * This module reports an EMPTY SLOT. Deciding who fills it is a human decision
 * made by IQAC, and a screen that suggested a name would be making it. There is
 * deliberately no scoring, no ranking of colleges, and no "suggested owner" —
 * the same call the rest of this desk already makes.
 *
 * Pure, and in its own module, because importing the page pulls the Supabase
 * client in at module scope and that cannot load under vitest — the same reason
 * owner-inheritance.ts and _lib/institution-body-scope.ts are shaped this way.
 */

import type { AssignmentStatus } from './owner-inheritance';

/** One row of `institution_accreditation_bodies`. */
export interface DeclaredBodyRow {
  institution_id: string;
  body_code: string;
  /** Absent is treated as active, matching `scopeFromRows`. */
  is_active?: boolean | null;
}

/**
 * One body-level row of `accreditation_metric_owners`.
 *
 * `metric_code` and `programme_id` are carried rather than assumed so a caller
 * that hands over every owner row it holds gets the same answer as one that
 * pre-filtered the query. Filtering only in SQL would make this function quietly
 * wrong for the other caller.
 */
export interface BodyOwnerRow {
  institution_id: string;
  body_code: string;
  metric_code: string | null;
  programme_id: string | null;
  assignment_status: AssignmentStatus;
}

/** A campus the reader may read. `id` and `name` are all that is needed. */
export interface NamedInstitution {
  id: string;
  name: string;
}

/**
 * Why a pair has nobody. Two different facts, and the screen words them
 * differently:
 *
 *   never-assigned — no body-level row exists. Nobody has ever been asked.
 *   declined       — somebody was asked and refused. On the record, and needing
 *                    reassignment rather than a first ask.
 *
 * A declined row is NOT ownership — `ResolvedOwner.isOwned` already takes that
 * position for metrics, and this agrees with it. Collapsing the two would either
 * hide a refusal or describe a refusal as a first ask.
 */
export type PairGapReason = 'never-assigned' | 'declined';

/** One declared pair that nobody is accountable for. */
export interface UnownedPair {
  institutionId: string;
  institutionName: string;
  bodyCode: string;
  reason: PairGapReason;
}

/** One campus's slice of the report, gaps first. */
export interface CampusGap {
  institutionId: string;
  institutionName: string;
  /** Declared (active) pairs for this campus. */
  declared: number;
  /** The declared pairs nobody holds, body code ascending. */
  unowned: UnownedPair[];
  /**
   * True when NOT ONE of this campus's declared bodies has an owner. The
   * headline fact: three colleges are in this state on production, and a
   * per-campus desk can never say it.
   */
  nobodyAtAll: boolean;
}

export interface OwnershipGapReport {
  /** Active (campus × body) pairs across the campuses handed in. */
  declaredPairs: number;
  /** Of those, how many have a live body-level owner. */
  ownedPairs: number;
  /** Every gap, campus name ascending then body code ascending. */
  unowned: UnownedPair[];
  /** Per campus, only campuses that HAVE a gap, campus name ascending. */
  campuses: CampusGap[];
  /** Campuses where no declared body has an owner, name ascending. */
  campusesWithNobody: CampusGap[];
  /** Gap count per body, largest first then code ascending. */
  byBody: Array<{ bodyCode: string; count: number }>;
  /**
   * Campuses the reader can see that have NO mapping row at all — unknown, not
   * empty. They are excluded from every count above; named here so a screen can
   * admit the matrix is incomplete instead of implying it is whole.
   */
  unmappedInstitutions: NamedInstitution[];
}

/** Keys one (campus × body) pair. */
function pairKey(institutionId: string, bodyCode: string): string {
  return `${institutionId}::${bodyCode}`;
}

/**
 * Build the cross-campus gap report.
 *
 * @param institutions the campuses the reader may read — already narrowed by
 *                     `_user_accessible_institutions()`, so this function never
 *                     needs to reason about permission. A campus absent from
 *                     this list is absent from the report, which is the correct
 *                     behaviour: we may not state a fact about a campus we
 *                     cannot read.
 * @param declared     rows of `institution_accreditation_bodies` for those ids.
 * @param owners       rows of `accreditation_metric_owners` for those ids.
 *
 * Rows naming a campus outside `institutions` are ignored rather than trusted:
 * the reader's accessible set is the boundary of what this report may claim,
 * and a stray row must not widen it.
 */
export function describeOwnershipGaps(
  institutions: readonly NamedInstitution[],
  declared: readonly DeclaredBodyRow[],
  owners: readonly BodyOwnerRow[],
): OwnershipGapReport {
  const nameById = new Map(institutions.map((i) => [i.id, i.name]));

  // The live body-level owners, keyed by pair. `metric_code IS NULL AND
  // programme_id IS NULL` is the body-level slot; a declined row is deliberately
  // NOT in here, so the pair falls through to a gap and is labelled `declined`.
  const liveOwners = new Set<string>();
  const declinedPairs = new Set<string>();
  for (const row of owners) {
    if (row.metric_code !== null || row.programme_id !== null) continue;
    if (!nameById.has(row.institution_id)) continue;
    const key = pairKey(row.institution_id, row.body_code);
    if (row.assignment_status === 'declined') declinedPairs.add(key);
    else liveOwners.add(key);
  }

  // The declared matrix, de-duplicated per campus. `is_active === false` drops
  // out here for the same reason `scopeFromRows` drops it: a retired mapping is
  // not a gap.
  const bodiesByCampus = new Map<string, Set<string>>();
  for (const row of declared) {
    if (row.is_active === false) continue;
    if (!nameById.has(row.institution_id)) continue;
    if (!row.body_code) continue;
    const bucket = bodiesByCampus.get(row.institution_id) ?? new Set<string>();
    bucket.add(row.body_code);
    bodiesByCampus.set(row.institution_id, bucket);
  }

  let declaredPairs = 0;
  let ownedPairs = 0;
  const campuses: CampusGap[] = [];

  for (const institution of institutions) {
    const bodies = bodiesByCampus.get(institution.id);
    // No mapping read for this campus: unknown, not empty. Contributes nothing.
    if (!bodies || bodies.size === 0) continue;

    const sorted = [...bodies].sort((a, b) => a.localeCompare(b));
    const unowned: UnownedPair[] = [];
    for (const bodyCode of sorted) {
      declaredPairs += 1;
      const key = pairKey(institution.id, bodyCode);
      if (liveOwners.has(key)) {
        ownedPairs += 1;
        continue;
      }
      unowned.push({
        institutionId: institution.id,
        institutionName: institution.name,
        bodyCode,
        // A pair can be both declined and live only if two body-level rows
        // existed for it, which `UNIQUE NULLS NOT DISTINCT` forbids — so the
        // `declined` read here is unambiguous.
        reason: declinedPairs.has(key) ? 'declined' : 'never-assigned',
      });
    }

    if (unowned.length === 0) continue;
    campuses.push({
      institutionId: institution.id,
      institutionName: institution.name,
      declared: sorted.length,
      unowned,
      nobodyAtAll: unowned.length === sorted.length,
    });
  }

  campuses.sort((a, b) => a.institutionName.localeCompare(b.institutionName));

  const byBodyCount = new Map<string, number>();
  for (const campus of campuses) {
    for (const pair of campus.unowned) {
      byBodyCount.set(pair.bodyCode, (byBodyCount.get(pair.bodyCode) ?? 0) + 1);
    }
  }

  return {
    declaredPairs,
    ownedPairs,
    unowned: campuses.flatMap((c) => c.unowned),
    campuses,
    campusesWithNobody: campuses.filter((c) => c.nobodyAtAll),
    byBody: [...byBodyCount.entries()]
      .map(([bodyCode, count]) => ({ bodyCode, count }))
      .sort((a, b) => b.count - a.count || a.bodyCode.localeCompare(b.bodyCode)),
    unmappedInstitutions: institutions.filter(
      (i) => (bodiesByCampus.get(i.id)?.size ?? 0) === 0,
    ),
  };
}

/**
 * The one sentence above the list.
 *
 * A count, never a grade. "21 of 35" is a statement about records; "60%
 * uncovered" would read as a score for the colleges named underneath, and this
 * desk does not score colleges — the same call its header already makes.
 */
export function gapHeadline(report: OwnershipGapReport): string {
  if (report.declaredPairs === 0) {
    return 'No campus you can see has recorded which awarding bodies it answers to yet.';
  }
  const gaps = report.unowned.length;
  if (gaps === 0) {
    // Phrased with the count in brackets so it stays grammatical at one pair as
    // well as at thirty-five — a reader with access to a single campus is the
    // common case, not the edge case.
    return `Every campus-and-body pair you can see (${report.declaredPairs}) has somebody accountable.`;
  }
  const pairWord = gaps === 1 ? 'pair has' : 'pairs have';
  return `${gaps} of the ${report.declaredPairs} campus-and-body ${pairWord} nobody accountable.`;
}
