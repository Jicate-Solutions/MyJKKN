/**
 * Pay band check — is a person's pay inside the band their job title is on?
 *
 * Nothing in MyJKKN asked this question before. The band and the pay are both
 * recorded, in two places that never met:
 *
 *   THE BAND lives in the institution-scoped `hr.pay_scales` row in
 *   platform_policies — `pay_matrix[]` of {designation, qualification,
 *   basic_pay} plus `overrides.net_set_basic`. Only 2 of 9 colleges have a row
 *   at all (Engineering and Dental, seeded 20260605_hr_compensation_seeds.sql).
 *
 *   THE PAY lives in hr_staff_salaries.monthly_gross, one row per person with
 *   `superseded_by IS NULL`. It is a FLAT figure, not a basic component: the
 *   import that created it held Gross_Annual = Basic_Salary × 12 on all 62
 *   source rows, so monthly_gross IS the person's basic. That equivalence is
 *   what makes it comparable to basic_pay at all, and it is the one assumption
 *   in this file that a change to payroll could invalidate. See the header of
 *   20260821191000_hr_staff_salaries.sql.
 *
 * `hr_pay_scales` — the TABLE, with its own basic_pay column — is deliberately
 * NOT used here. It has no rows, which is why PayslipGenerator skips every
 * staff member with "No pay scale configured" (20260830150000 header). Reading
 * it would return "cannot tell" for all 744 people and look like a bug.
 *
 * WHY "CANNOT TELL" IS A VERDICT AND NOT A GAP IN THE DATA
 * -------------------------------------------------------
 * The dominant answer on live data is "cannot tell", because seven colleges
 * have no band. A check that folded that into "within band" would report the
 * whole organisation as compliant while having compared nothing. So an unknown
 * is returned explicitly, with the reason, and the caller must render it.
 *
 * Every arithmetic guard here exists for one specific way NaN lies: `NaN < min`
 * and `NaN > max` are both false, so a figure that failed to parse would fall
 * through to "within band" — the single most dangerous silent pass in the file.
 * Non-finite input is rejected before any comparison happens.
 *
 * PURE. No imports, no I/O, no Supabase, no React. Everything it needs is an
 * argument, so it is testable without a database and callable from a server
 * component, a client component or a script.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One rung of a college's pay matrix. */
export interface PayBandRung {
  /** The job title, spelled as the pay matrix spells it. */
  designation: string;
  /** The qualification this rung is for. null = the rung covers the title as a whole. */
  qualification: string | null;
  /** Monthly basic pay in rupees for this rung. */
  basicPay: number;
}

/** A college's band, as read from its `hr.pay_scales` policy row. */
export interface PayBandPolicy {
  /** Every rung recorded for the college. An empty array is a configured-but-empty band. */
  rungs: PayBandRung[];
  /**
   * `overrides.net_set_basic` — the minimum basic the college guarantees
   * anybody, regardless of title. null when none is recorded.
   *
   * Deliberately NOT folded into the band floor. Engineering guarantees 15,000
   * while its matrix puts a Typist on 6,500, so folding the two together would
   * report a Typist paid exactly what the matrix says as "below band" — which
   * would be a true statement about the guarantee dressed up as a false one
   * about the matrix. They are two separate findings and are reported as two.
   */
  guaranteedMinimum: number | null;
}

/** What one person is paid, and the title that decides which rung applies. */
export interface PersonPay {
  /** Job title recorded against the person. null/blank = nothing recorded. */
  designation: string | null;
  /** Monthly pay in force, in rupees. null = no salary recorded. */
  monthlyPay: number | null;
  /**
   * Qualification recorded against the person, when one is.
   *
   * Almost always absent today — nothing on the staff record carries the
   * qualification strings the Engineering matrix keys on ("M.E (CSE/IT)"). With
   * it, the band narrows to that one rung; without it, the band spans every
   * rung the title has, which is the honest reading of "we do not know which
   * rung they are on".
   */
  qualification?: string | null;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type PayBandVerdict =
  | 'below_band'
  | 'within_band'
  | 'above_band'
  | 'cannot_tell';

/**
 * Why no comparison was possible. Ordered by what has to be fixed FIRST:
 * a college with no band blocks everyone in it, so it outranks a missing
 * figure on one person.
 */
export type PayBandUnknownReason =
  /** The college has no pay band recorded, or it has one with no usable rung. */
  | 'no_band_configured'
  /** No job title is recorded against this person, so no rung can be chosen. */
  | 'no_designation_recorded'
  /** The college has a band, but nothing in it covers this person's job title. */
  | 'no_matching_rung'
  /** The band and the title are both known; nobody has recorded what this person earns. */
  | 'no_pay_recorded';

export interface PayBandRange {
  /** Lowest monthly basic the matching rungs allow. */
  min: number;
  /** Highest monthly basic the matching rungs allow. Equals min for a single rung. */
  max: number;
}

export interface PayBandResult {
  verdict: PayBandVerdict;
  /** Set only when the verdict is 'cannot_tell'; null otherwise. */
  reason: PayBandUnknownReason | null;
  /** The band that was applied. null whenever the verdict is 'cannot_tell'. */
  band: PayBandRange | null;
  /** Rupees below the band floor. 0 unless the verdict is 'below_band'. */
  shortfall: number;
  /** Rupees above the band ceiling. 0 unless the verdict is 'above_band'. */
  excess: number;
  /** The rungs that produced the band, so a verdict can be explained on screen. */
  matchedRungs: PayBandRung[];
  /**
   * The pay is under the college's guaranteed minimum basic. Independent of the
   * verdict: someone can sit inside their title's band and still be under the
   * guarantee. False whenever no guarantee is recorded, or the pay is unknown.
   */
  belowGuaranteedMinimum: boolean;
  /** One plain sentence stating the finding, safe to render as-is. */
  explanation: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A money figure we are willing to compare, or null.
 *
 * Rejects NaN and ±Infinity (a numeric column arriving over PostgREST as an
 * unparseable string becomes NaN, and NaN compares false against everything),
 * and rejects zero or less — a rung or a salary of 0 is an unfilled field, not
 * a pay decision. hr_staff_salaries CHECKs monthly_gross > 0, so a
 * non-positive figure can only come from the hand-edited policy JSON.
 */
function usableAmount(value: number | null | undefined): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
}

/**
 * Job titles are compared on their letters, not their spacing or case: the pay
 * matrix is typed by hand into a JSON policy and the staff record is typed by
 * hand into an import sheet, so "Assistant  professor" and "Assistant
 * Professor" are the same title and have to match.
 */
function normaliseTitle(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Rupees to 2 decimals, so a subtraction cannot leave float dust on screen. */
function toRupees(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "₹20,000" — plain digits with Indian grouping, for the explanation line. */
function money(value: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)}`;
}

const UNKNOWN_EXPLANATION: Record<PayBandUnknownReason, string> = {
  no_band_configured:
    'Cannot tell — this college has no pay band recorded, so there is nothing to compare against.',
  no_designation_recorded:
    'Cannot tell — no job title is recorded for this person, so no pay band applies to them yet.',
  no_matching_rung:
    'Cannot tell — this college has a pay band, but it does not cover this job title.',
  no_pay_recorded:
    'Cannot tell — nobody has recorded what this person is paid.',
};

function unknown(
  reason: PayBandUnknownReason,
  matchedRungs: PayBandRung[] = []
): PayBandResult {
  return {
    verdict: 'cannot_tell',
    reason,
    band: null,
    shortfall: 0,
    excess: 0,
    matchedRungs,
    belowGuaranteedMinimum: false,
    explanation: UNKNOWN_EXPLANATION[reason],
  };
}

// ---------------------------------------------------------------------------
// Which rungs count
// ---------------------------------------------------------------------------

/**
 * The rungs of a band that can actually be compared against: a job title that
 * is not blank and an amount that is a real figure above zero.
 *
 * ONE DEFINITION, USED TWICE. checkPayBand decides a person's verdict from it,
 * and the server decides whether a college "has a band" from it. Two separate
 * filters are how a college came to read "has band" in the By-college table
 * while every person in it read "College has no pay band".
 */
export function usablePayBandRungs(policy: PayBandPolicy | null): PayBandRung[] {
  if (!policy) return [];
  return (policy.rungs ?? []).filter(
    (r) => normaliseTitle(r?.designation) !== '' && usableAmount(r?.basicPay) !== null
  );
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/**
 * Compare one person's pay against their college's pay band.
 *
 * Reporting only. Nothing here changes anyone's pay, and the result carries no
 * recommendation — "below band" states a fact about two recorded figures, not
 * that somebody should get a raise. Under the Director's ruling of 18 September
 * 2026 the band is reference material and a pay change is a separate decision.
 *
 * @param person The person's recorded pay and job title.
 * @param policy The college's band, or null when the college has no policy row.
 */
export function checkPayBand(
  person: PersonPay,
  policy: PayBandPolicy | null
): PayBandResult {
  // 1. The college's band. Checked first because its absence blocks everyone in
  //    the college, so it is the gap worth reporting even when the person's own
  //    record is also incomplete.
  if (!policy) return unknown('no_band_configured');

  const usableRungs = usablePayBandRungs(policy);
  if (usableRungs.length === 0) return unknown('no_band_configured');

  // 2. The person's job title — without it no rung can be chosen.
  const title = normaliseTitle(person.designation);
  if (title === '') return unknown('no_designation_recorded');

  // 3. The rungs for that title.
  const forTitle = usableRungs.filter((r) => normaliseTitle(r.designation) === title);
  if (forTitle.length === 0) return unknown('no_matching_rung');

  /**
   * A qualification narrows the band to one rung — but only on an exact match.
   * A near-miss falls back to the whole title's span rather than guessing a
   * rung, because guessing here would invent a band the college never set.
   */
  const qualification = normaliseTitle(person.qualification);
  const exact =
    qualification === ''
      ? []
      : forTitle.filter((r) => normaliseTitle(r.qualification) === qualification);
  const matchedRungs = exact.length > 0 ? exact : forTitle;

  const amounts = matchedRungs.map((r) => usableAmount(r.basicPay) as number);
  const band: PayBandRange = {
    min: toRupees(Math.min(...amounts)),
    max: toRupees(Math.max(...amounts)),
  };

  // 4. The person's pay. Last, because by here the band is known and usable, so
  //    a missing figure is a gap on this one person rather than on the college.
  const pay = usableAmount(person.monthlyPay);
  if (pay === null) return unknown('no_pay_recorded', matchedRungs);

  const guarantee = usableAmount(policy.guaranteedMinimum);
  const belowGuaranteedMinimum = guarantee !== null && pay < guarantee;
  const guaranteeNote = belowGuaranteedMinimum
    ? ` It is also under the ${money(guarantee as number)} minimum basic this college guarantees.`
    : '';

  const bandText =
    band.min === band.max
      ? `the ${money(band.min)} this job title is on`
      : `the ${money(band.min)} to ${money(band.max)} band for this job title`;

  if (pay < band.min) {
    const shortfall = toRupees(band.min - pay);
    return {
      verdict: 'below_band',
      reason: null,
      band,
      shortfall,
      excess: 0,
      matchedRungs,
      belowGuaranteedMinimum,
      explanation:
        `Paid ${money(pay)} a month, which is ${money(shortfall)} below ` +
        `${bandText}.${guaranteeNote}`,
    };
  }

  if (pay > band.max) {
    const excess = toRupees(pay - band.max);
    return {
      verdict: 'above_band',
      reason: null,
      band,
      shortfall: 0,
      excess,
      matchedRungs,
      belowGuaranteedMinimum,
      explanation:
        `Paid ${money(pay)} a month, which is ${money(excess)} above ` +
        `${bandText}.${guaranteeNote}`,
    };
  }

  return {
    verdict: 'within_band',
    reason: null,
    band,
    shortfall: 0,
    excess: 0,
    matchedRungs,
    belowGuaranteedMinimum,
    explanation: `Paid ${money(pay)} a month, inside ${bandText}.${guaranteeNote}`,
  };
}

// ---------------------------------------------------------------------------
// Per-college roll-up
// ---------------------------------------------------------------------------

/** One college's totals. Money is summed here rather than in a component. */
export interface PayBandCollegeSummary {
  collegeId: string;
  collegeName: string;
  /** True when this college has a usable pay band recorded. */
  hasBand: boolean;
  people: number;
  below: number;
  within: number;
  above: number;
  cannotTell: number;
  /** Rupees a month needed to lift everyone below band up to their band floor. */
  totalShortfall: number;
  /** Rupees a month paid above band ceilings across the college. */
  totalExcess: number;
  /** People paid under the college's guaranteed minimum basic. */
  belowGuaranteedMinimum: number;
}

/** A checked person, ready to be counted or listed. */
export interface CheckedPerson {
  collegeId: string;
  collegeName: string;
  result: PayBandResult;
}

/**
 * Count and total the checked people per college.
 *
 * `collegesWithBand` is passed in rather than inferred from the results,
 * because a college whose every person is unknown for some OTHER reason — no
 * job title recorded, say — still has a band, and inferring would report it as
 * unconfigured and send someone to fix the wrong thing.
 *
 * Colleges come back ordered by the people who need a decision first: most
 * below band, then most above, then by name.
 */
export function summarisePayBandByCollege(
  checked: CheckedPerson[],
  collegesWithBand: ReadonlySet<string>
): PayBandCollegeSummary[] {
  const byCollege = new Map<string, PayBandCollegeSummary>();

  for (const person of checked) {
    let row = byCollege.get(person.collegeId);
    if (!row) {
      row = {
        collegeId: person.collegeId,
        collegeName: person.collegeName,
        hasBand: collegesWithBand.has(person.collegeId),
        people: 0,
        below: 0,
        within: 0,
        above: 0,
        cannotTell: 0,
        totalShortfall: 0,
        totalExcess: 0,
        belowGuaranteedMinimum: 0,
      };
      byCollege.set(person.collegeId, row);
    }

    row.people += 1;
    if (person.result.belowGuaranteedMinimum) row.belowGuaranteedMinimum += 1;

    switch (person.result.verdict) {
      case 'below_band':
        row.below += 1;
        row.totalShortfall = toRupees(row.totalShortfall + person.result.shortfall);
        break;
      case 'above_band':
        row.above += 1;
        row.totalExcess = toRupees(row.totalExcess + person.result.excess);
        break;
      case 'within_band':
        row.within += 1;
        break;
      default:
        row.cannotTell += 1;
        break;
    }
  }

  return [...byCollege.values()].sort(
    (a, b) =>
      b.below - a.below ||
      b.above - a.above ||
      a.collegeName.localeCompare(b.collegeName)
  );
}
