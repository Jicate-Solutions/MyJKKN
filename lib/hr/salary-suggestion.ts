/**
 * Salary suggestion — "if we click, the system suggests a revised salary from
 * the salary scale, considering experience and other aspects" (the Director,
 * 29 September 2026).
 *
 * A SUGGESTION, NEVER A CHANGE. Under the Director's ruling of 18 September
 * 2026 the band is reference material: nobody's pay changes because of it, a
 * raise is his separate decision, and nothing is backdated. So this file only
 * works out a figure and says how it got there. The only way a figure reaches
 * a salary is a person typing it into the Edit Salary dialog and pressing Save.
 *
 * THE RULE IS HIS, PER DEPARTMENT (ruling of 29 September 2026, evening):
 *   - the amount per year at JKKN is set PER DEPARTMENT. The Director fills
 *     every department on one settings page
 *     (/hr/admin/policies/salary-suggestion). An EMPTY department means NO
 *     suggestion for anybody in it;
 *   - years before JKKN count at HALF that department's amount, and only when
 *     they are actually recorded;
 *   - a doctorate adds NOTHING;
 *   - the figure MAY go above the top of the band. There is no cap; a figure
 *     above the top carries a red "above band by ₹X" warning instead.
 * The amounts are stored in the `hr.salary_suggestion_rule` policy as
 * `{ per_year_by_department: { <department id>: rupees }, round_to? }`.
 * Nothing here invents an amount.
 *
 * HOW THE FIGURE IS BUILT (every step is a line on screen):
 *   1. Start at the band floor for the person's job title at their college
 *      (the same band the Pay Band Check uses — `checkPayBand`).
 *   2. Add the department's amount for each whole year since the date of joining.
 *   3. Add HALF the department's amount for each year before JKKN — only when
 *      it is actually recorded (see PRIOR EXPERIENCE below).
 *   4. Round (nearest ₹100 unless the rule says otherwise).
 *   5. If the figure is above the top of the band, keep it and warn.
 *   6. If current pay is already at or above that figure, say so plainly and
 *      suggest nothing: a suggestion is never a pay cut.
 * The line amounts always add up to the worked-out figure, rounding included,
 * so the panel can never show a total its lines do not explain.
 *
 * PRIOR EXPERIENCE. `staff.experience_years` is entered on the staff form
 * under "Years of Experience → Total Years" and shown on the profile as
 * "N years total", so it is TOTAL experience, JKKN included. The years before
 * JKKN are therefore `experience_years − whole years since joining`. The column
 * is NOT NULL DEFAULT 0, so 0 cannot be told apart from "never filled in"; it
 * counts as recorded only when the extended profile is switched on
 * (`has_extended_profile`, the flag the staff API documents as "otherwise treat
 * these fields as empty") AND the figure is above 0. Anything else reads
 * "Years before JKKN: not recorded, not counted" — never "fresher".
 *
 * PURE. No I/O, no Supabase, no React. `today` is an argument so the result is
 * testable and the server decides what day it is (IST), not the browser.
 */

import { checkPayBand, type PayBandPolicy } from '@/lib/hr/pay-band-check';

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

/**
 * The Director's rule as it is stored. EVERY FIELD IS OPTIONAL and an absent
 * field means "not set" — never 0. The settings page saves a blank box as an
 * absent key, so a department nobody filled in has no key at all.
 */
export interface SalarySuggestionRule {
  /** Rupees a month for each whole year at JKKN, keyed by department id (lower-case). */
  per_year_by_department?: Record<string, number>;
  /** Default 100. */
  round_to?: number;
}

/** A department id exactly as Postgres prints a uuid: lower-case, hyphenated. */
const DEPARTMENT_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A rupee figure: a JSON NUMBER, 0 or more — or undefined. A numeric string
 * ("500") is NOT a figure. The settings page only ever writes plain numbers,
 * and hr_salary_rule_department_rate() reads an amount by exactly this test,
 * so the two can never disagree about whether a department has an amount.
 */
function ruleAmount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

/**
 * Read a stored rule. EXACTLY AS STRICT AS THE DATABASE: the rule is the stored
 * object itself (no `{ value: {...} }` wrapper is unwrapped),
 * `per_year_by_department` must be an object, its keys must be lower-case
 * department ids (Postgres looks an id up by `uuid::text`, which is lower-case),
 * and each amount must be a JSON number 0 or more. hr_salary_rule_department_rate()
 * and hr_salary_rule_round_to() apply the same tests, and
 * __tests__/hr/salary-suggestion-rule-parity.test.ts runs the same cases
 * (supabase/tests/hr-salary-suggestion/rule-parity-cases.json) that the
 * Postgres rehearsal runs against them. Returns null when there is no object at
 * all. Anything that cannot be read is left out — i.e. "not set".
 */
export function parseSalarySuggestionRule(raw: unknown): SalarySuggestionRule | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;

  const rule: SalarySuggestionRule = {};
  const byDept = body.per_year_by_department;
  if (typeof byDept === 'object' && byDept !== null && !Array.isArray(byDept)) {
    const amounts: Record<string, number> = {};
    for (const [key, value] of Object.entries(byDept as Record<string, unknown>)) {
      if (!DEPARTMENT_KEY.test(key)) continue;
      const amount = ruleAmount(value);
      if (amount !== undefined) amounts[key] = amount;
    }
    if (Object.keys(amounts).length > 0) rule.per_year_by_department = amounts;
  }
  const roundTo = ruleAmount(body.round_to);
  if (roundTo !== undefined && roundTo > 0) rule.round_to = roundTo;

  return rule;
}

/** True when no department has an amount, so the rule cannot produce any figure. */
export function isSalarySuggestionRuleEmpty(rule: SalarySuggestionRule | null): boolean {
  return !rule || Object.keys(rule.per_year_by_department ?? {}).length === 0;
}

/**
 * The amount per year at JKKN for one department, or null when the Director
 * has left that department empty. Same answer as
 * hr_salary_rule_department_rate(value, department_id) in Postgres.
 */
export function departmentRate(
  rule: SalarySuggestionRule | null,
  departmentId: string | null | undefined
): number | null {
  if (!rule || typeof departmentId !== 'string') return null;
  const amount = rule.per_year_by_department?.[departmentId.toLowerCase()];
  return typeof amount === 'number' ? amount : null;
}

// ---------------------------------------------------------------------------
// The person
// ---------------------------------------------------------------------------

export interface SuggestionPerson {
  /** Job title, as the staff record spells it. */
  designation: string | null;
  /** yyyy-MM-dd. */
  dateOfJoining: string | null;
  /** staff.experience_years — TOTAL years, JKKN included. 0 is "not filled in". */
  experienceYears: number | null;
  hasExtendedProfile: boolean;
  /** The monthly gross in force. null = no salary recorded yet. */
  currentMonthlyPay: number | null;
}

/** The person's department and the Director's amount for it, resolved on the server. */
export interface SuggestionDepartment {
  /** null = no department recorded on the staff record. */
  id: string | null;
  name: string | null;
  /** Rupees a month per whole year at JKKN. null = the Director left this department empty. */
  perYearAtJkkn: number | null;
}

// ---------------------------------------------------------------------------
// The result
// ---------------------------------------------------------------------------

export type SalarySuggestionVerdict = 'suggested' | 'cannot_suggest' | 'rule_not_set' | 'no_band';

export type SuggestionReasonCode =
  | 'department_amount_not_set'
  | 'no_department'
  | 'college_has_no_band'
  | 'no_job_title'
  | 'job_title_not_on_band'
  | 'no_joining_date'
  | 'joining_date_in_future'
  | 'current_pay_already_above'
  | 'current_pay_already_equal'
  | 'suggested_raise'
  | 'suggested_first_salary'
  | 'above_band_top';

export interface SuggestionReason {
  code: SuggestionReasonCode;
  /** One plain sentence, safe to render as it is. */
  text: string;
}

export interface SuggestionLine {
  label: string;
  /** Rupees this line adds (negative for rounding down). null = counted as nothing. */
  amount: number | null;
  note: string;
}

export interface SalarySuggestion {
  verdict: SalarySuggestionVerdict;
  lines: SuggestionLine[];
  /** The figure to offer. Set only when the verdict is 'suggested'. */
  suggested: number | null;
  /** The worked-out figure before it was compared with current pay. null when none could be worked out. */
  computed: number | null;
  bandMin: number | null;
  bandMax: number | null;
  currentMonthlyPay: number | null;
  /** Rupees the worked-out figure is ABOVE the top of the band. null when it is not above. No cap. */
  aboveBandBy: number | null;
  /** The person's department, by name. The amount itself is in the lines. */
  departmentName: string | null;
  reasons: SuggestionReason[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "₹20,000" with Indian grouping. Paise are shown only when there are any. */
export function formatRupees(value: number): string {
  const sign = value < 0 ? '−' : '';
  const abs = toPaise(Math.abs(value));
  const digits = Number.isInteger(abs) ? 0 : 2;
  return `${sign}₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(abs)}`;
}

/** Round to the paisa, so sums of rupee amounts compare exactly. */
function toPaise(value: number): number {
  return Math.round(value * 100) / 100;
}

function usablePay(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseDate(value: string | null | undefined): { y: number; m: number; d: number } | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function compareDates(
  a: { y: number; m: number; d: number },
  b: { y: number; m: number; d: number }
): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

/** Whole years from `from` to `to`, counted on the anniversary. */
export function wholeYearsBetween(from: string, to: string): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b || compareDates(a, b) > 0) return null;
  let years = b.y - a.y;
  if (b.m < a.m || (b.m === a.m && b.d < a.d)) years -= 1;
  return years;
}

function formatDate(value: string): string {
  const p = parseDate(value);
  if (!p) return value;
  return new Date(p.y, p.m - 1, p.d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function departmentLabel(department: SuggestionDepartment): string {
  return department.name ? `the ${department.name} department` : 'this department';
}

// ---------------------------------------------------------------------------
// The suggestion
// ---------------------------------------------------------------------------

export interface SuggestSalaryInput {
  person: SuggestionPerson;
  /** The band for the person's college, or null when the college has none. */
  band: PayBandPolicy | null;
  /** The person's department and the Director's amount for it. */
  department: SuggestionDepartment;
  /** Round to the nearest this many rupees. null = ₹100. */
  roundTo: number | null;
  /** yyyy-MM-dd, decided by the caller (the server uses IST). */
  today: string;
}

export function suggestSalary(input: SuggestSalaryInput): SalarySuggestion {
  const { person, band, department, today } = input;
  if (!parseDate(today)) throw new Error(`suggestSalary: today must be yyyy-MM-dd, got ${today}`);

  const current = usablePay(person.currentMonthlyPay);
  const rate = ruleAmount(department.perYearAtJkkn ?? undefined) ?? null;

  // --- The band for the job title -----------------------------------------
  // No qualification is passed: nothing on the staff record carries the
  // qualification strings a pay matrix keys on, so the band spans every rung
  // the job title has and the floor is its lowest rung. The floor line says so.
  let bandMin: number | null = null;
  let bandMax: number | null = null;
  let rungCount = 0;
  let bandReason: SuggestionReason | null = null;

  const check = checkPayBand(
    { designation: person.designation, monthlyPay: current, qualification: null },
    band
  );
  if (check.band) {
    bandMin = check.band.min;
    bandMax = check.band.max;
    rungCount = check.matchedRungs.length;
  } else if (check.reason === 'no_pay_recorded' && check.matchedRungs.length > 0) {
    // The band is known; only the pay is missing, which is fine for a first salary.
    const amounts = check.matchedRungs.map((r) => r.basicPay);
    bandMin = Math.min(...amounts);
    bandMax = Math.max(...amounts);
    rungCount = check.matchedRungs.length;
  } else if (check.reason === 'no_designation_recorded') {
    bandReason = {
      code: 'no_job_title',
      text: 'No job title is recorded for this person, so no pay band applies and no figure can be worked out.',
    };
  } else if (check.reason === 'no_matching_rung') {
    bandReason = {
      code: 'job_title_not_on_band',
      text: `This college's pay band does not cover the job title "${person.designation ?? ''}", so there is no band floor to start from.`,
    };
  } else {
    bandReason = {
      code: 'college_has_no_band',
      text: 'This college has no pay band recorded, so there is no band floor to start from.',
    };
  }

  const base = {
    bandMin,
    bandMax,
    currentMonthlyPay: current,
    aboveBandBy: null as number | null,
    departmentName: department.name,
  };

  // --- No department, or the Director left it empty: no figure -------------
  if (department.id === null) {
    return {
      ...base,
      verdict: 'cannot_suggest',
      lines: [],
      suggested: null,
      computed: null,
      reasons: [
        {
          code: 'no_department',
          text: 'No department is recorded for this person, so no department amount applies and no figure is worked out. Record their department on their profile first.',
        },
        ...(bandReason ? [bandReason] : []),
      ],
    };
  }
  if (rate === null) {
    return {
      ...base,
      verdict: 'rule_not_set',
      lines: [],
      suggested: null,
      computed: null,
      reasons: [
        {
          code: 'department_amount_not_set',
          text: `The Director has not set an amount per year at JKKN for ${departmentLabel(department)}, so no figure is suggested for anybody in it.`,
        },
        ...(bandReason ? [bandReason] : []),
      ],
    };
  }

  if (bandMin === null || bandMax === null) {
    return {
      ...base,
      verdict: 'no_band',
      lines: [],
      suggested: null,
      computed: null,
      reasons: [bandReason as SuggestionReason],
    };
  }

  // --- The lines -----------------------------------------------------------
  const lines: SuggestionLine[] = [];
  const blocking: SuggestionReason[] = [];

  let floorNote =
    bandMin === bandMax
      ? `The pay band for this job title at this college is ${formatRupees(bandMin)}.`
      : `The lowest pay on the ${formatRupees(bandMin)} to ${formatRupees(bandMax)} band for this job title at this college.`;
  if (rungCount > 1 && bandMin !== bandMax) {
    floorNote += ' No qualification is recorded for this person, so the lowest rung for the job title is used.';
  }
  lines.push({ label: `Band floor for ${person.designation}`, amount: bandMin, note: floorNote });

  // Years at JKKN, from the date of joining.
  let jkknYears: number | null = null;
  const joined = parseDate(person.dateOfJoining);
  const todayParts = parseDate(today)!;
  const joinedInFuture = joined !== null && compareDates(joined, todayParts) > 0;
  if (joined && !joinedInFuture) jkknYears = wholeYearsBetween(person.dateOfJoining!, today);

  if (!joined) {
    blocking.push({
      code: 'no_joining_date',
      text: 'No date of joining is recorded, so the years at JKKN cannot be counted. Record it on their profile first.',
    });
    lines.push({ label: 'Years at JKKN', amount: null, note: 'No date of joining recorded.' });
  } else if (joinedInFuture) {
    blocking.push({
      code: 'joining_date_in_future',
      text: `The recorded date of joining (${formatDate(person.dateOfJoining!)}) is after today, so it looks wrong. Check their profile first.`,
    });
    lines.push({ label: 'Years at JKKN', amount: null, note: 'Date of joining is after today.' });
  } else {
    const years = jkknYears as number;
    lines.push({
      label: 'Years at JKKN',
      amount: toPaise(years * rate),
      note: `${plural(years, 'whole year', 'whole years')} since joining on ${formatDate(person.dateOfJoining!)}, at ${formatRupees(rate)} a year for ${departmentLabel(department)}.`,
    });
  }

  // Years before JKKN — only when actually recorded, at half the department's amount.
  const total = person.experienceYears;
  const priorRecorded =
    person.hasExtendedProfile === true &&
    typeof total === 'number' &&
    Number.isFinite(total) &&
    total > 0;
  const halfRate = toPaise(rate / 2);

  if (!priorRecorded) {
    lines.push({ label: 'Years before JKKN', amount: null, note: 'Not recorded, not counted.' });
  } else if (jkknYears === null) {
    lines.push({
      label: 'Years before JKKN',
      amount: null,
      note: `${plural(total as number, 'year', 'years')} recorded in total, but without a usable date of joining the years before JKKN cannot be told apart. Not counted.`,
    });
  } else {
    const prior = (total as number) - jkknYears;
    if (prior <= 0) {
      lines.push({
        label: 'Years before JKKN',
        amount: null,
        note: `${plural(total as number, 'year', 'years')} recorded in total, which is not more than the ${plural(jkknYears, 'year', 'years')} at JKKN, so no earlier experience is counted.`,
      });
    } else {
      lines.push({
        label: 'Years before JKKN',
        amount: toPaise(prior * halfRate),
        note: `${plural(total as number, 'year', 'years')} recorded in total, less ${plural(jkknYears, 'year', 'years')} at JKKN, leaves ${plural(prior, 'year', 'years')} before JKKN, at half the department's amount: ${formatRupees(halfRate)} a year.`,
      });
    }
  }

  if (blocking.length > 0) {
    return { ...base, verdict: 'cannot_suggest', lines, suggested: null, computed: null, reasons: blocking };
  }

  // --- Round -----------------------------------------------------------------
  // Everything is in paise before it is compared, so a sum such as 0.1 + 0.2
  // never shows as a rounding line of a fraction of a paisa.
  const raw = toPaise(lines.reduce((sum, l) => sum + (l.amount ?? 0), 0));
  const step = input.roundTo !== null && input.roundTo > 0 ? input.roundTo : 100;
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
  const aboveReason: SuggestionReason[] =
    aboveBandBy !== null
      ? [
          {
            code: 'above_band_top',
            text: `Above the band top by ${formatRupees(aboveBandBy)}: the worked-out ${formatRupees(figure)} is more than the ${formatRupees(bandMax)} top of the band. It is not capped.`,
          },
        ]
      : [];

  // --- Never a pay cut -----------------------------------------------------
  if (current !== null && figure <= current) {
    const reason: SuggestionReason =
      figure < current
        ? {
            code: 'current_pay_already_above',
            text: `Current pay is already above this: ${formatRupees(current)} a month against a worked-out ${formatRupees(figure)}. No change is suggested — a suggestion is never a pay cut.`,
          }
        : {
            code: 'current_pay_already_equal',
            text: `Current pay is already ${formatRupees(current)} a month, the same as the worked-out figure. No change is suggested.`,
          };
    return {
      ...base,
      aboveBandBy,
      verdict: 'cannot_suggest',
      lines,
      suggested: null,
      computed: figure,
      reasons: [reason, ...aboveReason],
    };
  }

  const headline: SuggestionReason =
    current === null
      ? {
          code: 'suggested_first_salary',
          text: `No salary is recorded yet. The worked-out figure is ${formatRupees(figure)} a month.`,
        }
      : {
          code: 'suggested_raise',
          text: `Suggested ${formatRupees(figure)} a month, up from ${formatRupees(current)} (${formatRupees(toPaise(figure - current))} more).`,
        };

  return {
    ...base,
    aboveBandBy,
    verdict: 'suggested',
    lines,
    suggested: figure,
    computed: figure,
    reasons: [headline, ...aboveReason],
  };
}
