/**
 * The band reader falls back to a college's year ladders when its pay_matrix
 * has no usable rung — and ONLY then.
 *
 * Why: the Pay Scales screen stores the reference ladders as `ladders` in the
 * same hr.pay_scales row, while the Pay Band Check, the salary suggestion and
 * the salary-revision warning all read the band through parsePayBandPolicy.
 * Arts & Science starts with an empty pay_matrix, so without the fallback its
 * loaded ladders would still read "no band" everywhere.
 *
 * Run: npx vitest run __tests__/hr/pay-band-ladders-fallback.test.ts
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import {
  collegePayBandsFromRows,
  parsePayBandPolicy,
} from '@/lib/services/hr/pay-bands/pay-band-policy-service';
import { checkPayBand } from '@/lib/hr/pay-band-check';
import {
  ARTS_SCIENCE_INSTITUTION_ID,
  ENGINEERING_INSTITUTION_ID,
  referenceLaddersFor,
} from '@/lib/hr/pay-scales/jkkn-reference-ladders';

const ARTS_SCIENCE_ROW_AFTER_LOAD = {
  pay_matrix: [],
  overrides: { net_set_basic: null },
  ladders: referenceLaddersFor(ARTS_SCIENCE_INSTITUTION_ID),
};

describe('a college with an empty pay_matrix and loaded ladders', () => {
  it('gets a band built from every ladder step', () => {
    const policy = parsePayBandPolicy(ARTS_SCIENCE_ROW_AFTER_LOAD);
    const steps = referenceLaddersFor(ARTS_SCIENCE_INSTITUTION_ID).reduce(
      (n, l) => n + l.steps.length,
      0
    );
    expect(policy?.rungs).toHaveLength(steps);
  });

  it('spans the Assistant Professor ladder from its first step to its last', () => {
    const policy = parsePayBandPolicy(ARTS_SCIENCE_ROW_AFTER_LOAD);
    const result = checkPayBand({ designation: 'Assistant Professor', monthlyPay: 16000 }, policy);
    expect(result.verdict).toBe('within_band');
    expect(result.band).toEqual({ min: 15000, max: 21500 });
  });

  it('reads pay above the last step as above the band', () => {
    const policy = parsePayBandPolicy(ARTS_SCIENCE_ROW_AFTER_LOAD);
    const result = checkPayBand({ designation: 'Assistant Professor', monthlyPay: 22000 }, policy);
    expect(result.verdict).toBe('above_band');
    expect(result.excess).toBe(500);
  });

  it('is listed as a college with a band', () => {
    const bands = collegePayBandsFromRows([
      { scope_id: ARTS_SCIENCE_INSTITUTION_ID, value: ARTS_SCIENCE_ROW_AFTER_LOAD, updated_at: null },
    ]);
    expect(bands.map((b) => b.institutionId)).toEqual([ARTS_SCIENCE_INSTITUTION_ID]);
  });

  it('still reads "no band" when no ladders are loaded yet', () => {
    expect(
      collegePayBandsFromRows([
        { scope_id: ARTS_SCIENCE_INSTITUTION_ID, value: { pay_matrix: [] }, updated_at: null },
      ])
    ).toEqual([]);
  });
});

describe('a college whose pay_matrix already has a usable rung', () => {
  it('keeps exactly its matrix band; the ladders are not merged in', () => {
    const matrixRung = { designation: 'Assistant Professor', qualification: 'M.E (CSE/IT)', basic_pay: 20000 };
    const policy = parsePayBandPolicy({
      pay_matrix: [matrixRung],
      ladders: referenceLaddersFor(ENGINEERING_INSTITUTION_ID),
    });
    expect(policy?.rungs).toEqual([
      { designation: 'Assistant Professor', qualification: 'M.E (CSE/IT)', basicPay: 20000 },
    ]);
  });

  it('falls back to the ladders when every matrix rung is unusable', () => {
    const policy = parsePayBandPolicy({
      pay_matrix: [{ designation: 'Librarian', basic_pay: 0 }],
      ladders: [
        { designation: 'Librarian', qualification: null, steps: [{ label: '0-1', basic_pay: 10000 }] },
      ],
    });
    expect(policy?.rungs).toEqual([{ designation: 'Librarian', qualification: null, basicPay: 10000 }]);
  });
});

describe('hand-edited ladder JSON', () => {
  it('drops a bad ladder or step instead of the whole college', () => {
    const policy = parsePayBandPolicy({
      pay_matrix: [],
      ladders: [
        null,
        'ladder',
        { designation: '', steps: [{ basic_pay: 9000 }] },
        { designation: 'Lab Technician', steps: 'none' },
        {
          designation: 'Lab Technician',
          qualification: 7,
          steps: [{ basic_pay: 'abc' }, null, { basic_pay: '7000' }, { basic_pay: 7350 }],
        },
      ],
    });
    expect(policy?.rungs).toEqual([
      { designation: 'Lab Technician', qualification: null, basicPay: 7000 },
      { designation: 'Lab Technician', qualification: null, basicPay: 7350 },
    ]);
  });

  it('leaves a college with only unusable ladders out of the band list', () => {
    expect(
      collegePayBandsFromRows([
        {
          scope_id: 'x',
          value: { pay_matrix: [], ladders: [{ designation: 'Librarian', steps: [{ basic_pay: 0 }] }] },
          updated_at: null,
        },
      ])
    ).toEqual([]);
  });
});
