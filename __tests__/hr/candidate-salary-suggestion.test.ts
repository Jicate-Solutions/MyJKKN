/**
 * The suggested starting salary for a recruitment candidate
 * (lib/hr/candidate-salary-suggestion.ts): band floor for the official job
 * title + HALF the Director's department amount × years before JKKN, rounded,
 * warned when above the band top. Every missing input is reported at once,
 * each with who fixes it.
 *
 * Run: npx vitest run __tests__/hr/candidate-salary-suggestion.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  PAY_SCALES_SETTINGS_HREF,
  SALARY_SUGGESTION_SETTINGS_HREF,
  suggestCandidateSalary,
  type CandidateSuggestionInput,
} from '@/lib/hr/candidate-salary-suggestion';
import type { PayBandPolicy } from '@/lib/hr/pay-band-check';

const BAND: PayBandPolicy = {
  rungs: [
    { designation: 'Assistant Professor', qualification: 'M.E.', basicPay: 30000 },
    { designation: 'Assistant Professor', qualification: 'Ph.D', basicPay: 40000 },
    { designation: 'Typist', qualification: null, basicPay: 12000 },
  ],
} as unknown as PayBandPolicy;

function input(over: Partial<CandidateSuggestionInput> = {}): CandidateSuggestionInput {
  return {
    institutionId: 'inst-a',
    designation: 'Assistant Professor',
    department: { id: 'dept-a', name: 'Mechanical', perYear: 1000 },
    priorExperienceYears: 4,
    band: BAND,
    roundTo: null,
    ...over,
  };
}

const codes = (r: ReturnType<typeof suggestCandidateSalary>) => r.reasons.map((x) => x.code);

describe('suggestCandidateSalary: the figure', () => {
  it('is the band floor (lowest rung) plus half the department amount per year before JKKN', () => {
    const r = suggestCandidateSalary(input());
    expect(r.verdict).toBe('suggested');
    // 30,000 floor + 4 × 500 = 32,000.
    expect(r.suggested).toBe(32000);
    expect(r.lines.map((l) => l.label)).toEqual([
      'Band floor for Assistant Professor',
      'Years at JKKN',
      'Years before JKKN',
    ]);
    expect(r.lines[0].amount).toBe(30000);
    expect(r.lines[0].note).toMatch(/lowest rung/);
    // No years at JKKN: the candidate has not joined.
    expect(r.lines[1].amount).toBeNull();
    expect(r.lines[2].amount).toBe(2000);
    expect(r.aboveBandBy).toBeNull();
    expect(codes(r)).toEqual(['suggested_offer']);
  });

  it('the lines always add up to the figure, rounding included', () => {
    const r = suggestCandidateSalary(input({ priorExperienceYears: 2.5, department: { id: 'd', name: 'X', perYear: 333 } }));
    // 30,000 + 2.5 × 166.5 = 30,416.25 → 30,400.
    expect(r.suggested).toBe(30400);
    const sum = r.lines.reduce((s, l) => s + (l.amount ?? 0), 0);
    expect(Math.round(sum * 100) / 100).toBe(30400);
    expect(r.lines.at(-1)!.label).toMatch(/Rounded to the nearest ₹100/);
  });

  it("uses the rule's rounding step", () => {
    const r = suggestCandidateSalary(input({ roundTo: 1000, priorExperienceYears: 3 }));
    // 30,000 + 1,500 = 31,500 → 32,000.
    expect(r.suggested).toBe(32000);
  });

  it('counts nothing for years not recorded, and still suggests the floor', () => {
    const r = suggestCandidateSalary(input({ priorExperienceYears: null }));
    expect(r.verdict).toBe('suggested');
    expect(r.suggested).toBe(30000);
    const prior = r.lines.find((l) => l.label === 'Years before JKKN')!;
    expect(prior.amount).toBeNull();
    expect(prior.note).toMatch(/Not recorded, not counted/);
  });

  it('counts 0 recorded years as 0, not as "not recorded"', () => {
    const r = suggestCandidateSalary(input({ priorExperienceYears: 0 }));
    expect(r.suggested).toBe(30000);
    expect(r.lines.find((l) => l.label === 'Years before JKKN')!.amount).toBe(0);
  });

  it('keeps a figure above the band top, uncapped, with a warning', () => {
    const r = suggestCandidateSalary(input({ priorExperienceYears: 30, department: { id: 'd', name: 'X', perYear: 1000 } }));
    // 30,000 + 30 × 500 = 45,000; top 40,000.
    expect(r.suggested).toBe(45000);
    expect(r.aboveBandBy).toBe(5000);
    expect(codes(r)).toEqual(['suggested_offer', 'above_band_top']);
  });

  it('never carries the band itself in the result', () => {
    const r = suggestCandidateSalary(input());
    expect(r).not.toHaveProperty('bandMin');
    expect(r).not.toHaveProperty('bandMax');
    expect(JSON.stringify(r)).not.toContain('40,000');
  });
});

describe('suggestCandidateSalary: what is missing, and who fixes it', () => {
  it('no official job title picked', () => {
    const r = suggestCandidateSalary(input({ designation: null }));
    expect(r.verdict).toBe('cannot_suggest');
    expect(r.suggested).toBeNull();
    expect(r.lines).toEqual([]);
    expect(codes(r)).toEqual(['no_job_title']);
    expect(r.reasons[0].fix?.text).toMatch(/Details for the suggested salary/);
    expect(r.reasons[0].fix?.href).toBeNull();
  });

  it('no pay band for the college', () => {
    const r = suggestCandidateSalary(input({ band: null }));
    expect(codes(r)).toEqual(['college_has_no_band']);
    expect(r.reasons[0].fix?.href).toBe(PAY_SCALES_SETTINGS_HREF);
  });

  it('the Director has not set an amount for the department', () => {
    const r = suggestCandidateSalary(input({ department: { id: 'dept-a', name: 'Mechanical', perYear: null } }));
    expect(codes(r)).toEqual(['department_amount_not_set']);
    expect(r.reasons[0].text).toMatch(/The Director has not set an amount for the Mechanical department/);
    expect(r.reasons[0].fix?.href).toBe(SALARY_SUGGESTION_SETTINGS_HREF);
  });

  it('no department picked', () => {
    const r = suggestCandidateSalary(input({ department: { id: null, name: null, perYear: null } }));
    expect(codes(r)).toEqual(['no_department']);
  });

  it('the job title is not on the band', () => {
    const r = suggestCandidateSalary(input({ designation: 'Registrar' }));
    expect(codes(r)).toEqual(['job_title_not_on_band']);
    expect(r.reasons[0].text).toContain('"Registrar"');
  });

  it('no college recorded', () => {
    const r = suggestCandidateSalary(input({ institutionId: null, band: null }));
    expect(codes(r)).toEqual(['no_college']);
  });

  it('reports every missing input at once (today: no rule row at all)', () => {
    const r = suggestCandidateSalary(
      input({ designation: null, department: { id: 'dept-a', name: 'Mechanical', perYear: null }, band: null })
    );
    expect(codes(r)).toEqual(['no_job_title', 'department_amount_not_set', 'college_has_no_band']);
  });

  it('a negative or non-number amount counts as not set', () => {
    expect(codes(suggestCandidateSalary(input({ department: { id: 'd', name: null, perYear: -5 } })))).toEqual([
      'department_amount_not_set',
    ]);
    expect(codes(suggestCandidateSalary(input({ department: { id: 'd', name: null, perYear: Number.NaN } })))).toEqual([
      'department_amount_not_set',
    ]);
  });
});
