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
import { bandWarning } from '@/lib/hr/salary-revision';
import {
  ARTS_SCIENCE_INSTITUTION_ID,
  ENGINEERING_INSTITUTION_ID,
  referenceLaddersFor,
} from '@/lib/hr/pay-scales/jkkn-reference-ladders';

// The one teaching ladder Arts & Science has; its title is read from the data
// so this file restates no job title of its own.
const TEACHING_TITLE = referenceLaddersFor(ARTS_SCIENCE_INSTITUTION_ID).find(
  (l) => l.staff_group === 'teaching'
)!.designation;

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

  it('spans the teaching ladder from its first step to its last', () => {
    const policy = parsePayBandPolicy(ARTS_SCIENCE_ROW_AFTER_LOAD);
    const result = checkPayBand({ designation: TEACHING_TITLE, monthlyPay: 16000 }, policy);
    expect(result.verdict).toBe('within_band');
    expect(result.band).toEqual({ min: 15000, max: 21500 });
  });

  it('reads pay above the last step as above the band', () => {
    const policy = parsePayBandPolicy(ARTS_SCIENCE_ROW_AFTER_LOAD);
    const result = checkPayBand({ designation: TEACHING_TITLE, monthlyPay: 22000 }, policy);
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
    // Engineering's ladders carry a Librarian ladder too (10,000 to 19,799).
    const matrixRung = { designation: 'Librarian', qualification: 'M.L.I.Sc', basic_pay: 40000 };
    const policy = parsePayBandPolicy({
      pay_matrix: [matrixRung],
      ladders: referenceLaddersFor(ENGINEERING_INSTITUTION_ID),
    });
    expect(policy?.rungs).toEqual([
      { designation: 'Librarian', qualification: 'M.L.I.Sc', basicPay: 40000 },
    ]);
  });

  it('is not marked as read from the ladders', () => {
    const policy = parsePayBandPolicy({
      pay_matrix: [{ designation: 'Librarian', qualification: null, basic_pay: 40000 }],
      ladders: referenceLaddersFor(ENGINEERING_INSTITUTION_ID),
    });
    expect(policy?.fromReferenceLadders).toBeUndefined();
  });

  it('a matrix whose entries are all zeroed stays without a band; it never switches to the ladders', () => {
    // Panel round 1 (9 Oct): only a college with NO pay matrix reads the
    // ladders. Zeroing Engineering's or Dental's entries must not hand their
    // verdicts to the reference ladders.
    const policy = parsePayBandPolicy({
      pay_matrix: [{ designation: 'Librarian', basic_pay: 0 }],
      ladders: [
        { designation: 'Librarian', qualification: null, steps: [{ label: '0-1', basic_pay: 10000 }] },
      ],
    });
    expect(policy?.rungs.some((r) => r.basicPay === 10000)).toBe(false);
    expect(policy?.fromReferenceLadders).toBeUndefined();
    expect(checkPayBand({ designation: 'Librarian', monthlyPay: 12000 }, policy).verdict).toBe('cannot_tell');
  });
});

describe('a band read from the reference ladders says so', () => {
  it('the policy is marked', () => {
    expect(parsePayBandPolicy(ARTS_SCIENCE_ROW_AFTER_LOAD)?.fromReferenceLadders).toBe(true);
  });

  it('the raise warning names the ladders as the source', () => {
    const policy = parsePayBandPolicy(ARTS_SCIENCE_ROW_AFTER_LOAD);
    expect(bandWarning(TEACHING_TITLE, 22000, policy)).toBe(
      'Above the band by ₹500 (band from the reference year ladders)'
    );
  });

  it('a matrix band keeps the plain warning', () => {
    const policy = parsePayBandPolicy({
      pay_matrix: [{ designation: TEACHING_TITLE, qualification: null, basic_pay: 15000 }],
    });
    expect(bandWarning(TEACHING_TITLE, 15500, policy)).toBe('Above the band by ₹500');
  });
});

describe('rival versions of one scale', () => {
  it('two ladders for the same title and qualification feed no rung; the others still do', () => {
    const ladders = referenceLaddersFor(ENGINEERING_INSTITUTION_ID);
    const key = (l: { designation: string; qualification: string | null }) =>
      `${l.designation}|${l.qualification ?? ''}`;
    const counts = new Map<string, number>();
    ladders.forEach((l) => counts.set(key(l), (counts.get(key(l)) ?? 0) + 1));
    const rivals = ladders.filter((l) => (counts.get(key(l)) ?? 0) > 1);
    // The workbook's 13,000 and 15,000 Science & Humanities scales.
    expect(rivals.map((l) => l.steps[0].basic_pay).sort()).toEqual([13000, 15000]);

    const policy = parsePayBandPolicy({ pay_matrix: [], ladders });
    const rivalTitle = rivals[0].designation;
    const rivalQual = rivals[0].qualification;
    expect(
      policy?.rungs.filter((r) => r.designation === rivalTitle && r.qualification === rivalQual)
    ).toEqual([]);
    const others = ladders.filter((l) => (counts.get(key(l)) ?? 0) === 1);
    expect(policy?.rungs).toHaveLength(others.reduce((n, l) => n + l.steps.length, 0));
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
        { designation: 'Typist', steps: 'none' },
        {
          designation: 'Typist',
          qualification: 7,
          steps: [{ basic_pay: 'abc' }, null, { basic_pay: '7000' }, { basic_pay: 7350 }],
        },
      ],
    });
    expect(policy?.rungs).toEqual([
      { designation: 'Typist', qualification: null, basicPay: 7000 },
      { designation: 'Typist', qualification: null, basicPay: 7350 },
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
