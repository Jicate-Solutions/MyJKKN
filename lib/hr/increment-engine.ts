// lib/hr/increment-engine.ts
// ============================================================================
// ANNUAL INCREMENT ENGINE — proposes, never applies.
// ============================================================================
//
// WHY THIS FILE EXISTS
// --------------------
// `platform_policies` has held `hr.allowances_and_increments` since
// 20260605_hr_compensation_seeds.sql. It records the annual window, who
// approves, that performance must be satisfactory, what withholds an
// increment, and eight performance dimensions. Every one of those was typed
// into a screen, read back by the same screen, and consumed by nothing:
// `yearly_increment_factors` has exactly three references in the repo — the
// editor, the editor's hook, and the seed. Nobody has ever been able to ask
// MyJKKN "who is due an increment".
//
// This module answers that question and stops there.
//
// IT DOES NOT CHANGE PAY. The Director ruled on 2026-09-18 that pay bands are
// reference only and that no salary moves without his per-person approval.
// There is deliberately no writer here, no payroll call, and no "apply"
// anything. The output is a PROPOSAL: a number, the clause that produced it,
// and a sentence a non-coder can read.
//
// THE POLICY DOES NOT SAY HOW MUCH (finding, 2026-09-29)
// -----------------------------------------------------
// Read the seeded rows: `increments` carries a window, approvers, two boolean
// conditions and a trigger list. `yearly_increment_factors` is a list of
// dimension NAMES ("research", "journal_pubs"), not weights or amounts. There
// is no rupee figure and no percentage anywhere in the policy.
//
// So the arithmetic below reads two OPTIONAL clauses that no seeded row has
// yet — `increments.annual_amount` and `increments.annual_percent_of_gross` —
// and when both are absent it reports the amount as NOT CONFIGURED rather than
// inventing one. Deriving a figure from the pay scale, or defaulting to some
// conventional 3%, would put a number in front of the Director that nobody
// authorised. That is the same reasoning the salary table's own migration
// header gives for refusing to invent a component split.
//
// Eligibility and amount are therefore separate answers. A person can be
// genuinely DUE while the amount stays null.
//
// UNKNOWN IS NEVER ELIGIBLE
// -------------------------
// `satisfactory_performance_required` needs a judged performance review.
// `withholding_triggers` name reasons that live in different tables, and one of
// them ("unsatisfactory_work") needs a threshold the policy does not state.
// `head_of_dept_recommendation_required` needs a recommendation MyJKKN records
// nowhere at all. Wherever the evidence is missing the verdict is
// `cannot_tell` and the reason names precisely what is missing — it is never
// rounded up to "due".
// ============================================================================

// ---------------------------------------------------------------------------
// Rules — the parsed shape of `hr.allowances_and_increments`.increments
// ---------------------------------------------------------------------------

export interface IncrementRules {
  /** `increments.annual_window_months`. Months that must pass between rises. */
  annualWindowMonths: number | null;
  /** `increments.approver_default`. */
  approverDefault: string | null;
  /** `increments.approver_for_principal`. */
  approverForPrincipal: string[];
  /** `increments.satisfactory_performance_required`. */
  satisfactoryPerformanceRequired: boolean;
  /** `increments.head_of_dept_recommendation_required`. */
  headOfDeptRecommendationRequired: boolean;
  /** `increments.withholding_triggers`. */
  withholdingTriggers: string[];
  /** `yearly_increment_factors` — recorded for display, not used in any sum. */
  yearlyIncrementFactors: string[];

  // --- Amount clauses. Optional, and absent from every seeded row today. ---
  /** `increments.annual_amount` — a flat rupees-per-month uplift. */
  annualAmount: number | null;
  /** `increments.annual_percent_of_gross` — e.g. 3 for 3%. */
  annualPercentOfGross: number | null;
  /**
   * `increments.satisfactory_min_score` — the review score at or above which
   * performance counts as satisfactory. Without it the engine cannot judge the
   * condition the policy sets, and says so.
   */
  satisfactoryMinScore: number | null;
}

export interface ParsedRules {
  rules: IncrementRules;
  /** Shape complaints worth showing an administrator. Never thrown. */
  problems: string[];
}

/** Withholding trigger names this engine knows how to check. */
export const KNOWN_WITHHOLDING_TRIGGERS = [
  'poor_conduct',
  'unsatisfactory_work',
] as const;

export type KnownWithholdingTrigger =
  (typeof KNOWN_WITHHOLDING_TRIGGERS)[number];

// ---------------------------------------------------------------------------
// Person facts — everything the engine is allowed to look at.
// ---------------------------------------------------------------------------

export type DisciplinaryOutcome =
  | 'warning'
  | 'suspension'
  | 'termination'
  | 'exonerated';

export interface DecidedDisciplinaryCase {
  outcome: DisciplinaryOutcome;
  /** ISO date. The engine ignores a decided case with no date. */
  outcomeDate: string | null;
  caseNumber?: string | null;
}

export interface PerformanceReviewFact {
  cycleYear: number | null;
  /** `hr_performance_reviews.final_score`. Null until the Director stamps it. */
  finalScore: number | null;
  /** True only for status = 'final_approved'. */
  isFinalApproved: boolean;
}

export interface PayScaleReference {
  basicPay: number | null;
  gradePay: number | null;
}

export interface PersonPayFacts {
  staffId: string;
  staffName: string;
  /** Free-text job title from `staff.designation`. */
  designation: string | null;
  institutionId: string;
  /** `hr_staff_salaries.monthly_gross` of the row in force. */
  currentMonthlyGross: number | null;
  /**
   * `effective_from` of the salary row in force — i.e. the date this person's
   * pay was last set. This is the annual window's anchor.
   */
  payEffectiveFrom: string | null;
  /** `staff.date_of_joining`. The anchor when no salary row exists. */
  dateOfJoining: string | null;
  /** The most recent review, final-approved or not. Null when none exists. */
  latestReview: PerformanceReviewFact | null;
  /** Decided disciplinary cases. */
  decidedDisciplinaryCases: DecidedDisciplinaryCase[];
  /** Cases initiated and not yet decided. A live enquiry may still exonerate. */
  openUndecidedDisciplinaryCases: number;
  /**
   * The designation's reference scale, when the person's job title has been
   * sorted to a designation. Shown for context; no sum uses it.
   */
  scale: PayScaleReference | null;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type IncrementVerdict =
  /** The college has no increment rules recorded at all. */
  | 'no_rules'
  /** The annual window has not elapsed. A knowable fact, reported first. */
  | 'not_due'
  /** A rule definitely blocks it. */
  | 'withheld'
  /** Something the rules require cannot be judged from recorded data. */
  | 'cannot_tell'
  /** Every condition the rules set is met. */
  | 'due';

export type AmountRule =
  | 'policy_fixed_amount'
  | 'policy_percent_of_gross'
  /** The policy states no amount and no percentage. */
  | 'not_configured'
  /** A percentage is configured but this person's current pay is unrecorded. */
  | 'unknown_current_pay'
  /** Not eligible, so no amount was computed. */
  | 'not_applicable';

export type CheckStatus = 'pass' | 'fail' | 'unknown' | 'not_required';

export interface IncrementCheck {
  id:
    | 'rules_present'
    | 'annual_window'
    | 'conduct'
    | 'performance'
    | 'hod_recommendation'
    | 'unrecognised_trigger';
  /** Short label for a table cell. */
  label: string;
  status: CheckStatus;
  /** One plain sentence. Rendered verbatim — no jargon, no field names. */
  detail: string;
}

export interface IncrementProposal {
  staffId: string;
  staffName: string;
  designation: string | null;
  institutionId: string;

  verdict: IncrementVerdict;
  /** The single sentence that explains the verdict. Always present. */
  reason: string;

  /** Rupees per month. Null whenever it cannot be stated honestly. */
  proposedMonthlyIncrease: number | null;
  /** Current gross plus the proposal. Null when either half is unknown. */
  proposedNewMonthlyGross: number | null;
  currentMonthlyGross: number | null;
  amountRule: AmountRule;

  /** Who signs this off under the policy. */
  approver: string | null;
  /** Whole months since pay was last set. Null when the anchor is unknown. */
  monthsSinceLastPayChange: number | null;
  /** Which date the window was measured from. */
  windowAnchor: 'last_pay_change' | 'date_of_joining' | null;
  /** ISO date the window next elapses. Null when already elapsed or unknown. */
  nextEligibleOn: string | null;

  /** Every check, in a fixed order, so the screen can show its work. */
  checks: IncrementCheck[];
  scale: PayScaleReference | null;
}

// ---------------------------------------------------------------------------
// Date helpers. Plain UTC parts — a Date built from a local string shifts a
// joining date across a day boundary either side of midnight.
// ---------------------------------------------------------------------------

export interface DateParts {
  y: number;
  m: number;
  d: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

export function parseIsoDate(value: string | null | undefined): DateParts | null {
  if (typeof value !== 'string') return null;
  const matched = ISO_DATE.exec(value.trim());
  if (!matched) return null;
  const y = Number(matched[1]);
  const m = Number(matched[2]);
  const d = Number(matched[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Reject impossible days such as 2026-02-31, which Date would roll forward.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

export function formatIsoDate(parts: DateParts): string {
  const mm = String(parts.m).padStart(2, '0');
  const dd = String(parts.d).padStart(2, '0');
  return `${parts.y}-${mm}-${dd}`;
}

export function compareDates(a: DateParts, b: DateParts): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Whole months between two dates. 2026-01-15 → 2027-01-15 is 12; a day short
 * of that is 11. This is what "the annual window has elapsed" means.
 */
export function wholeMonthsBetween(from: DateParts, to: DateParts): number {
  let months = (to.y - from.y) * 12 + (to.m - from.m);
  if (to.d < from.d) months -= 1;
  return months;
}

/**
 * Add months, clamping the day to the target month's length, so 31 Jan plus
 * one month is 28 Feb rather than 3 March.
 */
export function addMonthsClamped(parts: DateParts, months: number): DateParts {
  const zeroBased = parts.y * 12 + (parts.m - 1) + months;
  const y = Math.floor(zeroBased / 12);
  const m = zeroBased - y * 12 + 1;
  return { y, m, d: Math.min(parts.d, daysInMonth(y, m)) };
}

/** Two decimals, the precision `numeric(12,2)` stores. */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Rule parsing
// ---------------------------------------------------------------------------

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export const EMPTY_RULES: IncrementRules = {
  annualWindowMonths: null,
  approverDefault: null,
  approverForPrincipal: [],
  satisfactoryPerformanceRequired: false,
  headOfDeptRecommendationRequired: false,
  withholdingTriggers: [],
  yearlyIncrementFactors: [],
  annualAmount: null,
  annualPercentOfGross: null,
  satisfactoryMinScore: null,
};

/**
 * Parse an `hr.allowances_and_increments` JSONB value. Returns null when there
 * is no usable policy object at all — the caller renders that as "no rules
 * recorded for this college", which is a different thing from rules that are
 * present but incomplete.
 */
export function parseIncrementRules(policyValue: unknown): ParsedRules | null {
  if (policyValue == null || typeof policyValue !== 'object' || Array.isArray(policyValue)) {
    return null;
  }
  const root = policyValue as Record<string, unknown>;
  const incrementsRaw = root.increments;
  const problems: string[] = [];

  if (
    incrementsRaw == null ||
    typeof incrementsRaw !== 'object' ||
    Array.isArray(incrementsRaw)
  ) {
    problems.push(
      'The saved rules for this college do not contain an increments section.',
    );
    return {
      rules: {
        ...EMPTY_RULES,
        yearlyIncrementFactors: asStringArray(root.yearly_increment_factors),
      },
      problems,
    };
  }

  const inc = incrementsRaw as Record<string, unknown>;

  const window = asFiniteNumber(inc.annual_window_months);
  if (window === null) {
    problems.push('The rules do not say how many months must pass between rises.');
  } else if (!Number.isInteger(window) || window <= 0) {
    problems.push(
      `The rules say ${window} months must pass between rises, which is not a usable number of months.`,
    );
  }

  const annualAmount = asFiniteNumber(inc.annual_amount);
  if (annualAmount !== null && annualAmount <= 0) {
    problems.push('The fixed increment amount in the rules is not a positive figure.');
  }

  const percent = asFiniteNumber(inc.annual_percent_of_gross);
  if (percent !== null && (percent <= 0 || percent > 100)) {
    problems.push(
      'The increment percentage in the rules is not between 0 and 100.',
    );
  }

  const usableAmount = annualAmount !== null && annualAmount > 0 ? annualAmount : null;
  const usablePercent = percent !== null && percent > 0 && percent <= 100 ? percent : null;

  if (usableAmount !== null && usablePercent !== null) {
    problems.push(
      'The rules give both a fixed amount and a percentage. The fixed amount is used.',
    );
  }

  const triggers = asStringArray(inc.withholding_triggers);
  const unrecognised = triggers.filter(
    (t) => !(KNOWN_WITHHOLDING_TRIGGERS as readonly string[]).includes(t),
  );
  if (unrecognised.length > 0) {
    problems.push(
      `The rules withhold an increment for ${unrecognised.join(', ')}, which MyJKKN keeps no record of.`,
    );
  }

  return {
    rules: {
      annualWindowMonths:
        window !== null && Number.isInteger(window) && window > 0 ? window : null,
      approverDefault: asNonEmptyString(inc.approver_default),
      approverForPrincipal: asStringArray(inc.approver_for_principal),
      satisfactoryPerformanceRequired: inc.satisfactory_performance_required === true,
      headOfDeptRecommendationRequired:
        inc.head_of_dept_recommendation_required === true,
      withholdingTriggers: triggers,
      yearlyIncrementFactors: asStringArray(root.yearly_increment_factors),
      annualAmount: usableAmount,
      annualPercentOfGross: usableAmount !== null ? null : usablePercent,
      satisfactoryMinScore: asFiniteNumber(inc.satisfactory_min_score),
    },
    problems,
  };
}

// ---------------------------------------------------------------------------
// Amount
// ---------------------------------------------------------------------------

export interface AmountProposal {
  monthlyIncrease: number | null;
  newMonthlyGross: number | null;
  rule: AmountRule;
  /** Why the amount is null, when it is. */
  note: string | null;
}

export function proposeAmount(
  rules: IncrementRules,
  currentMonthlyGross: number | null,
): AmountProposal {
  const gross =
    typeof currentMonthlyGross === 'number' &&
    Number.isFinite(currentMonthlyGross) &&
    currentMonthlyGross > 0
      ? currentMonthlyGross
      : null;

  if (rules.annualAmount !== null) {
    const increase = roundCurrency(rules.annualAmount);
    return {
      monthlyIncrease: increase,
      newMonthlyGross: gross === null ? null : roundCurrency(gross + increase),
      rule: 'policy_fixed_amount',
      note:
        gross === null
          ? 'No monthly pay is recorded for this person, so the new figure cannot be shown.'
          : null,
    };
  }

  if (rules.annualPercentOfGross !== null) {
    if (gross === null) {
      return {
        monthlyIncrease: null,
        newMonthlyGross: null,
        rule: 'unknown_current_pay',
        note:
          'The rules set the rise as a percentage of pay, and no monthly pay is recorded for this person.',
      };
    }
    const increase = roundCurrency((gross * rules.annualPercentOfGross) / 100);
    return {
      monthlyIncrease: increase,
      newMonthlyGross: roundCurrency(gross + increase),
      rule: 'policy_percent_of_gross',
      note: null,
    };
  }

  return {
    monthlyIncrease: null,
    newMonthlyGross: null,
    rule: 'not_configured',
    note: 'The rules for this college do not say how much an increment is worth.',
  };
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

export interface AssessOptions {
  /** The date the question is asked. ISO date or Date. */
  asOf: string | Date;
}

function asOfParts(asOf: string | Date): DateParts {
  if (asOf instanceof Date) {
    return {
      y: asOf.getUTCFullYear(),
      m: asOf.getUTCMonth() + 1,
      d: asOf.getUTCDate(),
    };
  }
  const parsed = parseIsoDate(asOf);
  if (parsed) return parsed;
  const fallback = new Date(asOf);
  return {
    y: fallback.getUTCFullYear(),
    m: fallback.getUTCMonth() + 1,
    d: fallback.getUTCDate(),
  };
}

const WITHHOLDING_OUTCOMES: DisciplinaryOutcome[] = [
  'warning',
  'suspension',
  'termination',
];

/**
 * The single entry point. Pure: no clock, no network, no database. Give it a
 * person, the college's rules and a date, and it returns a proposal.
 *
 * Pass `rules = null` for a college with no policy row. That is answered as
 * `no_rules`, never as an empty or eligible result.
 */
export function assessIncrement(
  person: PersonPayFacts,
  rules: IncrementRules | null,
  options: AssessOptions,
): IncrementProposal {
  const today = asOfParts(options.asOf);
  const checks: IncrementCheck[] = [];

  const base = {
    staffId: person.staffId,
    staffName: person.staffName,
    designation: person.designation,
    institutionId: person.institutionId,
    currentMonthlyGross: person.currentMonthlyGross,
    scale: person.scale,
  };

  // --- 1. Rules present at all -------------------------------------------
  if (rules === null) {
    checks.push({
      id: 'rules_present',
      label: 'Increment rules',
      status: 'unknown',
      detail: 'This college has no increment rules recorded.',
    });
    return {
      ...base,
      verdict: 'no_rules',
      reason:
        'No increment rules are recorded for this college, so nobody here can be assessed.',
      proposedMonthlyIncrease: null,
      proposedNewMonthlyGross: null,
      amountRule: 'not_applicable',
      approver: null,
      monthsSinceLastPayChange: null,
      windowAnchor: null,
      nextEligibleOn: null,
      checks,
    };
  }

  checks.push({
    id: 'rules_present',
    label: 'Increment rules',
    status: 'pass',
    detail: 'This college has increment rules recorded.',
  });

  const approver = rules.approverDefault;

  // --- 2. The annual window ----------------------------------------------
  const payAnchor = parseIsoDate(person.payEffectiveFrom);
  const joinAnchor = parseIsoDate(person.dateOfJoining);
  const anchor = payAnchor ?? joinAnchor;
  const anchorKind: IncrementProposal['windowAnchor'] =
    payAnchor !== null ? 'last_pay_change' : joinAnchor !== null ? 'date_of_joining' : null;

  let monthsSince: number | null = null;
  let nextEligibleOn: string | null = null;

  if (rules.annualWindowMonths === null) {
    checks.push({
      id: 'annual_window',
      label: 'Time since last rise',
      status: 'unknown',
      detail: 'The rules do not say how many months must pass between rises.',
    });
    return {
      ...base,
      verdict: 'cannot_tell',
      reason: 'The rules do not say how many months must pass between rises.',
      proposedMonthlyIncrease: null,
      proposedNewMonthlyGross: null,
      amountRule: 'not_applicable',
      approver,
      monthsSinceLastPayChange: null,
      windowAnchor: anchorKind,
      nextEligibleOn: null,
      checks,
    };
  }

  if (anchor === null) {
    checks.push({
      id: 'annual_window',
      label: 'Time since last rise',
      status: 'unknown',
      detail:
        'There is no record of when this person joined or when their pay was last set, so the year cannot be counted.',
    });
    return {
      ...base,
      verdict: 'cannot_tell',
      reason:
        'There is no record of when this person joined or when their pay was last set, so the year cannot be counted.',
      proposedMonthlyIncrease: null,
      proposedNewMonthlyGross: null,
      amountRule: 'not_applicable',
      approver,
      monthsSinceLastPayChange: null,
      windowAnchor: null,
      nextEligibleOn: null,
      checks,
    };
  }

  monthsSince = wholeMonthsBetween(anchor, today);
  const anchorPhrase =
    anchorKind === 'last_pay_change' ? 'pay was last set' : 'they joined';

  if (monthsSince < rules.annualWindowMonths) {
    const due = addMonthsClamped(anchor, rules.annualWindowMonths);
    nextEligibleOn = formatIsoDate(due);
    const monthsToGo = rules.annualWindowMonths - Math.max(monthsSince, 0);
    checks.push({
      id: 'annual_window',
      label: 'Time since last rise',
      status: 'fail',
      detail: `Only ${Math.max(monthsSince, 0)} of the ${rules.annualWindowMonths} months since ${anchorPhrase} have passed.`,
    });
    return {
      ...base,
      verdict: 'not_due',
      reason: `Not due yet — ${monthsToGo} more ${monthsToGo === 1 ? 'month' : 'months'} to go, on ${nextEligibleOn}.`,
      proposedMonthlyIncrease: null,
      proposedNewMonthlyGross: null,
      amountRule: 'not_applicable',
      approver,
      monthsSinceLastPayChange: monthsSince,
      windowAnchor: anchorKind,
      nextEligibleOn,
      checks,
    };
  }

  checks.push({
    id: 'annual_window',
    label: 'Time since last rise',
    status: 'pass',
    detail: `${monthsSince} months have passed since ${anchorPhrase}, and the rules ask for ${rules.annualWindowMonths}.`,
  });

  // --- 3. Conduct ---------------------------------------------------------
  // Scope: only outcomes dated on or after the window's anchor. A warning from
  // four years ago was already accounted for at the rise that followed it;
  // re-applying it for ever would withhold a person's pay permanently for one
  // old incident. Decision taken here, not stated by the policy.
  const conductIsATrigger = rules.withholdingTriggers.includes('poor_conduct');

  if (!conductIsATrigger) {
    checks.push({
      id: 'conduct',
      label: 'Conduct',
      status: 'not_required',
      detail: 'The rules do not withhold an increment for conduct.',
    });
  } else {
    const blocking = person.decidedDisciplinaryCases.filter((c) => {
      if (!WITHHOLDING_OUTCOMES.includes(c.outcome)) return false;
      const when = parseIsoDate(c.outcomeDate);
      // A decided case with no date cannot be placed inside the window.
      if (when === null) return false;
      return compareDates(when, anchor) >= 0;
    });
    const undatedDecided = person.decidedDisciplinaryCases.filter(
      (c) =>
        WITHHOLDING_OUTCOMES.includes(c.outcome) && parseIsoDate(c.outcomeDate) === null,
    );

    if (blocking.length > 0) {
      const worst = blocking[0];
      checks.push({
        id: 'conduct',
        label: 'Conduct',
        status: 'fail',
        detail: `A disciplinary decision of "${worst.outcome}" was recorded since ${anchorPhrase}.`,
      });
      return {
        ...base,
        verdict: 'withheld',
        reason: `Withheld — a disciplinary decision of "${worst.outcome}" was recorded since ${anchorPhrase}, and the rules withhold an increment for poor conduct.`,
        proposedMonthlyIncrease: null,
        proposedNewMonthlyGross: null,
        amountRule: 'not_applicable',
        approver,
        monthsSinceLastPayChange: monthsSince,
        windowAnchor: anchorKind,
        nextEligibleOn: null,
        checks,
      };
    }

    if (person.openUndecidedDisciplinaryCases > 0) {
      const n = person.openUndecidedDisciplinaryCases;
      checks.push({
        id: 'conduct',
        label: 'Conduct',
        status: 'unknown',
        detail: `${n} disciplinary ${n === 1 ? 'case is' : 'cases are'} open with no decision yet, and the enquiry may clear them.`,
      });
    } else if (undatedDecided.length > 0) {
      checks.push({
        id: 'conduct',
        label: 'Conduct',
        status: 'unknown',
        detail:
          'A disciplinary decision is recorded with no date, so it cannot be placed inside or outside this year.',
      });
    } else {
      checks.push({
        id: 'conduct',
        label: 'Conduct',
        status: 'pass',
        detail: `No disciplinary decision has been recorded since ${anchorPhrase}.`,
      });
    }
  }

  // --- 4. Performance ----------------------------------------------------
  const performanceMatters =
    rules.satisfactoryPerformanceRequired ||
    rules.withholdingTriggers.includes('unsatisfactory_work');

  if (!performanceMatters) {
    checks.push({
      id: 'performance',
      label: 'Performance',
      status: 'not_required',
      detail: 'The rules do not make this increment depend on a performance review.',
    });
  } else {
    const review = person.latestReview;
    if (review === null) {
      checks.push({
        id: 'performance',
        label: 'Performance',
        status: 'unknown',
        detail:
          'The rules require satisfactory performance, and this person has no performance review on record.',
      });
    } else if (!review.isFinalApproved) {
      checks.push({
        id: 'performance',
        label: 'Performance',
        status: 'unknown',
        detail:
          'This person has a performance review that has not been finally approved, so there is no judged result to read.',
      });
    } else if (review.finalScore === null) {
      checks.push({
        id: 'performance',
        label: 'Performance',
        status: 'unknown',
        detail:
          'This person’s performance review was approved without a score, so there is nothing to compare.',
      });
    } else if (rules.satisfactoryMinScore === null) {
      checks.push({
        id: 'performance',
        label: 'Performance',
        status: 'unknown',
        detail: `The rules require satisfactory performance but never say what score counts as satisfactory. This person scored ${review.finalScore}.`,
      });
    } else if (review.finalScore < rules.satisfactoryMinScore) {
      checks.push({
        id: 'performance',
        label: 'Performance',
        status: 'fail',
        detail: `This person scored ${review.finalScore}, and the rules ask for at least ${rules.satisfactoryMinScore}.`,
      });
      return {
        ...base,
        verdict: 'withheld',
        reason: `Withheld — this person scored ${review.finalScore} in their performance review and the rules ask for at least ${rules.satisfactoryMinScore}.`,
        proposedMonthlyIncrease: null,
        proposedNewMonthlyGross: null,
        amountRule: 'not_applicable',
        approver,
        monthsSinceLastPayChange: monthsSince,
        windowAnchor: anchorKind,
        nextEligibleOn: null,
        checks,
      };
    } else {
      checks.push({
        id: 'performance',
        label: 'Performance',
        status: 'pass',
        detail: `This person scored ${review.finalScore}, and the rules ask for at least ${rules.satisfactoryMinScore}.`,
      });
    }
  }

  // --- 5. Head of department's recommendation -----------------------------
  if (!rules.headOfDeptRecommendationRequired) {
    checks.push({
      id: 'hod_recommendation',
      label: 'Head of department',
      status: 'not_required',
      detail: 'The rules do not require the head of department to recommend this.',
    });
  } else {
    checks.push({
      id: 'hod_recommendation',
      label: 'Head of department',
      status: 'unknown',
      detail:
        'The rules require the head of department to recommend the increment, and MyJKKN records no such recommendation anywhere.',
    });
  }

  // --- 6. Trigger names nobody can check ---------------------------------
  const unrecognised = rules.withholdingTriggers.filter(
    (t) => !(KNOWN_WITHHOLDING_TRIGGERS as readonly string[]).includes(t),
  );
  if (unrecognised.length === 0) {
    checks.push({
      id: 'unrecognised_trigger',
      label: 'Other withholding reasons',
      status: 'not_required',
      detail: 'Every reason the rules give for withholding an increment can be checked.',
    });
  } else {
    checks.push({
      id: 'unrecognised_trigger',
      label: 'Other withholding reasons',
      status: 'unknown',
      detail: `The rules also withhold an increment for ${unrecognised.join(', ')}, which MyJKKN keeps no record of.`,
    });
  }

  // --- 7. Verdict --------------------------------------------------------
  const unknowns = checks.filter((c) => c.status === 'unknown');
  if (unknowns.length > 0) {
    return {
      ...base,
      verdict: 'cannot_tell',
      reason: `Cannot tell — ${unknowns.map((c) => c.detail).join(' ')}`,
      proposedMonthlyIncrease: null,
      proposedNewMonthlyGross: null,
      amountRule: 'not_applicable',
      approver,
      monthsSinceLastPayChange: monthsSince,
      windowAnchor: anchorKind,
      nextEligibleOn: null,
      checks,
    };
  }

  const amount = proposeAmount(rules, person.currentMonthlyGross);
  const reason =
    amount.monthlyIncrease === null
      ? `Due — the year has passed and every condition is met. ${amount.note ?? ''}`.trim()
      : 'Due — the year has passed and every condition is met.';

  return {
    ...base,
    verdict: 'due',
    reason,
    proposedMonthlyIncrease: amount.monthlyIncrease,
    proposedNewMonthlyGross: amount.newMonthlyGross,
    amountRule: amount.rule,
    approver,
    monthsSinceLastPayChange: monthsSince,
    windowAnchor: anchorKind,
    nextEligibleOn: null,
    checks,
  };
}

// ---------------------------------------------------------------------------
// College-level rollup
// ---------------------------------------------------------------------------

export interface CollegeIncrementReport {
  institutionId: string;
  institutionName: string;
  /** False when the college has no `hr.allowances_and_increments` row. */
  hasRules: boolean;
  /** Shape complaints about the saved rules. Empty when they parse cleanly. */
  rulesProblems: string[];
  rules: IncrementRules | null;
  proposals: IncrementProposal[];
  counts: Record<IncrementVerdict, number>;
  /** Sum of the proposals that carry a figure. Null when none does. */
  totalMonthlyIncrease: number | null;
  staffCount: number;
}

export function emptyVerdictCounts(): Record<IncrementVerdict, number> {
  return { no_rules: 0, not_due: 0, withheld: 0, cannot_tell: 0, due: 0 };
}

export function buildCollegeReport(input: {
  institutionId: string;
  institutionName: string;
  /** The raw policy JSONB, or null when the college has no row. */
  policyValue: unknown;
  people: PersonPayFacts[];
  asOf: string | Date;
}): CollegeIncrementReport {
  const hasRow = input.policyValue != null;
  const parsed = hasRow ? parseIncrementRules(input.policyValue) : null;
  const rules = parsed?.rules ?? null;

  // A row exists but is not an object the engine can read. That is a different
  // fault from having no row, and it must not be reported as "no rules".
  const problems = parsed?.problems ?? [];
  if (hasRow && parsed === null) {
    problems.push(
      'This college has a saved increment policy, but it is not in a shape MyJKKN can read.',
    );
  }

  const proposals = input.people.map((person) =>
    assessIncrement(person, rules, { asOf: input.asOf }),
  );

  const counts = emptyVerdictCounts();
  let total = 0;
  let anyAmount = false;
  for (const p of proposals) {
    counts[p.verdict] += 1;
    if (p.proposedMonthlyIncrease !== null) {
      total += p.proposedMonthlyIncrease;
      anyAmount = true;
    }
  }

  return {
    institutionId: input.institutionId,
    institutionName: input.institutionName,
    hasRules: rules !== null,
    rulesProblems: problems,
    rules,
    proposals,
    counts,
    totalMonthlyIncrease: anyAmount ? roundCurrency(total) : null,
    staffCount: input.people.length,
  };
}
