/**
 * End to end, without a database: the hr.pay_scales value the Pay Scales screen
 * saves after "Load JKKN reference ladders" → parsePayBandPolicy → checkPayBand
 * → suggestSalary. Arts & Science is the case: its pay_matrix has no usable
 * rung, so the band — and the floor the suggestion starts from — must come
 * from the ladders.
 *
 * Year labels: a ladder step's label ('0-1', '2', 'Step 1' …) is dropped when
 * the steps become rungs. That is safe because the band is the span of the
 * title's rungs (lowest to highest amount), which does not depend on order or
 * label; and the suggestion adds years of service on top of the FLOOR itself,
 * so placing someone on their year's step as well would count those years
 * twice. The last test pins the span to the first and last step.
 *
 * Run: npx vitest run __tests__/hr/pay-ladders-to-suggestion.test.ts
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { parsePayBandPolicy } from '@/lib/services/hr/pay-bands/pay-band-policy-service';
import { checkPayBand } from '@/lib/hr/pay-band-check';
import { suggestSalary } from '@/lib/hr/salary-suggestion';
import {
  ARTS_SCIENCE_INSTITUTION_ID,
  referenceLaddersFor,
  referenceNotesFor,
} from '@/lib/hr/pay-scales/jkkn-reference-ladders';

const ladders = referenceLaddersFor(ARTS_SCIENCE_INSTITUTION_ID);
const teaching = ladders.find((l) => l.staff_group === 'teaching')!;
const TITLE = teaching.designation;
const FIRST_STEP = teaching.steps[0].basic_pay;
const LAST_STEP = teaching.steps[teaching.steps.length - 1].basic_pay;

/** What the screen writes: the row's value with ladders added, round-tripped through JSON as jsonb would be. */
const savedValue = JSON.parse(
  JSON.stringify({
    pay_matrix: [],
    overrides: { net_set_basic: null },
    fixation_basis: ['qualification', 'experience'],
    selection_committee_authority: true,
    higher_pay_package_approver: 'Trust Secretary',
    ladders,
    ladder_notes: referenceNotesFor(ARTS_SCIENCE_INSTITUTION_ID),
  })
);

describe('saved ladders → band → salary suggestion (Arts & Science)', () => {
  it('the data this test relies on: one teaching ladder whose first step is its lowest', () => {
    expect(ladders.filter((l) => l.staff_group === 'teaching')).toHaveLength(1);
    expect(FIRST_STEP).toBe(Math.min(...teaching.steps.map((s) => s.basic_pay)));
    expect(LAST_STEP).toBe(Math.max(...teaching.steps.map((s) => s.basic_pay)));
  });

  it('the suggestion starts from the first step of the ladder', () => {
    const band = parsePayBandPolicy(savedValue);
    expect(band).not.toBeNull();

    const suggestion = suggestSalary({
      person: {
        designation: TITLE,
        dateOfJoining: '2023-06-01',
        experienceYears: 3,
        hasExtendedProfile: true,
        currentMonthlyPay: null,
      },
      band,
      department: { id: 'd1', name: 'Tamil', perYearAtJkkn: 500 },
      roundTo: 100,
      today: '2026-10-09',
    });

    expect(suggestion.bandMin).toBe(FIRST_STEP);
    expect(suggestion.bandMax).toBe(LAST_STEP);
    const floorLine = suggestion.lines.find((l) => l.label.startsWith('Band floor'));
    expect(floorLine?.amount).toBe(FIRST_STEP);
    // The floor says where it came from (panel round 1, 9 Oct).
    expect(floorLine?.note).toContain(
      'From the reference year ladders: this college has no pay matrix, and the band is reference only.'
    );
    // Three whole years at JKKN at ₹500 a year, on top of the floor.
    expect(suggestion.computed).toBe(FIRST_STEP + 3 * 500);
  });

  it('the band check spans first step to last step, whatever the year labels say', () => {
    const band = parsePayBandPolicy(savedValue);
    const below = checkPayBand({ designation: TITLE, monthlyPay: FIRST_STEP - 1 }, band);
    expect(below.verdict).toBe('below_band');
    expect(below.band).toEqual({ min: FIRST_STEP, max: LAST_STEP });

    // Reversing the steps (and so their labels) changes nothing.
    const reversed = JSON.parse(JSON.stringify(savedValue));
    for (const l of reversed.ladders) l.steps.reverse();
    const again = checkPayBand(
      { designation: TITLE, monthlyPay: LAST_STEP + 1 },
      parsePayBandPolicy(reversed)
    );
    expect(again.verdict).toBe('above_band');
    expect(again.band).toEqual({ min: FIRST_STEP, max: LAST_STEP });
  });
});
