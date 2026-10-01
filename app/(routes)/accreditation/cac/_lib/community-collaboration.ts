// app/(routes)/accreditation/cac/_lib/community-collaboration.ts
// ============================================================================
// The shaping behind the fifth cluster-collaboration panel: community work the
// colleges did TOGETHER.
//
// Pure, and in its own module with no Supabase import, for the same reason
// `cluster-scope.ts` and `cac-metric-catalog.ts` sit apart from their pages —
// importing the page pulls the Supabase client in at module scope and that
// cannot load under vitest.
//
// THE FOUR COUNCIL DECISIONS THAT SHAPE EVERY FUNCTION HERE are stated in full
// at the top of `_components/cluster-collaboration-section.tsx`. Three of them
// decide the shape of this file specifically:
//
//   No bare zero. Nothing below returns a number for the screen to print
//   unguarded — every figure comes back paired with the REASON it would be
//   empty, and the reason is always the specific one. The register
//   (`sh_community_engagements`) exists and is readable cluster-wide, so an
//   absence here can only ever mean "nothing recorded yet". It can never mean
//   "nothing captures this" (something does) and it can never mean "outside
//   what you can see" (the read is definer-scoped, like every other figure on
//   this page). Those three reasons are not interchangeable and picking the
//   wrong one is a lie about which gap a reader is looking at.
//
//   Volume alone is never the verdict. The headline is REACH PER INITIATIVE,
//   joint against solo — not the count of joint initiatives. The Director
//   rejected a joint-count on 2026-09-18 for a concrete reason: three colleges
//   can put their names on one camp and every joint count in the cluster rises
//   without one extra person being reached. An average reach cannot be inflated
//   that way. But an average is only a finding if it rests on enough
//   initiatives to be a pattern, so `reachComparison` refuses to compute a
//   difference over a thin denominator and says which side is thin instead.
//   For the same reason nothing here ranks the colleges: there is no "most
//   collaborative college", by design.
//
//   No count is written into prose. Every number a caller prints comes out of
//   these functions, derived from the rows that came back. Eleven hardcoded
//   counts had to be stripped from this module once already.
//
// ON THE ASYMMETRY THIS FILE EXISTS TO MAKE VISIBLE (Director decision D2).
// A shared initiative is counted ONCE for the cluster and IN FULL for each
// college that took part. So the per-college beneficiary figures deliberately
// add up to more than the cluster total, and a council member who notices that
// without being told will read it as a bug. `beneficiaryAsymmetry` returns the
// arithmetic and names which of the three possible shapes the data is in, so
// the screen can say the true sentence rather than the expected one.
// ============================================================================

// ----------------------------------------------------------------------------
// THE TWO RPC SHAPES, COPIED FROM THE FUNCTIONS THEMSELVES.
//
// These are not a description of what the panel wants; they are the RETURNS
// TABLE clauses of `fn_community_cluster_totals()` and
// `fn_community_college_totals()` in
// supabase/migrations/20261226113000_community_engagement_joint_departments.sql,
// field for field and name for name.
//
// An earlier version described the shape the screen wished for instead, and the
// panel went out reading keys that were not there. Nothing threw: a missing key
// on an `any` payload is not an error, it is `undefined`, `num()` turns that
// into 0, and 0 prints as "nothing recorded yet". Every type checked, every
// test passed, and the screen would have reported an empty register over real
// work. The per-college table was the whole of it — all four of its numeric
// columns, and the asymmetry paragraph computed from them — plus the two
// cluster volume figures, which the sibling lane has since renamed to
// `total_beneficiaries` / `total_hours` to match what was written here.
//
// So: when either function's signature changes, change these first and let the
// compiler find the callers.
// ----------------------------------------------------------------------------

/** The one row `fn_community_cluster_totals()` returns. The cluster, counted once. */
export interface CommunityClusterTotals {
  /** Every approved initiative, joint and solo together. */
  initiatives: number;
  /** People reached, counting a shared initiative ONCE. */
  total_beneficiaries: number;
  total_hours: number;
  joint_initiatives: number;
  solo_initiatives: number;
  /**
   * Beneficiaries per joint initiative.
   *
   * NULL — never 0 — when there is nothing to average. The function returns it
   * that way deliberately (decision D4): a 0 here would read as "joint
   * initiatives reach nobody", which is a measurement, and no measurement has
   * been taken.
   */
  avg_reach_joint: number | null;
  /** Beneficiaries per solo initiative. NULL, never 0, when nothing is on record. */
  avg_reach_solo: number | null;
}

/**
 * One row from `fn_community_college_totals()` — which is one row per
 * (college, initiative), NOT one row per college.
 *
 * `beneficiaries_count` is the FULL figure for the initiative, carried whole by
 * every college that took part (decision D2). `hours_contributed` is this
 * college's own confirmed hours, not the initiative's total, because
 * beneficiaries are shared and effort is not. `shared_with` counts the
 * confirmed participating departments belonging to OTHER colleges, so a
 * two-department initiative inside one college reads `is_shared = false`.
 */
export interface CommunityCollegeRow {
  institution_id: string | null;
  institution_name: string | null;
  engagement_id: string;
  title: string | null;
  engagement_date: string | null;
  beneficiaries_count: number | null;
  hours_contributed: number | null;
  is_shared: boolean;
  shared_with: number;
}

/**
 * One college's line in the per-college table.
 *
 * DERIVED HERE, not returned by any function — `fn_community_college_totals()`
 * returns initiative rows and the table shows colleges. `aggregateColleges`
 * below is the only thing that builds one.
 */
export interface CommunityCollegeTotals {
  institution_id: string | null;
  institution_name: string | null;
  /** The full figure for every initiative this college took part in, summed. */
  beneficiaries: number;
  /** This college's own confirmed hours, summed. */
  hours: number;
  initiatives: number;
  shared_initiatives: number;
}

/**
 * How many initiatives an average has to rest on before it is read as a
 * pattern rather than as an anecdote.
 *
 * Three is a judgement, not a measurement, and it is a constant so that the
 * judgement is visible and arguable instead of buried in a comparison. Below
 * it the panel still shows both figures — hiding them would be its own kind of
 * dishonesty — but it shows no difference between them and says why.
 */
export const READABLE_INITIATIVES = 3;

export type ReachVerdict =
  /** Both sides readable, and joint reaches further per initiative. */
  | 'joint-reaches-further'
  /** Both sides readable, and solo reaches further per initiative. */
  | 'solo-reaches-further'
  /** Both sides readable and identical. */
  | 'level'
  /** Only joint work is on record, so there is nothing to compare it against. */
  | 'only-joint-recorded'
  /** Only solo work is on record. */
  | 'only-solo-recorded'
  /** Neither is on record. */
  | 'nothing-recorded';

export interface ReachSide {
  /** Beneficiaries per initiative. 0 means unrecorded, never "reached nobody". */
  value: number;
  /** How many initiatives the average rests on. */
  initiatives: number;
  /** Printed INSTEAD of the figure when there is nothing. Never "0". */
  empty: string;
}

export interface ReachReading {
  joint: ReachSide;
  solo: ReachSide;
  verdict: ReachVerdict;
  /**
   * How much further joint work reaches per initiative, as a percentage of the
   * solo figure. Null whenever it would be unreadable — either side missing, or
   * either side resting on fewer than `READABLE_INITIATIVES`. A percentage
   * computed over one initiative looks like knowledge and is not.
   */
  differencePct: number | null;
  /** The sides resting on too few initiatives to read. Empty when neither is. */
  thinSides: Array<'joint' | 'solo'>;
}

/** The reason an absence carries when the register itself holds nothing. */
const NOTHING_RECORDED = 'nothing recorded yet';

/**
 * WHICH ABSENCE THIS IS, AND THEY ARE NOT THE SAME ABSENCE.
 *
 * An unfilled register and a recorded initiative that reached nobody it counted
 * are two different facts, and "nothing recorded yet" is only true of the
 * first. Printing it over the second is the no-bare-zero rule's own failure
 * mode one step along: the figure is correctly hidden and the reason given for
 * hiding it is false. So once an initiative of that kind exists, the absence is
 * described as a count of nobody rather than as an empty register.
 */
function reachEmptyReason(initiatives: number): string {
  return initiatives > 0 ? 'no one counted as reached' : NOTHING_RECORDED;
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

/**
 * THE HEADLINE: reach per initiative, joint against solo.
 *
 * Deliberately NOT the count of joint initiatives, and deliberately not a
 * ranking. See the file header for why.
 */
export function reachComparison(
  totals: CommunityClusterTotals | null | undefined,
): ReachReading {
  const jointInitiatives = num(totals?.joint_initiatives);
  const soloInitiatives = num(totals?.solo_initiatives);
  const jointReach = num(totals?.avg_reach_joint);
  const soloReach = num(totals?.avg_reach_solo);

  const joint: ReachSide = {
    value: jointReach,
    initiatives: jointInitiatives,
    empty: reachEmptyReason(jointInitiatives),
  };
  const solo: ReachSide = {
    value: soloReach,
    initiatives: soloInitiatives,
    empty: reachEmptyReason(soloInitiatives),
  };

  // An initiative can legitimately reach nobody it counted, so the side is
  // "recorded" when an INITIATIVE exists, not when the average is above zero.
  const hasJoint = jointInitiatives > 0;
  const hasSolo = soloInitiatives > 0;

  const thinSides: Array<'joint' | 'solo'> = [];
  if (hasJoint && jointInitiatives < READABLE_INITIATIVES) thinSides.push('joint');
  if (hasSolo && soloInitiatives < READABLE_INITIATIVES) thinSides.push('solo');

  let verdict: ReachVerdict;
  if (!hasJoint && !hasSolo) verdict = 'nothing-recorded';
  else if (hasJoint && !hasSolo) verdict = 'only-joint-recorded';
  else if (!hasJoint && hasSolo) verdict = 'only-solo-recorded';
  else if (jointReach > soloReach) verdict = 'joint-reaches-further';
  else if (jointReach < soloReach) verdict = 'solo-reaches-further';
  else verdict = 'level';

  const comparable =
    hasJoint &&
    hasSolo &&
    thinSides.length === 0 &&
    soloReach > 0 &&
    jointReach > 0;

  return {
    joint,
    solo,
    verdict,
    differencePct: comparable
      ? Math.round((100 * (jointReach - soloReach)) / soloReach)
      : null,
    thinSides,
  };
}

/** The two cluster-wide volume figures, each carrying its own empty reason. */
export interface CommunityVolume {
  key: 'beneficiaries' | 'hours';
  label: string;
  value: number;
  empty: string;
  meaning: string;
}

/**
 * The volume figures, in a FIXED order that does not depend on their values.
 *
 * They sit below the headline rather than above it on purpose: this is the
 * "biggest number" reading, and a panel that led with it would be the failure
 * mode the section was built to avoid.
 */
export function communityVolume(
  totals: CommunityClusterTotals | null | undefined,
): CommunityVolume[] {
  // Same distinction the reach figures make: once any initiative is on record,
  // an empty total is a count of nothing, not an empty register.
  const anyInitiative =
    num(totals?.joint_initiatives) + num(totals?.solo_initiatives) > 0;

  return [
    {
      key: 'beneficiaries',
      label: 'People reached',
      value: num(totals?.total_beneficiaries),
      empty: anyInitiative ? 'no one counted as reached' : NOTHING_RECORDED,
      meaning:
        'Counted once for the cluster, however many colleges took part in reaching them.',
    },
    {
      key: 'hours',
      // NAMED FOR ITS SOURCE, AND NOT THE SAME QUANTITY AS THE HOURS COLUMN IN
      // THE PER-COLLEGE TABLE. This figure is `hours_spent` off the engagement
      // row — the effort recorded once for the initiative by whoever ran it.
      // The table's column is `hours_contributed`, which is what a department
      // head confirmed for their own people and which only they may state
      // (decision D3). The two measure different things and will not add up.
      //
      // That is why the label differs from the column's while "People reached"
      // is worded identically in both places: beneficiaries ARE one quantity
      // read at two levels, and their gap is deliberate and explained on
      // screen. Hours are two quantities. Wording them alike would invite a
      // reader to reconcile figures that were never the same measure — and a
      // second unexplained mismatch beside the explained one costs the
      // explained one its credibility. Do not normalise these two labels.
      label: 'Hours logged on the work',
      value: num(totals?.total_hours),
      empty: anyInitiative ? 'no hours recorded against it' : NOTHING_RECORDED,
      meaning: 'Recorded once for each initiative, by whoever ran it.',
    },
  ];
}

export type AsymmetryShape =
  /** The expected shape: the colleges sum past the cluster because work is shared. */
  | 'colleges-exceed-cluster'
  /** No shared initiative has been recorded, so the two readings agree. */
  | 'equal'
  /** Unexpected: cluster work exists that no college row accounts for. */
  | 'cluster-exceeds-colleges'
  /** Nothing is recorded on either side. */
  | 'not-readable';

export interface BeneficiaryAsymmetry {
  shape: AsymmetryShape;
  /** The per-college column, added up — the sum a reader would do by hand. */
  collegesSum: number;
  /** The cluster's own figure, counting a shared initiative once. */
  clusterTotal: number;
  /** The gap between the two. Never negative; the shape carries the direction. */
  gap: number;
  /** How many colleges recorded taking part in at least one shared initiative. */
  collegesSharing: number;
}

/**
 * THE ASYMMETRY, STATED RATHER THAN HIDDEN (Director decision D2).
 *
 * Reconciling the two figures would be the wrong fix: both are correct answers
 * to different questions, and a college's own page has to show the full reach
 * of work it genuinely took part in. What was missing was the sentence saying
 * so, which is what this makes possible.
 */
export function beneficiaryAsymmetry(
  totals: CommunityClusterTotals | null | undefined,
  colleges: CommunityCollegeTotals[],
): BeneficiaryAsymmetry {
  const collegesSum = colleges.reduce((n, c) => n + num(c.beneficiaries), 0);
  const clusterTotal = num(totals?.total_beneficiaries);
  const collegesSharing = colleges.filter(
    (c) => num(c.shared_initiatives) > 0,
  ).length;

  let shape: AsymmetryShape;
  if (collegesSum === 0 && clusterTotal === 0) shape = 'not-readable';
  else if (collegesSum > clusterTotal) shape = 'colleges-exceed-cluster';
  else if (collegesSum < clusterTotal) shape = 'cluster-exceeds-colleges';
  else shape = 'equal';

  return {
    shape,
    collegesSum,
    clusterTotal,
    gap: Math.abs(collegesSum - clusterTotal),
    collegesSharing,
  };
}

/**
 * INITIATIVE ROWS IN, COLLEGE LINES OUT.
 *
 * `fn_community_college_totals()` returns one row per (college, initiative)
 * because that is the grain the confirmations are recorded at — each row
 * carries the initiative's title and date and this college's own confirmed
 * hours. The table shows one line per college, so the folding has to happen
 * somewhere; it happens here, in the pure module, where it can be exercised
 * without a database.
 *
 * WHAT IS SUMMED AND WHAT IS COUNTED, AND WHY THEY DIFFER.
 *   `beneficiaries` sums the FULL figure of every initiative this college took
 *   part in (decision D2) — that is exactly what makes this column add up to
 *   more than the cluster total, which `beneficiaryAsymmetry` then states out
 *   loud rather than reconciling away.
 *   `hours` sums `hours_contributed`, which is already this college's own
 *   confirmed effort and not the initiative's total.
 *   `shared_initiatives` counts the rows flagged `is_shared`, which the
 *   function sets from confirmed departments belonging to OTHER colleges. A
 *   second department inside the same college does not make an initiative
 *   shared, and counting it would be the hub-traffic mistake wearing a
 *   different hat.
 *
 * A null figure is read as "not recorded", which sums as nothing — never as a
 * zero the screen could print. The screen never sees a raw total anyway: it
 * sees `initiatives`, which is what tells "nothing recorded yet" apart from
 * "counted nobody".
 */
export function aggregateColleges(
  rows: CommunityCollegeRow[],
): CommunityCollegeTotals[] {
  const byCollege = new Map<string, CommunityCollegeTotals>();

  for (const row of rows) {
    // Institutions the function could not name still deserve a line rather
    // than silent omission — a dropped row would quietly shrink the column the
    // asymmetry sentence is computed from.
    const key = row.institution_id ?? row.institution_name ?? '\u0000unnamed';
    const college = byCollege.get(key) ?? {
      institution_id: row.institution_id ?? null,
      institution_name: row.institution_name ?? null,
      beneficiaries: 0,
      hours: 0,
      initiatives: 0,
      shared_initiatives: 0,
    };

    college.initiatives += 1;
    college.beneficiaries += num(row.beneficiaries_count);
    college.hours += num(row.hours_contributed);
    if (row.is_shared) college.shared_initiatives += 1;

    byCollege.set(key, college);
  }

  return [...byCollege.values()];
}

/**
 * The per-college rows, ordered BY NAME.
 *
 * The order is declarative and does not depend on any value, so no figure can
 * float a college to the top of the table. That is decision 3 applied to a
 * list: this page has no ranking of the colleges against one another, and a
 * table sorted by a number is a ranking whether or not it is labelled as one.
 */
export function collegesByName(
  rows: CommunityCollegeTotals[],
): CommunityCollegeTotals[] {
  return [...rows].sort((a, b) =>
    (a.institution_name ?? '').localeCompare(b.institution_name ?? ''),
  );
}
