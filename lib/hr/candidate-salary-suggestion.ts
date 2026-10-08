/**
 * Suggested starting salary for a CANDIDATE — the hiring screen's "Propose
 * Package" (the Director, 8 October 2026: "Why can't it suggest the salary from
 * pay scale? ... Do all it takes to show up the suggest salary.").
 *
 * The same rule as the staff suggestion in ./salary-suggestion.ts, narrowed to
 * someone who has not joined yet:
 *   1. Start at the band floor for the official job title at the candidate's
 *      college (the same band and matching as the Pay Band Check —
 *      `checkPayBand`). No qualification is passed, so a title with several
 *      rungs starts at its lowest.
 *   2. Years at JKKN count for nothing: the candidate has not joined.
 *   3. Add HALF the department's amount per year (the Director's
 *      `hr.salary_suggestion_rule`) for each year of experience before JKKN,
 *      only when it is recorded. Fractions (one decimal) count pro rata.
 *   4. Round (nearest ₹100 unless the rule says otherwise).
 *   5. Above the band top: kept, with a red warning. No cap.
 * There is no current pay and therefore no "pay cut" comparison. A doctorate
 * adds nothing.
 *
 * A SUGGESTION, NEVER A CHANGE. The figure fills the Monthly Salary box only
 * when somebody presses "Use this figure", and nothing is saved until they
 * press Propose Package.
 *
 * EVERY missing input is reported at once, each with who can fix it, so the
 * screen never shows a blank box.
 *
 * PURE. No I/O, no Supabase, no React.
 */

import { checkPayBand, type PayBandPolicy } from '@/lib/hr/pay-band-check';
import { formatRupees, type SuggestionLine } from '@/lib/hr/salary-suggestion';

/** Where the Director sets the amount per year for each department. */
export const SALARY_SUGGESTION_SETTINGS_HREF = '/hr/admin/policies/salary-suggestion';
/** Where a college's pay band (the `hr.pay_scales` policy) is edited. */
export const PAY_SCALES_SETTINGS_HREF = '/hr/admin/policies/pay-scales';

export type CandidateSuggestionReasonCode =
  | 'no_college'
  | 'no_job_title'
  | 'no_department'
  | 'department_amount_not_set'
  | 'college_has_no_band'
  | 'job_title_not_on_band'
  | 'suggested_offer'
  | 'above_band_top';

export interface CandidateSuggestionFix {
  /** Who fixes it and where, in one plain sentence. */
  text: string;
  /** A settings page, shown as a link to super admins only. null = fixed on this screen. */
  href: string | null;
  linkLabel: string | null;
}

export interface CandidateSuggestionReason {
  code: CandidateSuggestionReasonCode;
  /** One plain sentence, safe to render as it is. */
  text: string;
  fix: CandidateSuggestionFix | null;
}

export interface CandidateSalarySuggestion {
  verdict: 'suggested' | 'cannot_suggest';
  /** The working, line by line. Empty when no figure could be worked out. */
  lines: SuggestionLine[];
  /** The figure to offer. Set only when the verdict is 'suggested'. */
  suggested: number | null;
  /** Rupees the figure is ABOVE the top of the band. null when it is not above. */
  aboveBandBy: number | null;
  departmentName: string | null;
  reasons: CandidateSuggestionReason[];
}

export interface CandidateSuggestionInput {
  /** The candidate's college. null = none recorded. */
  institutionId: string | null;
  /** The official job title's name (hr_designations.name). null = not picked. */
  designation: string | null;
  department: {
    /** null = no department picked. */
    id: string | null;
    name: string | null;
    /** The Director's rupees per year for this department. null = not set. */
    perYear: number | null;
  };
  /** Years of experience before JKKN. null = not recorded. */
  priorExperienceYears: number | null;
  /** The college's pay band, or null when it has none. */
  band: PayBandPolicy | null;
  /** Round to the nearest this many rupees. null = ₹100. */
  roundTo: number | null;
}

/** Round to the paisa, so sums of rupee amounts compare exactly. */
function toPaise(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A rupee or year figure: a finite number, 0 or more — else null. */
function usable(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function years(n: number): string {
  return `${n} ${n === 1 ? 'year' : 'years'}`;
}

const EDIT_HERE = 'under "Details for the suggested salary" on this page';

export function suggestCandidateSalary(input: CandidateSuggestionInput): CandidateSalarySuggestion {
  const { band, department } = input;
  const designation = input.designation?.trim() ? input.designation.trim() : null;
  const rate = usable(department.perYear);
  const prior = usable(input.priorExperienceYears);
  const departmentName = department.name ?? null;
  const missing: CandidateSuggestionReason[] = [];

  // --- What is missing, all of it, each with who fixes it ------------------
  if (!input.institutionId) {
    missing.push({
      code: 'no_college',
      text: 'No college is recorded for this candidate, so no pay band applies.',
      fix: { text: 'HR recruitment must record the college on this candidate.', href: null, linkLabel: null },
    });
  }
  if (!designation) {
    missing.push({
      code: 'no_job_title',
      text: 'No official job title is picked for this candidate, so the pay band cannot be looked up.',
      fix: { text: `Pick the job title ${EDIT_HERE}.`, href: null, linkLabel: null },
    });
  }
  if (!department.id) {
    missing.push({
      code: 'no_department',
      text: 'No department is picked for this candidate, so no department amount applies.',
      fix: { text: `Pick the department ${EDIT_HERE}.`, href: null, linkLabel: null },
    });
  } else if (rate === null) {
    missing.push({
      code: 'department_amount_not_set',
      text: `The Director has not set an amount for ${departmentName ? `the ${departmentName} department` : 'this department'}, so no figure is suggested.`,
      fix: {
        text: 'The Director sets it on Salary suggestion settings.',
        href: SALARY_SUGGESTION_SETTINGS_HREF,
        linkLabel: 'Open Salary suggestion settings',
      },
    });
  }

  let bandMin: number | null = null;
  let bandMax: number | null = null;
  let rungCount = 0;
  if (input.institutionId) {
    // monthlyPay is irrelevant for a candidate; 'no_pay_recorded' then means
    // "the band is known", and its rungs carry the floor and top.
    const check = checkPayBand({ designation, monthlyPay: null, qualification: null }, band);
    if (check.reason === 'no_band_configured') {
      missing.push({
        code: 'college_has_no_band',
        text: "This candidate's college has no pay band recorded, so there is no band floor to start from.",
        fix: { text: 'A super admin records the band on Pay Scales.', href: PAY_SCALES_SETTINGS_HREF, linkLabel: 'Open Pay Scales' },
      });
    } else if (designation && check.reason === 'no_matching_rung') {
      missing.push({
        code: 'job_title_not_on_band',
        text: `The college's pay band does not list the job title "${designation}".`,
        fix: {
          text: `Pick the job title the band uses ${EDIT_HERE}, or a super admin adds it to the band on Pay Scales.`,
          href: PAY_SCALES_SETTINGS_HREF,
          linkLabel: 'Open Pay Scales',
        },
      });
    } else if (check.matchedRungs.length > 0) {
      const amounts = check.matchedRungs.map((r) => r.basicPay);
      bandMin = toPaise(Math.min(...amounts));
      bandMax = toPaise(Math.max(...amounts));
      rungCount = check.matchedRungs.length;
    }
  }

  if (missing.length > 0 || bandMin === null || bandMax === null || rate === null || !designation) {
    return { verdict: 'cannot_suggest', lines: [], suggested: null, aboveBandBy: null, departmentName, reasons: missing };
  }

  // --- The lines -------------------------------------------------------------
  const lines: SuggestionLine[] = [];
  let floorNote = 'The lowest pay on the band for this job title at this college.';
  if (rungCount > 1) floorNote += ' No qualification is recorded for a candidate, so the lowest rung is used.';
  lines.push({ label: `Band floor for ${designation}`, amount: bandMin, note: floorNote });

  lines.push({ label: 'Years at JKKN', amount: null, note: 'Not counted: the candidate has not joined yet.' });

  const halfRate = toPaise(rate / 2);
  if (prior === null) {
    lines.push({
      label: 'Years before JKKN',
      amount: null,
      note: `Not recorded, not counted. Enter it ${EDIT_HERE}.`,
    });
  } else {
    lines.push({
      label: 'Years before JKKN',
      amount: toPaise(prior * halfRate),
      note: `${years(prior)} before JKKN, at half the department's ${formatRupees(rate)} a year: ${formatRupees(halfRate)} a year.`,
    });
  }

  // --- Round -----------------------------------------------------------------
  const raw = toPaise(lines.reduce((sum, l) => sum + (l.amount ?? 0), 0));
  const roundTo = usable(input.roundTo);
  const step = roundTo !== null && roundTo > 0 ? roundTo : 100;
  const figure = toPaise(Math.round(raw / step) * step);
  const roundBy = toPaise(figure - raw);
  if (roundBy !== 0) {
    lines.push({
      label: `Rounded to the nearest ${formatRupees(step)}`,
      amount: roundBy,
      note: `${formatRupees(raw)} rounds to ${formatRupees(figure)}.`,
    });
  }

  // --- Above the band top: kept, and warned about (no cap) -----------------
  const aboveBandBy = figure > bandMax ? toPaise(figure - bandMax) : null;
  const reasons: CandidateSuggestionReason[] = [
    { code: 'suggested_offer', text: `Suggested starting salary: ${formatRupees(figure)} a month.`, fix: null },
  ];
  if (aboveBandBy !== null) {
    reasons.push({
      code: 'above_band_top',
      text: `Above the band top by ${formatRupees(aboveBandBy)}. It is not capped.`,
      fix: null,
    });
  }

  return { verdict: 'suggested', lines, suggested: figure, aboveBandBy, departmentName, reasons };
}
