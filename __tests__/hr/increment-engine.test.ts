/**
 * Annual increment engine — the whole decision surface.
 *
 * MyJKKN has stored `hr.allowances_and_increments` since June and never once
 * calculated an increment from it. These tests pin what the engine is allowed
 * to conclude, and in particular the rule that matters most: missing evidence
 * is NEVER rounded up to "eligible". Every branch that cannot be judged has to
 * come back as `cannot_tell` with a sentence naming what is missing.
 *
 * Nothing here touches pay. The engine has no writer.
 */
import { describe, it, expect } from 'vitest';

import {
  addMonthsClamped,
  assessIncrement,
  buildCollegeReport,
  formatIsoDate,
  parseIncrementRules,
  parseIsoDate,
  proposeAmount,
  roundCurrency,
  wholeMonthsBetween,
  type IncrementRules,
  type PersonPayFacts,
} from '@/lib/hr/increment-engine';

// ---------------------------------------------------------------------------
// The two seeded colleges' real policy, verbatim from
// supabase/migrations/20260605_hr_compensation_seeds.sql.
// ---------------------------------------------------------------------------

const SEEDED_POLICY = {
  allowances: { hod: 3000, other_per_designation: {} },
  allowance_aicte_university_government_aligned: true,
  allowance_governing_body_decision_authority: true,
  increments: {
    annual_window_months: 12,
    approver_default: 'Principal',
    approver_for_principal: ['Chairman', 'Secretary'],
    satisfactory_performance_required: true,
    head_of_dept_recommendation_required: true,
    withholding_triggers: ['poor_conduct', 'unsatisfactory_work'],
  },
  yearly_increment_factors: [
    'contributions',
    'univ_results',
    'feedback',
    'research',
    'entrepreneurship',
    'innovation',
    'startups',
    'journal_pubs',
  ],
  discretion: 'management',
} as const;

const INSTITUTION = '5de4fba1-4564-41ed-8c73-5d948b74b843';

/** Rules that CAN reach a verdict: amount + threshold + no HOD requirement. */
function completeRules(over: Partial<IncrementRules> = {}): IncrementRules {
  return {
    annualWindowMonths: 12,
    approverDefault: 'Principal',
    approverForPrincipal: ['Chairman', 'Secretary'],
    satisfactoryPerformanceRequired: true,
    headOfDeptRecommendationRequired: false,
    withholdingTriggers: ['poor_conduct', 'unsatisfactory_work'],
    yearlyIncrementFactors: [],
    annualAmount: 1000,
    annualPercentOfGross: null,
    satisfactoryMinScore: 60,
    ...over,
  };
}

function person(over: Partial<PersonPayFacts> = {}): PersonPayFacts {
  return {
    staffId: 'staff-1',
    staffName: 'A Teacher',
    designation: 'Assistant Professor',
    institutionId: INSTITUTION,
    currentMonthlyGross: 20000,
    payEffectiveFrom: '2025-01-15',
    dateOfJoining: '2020-06-01',
    latestReview: { cycleYear: 2026, finalScore: 75, isFinalApproved: true },
    decidedDisciplinaryCases: [],
    openUndecidedDisciplinaryCases: 0,
    scale: { basicPay: 20000, gradePay: null },
    ...over,
  };
}

const ASOF = '2026-09-29';

function checkFor(
  result: ReturnType<typeof assessIncrement>,
  id: string,
) {
  const found = result.checks.find((c) => c.id === id);
  if (!found) throw new Error(`no check with id ${id}`);
  return found;
}

// ===========================================================================
// Date arithmetic — the boundary the whole engine turns on
// ===========================================================================

describe('date arithmetic', () => {
  it('counts a year as elapsed on the anniversary, not a day before', () => {
    const anchor = { y: 2025, m: 9, d: 29 };
    expect(wholeMonthsBetween(anchor, { y: 2026, m: 9, d: 28 })).toBe(11);
    expect(wholeMonthsBetween(anchor, { y: 2026, m: 9, d: 29 })).toBe(12);
    expect(wholeMonthsBetween(anchor, { y: 2026, m: 9, d: 30 })).toBe(12);
  });

  it('returns a negative count for a future anchor', () => {
    expect(wholeMonthsBetween({ y: 2027, m: 1, d: 1 }, { y: 2026, m: 9, d: 29 })).toBe(-4);
  });

  it('clamps the due date into a short month instead of rolling into the next', () => {
    expect(formatIsoDate(addMonthsClamped({ y: 2026, m: 1, d: 31 }, 1))).toBe('2026-02-28');
    expect(formatIsoDate(addMonthsClamped({ y: 2027, m: 1, d: 31 }, 1))).toBe('2027-02-28');
    // 2028 is a leap year.
    expect(formatIsoDate(addMonthsClamped({ y: 2028, m: 1, d: 31 }, 1))).toBe('2028-02-29');
    expect(formatIsoDate(addMonthsClamped({ y: 2026, m: 3, d: 15 }, 12))).toBe('2027-03-15');
    expect(formatIsoDate(addMonthsClamped({ y: 2026, m: 12, d: 1 }, 12))).toBe('2027-12-01');
  });

  it('rejects a date that does not exist rather than rolling it forward', () => {
    expect(parseIsoDate('2026-02-31')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('not a date')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate('2026-02-28T11:00:00Z')).toEqual({ y: 2026, m: 2, d: 28 });
  });

  it('rounds currency to the two decimals the column stores', () => {
    expect(roundCurrency(1000.005)).toBe(1000.01);
    expect(roundCurrency(20000 * 0.03)).toBe(600);
    expect(roundCurrency(17333.33 * 0.03)).toBe(520);
  });
});

// ===========================================================================
// Rule parsing
// ===========================================================================

describe('parseIncrementRules', () => {
  it('reads the real seeded policy', () => {
    const parsed = parseIncrementRules(SEEDED_POLICY);
    expect(parsed).not.toBeNull();
    expect(parsed!.rules.annualWindowMonths).toBe(12);
    expect(parsed!.rules.approverDefault).toBe('Principal');
    expect(parsed!.rules.approverForPrincipal).toEqual(['Chairman', 'Secretary']);
    expect(parsed!.rules.satisfactoryPerformanceRequired).toBe(true);
    expect(parsed!.rules.headOfDeptRecommendationRequired).toBe(true);
    expect(parsed!.rules.withholdingTriggers).toEqual([
      'poor_conduct',
      'unsatisfactory_work',
    ]);
    expect(parsed!.rules.yearlyIncrementFactors).toHaveLength(8);
  });

  it('reports that the seeded policy states no amount at all', () => {
    const parsed = parseIncrementRules(SEEDED_POLICY)!;
    expect(parsed.rules.annualAmount).toBeNull();
    expect(parsed.rules.annualPercentOfGross).toBeNull();
    expect(parsed.rules.satisfactoryMinScore).toBeNull();
  });

  it('returns null for something that is not a policy object', () => {
    expect(parseIncrementRules(null)).toBeNull();
    expect(parseIncrementRules('a string')).toBeNull();
    expect(parseIncrementRules([1, 2, 3])).toBeNull();
  });

  it('complains, but does not throw, when the increments section is missing', () => {
    const parsed = parseIncrementRules({ allowances: {} })!;
    expect(parsed.rules.annualWindowMonths).toBeNull();
    expect(parsed.problems.join(' ')).toMatch(/do not contain an increments section/);
  });

  it('refuses a window that is not a usable number of months', () => {
    for (const bad of [0, -12, 12.5]) {
      const parsed = parseIncrementRules({ increments: { annual_window_months: bad } })!;
      expect(parsed.rules.annualWindowMonths).toBeNull();
      expect(parsed.problems.length).toBeGreaterThan(0);
    }
  });

  it('prefers a fixed amount over a percentage, and says so', () => {
    const parsed = parseIncrementRules({
      increments: {
        annual_window_months: 12,
        annual_amount: 1500,
        annual_percent_of_gross: 3,
      },
    })!;
    expect(parsed.rules.annualAmount).toBe(1500);
    expect(parsed.rules.annualPercentOfGross).toBeNull();
    expect(parsed.problems.join(' ')).toMatch(/both a fixed amount and a percentage/);
  });

  it('discards a percentage outside 0-100', () => {
    for (const bad of [0, -3, 101]) {
      const parsed = parseIncrementRules({
        increments: { annual_window_months: 12, annual_percent_of_gross: bad },
      })!;
      expect(parsed.rules.annualPercentOfGross).toBeNull();
    }
  });

  it('names a withholding reason it cannot check', () => {
    const parsed = parseIncrementRules({
      increments: {
        annual_window_months: 12,
        withholding_triggers: ['poor_conduct', 'pending_court_case'],
      },
    })!;
    expect(parsed.problems.join(' ')).toMatch(/pending_court_case/);
  });
});

// ===========================================================================
// Amount
// ===========================================================================

describe('proposeAmount', () => {
  it('uses the fixed amount from the rules', () => {
    const a = proposeAmount(completeRules({ annualAmount: 1500 }), 20000);
    expect(a.rule).toBe('policy_fixed_amount');
    expect(a.monthlyIncrease).toBe(1500);
    expect(a.newMonthlyGross).toBe(21500);
  });

  it('computes a percentage of current pay', () => {
    const a = proposeAmount(
      completeRules({ annualAmount: null, annualPercentOfGross: 3 }),
      20000,
    );
    expect(a.rule).toBe('policy_percent_of_gross');
    expect(a.monthlyIncrease).toBe(600);
    expect(a.newMonthlyGross).toBe(20600);
  });

  it('rounds a percentage to paise, not to a float artefact', () => {
    const a = proposeAmount(
      completeRules({ annualAmount: null, annualPercentOfGross: 3.5 }),
      17333.33,
    );
    expect(a.monthlyIncrease).toBe(606.67);
    expect(a.newMonthlyGross).toBe(17940);
  });

  it('will not compute a percentage of pay it does not know', () => {
    for (const gross of [null, 0, -5]) {
      const a = proposeAmount(
        completeRules({ annualAmount: null, annualPercentOfGross: 3 }),
        gross,
      );
      expect(a.rule).toBe('unknown_current_pay');
      expect(a.monthlyIncrease).toBeNull();
      expect(a.note).toMatch(/no monthly pay is recorded/i);
    }
  });

  it('reports "not configured" rather than inventing a figure', () => {
    const a = proposeAmount(
      completeRules({ annualAmount: null, annualPercentOfGross: null }),
      20000,
    );
    expect(a.rule).toBe('not_configured');
    expect(a.monthlyIncrease).toBeNull();
    expect(a.newMonthlyGross).toBeNull();
    expect(a.note).toMatch(/do not say how much/i);
  });

  it('still states the fixed amount when current pay is unknown', () => {
    const a = proposeAmount(completeRules({ annualAmount: 1000 }), null);
    expect(a.monthlyIncrease).toBe(1000);
    expect(a.newMonthlyGross).toBeNull();
  });
});

// ===========================================================================
// Eligibility branches
// ===========================================================================

describe('assessIncrement — a college with no rules', () => {
  it('says so explicitly and never says "due"', () => {
    const r = assessIncrement(person(), null, { asOf: ASOF });
    expect(r.verdict).toBe('no_rules');
    expect(r.reason).toMatch(/No increment rules are recorded for this college/);
    expect(r.proposedMonthlyIncrease).toBeNull();
    expect(r.amountRule).toBe('not_applicable');
    expect(checkFor(r, 'rules_present').status).toBe('unknown');
  });
});

describe('assessIncrement — the annual window', () => {
  it('is due on the anniversary itself', () => {
    const r = assessIncrement(
      person({ payEffectiveFrom: '2025-09-29' }),
      completeRules(),
      { asOf: '2026-09-29' },
    );
    expect(r.monthsSinceLastPayChange).toBe(12);
    expect(r.verdict).toBe('due');
  });

  it('is not due one day before the anniversary', () => {
    const r = assessIncrement(
      person({ payEffectiveFrom: '2025-09-29' }),
      completeRules(),
      { asOf: '2026-09-28' },
    );
    expect(r.verdict).toBe('not_due');
    expect(r.monthsSinceLastPayChange).toBe(11);
    expect(r.nextEligibleOn).toBe('2026-09-29');
    expect(r.reason).toMatch(/1 more month to go/);
  });

  it('honours a window other than twelve months', () => {
    const r = assessIncrement(
      person({ payEffectiveFrom: '2026-03-29' }),
      completeRules({ annualWindowMonths: 6 }),
      { asOf: '2026-09-29' },
    );
    expect(r.verdict).toBe('due');

    const early = assessIncrement(
      person({ payEffectiveFrom: '2026-05-29' }),
      completeRules({ annualWindowMonths: 6 }),
      { asOf: '2026-09-29' },
    );
    expect(early.verdict).toBe('not_due');
    expect(early.nextEligibleOn).toBe('2026-11-29');
  });

  it('measures from the joining date when no pay row exists', () => {
    const r = assessIncrement(
      person({ payEffectiveFrom: null, dateOfJoining: '2025-01-10' }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.windowAnchor).toBe('date_of_joining');
    expect(r.verdict).toBe('due');
    expect(checkFor(r, 'annual_window').detail).toMatch(/since they joined/);
  });

  it('prefers the last pay change over the joining date', () => {
    const r = assessIncrement(
      person({ payEffectiveFrom: '2026-06-01', dateOfJoining: '2010-01-01' }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.windowAnchor).toBe('last_pay_change');
    expect(r.verdict).toBe('not_due');
  });

  it('cannot tell when neither date is on record', () => {
    const r = assessIncrement(
      person({ payEffectiveFrom: null, dateOfJoining: null }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toMatch(/no record of when this person joined/);
    expect(r.windowAnchor).toBeNull();
  });

  it('cannot tell when the rules omit the window', () => {
    const r = assessIncrement(
      person(),
      completeRules({ annualWindowMonths: null }),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toMatch(/how many months must pass/);
  });

  it('treats a future-dated pay row as not due, not as elapsed', () => {
    const r = assessIncrement(
      person({ payEffectiveFrom: '2027-01-01' }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('not_due');
    expect(r.monthsSinceLastPayChange).toBeLessThan(0);
    expect(r.nextEligibleOn).toBe('2028-01-01');
  });
});

describe('assessIncrement — conduct', () => {
  it('withholds on a disciplinary decision inside the year', () => {
    const r = assessIncrement(
      person({
        payEffectiveFrom: '2025-01-15',
        decidedDisciplinaryCases: [{ outcome: 'warning', outcomeDate: '2026-02-01' }],
      }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('withheld');
    expect(r.reason).toMatch(/"warning"/);
    expect(r.proposedMonthlyIncrease).toBeNull();
  });

  it('ignores a decision that predates the year', () => {
    const r = assessIncrement(
      person({
        payEffectiveFrom: '2025-01-15',
        decidedDisciplinaryCases: [{ outcome: 'suspension', outcomeDate: '2022-03-01' }],
      }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('due');
    expect(checkFor(r, 'conduct').status).toBe('pass');
  });

  it('withholds on a decision dated exactly on the anchor', () => {
    const r = assessIncrement(
      person({
        payEffectiveFrom: '2025-01-15',
        decidedDisciplinaryCases: [{ outcome: 'warning', outcomeDate: '2025-01-15' }],
      }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('withheld');
  });

  it('does not withhold on an exoneration', () => {
    const r = assessIncrement(
      person({
        decidedDisciplinaryCases: [{ outcome: 'exonerated', outcomeDate: '2026-02-01' }],
      }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('due');
  });

  it('cannot tell while an enquiry is still open', () => {
    const r = assessIncrement(
      person({ openUndecidedDisciplinaryCases: 1 }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toMatch(/open with no decision yet/);
  });

  it('cannot tell when a decision carries no date', () => {
    const r = assessIncrement(
      person({
        decidedDisciplinaryCases: [{ outcome: 'warning', outcomeDate: null }],
      }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('cannot_tell');
    expect(checkFor(r, 'conduct').detail).toMatch(/no date/);
  });

  it('skips the conduct check when conduct is not a withholding reason', () => {
    const r = assessIncrement(
      person({
        openUndecidedDisciplinaryCases: 3,
        decidedDisciplinaryCases: [{ outcome: 'warning', outcomeDate: '2026-02-01' }],
      }),
      completeRules({ withholdingTriggers: [] }),
      { asOf: ASOF },
    );
    expect(checkFor(r, 'conduct').status).toBe('not_required');
    expect(r.verdict).toBe('due');
  });
});

describe('assessIncrement — performance', () => {
  it('passes a score at or above the satisfactory mark', () => {
    for (const score of [60, 61, 100]) {
      const r = assessIncrement(
        person({ latestReview: { cycleYear: 2026, finalScore: score, isFinalApproved: true } }),
        completeRules({ satisfactoryMinScore: 60 }),
        { asOf: ASOF },
      );
      expect(r.verdict).toBe('due');
    }
  });

  it('withholds a score below the satisfactory mark', () => {
    const r = assessIncrement(
      person({ latestReview: { cycleYear: 2026, finalScore: 59.99, isFinalApproved: true } }),
      completeRules({ satisfactoryMinScore: 60 }),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('withheld');
    expect(r.reason).toMatch(/scored 59.99/);
  });

  it('cannot tell when there is no review at all', () => {
    const r = assessIncrement(person({ latestReview: null }), completeRules(), {
      asOf: ASOF,
    });
    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toMatch(/no performance review on record/);
  });

  it('cannot tell while a review is unapproved', () => {
    const r = assessIncrement(
      person({ latestReview: { cycleYear: 2026, finalScore: 90, isFinalApproved: false } }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toMatch(/not been finally approved/);
  });

  it('cannot tell when an approved review carries no score', () => {
    const r = assessIncrement(
      person({ latestReview: { cycleYear: 2026, finalScore: null, isFinalApproved: true } }),
      completeRules(),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toMatch(/approved without a score/);
  });

  it('cannot tell when the rules never say what counts as satisfactory', () => {
    const r = assessIncrement(
      person(),
      completeRules({ satisfactoryMinScore: null }),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toMatch(/never say what score counts as satisfactory/);
  });

  it('skips performance when no rule depends on it', () => {
    const r = assessIncrement(
      person({ latestReview: null }),
      completeRules({
        satisfactoryPerformanceRequired: false,
        withholdingTriggers: ['poor_conduct'],
      }),
      { asOf: ASOF },
    );
    expect(checkFor(r, 'performance').status).toBe('not_required');
    expect(r.verdict).toBe('due');
  });

  it('still checks performance when only the withholding trigger asks for it', () => {
    const r = assessIncrement(
      person({ latestReview: null }),
      completeRules({
        satisfactoryPerformanceRequired: false,
        withholdingTriggers: ['unsatisfactory_work'],
      }),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('cannot_tell');
  });
});

describe('assessIncrement — conditions MyJKKN records nowhere', () => {
  it('cannot tell when the head of department must recommend it', () => {
    const r = assessIncrement(
      person(),
      completeRules({ headOfDeptRecommendationRequired: true }),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toMatch(/records no such recommendation/);
    expect(checkFor(r, 'hod_recommendation').status).toBe('unknown');
  });

  it('cannot tell when the rules name a withholding reason it cannot check', () => {
    const r = assessIncrement(
      person(),
      completeRules({ withholdingTriggers: ['poor_conduct', 'pending_court_case'] }),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('cannot_tell');
    expect(checkFor(r, 'unrecognised_trigger').detail).toMatch(/pending_court_case/);
  });

  it('is cannot_tell, never due, under the policy actually seeded today', () => {
    // The seeded rows require the HOD's recommendation and set no satisfactory
    // score. A person who has waited a year and has a clean record still cannot
    // be declared due, and that is the point.
    const rules = parseIncrementRules(SEEDED_POLICY)!.rules;
    const r = assessIncrement(person(), rules, { asOf: ASOF });
    expect(r.verdict).toBe('cannot_tell');
    expect(r.proposedMonthlyIncrease).toBeNull();
  });
});

describe('assessIncrement — a definite fail beats an unknown', () => {
  it('reports the window before anything else', () => {
    const r = assessIncrement(
      person({
        payEffectiveFrom: '2026-06-01',
        latestReview: null,
        openUndecidedDisciplinaryCases: 2,
      }),
      completeRules({ headOfDeptRecommendationRequired: true }),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('not_due');
  });

  it('reports a withholding decision ahead of an unknown recommendation', () => {
    const r = assessIncrement(
      person({
        decidedDisciplinaryCases: [{ outcome: 'termination', outcomeDate: '2026-02-01' }],
      }),
      completeRules({ headOfDeptRecommendationRequired: true }),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('withheld');
  });
});

describe('assessIncrement — due but unpriced', () => {
  it('says due and leaves the amount null when the rules give no figure', () => {
    const r = assessIncrement(
      person(),
      completeRules({ annualAmount: null, annualPercentOfGross: null }),
      { asOf: ASOF },
    );
    expect(r.verdict).toBe('due');
    expect(r.proposedMonthlyIncrease).toBeNull();
    expect(r.amountRule).toBe('not_configured');
    expect(r.reason).toMatch(/do not say how much/i);
  });

  it('carries the approver from the rules', () => {
    const r = assessIncrement(person(), completeRules(), { asOf: ASOF });
    expect(r.approver).toBe('Principal');
  });

  it('never proposes a figure for anyone who is not due', () => {
    const notDue = assessIncrement(
      person({ payEffectiveFrom: '2026-06-01' }),
      completeRules(),
      { asOf: ASOF },
    );
    const withheld = assessIncrement(
      person({
        decidedDisciplinaryCases: [{ outcome: 'warning', outcomeDate: '2026-02-01' }],
      }),
      completeRules(),
      { asOf: ASOF },
    );
    const unknown = assessIncrement(person({ latestReview: null }), completeRules(), {
      asOf: ASOF,
    });
    for (const r of [notDue, withheld, unknown]) {
      expect(r.proposedMonthlyIncrease).toBeNull();
      expect(r.proposedNewMonthlyGross).toBeNull();
      expect(r.amountRule).toBe('not_applicable');
    }
  });
});

// ===========================================================================
// College rollup — the seven colleges with no rules row
// ===========================================================================

describe('buildCollegeReport', () => {
  it('marks a college with no policy row as having no rules', () => {
    const report = buildCollegeReport({
      institutionId: 'college-with-nothing',
      institutionName: 'JKKN Nursing',
      policyValue: null,
      people: [person({ staffId: 'a' }), person({ staffId: 'b' })],
      asOf: ASOF,
    });
    expect(report.hasRules).toBe(false);
    expect(report.staffCount).toBe(2);
    expect(report.counts.no_rules).toBe(2);
    expect(report.counts.due).toBe(0);
    expect(report.totalMonthlyIncrease).toBeNull();
    expect(report.proposals.every((p) => p.verdict === 'no_rules')).toBe(true);
  });

  it('is not an empty list — a rule-less college still lists its people', () => {
    const report = buildCollegeReport({
      institutionId: 'x',
      institutionName: 'JKKN Pharmacy',
      policyValue: null,
      people: [person()],
      asOf: ASOF,
    });
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0].reason).toMatch(/No increment rules are recorded/);
  });

  it('distinguishes a broken policy row from a missing one', () => {
    const report = buildCollegeReport({
      institutionId: 'x',
      institutionName: 'JKKN Allied Health',
      policyValue: 'this is not an object',
      people: [person()],
      asOf: ASOF,
    });
    expect(report.hasRules).toBe(false);
    expect(report.rulesProblems.join(' ')).toMatch(/not in a shape MyJKKN can read/);
  });

  it('totals only the proposals that carry a figure', () => {
    const policy = {
      increments: {
        annual_window_months: 12,
        approver_default: 'Principal',
        satisfactory_performance_required: true,
        satisfactory_min_score: 60,
        annual_amount: 1000,
        withholding_triggers: ['poor_conduct'],
      },
    };
    const report = buildCollegeReport({
      institutionId: INSTITUTION,
      institutionName: 'JKKN Engineering',
      policyValue: policy,
      people: [
        person({ staffId: 'due-1' }),
        person({ staffId: 'due-2' }),
        person({ staffId: 'early', payEffectiveFrom: '2026-06-01' }),
        person({ staffId: 'unknown', latestReview: null }),
      ],
      asOf: ASOF,
    });
    expect(report.counts.due).toBe(2);
    expect(report.counts.not_due).toBe(1);
    expect(report.counts.cannot_tell).toBe(1);
    expect(report.totalMonthlyIncrease).toBe(2000);
  });

  it('reports the seeded Engineering policy as unpriceable and unjudgeable', () => {
    const report = buildCollegeReport({
      institutionId: INSTITUTION,
      institutionName: 'JKKN Engineering',
      policyValue: SEEDED_POLICY,
      people: [person(), person({ staffId: 'b' })],
      asOf: ASOF,
    });
    expect(report.hasRules).toBe(true);
    expect(report.counts.cannot_tell).toBe(2);
    expect(report.counts.due).toBe(0);
    expect(report.totalMonthlyIncrease).toBeNull();
  });

  it('handles a college with rules and nobody in it', () => {
    const report = buildCollegeReport({
      institutionId: INSTITUTION,
      institutionName: 'JKKN Engineering',
      policyValue: SEEDED_POLICY,
      people: [],
      asOf: ASOF,
    });
    expect(report.staffCount).toBe(0);
    expect(report.proposals).toHaveLength(0);
    expect(report.totalMonthlyIncrease).toBeNull();
  });
});

// ===========================================================================
// The ceiling
// ===========================================================================

describe('the engine cannot change pay', () => {
  it('exports no writer of any kind', async () => {
    const mod = await import('@/lib/hr/increment-engine');
    const writerish = Object.keys(mod).filter((k) =>
      /^(apply|save|commit|write|update|insert|persist|grant|award)/i.test(k),
    );
    expect(writerish).toEqual([]);
  });

  it('leaves the person facts it was given untouched', () => {
    const p = person();
    const snapshot = JSON.stringify(p);
    assessIncrement(p, completeRules(), { asOf: ASOF });
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});
