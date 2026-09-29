/**
 * The salary suggestion engine (lib/hr/salary-suggestion.ts).
 *
 * Every verdict, and the rulings it follows: the rule starts blank and a blank
 * rule suggests nothing; 0 recorded experience is "not recorded", never a
 * fresher; a doctorate is eligible-only and never in the figure; the cap; never
 * a pay cut; rounding; absent keys.
 *
 * Job titles here are neutral fixture strings.
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  hasDoctorate,
  isSalarySuggestionRuleEmpty,
  parseSalarySuggestionRule,
  suggestSalary,
  wholeYearsBetween,
  type SalarySuggestion,
  type SalarySuggestionRule,
  type SuggestionPerson,
} from '@/lib/hr/salary-suggestion';
import type { PayBandPolicy } from '@/lib/hr/pay-band-check';

const TODAY = '2026-09-29';

const BAND: PayBandPolicy = {
  rungs: [
    { designation: 'Office Assistant', qualification: 'Diploma', basicPay: 20000 },
    { designation: 'Office Assistant', qualification: 'Degree', basicPay: 30000 },
    { designation: 'Typist', qualification: null, basicPay: 6500 },
  ],
  guaranteedMinimum: null,
};

function person(over: Partial<SuggestionPerson> = {}): SuggestionPerson {
  return {
    designation: 'Office Assistant',
    dateOfJoining: '2020-06-15', // 6 whole years on TODAY
    experienceYears: 0,
    hasExtendedProfile: false,
    qualifications: [],
    researchPapers: 0,
    currentMonthlyPay: 21000,
    ...over,
  };
}

function run(p: Partial<SuggestionPerson>, rule: SalarySuggestionRule | null, band: PayBandPolicy | null = BAND) {
  return suggestSalary({ person: person(p), band, rule, today: TODAY });
}

function line(s: SalarySuggestion, label: string) {
  const found = s.lines.find((l) => l.label === label);
  if (!found) throw new Error(`no line "${label}" in ${s.lines.map((l) => l.label).join(', ')}`);
  return found;
}

function sumOfLines(s: SalarySuggestion): number {
  return s.lines.reduce((sum, l) => sum + (l.amount ?? 0), 0);
}

describe('rule not set — no figure, ever', () => {
  it('with no rule at all: shows the band and current pay, suggests nothing', () => {
    const s = run({}, null);
    expect(s.verdict).toBe('rule_not_set');
    expect(s.suggested).toBeNull();
    expect(s.computed).toBeNull();
    expect(s.lines).toEqual([]);
    expect(s.bandMin).toBe(20000);
    expect(s.bandMax).toBe(30000);
    expect(s.currentMonthlyPay).toBe(21000);
    expect(s.reasons[0].code).toBe('rule_not_set');
  });

  it('with a rule that holds only rounding and cap settings: still not set', () => {
    expect(run({}, { round_to: 500, cap_at_band_max: false, prior_counts: true }).verdict).toBe('rule_not_set');
  });

  it('with blank strings saved in the JSON: still not set (blank is absent, not 0)', () => {
    const rule = parseSalarySuggestionRule({ per_year_at_jkkn: '', per_year_prior: '  ', extras: [] });
    expect(rule).toEqual({});
    expect(isSalarySuggestionRuleEmpty(rule)).toBe(true);
    expect(run({}, rule).verdict).toBe('rule_not_set');
  });

  it('says so about a missing band too, without inventing one', () => {
    const s = run({}, null, null);
    expect(s.verdict).toBe('rule_not_set');
    expect(s.bandMin).toBeNull();
    expect(s.reasons.map((r) => r.code)).toEqual(['rule_not_set', 'college_has_no_band']);
  });
});

describe('no band', () => {
  const rule = { per_year_at_jkkn: 500 };

  it('when the college has no band', () => {
    const s = run({}, rule, null);
    expect(s.verdict).toBe('no_band');
    expect(s.suggested).toBeNull();
    expect(s.reasons[0].code).toBe('college_has_no_band');
  });

  it('when no job title is recorded', () => {
    const s = run({ designation: '  ' }, rule);
    expect(s.verdict).toBe('no_band');
    expect(s.reasons[0].code).toBe('no_job_title');
  });

  it('when the band does not cover the job title', () => {
    const s = run({ designation: 'Gardener' }, rule);
    expect(s.verdict).toBe('no_band');
    expect(s.reasons[0].code).toBe('job_title_not_on_band');
  });
});

describe('a suggestion', () => {
  it('starts at the band floor and adds whole years at JKKN', () => {
    const s = run({}, { per_year_at_jkkn: 500 });
    expect(s.verdict).toBe('suggested');
    expect(line(s, 'Band floor for Office Assistant').amount).toBe(20000);
    expect(line(s, 'Years at JKKN').amount).toBe(3000);
    expect(line(s, 'Years at JKKN').note).toContain('6 whole years');
    expect(s.suggested).toBe(23000);
    expect(s.reasons[0].code).toBe('suggested_raise');
    expect(s.reasons[0].text).toContain('₹2,000 more');
    expect(sumOfLines(s)).toBe(s.suggested);
  });

  it('counts a year only once its anniversary is reached', () => {
    expect(wholeYearsBetween('2020-09-30', TODAY)).toBe(5);
    expect(wholeYearsBetween('2020-09-29', TODAY)).toBe(6);
    expect(wholeYearsBetween('2026-10-01', TODAY)).toBeNull();
  });

  it('works out a first salary when none is recorded', () => {
    const s = run({ currentMonthlyPay: null }, { per_year_at_jkkn: 500 });
    expect(s.verdict).toBe('suggested');
    expect(s.suggested).toBe(23000);
    expect(s.reasons[0].code).toBe('suggested_first_salary');
  });

  it('a job title on a single rung starts at that rung', () => {
    const s = run({ designation: 'typist', currentMonthlyPay: 5000 }, { per_year_at_jkkn: 50 }, BAND);
    expect(s.bandMin).toBe(6500);
    expect(s.bandMax).toBe(6500);
    // 6500 + 300 rounds to 6800, above the one-rung band -> capped at 6500.
    expect(s.suggested).toBe(6500);
  });
});

describe('prior experience — only when actually recorded', () => {
  const rule = { per_year_at_jkkn: 500, prior_counts: true, per_year_prior: 200 };

  it('is NOT counted when the extended profile is off, whatever the number says', () => {
    const s = run({ hasExtendedProfile: false, experienceYears: 12 }, rule);
    expect(line(s, 'Prior experience')).toEqual({
      label: 'Prior experience',
      amount: null,
      note: 'Not recorded, not counted.',
    });
  });

  it('treats 0 as "not recorded", never as a fresher', () => {
    const s = run({ hasExtendedProfile: true, experienceYears: 0 }, rule);
    const l = line(s, 'Prior experience');
    expect(l.amount).toBeNull();
    expect(l.note).toBe('Not recorded, not counted.');
    expect(JSON.stringify(s)).not.toMatch(/fresher|no experience/i);
  });

  it('counts total years less the years at JKKN when recorded and the rule counts it', () => {
    const s = run({ hasExtendedProfile: true, experienceYears: 10 }, rule);
    expect(line(s, 'Prior experience').amount).toBe(800); // (10 - 6) x 200
    expect(s.suggested).toBe(23800);
  });

  it('counts nothing earlier when the recorded total is not above the years at JKKN', () => {
    const s = run({ hasExtendedProfile: true, experienceYears: 6 }, rule);
    expect(line(s, 'Prior experience').amount).toBeNull();
    expect(line(s, 'Prior experience').note).toContain('not more than the 6 years at JKKN');
  });

  it('is recorded but not counted when the rule does not count it', () => {
    const s = run({ hasExtendedProfile: true, experienceYears: 10 }, { per_year_at_jkkn: 500, per_year_prior: 200 });
    expect(line(s, 'Prior experience').amount).toBeNull();
    expect(line(s, 'Prior experience').note).toContain('does not count experience before JKKN');
  });

  it('is not counted when the rule counts it but sets no amount (absent key)', () => {
    const s = run({ hasExtendedProfile: true, experienceYears: 10 }, { per_year_at_jkkn: 500, prior_counts: true });
    expect(line(s, 'Prior experience').amount).toBeNull();
    expect(line(s, 'Prior experience').note).toContain('sets no amount');
  });
});

describe('extras', () => {
  const doctorate = { label: 'Doctorate', source: 'doctorate', amount: 5000 };

  it('a doctorate is listed as eligible and NOT added to the figure', () => {
    const s = run(
      { qualifications: [{ degree: 'Ph.D', institution: 'X', year: '2015' }] },
      { per_year_at_jkkn: 500, extras: [doctorate] }
    );
    expect(s.extrasEligible).toEqual([{ label: 'Doctorate', amount: 5000, needsDirectorApproval: true }]);
    expect(line(s, 'Doctorate').amount).toBeNull();
    expect(line(s, 'Doctorate').note).toContain("needs the Director's approval");
    expect(s.suggested).toBe(23000);
    expect(s.reasons.map((r) => r.code)).toContain('extras_need_approval');
  });

  it('a doctorate needs approval even when the rule says it does not', () => {
    const s = run(
      { qualifications: [{ degree: 'PhD' }] },
      { per_year_at_jkkn: 500, extras: [{ ...doctorate, needs_approval: false }] }
    );
    expect(s.suggested).toBe(23000);
    expect(s.extrasEligible).toHaveLength(1);
  });

  it('reads a doctorate only when one is awarded', () => {
    expect(hasDoctorate([{ degree: 'Ph.D.' }])).toBe(true);
    expect(hasDoctorate([{ degree: 'Doctor of Philosophy' }])).toBe(true);
    expect(hasDoctorate(['D.Sc'])).toBe(true);
    expect(hasDoctorate([{ degree: 'Pharm.D' }])).toBe(false);
    expect(hasDoctorate([{ degree: 'M.Phil' }])).toBe(false);
    expect(hasDoctorate([{ degree: 'Ph.D', specialization: 'pursuing' }])).toBe(false);
    expect(hasDoctorate([])).toBe(false);
    expect(hasDoctorate(null)).toBe(false);
  });

  it('a person without a doctorate is not eligible', () => {
    const s = run({ qualifications: [{ degree: 'M.A' }] }, { per_year_at_jkkn: 500, extras: [doctorate] });
    expect(s.extrasEligible).toEqual([]);
    expect(line(s, 'Doctorate').note).toContain('No doctorate recorded');
  });

  it('research papers without approval ARE added once the least number is reached', () => {
    const rule = {
      per_year_at_jkkn: 500,
      extras: [{ label: 'Research', source: 'research_papers', amount: 1000, min_count: 3 }],
    };
    expect(run({ researchPapers: 3 }, rule).suggested).toBe(24000);
    expect(line(run({ researchPapers: 2 }, rule), 'Research').amount).toBeNull();
    expect(line(run({ researchPapers: 0 }, rule), 'Research').note).toBe(
      'No research papers recorded. Not counted.'
    );
  });

  it('research papers marked as needing approval are eligible, not added', () => {
    const s = run(
      { researchPapers: 5 },
      {
        per_year_at_jkkn: 500,
        extras: [{ label: 'Research', source: 'research_papers', amount: 1000, needs_approval: true }],
      }
    );
    expect(s.suggested).toBe(23000);
    expect(s.extrasEligible).toEqual([{ label: 'Research', amount: 1000, needsDirectorApproval: true }]);
  });

  it('an item it cannot read, or with no amount, is shown and not counted', () => {
    const s = run(
      {},
      {
        per_year_at_jkkn: 500,
        extras: [
          { label: 'Mystery', source: 'shoe_size', amount: 9999 },
          { label: 'Unpriced', source: 'doctorate', amount: null },
        ],
      }
    );
    expect(line(s, 'Mystery').amount).toBeNull();
    expect(line(s, 'Mystery').note).toContain('does not say what to check');
    expect(line(s, 'Unpriced').note).toContain('sets no amount');
    expect(s.suggested).toBe(23000);
  });
});

describe('cap and rounding', () => {
  it('caps at the band maximum by default and says so', () => {
    const s = run({}, { per_year_at_jkkn: 5000 }); // 20000 + 30000
    expect(s.suggested).toBe(30000);
    expect(line(s, 'Capped at the band maximum').amount).toBe(-20000);
    expect(sumOfLines(s)).toBe(30000);
  });

  it('does not cap when the rule says not to', () => {
    expect(run({}, { per_year_at_jkkn: 5000, cap_at_band_max: false }).suggested).toBe(50000);
  });

  it('rounds to the nearest 100 by default', () => {
    const s = run({}, { per_year_at_jkkn: 333 }); // 20000 + 1998
    expect(s.suggested).toBe(22000);
    expect(line(s, 'Rounded to the nearest ₹100').amount).toBe(2);
    expect(sumOfLines(s)).toBe(22000);
  });

  it('rounds to the rule\'s step, down as well as up', () => {
    const s = run({ currentMonthlyPay: 20500 }, { per_year_at_jkkn: 233, round_to: 1000 }); // 20000 + 1398
    expect(s.suggested).toBe(21000);
    expect(line(s, 'Rounded to the nearest ₹1,000').amount).toBe(-398);
  });
});

describe('never a pay cut', () => {
  it('says plainly when current pay is already above the figure, and suggests nothing', () => {
    const s = run({ currentMonthlyPay: 26000 }, { per_year_at_jkkn: 500 });
    expect(s.verdict).toBe('cannot_suggest');
    expect(s.suggested).toBeNull();
    expect(s.computed).toBe(23000);
    expect(s.reasons[0].code).toBe('current_pay_already_above');
    expect(s.reasons[0].text).toContain('Current pay is already above this');
    expect(s.reasons[0].text).toContain('never a pay cut');
  });

  it('suggests nothing when the figure equals current pay', () => {
    const s = run({ currentMonthlyPay: 23000 }, { per_year_at_jkkn: 500 });
    expect(s.verdict).toBe('cannot_suggest');
    expect(s.reasons[0].code).toBe('current_pay_already_equal');
  });
});

describe('cannot suggest', () => {
  it('without a date of joining when the rule pays per year at JKKN', () => {
    const s = run({ dateOfJoining: null }, { per_year_at_jkkn: 500 });
    expect(s.verdict).toBe('cannot_suggest');
    expect(s.suggested).toBeNull();
    expect(s.reasons[0].code).toBe('no_joining_date');
  });

  it('with a date of joining after today', () => {
    const s = run({ dateOfJoining: '2027-01-01' }, { per_year_at_jkkn: 500 });
    expect(s.verdict).toBe('cannot_suggest');
    expect(s.reasons[0].code).toBe('joining_date_in_future');
  });

  it('a missing date does not block a rule that does not pay per year at JKKN', () => {
    const s = run(
      { dateOfJoining: null, researchPapers: 4 },
      { extras: [{ label: 'Research', source: 'research_papers', amount: 1500 }] }
    );
    expect(s.verdict).toBe('suggested');
    expect(line(s, 'Years at JKKN').note).toContain('sets no amount');
    expect(s.suggested).toBe(21500);
  });
});

describe('reading the stored rule', () => {
  it('reads plain numbers only — a numeric string, a negative and a zero step are all dropped', () => {
    expect(
      parseSalarySuggestionRule({ per_year_at_jkkn: 500, per_year_prior: -1, round_to: 0, prior_counts: 'yes' })
    ).toEqual({ per_year_at_jkkn: 500 });
    expect(parseSalarySuggestionRule({ per_year_at_jkkn: '500' })).toEqual({});
  });

  it('does not unwrap { value: {...} }: a wrapped rule is "not set", as the database reads it', () => {
    const rule = parseSalarySuggestionRule({ value: { per_year_at_jkkn: 500 } });
    expect(rule).toEqual({});
    expect(isSalarySuggestionRuleEmpty(rule)).toBe(true);
  });

  it('keeps a deliberate 0 as a set amount', () => {
    const rule = parseSalarySuggestionRule({ per_year_at_jkkn: 0 });
    expect(rule).toEqual({ per_year_at_jkkn: 0 });
    expect(isSalarySuggestionRuleEmpty(rule)).toBe(false);
  });

  it('returns null for something that is not a rule', () => {
    expect(parseSalarySuggestionRule(null)).toBeNull();
    expect(parseSalarySuggestionRule([1, 2])).toBeNull();
  });

  it('refuses a malformed today rather than guessing the date', () => {
    expect(() => suggestSalary({ person: person(), band: BAND, rule: { per_year_at_jkkn: 1 }, today: 'soon' })).toThrow();
  });
});
