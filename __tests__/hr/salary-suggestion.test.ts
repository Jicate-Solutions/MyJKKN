/**
 * The salary suggestion engine (lib/hr/salary-suggestion.ts).
 *
 * The Director's rulings (29 Sep 2026, evening): the amount per year at JKKN is
 * set PER DEPARTMENT and an empty department gets no suggestion; years before
 * JKKN count at HALF the department's amount, only when recorded (0 recorded is
 * "not recorded", never a fresher); a doctorate adds NOTHING; no cap — a figure
 * above the band top carries a warning. Also: never a pay cut; rounding in
 * paise; absent keys are "not set".
 *
 * Job titles and departments here are neutral fixture strings.
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  departmentRate,
  formatRupees,
  isSalarySuggestionRuleEmpty,
  parseSalarySuggestionRule,
  suggestSalary,
  wholeYearsBetween,
  type SalarySuggestion,
  type SuggestionDepartment,
  type SuggestionPerson,
} from '@/lib/hr/salary-suggestion';
import type { PayBandPolicy } from '@/lib/hr/pay-band-check';

const TODAY = '2026-09-29';
const DEPT_X = 'abcdef12-1111-4111-8111-111111111111';
const DEPT_Y = '22222222-2222-4222-8222-222222222222';

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
    currentMonthlyPay: 21000,
    ...over,
  };
}

function dept(perYearAtJkkn: number | null, over: Partial<SuggestionDepartment> = {}): SuggestionDepartment {
  return { id: DEPT_X, name: 'Dept X', perYearAtJkkn, ...over };
}

function run(
  p: Partial<SuggestionPerson>,
  d: SuggestionDepartment,
  band: PayBandPolicy | null = BAND,
  roundTo: number | null = null
) {
  return suggestSalary({ person: person(p), band, department: d, roundTo, today: TODAY });
}

function line(s: SalarySuggestion, label: string) {
  const found = s.lines.find((l) => l.label === label);
  if (!found) throw new Error(`no line "${label}" in ${s.lines.map((l) => l.label).join(', ')}`);
  return found;
}

function sumOfLines(s: SalarySuggestion): number {
  return Math.round(s.lines.reduce((sum, l) => sum + (l.amount ?? 0), 0) * 100) / 100;
}

describe('the rule is read per department', () => {
  const RULE = parseSalarySuggestionRule({
    per_year_by_department: { [DEPT_X]: 500, [DEPT_Y]: 0 },
    round_to: 500,
  });

  it('looks up each department on its own', () => {
    expect(departmentRate(RULE, DEPT_X)).toBe(500);
    expect(departmentRate(RULE, DEPT_Y)).toBe(0); // a deliberate 0 is an amount
  });

  it('an EMPTY department has no amount (null, never 0)', () => {
    expect(departmentRate(RULE, '33333333-3333-4333-8333-333333333333')).toBeNull();
    expect(departmentRate(RULE, null)).toBeNull();
    expect(departmentRate(null, DEPT_X)).toBeNull();
  });

  it('finds a lower-case key whatever case the id is asked in, as Postgres does', () => {
    expect(departmentRate(RULE, DEPT_X.toUpperCase())).toBe(500);
  });

  it('drops keys that are not lower-case department ids, and amounts that are not numbers', () => {
    const r = parseSalarySuggestionRule({
      per_year_by_department: { 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA': 500, 'not-an-id': 500, [DEPT_Y]: '500' },
    });
    expect(isSalarySuggestionRuleEmpty(r)).toBe(true);
  });

  it('the old single amount for everybody is not read at all', () => {
    expect(isSalarySuggestionRuleEmpty(parseSalarySuggestionRule({ per_year_at_jkkn: 500 }))).toBe(true);
  });
});

describe('an empty department, or no department: no figure', () => {
  it('the Director left the department empty: "not set", plain, band still shown', () => {
    const s = run({}, dept(null));
    expect(s.verdict).toBe('rule_not_set');
    expect(s.suggested).toBeNull();
    expect(s.computed).toBeNull();
    expect(s.lines).toEqual([]);
    expect(s.bandMin).toBe(20000);
    expect(s.currentMonthlyPay).toBe(21000);
    expect(s.reasons[0].code).toBe('department_amount_not_set');
    expect(s.reasons[0].text).toContain('the Dept X department');
    expect(s.departmentName).toBe('Dept X');
  });

  it('no department recorded on the person: cannot suggest, and says why', () => {
    const s = run({}, { id: null, name: null, perYearAtJkkn: null });
    expect(s.verdict).toBe('cannot_suggest');
    expect(s.reasons[0].code).toBe('no_department');
    expect(s.suggested).toBeNull();
  });
});

describe('years at JKKN at the department amount', () => {
  it('band floor + whole years × the department amount, rounded to ₹100', () => {
    const s = run({ currentMonthlyPay: 20000 }, dept(500));
    expect(line(s, 'Years at JKKN').amount).toBe(3000); // 6 × 500
    expect(line(s, 'Years at JKKN').note).toContain('the Dept X department');
    expect(s.verdict).toBe('suggested');
    expect(s.suggested).toBe(23000);
    expect(sumOfLines(s)).toBe(23000);
  });

  it('two departments with different amounts give two different figures for the same person', () => {
    const x = run({ currentMonthlyPay: 20000 }, dept(500));
    const y = run({ currentMonthlyPay: 20000 }, dept(800, { id: DEPT_Y, name: 'Dept Y' }));
    expect(x.suggested).toBe(23000);
    expect(y.suggested).toBe(24800);
  });

  it('a deliberate 0 counts years as nothing, and is not "not set"', () => {
    const s = run({ currentMonthlyPay: 19000 }, dept(0));
    expect(s.verdict).toBe('suggested');
    expect(line(s, 'Years at JKKN').amount).toBe(0);
    expect(s.suggested).toBe(20000);
  });

  it('no joining date, or one in the future: cannot suggest', () => {
    expect(run({ dateOfJoining: null }, dept(500)).reasons[0].code).toBe('no_joining_date');
    expect(run({ dateOfJoining: '2027-01-01' }, dept(500)).reasons[0].code).toBe('joining_date_in_future');
  });
});

describe('years before JKKN at HALF the department amount, only when recorded', () => {
  it('counts (total − years at JKKN) × half the amount', () => {
    // 12 total, 6 at JKKN → 6 before; half of 500 = 250 → 1,500.
    const s = run({ experienceYears: 12, hasExtendedProfile: true, currentMonthlyPay: 20000 }, dept(500));
    const prior = line(s, 'Years before JKKN');
    expect(prior.amount).toBe(1500);
    expect(prior.note).toContain('half');
    expect(prior.note).toContain('₹250 a year');
    expect(s.suggested).toBe(24500); // 20,000 + 3,000 + 1,500
    expect(sumOfLines(s)).toBe(24500);
  });

  it('an odd amount halves to paise, and the lines still add up after rounding', () => {
    // half of 333 = 166.50; 6 × 166.50 = 999; 6 × 333 = 1,998; raw 22,997 → 23,000.
    const s = run({ experienceYears: 12, hasExtendedProfile: true, currentMonthlyPay: 20000 }, dept(333));
    expect(line(s, 'Years before JKKN').amount).toBe(999);
    expect(line(s, 'Years before JKKN').note).toContain('₹166.50 a year');
    expect(s.suggested).toBe(23000);
    expect(sumOfLines(s)).toBe(23000);
  });

  it('0 recorded is "not recorded", never a fresher', () => {
    const s = run({ experienceYears: 0, hasExtendedProfile: true }, dept(500));
    expect(line(s, 'Years before JKKN')).toMatchObject({ amount: null, note: 'Not recorded, not counted.' });
  });

  it('a figure with the extended profile switched off is "not recorded"', () => {
    const s = run({ experienceYears: 12, hasExtendedProfile: false }, dept(500));
    expect(line(s, 'Years before JKKN').amount).toBeNull();
  });

  it('a total not more than the years at JKKN adds nothing', () => {
    const s = run({ experienceYears: 5, hasExtendedProfile: true }, dept(500));
    expect(line(s, 'Years before JKKN').amount).toBeNull();
  });
});

describe('a doctorate adds NOTHING', () => {
  it('there is no doctorate line and no extra of any kind in the result', () => {
    const s = run({ currentMonthlyPay: 20000 }, dept(500));
    expect(s.lines.map((l) => l.label)).toEqual(['Band floor for Office Assistant', 'Years at JKKN', 'Years before JKKN']);
    expect(JSON.stringify(s)).not.toMatch(/doctor|ph\.?d|extras/i);
  });

  it('extras in a stored rule are ignored entirely', () => {
    const r = parseSalarySuggestionRule({
      per_year_by_department: { [DEPT_X]: 500 },
      extras: [{ label: 'Doctorate', source: 'doctorate', amount: 3000 }],
    });
    expect(r).toEqual({ per_year_by_department: { [DEPT_X]: 500 } });
  });
});

describe('no cap: above the band top is kept, with a warning', () => {
  it('a figure over the top stays, and says by how much', () => {
    // 6 × 2,000 = 12,000 on a 20,000 floor = 32,000, top 30,000.
    const s = run({ currentMonthlyPay: 21000 }, dept(2000));
    expect(s.verdict).toBe('suggested');
    expect(s.suggested).toBe(32000);
    expect(s.aboveBandBy).toBe(2000);
    const warn = s.reasons.find((r) => r.code === 'above_band_top');
    expect(warn?.text).toContain('Above the band top by ₹2,000');
    expect(s.lines.some((l) => /cap/i.test(l.label))).toBe(false);
    expect(sumOfLines(s)).toBe(32000);
  });

  it('at or under the top: no warning', () => {
    const s = run({ currentMonthlyPay: 20000 }, dept(500));
    expect(s.aboveBandBy).toBeNull();
    expect(s.reasons.some((r) => r.code === 'above_band_top')).toBe(false);
  });

  it('the warning stays even when current pay is already higher (no suggestion)', () => {
    const s = run({ currentMonthlyPay: 40000 }, dept(2000));
    expect(s.verdict).toBe('cannot_suggest');
    expect(s.aboveBandBy).toBe(2000);
  });
});

describe('the band floor when no qualification is recorded', () => {
  it('uses the lowest rung for the job title and says so', () => {
    const s = run({ currentMonthlyPay: 20000 }, dept(500));
    const floor = line(s, 'Band floor for Office Assistant');
    expect(floor.amount).toBe(20000);
    expect(floor.note).toContain('No qualification is recorded');
  });

  it('a single-rung title has no such note', () => {
    const s = run({ designation: 'Typist', currentMonthlyPay: 5000 }, dept(100));
    expect(line(s, 'Band floor for Typist').note).not.toContain('qualification');
  });

  it('a college with no band: no figure', () => {
    expect(run({}, dept(500), null).verdict).toBe('no_band');
  });
});

describe('rounding and never a pay cut', () => {
  it('rounds to the rule step, with a line, in whole paise', () => {
    const s = run({ currentMonthlyPay: 20000 }, dept(510), BAND, 500);
    // 20,000 + 3,060 = 23,060 → 23,000 (nearest 500).
    const r = line(s, 'Rounded to the nearest ₹500');
    expect(r.amount).toBe(-60);
    expect(s.suggested).toBe(23000);
  });

  it('a sum that is already a whole step adds no rounding line (no float noise)', () => {
    // 0.1-style amounts: 6 × 16.7 = 100.2 → with rate 16.7 the raw is 20,100.2 → 20,100.
    const s = run({ currentMonthlyPay: 20000 }, dept(16.7));
    expect(s.suggested).toBe(20100);
    expect(line(s, 'Rounded to the nearest ₹100').amount).toBe(-0.2);
    const exact = run({ currentMonthlyPay: 20000 }, dept(50));
    expect(exact.lines.some((l) => l.label.startsWith('Rounded'))).toBe(false);
  });

  it('current pay at or above the figure: no suggestion, never a cut', () => {
    expect(run({ currentMonthlyPay: 23000 }, dept(500)).reasons[0].code).toBe('current_pay_already_equal');
    expect(run({ currentMonthlyPay: 25000 }, dept(500)).reasons[0].code).toBe('current_pay_already_above');
  });

  it('no salary yet: a first salary is suggested', () => {
    const s = run({ currentMonthlyPay: null }, dept(500));
    expect(s.reasons[0].code).toBe('suggested_first_salary');
    expect(s.suggested).toBe(23000);
  });
});

describe('helpers', () => {
  it('whole years count on the anniversary', () => {
    expect(wholeYearsBetween('2020-09-30', '2026-09-29')).toBe(5);
    expect(wholeYearsBetween('2020-09-29', '2026-09-29')).toBe(6);
  });

  it('rupees show paise only when there are any', () => {
    expect(formatRupees(20000)).toBe('₹20,000');
    expect(formatRupees(166.5)).toBe('₹166.50');
    expect(formatRupees(-60)).toBe('−₹60');
  });
});
