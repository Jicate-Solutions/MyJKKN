/**
 * Salary suggestion — "if we click, the system suggests a revised salary from
 * the salary scale, considering experience and other aspects" (the Director,
 * 29 September 2026).
 *
 * A SUGGESTION, NEVER A CHANGE. Under the Director's ruling of 18 September
 * 2026 the band is reference material: nobody's pay changes because of it, a
 * raise is his separate decision, a doctorate makes someone ELIGIBLE but he
 * approves each case, and nothing is backdated. So this file only works out a
 * figure and says how it got there. The only way a figure reaches a salary is
 * the HR head typing it into the existing Edit Salary dialog and pressing Save.
 *
 * THE RULE IS HIS, AND IT STARTS BLANK. The rupee amounts (per year at JKKN,
 * per year before JKKN, extras) come from the `hr.salary_suggestion_rule`
 * policy, which the Director fills in on /hr/admin/policies/salary-suggestion.
 * Until he does, every person reads "rule not set" and no figure is produced.
 * Nothing here invents an amount.
 *
 * HOW THE FIGURE IS BUILT (every step is a line on screen):
 *   1. Start at the band floor for the person's job title at their college
 *      (the same band the Pay Band Check uses — `checkPayBand`).
 *   2. Add the rule's amount per whole year since the date of joining.
 *   3. Add the rule's amount per year of experience BEFORE JKKN — only when it
 *      is actually recorded (see PRIOR EXPERIENCE below).
 *   4. Add each extra the rule lists and the person qualifies for. An extra
 *      that needs the Director's approval (a doctorate always does) is listed
 *      as "eligible" and is NOT added.
 *   5. Round (nearest ₹100 unless the rule says otherwise), then cap at the
 *      band maximum unless the rule says not to.
 *   6. If current pay is already at or above that figure, say so plainly and
 *      suggest nothing: a suggestion is never a pay cut.
 * The line amounts always add up to the worked-out figure, rounding and cap
 * included, so the panel can never show a total its lines do not explain.
 *
 * PRIOR EXPERIENCE. `staff.experience_years` is entered on the staff form
 * under "Years of Experience → Total Years" and shown on the profile as
 * "N years total", so it is TOTAL experience, JKKN included. The years before
 * JKKN are therefore `experience_years − whole years since joining`. The column
 * is NOT NULL DEFAULT 0, so 0 cannot be told apart from "never filled in"; it
 * counts as recorded only when the extended profile is switched on
 * (`has_extended_profile`, the flag the staff API documents as "otherwise treat
 * these fields as empty") AND the figure is above 0. Anything else reads
 * "Prior experience: not recorded, not counted" — never "fresher".
 *
 * PURE. No I/O, no Supabase, no React. `today` is an argument so the result is
 * testable and the server decides what day it is (IST), not the browser.
 */

import { checkPayBand, type PayBandPolicy } from '@/lib/hr/pay-band-check';

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

/** Where an extra's eligibility is read from. Only fields we can actually read. */
export type SuggestionExtraSource = 'doctorate' | 'research_papers';

export const SUGGESTION_EXTRA_SOURCES: ReadonlyArray<{
  value: SuggestionExtraSource;
  label: string;
}> = [
  { value: 'doctorate', label: 'Has a doctorate (from qualifications)' },
  { value: 'research_papers', label: 'Research papers recorded (at least a number)' },
];

export interface SuggestionExtra {
  label: string;
  /** Kept as a string: an unreadable source is reported, not silently dropped. */
  source: string;
  /** Rupees a month. null = no usable amount recorded for this item. */
  amount: number | null;
  /** research_papers only: the least number of papers that qualifies. Default 1. */
  min_count?: number;
  /** Listed as "eligible, needs the Director's approval" and not added. A doctorate always is. */
  needs_approval?: boolean;
}

/**
 * The Director's rule. EVERY FIELD IS OPTIONAL and an absent field means "not
 * set" — never 0. The editor saves a blank box as an absent key.
 */
export interface SalarySuggestionRule {
  per_year_at_jkkn?: number;
  per_year_prior?: number;
  prior_counts?: boolean;
  extras?: SuggestionExtra[];
  /** Default true. */
  cap_at_band_max?: boolean;
  /** Default 100. */
  round_to?: number;
}

/**
 * A rupee figure: a JSON NUMBER, 0 or more — or undefined. A numeric string
 * ("500") is NOT a figure. The editor only ever writes plain numbers, and
 * hr_salary_suggestion_inputs() (hr_salary_rule_has_amount) counts a row as a
 * rule by exactly this test, so the two can never disagree about whether a
 * college has a rule of its own.
 */
function ruleAmount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

/**
 * Read a stored rule. EXACTLY AS STRICT AS THE DATABASE: the rule is the stored
 * object itself (no `{ value: {...} }` wrapper is unwrapped), amounts are JSON
 * numbers 0 or more, and an extra counts only when it is an object in an
 * `extras` ARRAY with a non-blank label. hr_salary_rule_has_amount() applies
 * the same tests, and __tests__/hr/salary-suggestion-rule-parity.test.ts runs
 * the same cases (supabase/tests/hr-salary-suggestion/rule-parity-cases.json)
 * that the Postgres rehearsal runs against it. Returns null when there is no
 * object at all. Fields that cannot be read are left out — i.e. "not set".
 */
export function parseSalarySuggestionRule(raw: unknown): SalarySuggestionRule | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;

  const rule: SalarySuggestionRule = {};
  const perYear = ruleAmount(body.per_year_at_jkkn);
  if (perYear !== undefined) rule.per_year_at_jkkn = perYear;
  const perPrior = ruleAmount(body.per_year_prior);
  if (perPrior !== undefined) rule.per_year_prior = perPrior;
  if (typeof body.prior_counts === 'boolean') rule.prior_counts = body.prior_counts;
  if (typeof body.cap_at_band_max === 'boolean') rule.cap_at_band_max = body.cap_at_band_max;
  const roundTo = ruleAmount(body.round_to);
  if (roundTo !== undefined && roundTo > 0) rule.round_to = roundTo;

  if (Array.isArray(body.extras)) {
    const extras: SuggestionExtra[] = [];
    for (const entry of body.extras) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
      const e = entry as Record<string, unknown>;
      const label = typeof e.label === 'string' ? e.label.trim() : '';
      if (label === '') continue;
      const extra: SuggestionExtra = {
        label,
        source: typeof e.source === 'string' ? e.source : '',
        amount: ruleAmount(e.amount) ?? null,
      };
      const min = ruleAmount(e.min_count);
      if (min !== undefined && min >= 1) extra.min_count = Math.floor(min);
      if (typeof e.needs_approval === 'boolean') extra.needs_approval = e.needs_approval;
      extras.push(extra);
    }
    if (extras.length > 0) rule.extras = extras;
  }

  return rule;
}

/**
 * True when the rule carries no amount of any kind, so it cannot produce a
 * figure. Rounding and cap settings on their own are not a rule.
 */
export function isSalarySuggestionRuleEmpty(rule: SalarySuggestionRule | null): boolean {
  if (!rule) return true;
  if (rule.per_year_at_jkkn !== undefined) return false;
  if (rule.per_year_prior !== undefined) return false;
  return !(rule.extras ?? []).some((e) => e.amount !== null);
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
  /** staff.qualifications jsonb — normally [{degree, institution, year, specialization}]. */
  qualifications: unknown;
  /** staff.research_papers — 0 is "not filled in", as with experience. */
  researchPapers: number | null;
  /** The monthly gross in force. null = no salary recorded yet. */
  currentMonthlyPay: number | null;
}

// ---------------------------------------------------------------------------
// The result
// ---------------------------------------------------------------------------

export type SalarySuggestionVerdict = 'suggested' | 'cannot_suggest' | 'rule_not_set' | 'no_band';

export type SuggestionReasonCode =
  | 'rule_not_set'
  | 'college_has_no_band'
  | 'no_job_title'
  | 'job_title_not_on_band'
  | 'no_joining_date'
  | 'joining_date_in_future'
  | 'current_pay_already_above'
  | 'current_pay_already_equal'
  | 'suggested_raise'
  | 'suggested_first_salary'
  | 'extras_need_approval';

export interface SuggestionReason {
  code: SuggestionReasonCode;
  /** One plain sentence, safe to render as it is. */
  text: string;
}

export interface SuggestionLine {
  label: string;
  /** Rupees this line adds (negative for rounding down or the cap). null = counted as nothing. */
  amount: number | null;
  note: string;
}

export interface EligibleExtra {
  label: string;
  amount: number;
  needsDirectorApproval: true;
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
  /** Extras the person qualifies for that the Director must approve one by one. Never in `suggested`. */
  extrasEligible: EligibleExtra[];
  reasons: SuggestionReason[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "₹20,000" with Indian grouping. */
export function formatRupees(value: number): string {
  const sign = value < 0 ? '−' : '';
  return `${sign}₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(value))}`;
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

/** Text of one qualification entry, whatever shape the jsonb holds it in. */
function qualificationTexts(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null
      ? Object.values(raw as Record<string, unknown>)
      : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') out.push(item);
    else if (typeof item === 'object' && item !== null) {
      const q = item as Record<string, unknown>;
      out.push(
        [q.degree, q.name, q.qualification, q.specialization, q.year]
          .filter((v) => typeof v === 'string' || typeof v === 'number')
          .join(' ')
      );
    }
  }
  return out;
}

const DOCTORATE = /\b(ph\.?\s?d|d\.?\s?phil|doctor\s+of\s+philosophy|d\.?\s?sc|d\.?\s?litt)\b/i;
const NOT_YET_AWARDED = /\b(pursuing|ongoing|in\s+progress|registered|submitted|thesis\s+under)\b/i;

/**
 * A doctorate awarded, read from the recorded qualifications: Ph.D / PhD,
 * D.Phil, Doctor of Philosophy, D.Sc or D.Litt. A Pharm.D (a professional
 * degree) is not one, and an entry marked pursuing / ongoing / registered /
 * submitted is not awarded yet.
 */
export function hasDoctorate(qualifications: unknown): boolean {
  return qualificationTexts(qualifications).some(
    (text) => DOCTORATE.test(text) && !NOT_YET_AWARDED.test(text)
  );
}

// ---------------------------------------------------------------------------
// The suggestion
// ---------------------------------------------------------------------------

export interface SuggestSalaryInput {
  person: SuggestionPerson;
  /** The band for the person's college, or null when the college has none. */
  band: PayBandPolicy | null;
  /** The rule in force for the person's college (college row, else group-wide). */
  rule: SalarySuggestionRule | null;
  /** yyyy-MM-dd, decided by the caller (the server uses IST). */
  today: string;
}

export function suggestSalary(input: SuggestSalaryInput): SalarySuggestion {
  const { person, band, today } = input;
  if (!parseDate(today)) throw new Error(`suggestSalary: today must be yyyy-MM-dd, got ${today}`);

  const current = usablePay(person.currentMonthlyPay);
  const rule = isSalarySuggestionRuleEmpty(input.rule) ? null : input.rule;

  // --- The band for the job title -----------------------------------------
  let bandMin: number | null = null;
  let bandMax: number | null = null;
  let bandReason: SuggestionReason | null = null;

  const check = checkPayBand(
    { designation: person.designation, monthlyPay: current, qualification: null },
    band
  );
  if (check.band) {
    bandMin = check.band.min;
    bandMax = check.band.max;
  } else if (check.reason === 'no_pay_recorded' && check.matchedRungs.length > 0) {
    // The band is known; only the pay is missing, which is fine for a first salary.
    const amounts = check.matchedRungs.map((r) => r.basicPay);
    bandMin = Math.min(...amounts);
    bandMax = Math.max(...amounts);
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
    extrasEligible: [] as EligibleExtra[],
  };

  // --- No rule: show the band and the pay, no figure ----------------------
  if (!rule) {
    return {
      ...base,
      verdict: 'rule_not_set',
      lines: [],
      suggested: null,
      computed: null,
      reasons: [
        {
          code: 'rule_not_set',
          text: 'The Director has not set the suggestion rule yet, so no figure is worked out.',
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
  const extrasEligible: EligibleExtra[] = [];

  lines.push({
    label: `Band floor for ${person.designation}`,
    amount: bandMin,
    note:
      bandMin === bandMax
        ? `The pay band for this job title at this college is ${formatRupees(bandMin)}.`
        : `The lowest pay on the ${formatRupees(bandMin)} to ${formatRupees(bandMax)} band for this job title at this college.`,
  });

  // Years at JKKN, from the date of joining.
  let jkknYears: number | null = null;
  const joined = parseDate(person.dateOfJoining);
  const todayParts = parseDate(today)!;
  const joinedInFuture = joined !== null && compareDates(joined, todayParts) > 0;
  if (joined && !joinedInFuture) jkknYears = wholeYearsBetween(person.dateOfJoining!, today);

  if (rule.per_year_at_jkkn === undefined) {
    lines.push({
      label: 'Years at JKKN',
      amount: null,
      note: 'The rule sets no amount for years at JKKN, so they are not counted.',
    });
  } else if (!joined) {
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
      amount: years * rule.per_year_at_jkkn,
      note: `${plural(years, 'whole year', 'whole years')} since joining on ${formatDate(person.dateOfJoining!)}, at ${formatRupees(rule.per_year_at_jkkn)} a year.`,
    });
  }

  // Experience before JKKN — only when it is actually recorded.
  const total = person.experienceYears;
  const priorRecorded =
    person.hasExtendedProfile === true &&
    typeof total === 'number' &&
    Number.isFinite(total) &&
    total > 0;

  if (!priorRecorded) {
    lines.push({ label: 'Prior experience', amount: null, note: 'Not recorded, not counted.' });
  } else if (rule.prior_counts !== true) {
    lines.push({
      label: 'Prior experience',
      amount: null,
      note: `${plural(total as number, 'year', 'years')} recorded in total, but the rule does not count experience before JKKN.`,
    });
  } else if (rule.per_year_prior === undefined) {
    lines.push({
      label: 'Prior experience',
      amount: null,
      note: 'The rule sets no amount per year of experience before JKKN, so it is not counted.',
    });
  } else if (jkknYears === null) {
    lines.push({
      label: 'Prior experience',
      amount: null,
      note: `${plural(total as number, 'year', 'years')} recorded in total, but without a usable date of joining the years before JKKN cannot be told apart. Not counted.`,
    });
  } else {
    const prior = (total as number) - jkknYears;
    if (prior <= 0) {
      lines.push({
        label: 'Prior experience',
        amount: null,
        note: `${plural(total as number, 'year', 'years')} recorded in total, which is not more than the ${plural(jkknYears, 'year', 'years')} at JKKN, so no earlier experience is counted.`,
      });
    } else {
      lines.push({
        label: 'Prior experience',
        amount: prior * rule.per_year_prior,
        note: `${plural(total as number, 'year', 'years')} recorded in total, less ${plural(jkknYears, 'year', 'years')} at JKKN, leaves ${plural(prior, 'year', 'years')} before JKKN, at ${formatRupees(rule.per_year_prior)} a year.`,
      });
    }
  }

  // Extras.
  for (const extra of rule.extras ?? []) {
    if (extra.amount === null) {
      lines.push({ label: extra.label, amount: null, note: 'The rule sets no amount for this, so it is not counted.' });
      continue;
    }

    let eligible: boolean;
    let notEligibleNote = '';
    let eligibleNote = '';
    const alwaysNeedsApproval = extra.source === 'doctorate';

    if (extra.source === 'doctorate') {
      eligible = hasDoctorate(person.qualifications);
      notEligibleNote = 'No doctorate recorded in the qualifications. Not counted.';
      eligibleNote = 'Doctorate recorded in the qualifications.';
    } else if (extra.source === 'research_papers') {
      const min = extra.min_count ?? 1;
      const count = person.researchPapers;
      const usable = typeof count === 'number' && Number.isFinite(count) && count > 0;
      eligible = usable && (count as number) >= min;
      notEligibleNote = usable
        ? `${plural(count as number, 'research paper', 'research papers')} recorded; at least ${min} needed. Not counted.`
        : 'No research papers recorded. Not counted.';
      eligibleNote = `${plural(count as number, 'research paper', 'research papers')} recorded (at least ${min} needed).`;
    } else {
      lines.push({
        label: extra.label,
        amount: null,
        note: 'This item does not say what to check, so it is not counted. Fix it in the rule.',
      });
      continue;
    }

    if (!eligible) {
      lines.push({ label: extra.label, amount: null, note: notEligibleNote });
    } else if (alwaysNeedsApproval || extra.needs_approval === true) {
      extrasEligible.push({ label: extra.label, amount: extra.amount, needsDirectorApproval: true });
      lines.push({
        label: extra.label,
        amount: null,
        note: `${eligibleNote} Eligible for ${formatRupees(extra.amount)} — needs the Director's approval. Not added to the figure.`,
      });
    } else {
      lines.push({ label: extra.label, amount: extra.amount, note: eligibleNote });
    }
  }

  const eligibleReason: SuggestionReason[] =
    extrasEligible.length > 0
      ? [
          {
            code: 'extras_need_approval',
            text: `Eligible for ${extrasEligible.map((e) => `${e.label} (${formatRupees(e.amount)})`).join(', ')} — the Director approves each case. Not included in the figure.`,
          },
        ]
      : [];

  if (blocking.length > 0) {
    return {
      ...base,
      verdict: 'cannot_suggest',
      lines,
      suggested: null,
      computed: null,
      extrasEligible,
      reasons: [...blocking, ...eligibleReason],
    };
  }

  // --- Round, then cap -----------------------------------------------------
  const raw = lines.reduce((sum, l) => sum + (l.amount ?? 0), 0);
  const step = rule.round_to ?? 100;
  let figure = Math.round(raw / step) * step;
  if (figure !== raw) {
    lines.push({
      label: `Rounded to the nearest ${formatRupees(step)}`,
      amount: figure - raw,
      note: `${formatRupees(raw)} rounds to ${formatRupees(figure)}.`,
    });
  }
  if (rule.cap_at_band_max !== false && figure > bandMax) {
    lines.push({
      label: 'Capped at the band maximum',
      amount: bandMax - figure,
      note: `${formatRupees(figure)} is above the top of the band, ${formatRupees(bandMax)}.`,
    });
    figure = bandMax;
  }

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
      verdict: 'cannot_suggest',
      lines,
      suggested: null,
      computed: figure,
      extrasEligible,
      reasons: [reason, ...eligibleReason],
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
          text: `Suggested ${formatRupees(figure)} a month, up from ${formatRupees(current)} (${formatRupees(figure - current)} more).`,
        };

  return {
    ...base,
    verdict: 'suggested',
    lines,
    suggested: figure,
    computed: figure,
    extrasEligible,
    reasons: [headline, ...eligibleReason],
  };
}
