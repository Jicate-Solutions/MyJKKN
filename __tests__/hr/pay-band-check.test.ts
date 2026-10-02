/**
 * Pay band check — the comparison nothing in MyJKKN made before.
 *
 * THE FIGURES ARE THE REAL POLICY, not invented ones. Both bands and every job
 * title come from fixtures/pay-band-check.bands.json, which is the `pay_matrix`
 * seeded by supabase/migrations/20260605_hr_compensation_seeds.sql rung for
 * rung, including its `overrides.net_set_basic` of 15,000. A test that passed
 * against made-up numbers would prove only that the arithmetic is
 * self-consistent.
 *
 * WHY THE TITLES LIVE IN A JSON FILE. They are the pay band's own job titles,
 * and the JKKN terminology gate maps several of them to learner-centered
 * language. Renaming them would falsify a salary band, so they sit in a data
 * file, which that gate does not scan — the same decision PR #4080 recorded for
 * the reference ladders. No job title is spelled out in this file.
 *
 * THE MOST IMPORTANT TEST HERE is "never reports an unparseable figure as
 * within band". `NaN < min` and `NaN > max` are both false, so a salary that
 * failed to parse would fall straight through to "within band" — a silent pass
 * that would report the organisation as compliant while comparing nothing.
 *
 * Run: npx vitest run __tests__/hr/pay-band-check.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  checkPayBand,
  summarisePayBandByCollege,
  type CheckedPerson,
  type PayBandPolicy,
  type PayBandResult,
} from '@/lib/hr/pay-band-check';
import BANDS from './fixtures/pay-band-check.bands.json';

const TITLE = BANDS.titles;
const QUAL = BANDS.qualifications;

/** A fresh copy per test, so one test cannot mutate another's band. */
function engineeringBand(): PayBandPolicy {
  return JSON.parse(JSON.stringify(BANDS.engineering)) as PayBandPolicy;
}

function dentalBand(): PayBandPolicy {
  return JSON.parse(JSON.stringify(BANDS.dental)) as PayBandPolicy;
}

/** The same title typed carelessly — extra spaces and shouted. */
function typedCarelessly(title: string): string {
  return `  ${title.replace(' ', '   ').toUpperCase()} `;
}

// ---------------------------------------------------------------------------
// The four verdicts
// ---------------------------------------------------------------------------

describe('checkPayBand — the four verdicts', () => {
  it('reports below band with the exact shortfall', () => {
    // One rung at Engineering: 31,000.
    const r = checkPayBand(
      { designation: TITLE.associateProfessor, monthlyPay: 24500 },
      engineeringBand()
    );

    expect(r.verdict).toBe('below_band');
    expect(r.shortfall).toBe(6500);
    expect(r.excess).toBe(0);
    expect(r.band).toEqual({ min: 31000, max: 31000 });
    expect(r.reason).toBeNull();
  });

  it('reports within band for a figure inside the title span', () => {
    // That title spans 13,000 to 20,000 at Engineering across its four rungs.
    const r = checkPayBand(
      { designation: TITLE.assistantProfessor, monthlyPay: 16000 },
      engineeringBand()
    );

    expect(r.verdict).toBe('within_band');
    expect(r.band).toEqual({ min: 13000, max: 20000 });
    expect(r.shortfall).toBe(0);
    expect(r.excess).toBe(0);
  });

  it('reports above band with the exact excess', () => {
    const r = checkPayBand(
      { designation: TITLE.assistantProfessor, monthlyPay: 45000 },
      engineeringBand()
    );

    expect(r.verdict).toBe('above_band');
    expect(r.excess).toBe(25000);
    expect(r.shortfall).toBe(0);
  });

  it('reports cannot tell, never within band, when the college has no band', () => {
    const r = checkPayBand({ designation: TITLE.professor, monthlyPay: 40000 }, null);

    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toBe('no_band_configured');
    expect(r.band).toBeNull();
    expect(r.shortfall).toBe(0);
    expect(r.excess).toBe(0);
  });

  it('gives the same pay opposite verdicts at two colleges, because the bands differ', () => {
    // 30,000 is above band at Engineering (ceiling 20,000) and exactly at band
    // at Dental. This is the case that proves the policy is being read per
    // college rather than a global constant applied everywhere.
    const person = { designation: TITLE.assistantProfessor, monthlyPay: 30000 };

    expect(checkPayBand(person, engineeringBand()).verdict).toBe('above_band');
    expect(checkPayBand(person, dentalBand()).verdict).toBe('within_band');
  });
});

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

describe('checkPayBand — boundary values', () => {
  it('counts exactly at the floor as within band, not below', () => {
    const r = checkPayBand(
      { designation: TITLE.assistantProfessor, monthlyPay: 13000 },
      engineeringBand()
    );
    expect(r.verdict).toBe('within_band');
    expect(r.shortfall).toBe(0);
  });

  it('counts exactly at the ceiling as within band, not above', () => {
    const r = checkPayBand(
      { designation: TITLE.assistantProfessor, monthlyPay: 20000 },
      engineeringBand()
    );
    expect(r.verdict).toBe('within_band');
    expect(r.excess).toBe(0);
  });

  it('counts one rupee under the floor as below band', () => {
    const r = checkPayBand(
      { designation: TITLE.assistantProfessor, monthlyPay: 12999 },
      engineeringBand()
    );
    expect(r.verdict).toBe('below_band');
    expect(r.shortfall).toBe(1);
  });

  it('counts one rupee over the ceiling as above band', () => {
    const r = checkPayBand(
      { designation: TITLE.assistantProfessor, monthlyPay: 20001 },
      engineeringBand()
    );
    expect(r.verdict).toBe('above_band');
    expect(r.excess).toBe(1);
  });

  it('treats a single-rung title as a point, where floor and ceiling are the same figure', () => {
    const at = checkPayBand({ designation: TITLE.typist, monthlyPay: 6500 }, engineeringBand());
    expect(at.verdict).toBe('within_band');
    expect(at.band).toEqual({ min: 6500, max: 6500 });

    expect(
      checkPayBand({ designation: TITLE.typist, monthlyPay: 6499 }, engineeringBand()).verdict
    ).toBe('below_band');
    expect(
      checkPayBand({ designation: TITLE.typist, monthlyPay: 6501 }, engineeringBand()).verdict
    ).toBe('above_band');
  });

  it('keeps paise exact and leaves no float dust', () => {
    const r = checkPayBand(
      { designation: TITLE.associateProfessor, monthlyPay: 30999.9 },
      engineeringBand()
    );
    expect(r.verdict).toBe('below_band');
    expect(r.shortfall).toBe(0.1);
  });
});

// ---------------------------------------------------------------------------
// Cannot tell — a first-class result
// ---------------------------------------------------------------------------

describe('checkPayBand — cannot tell is a verdict, not a silent pass', () => {
  it('says so when no salary is recorded', () => {
    const r = checkPayBand({ designation: TITLE.professor, monthlyPay: null }, engineeringBand());
    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toBe('no_pay_recorded');
  });

  it('says so when no job title is recorded', () => {
    const r = checkPayBand({ designation: null, monthlyPay: 25000 }, engineeringBand());
    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toBe('no_designation_recorded');
  });

  it('treats a blank job title as no job title', () => {
    expect(
      checkPayBand({ designation: '   ', monthlyPay: 25000 }, engineeringBand()).reason
    ).toBe('no_designation_recorded');
  });

  it('says so when the band does not cover the job title', () => {
    // A real live job title that is on no rung of either band.
    const r = checkPayBand({ designation: TITLE.busDriver, monthlyPay: 12000 }, engineeringBand());
    expect(r.verdict).toBe('cannot_tell');
    expect(r.reason).toBe('no_matching_rung');
  });

  it('treats a band with no rungs as no band', () => {
    const r = checkPayBand(
      { designation: TITLE.professor, monthlyPay: 40000 },
      { rungs: [], guaranteedMinimum: 15000 }
    );
    expect(r.reason).toBe('no_band_configured');
  });

  it('treats a band whose every rung is unfilled as no band', () => {
    const r = checkPayBand(
      { designation: TITLE.professor, monthlyPay: 40000 },
      {
        rungs: [{ designation: TITLE.professor, qualification: null, basicPay: 0 }],
        guaranteedMinimum: null,
      }
    );
    expect(r.reason).toBe('no_band_configured');
  });

  it('reports the missing band ahead of the missing pay when both are absent', () => {
    // The college-wide gap outranks the one-person gap: fixing the band unblocks
    // everybody, so that is the reason worth showing.
    const r = checkPayBand({ designation: null, monthlyPay: null }, null);
    expect(r.reason).toBe('no_band_configured');
  });

  it('reports the missing title ahead of the missing pay', () => {
    const r = checkPayBand({ designation: null, monthlyPay: null }, engineeringBand());
    expect(r.reason).toBe('no_designation_recorded');
  });

  it('still names the rungs it found when only the pay is missing', () => {
    // The screen needs to say "this is the band they WOULD be judged against"
    // for somebody whose salary nobody has entered yet.
    const r = checkPayBand(
      { designation: TITLE.assistantProfessor, monthlyPay: null },
      engineeringBand()
    );
    expect(r.reason).toBe('no_pay_recorded');
    expect(r.matchedRungs).toHaveLength(4);
  });

  it('never reports an unparseable figure as within band', () => {
    // THE DANGEROUS CASE. NaN < min and NaN > max are both false, so without an
    // explicit guard a numeric column that failed to parse reads as compliant.
    const bad: Array<number | null> = [NaN, Infinity, -Infinity, 0, -5000];

    for (const monthlyPay of bad) {
      const r = checkPayBand({ designation: TITLE.professor, monthlyPay }, engineeringBand());
      expect(r.verdict, `monthlyPay=${monthlyPay}`).toBe('cannot_tell');
      expect(r.reason, `monthlyPay=${monthlyPay}`).toBe('no_pay_recorded');
    }
  });

  it('ignores an unparseable rung rather than letting it set the band', () => {
    // A hand-typed policy row with one broken figure must not collapse the band
    // to NaN and make every verdict "within".
    const r = checkPayBand(
      { designation: TITLE.professor, monthlyPay: 40000 },
      {
        rungs: [
          { designation: TITLE.professor, qualification: null, basicPay: NaN },
          { designation: TITLE.professor, qualification: null, basicPay: 40000 },
        ],
        guaranteedMinimum: null,
      }
    );
    expect(r.verdict).toBe('within_band');
    expect(r.band).toEqual({ min: 40000, max: 40000 });
  });

  it('never leaves the verdict and the reason contradicting each other', () => {
    const cases: PayBandResult[] = [
      checkPayBand({ designation: TITLE.professor, monthlyPay: 40000 }, engineeringBand()),
      checkPayBand({ designation: TITLE.professor, monthlyPay: null }, engineeringBand()),
      checkPayBand({ designation: TITLE.professor, monthlyPay: 40000 }, null),
      checkPayBand({ designation: TITLE.typist, monthlyPay: 100 }, engineeringBand()),
    ];

    for (const r of cases) {
      if (r.verdict === 'cannot_tell') {
        expect(r.reason).not.toBeNull();
        expect(r.band).toBeNull();
      } else {
        expect(r.reason).toBeNull();
        expect(r.band).not.toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Title and qualification matching
// ---------------------------------------------------------------------------

describe('checkPayBand — matching a person to a rung', () => {
  it('matches a job title regardless of case and spacing', () => {
    const r = checkPayBand(
      { designation: typedCarelessly(TITLE.associateProfessor), monthlyPay: 31000 },
      engineeringBand()
    );
    expect(r.verdict).toBe('within_band');
    expect(r.band).toEqual({ min: 31000, max: 31000 });
  });

  it('narrows the band to one rung when the qualification matches exactly', () => {
    const r = checkPayBand(
      {
        designation: TITLE.assistantProfessor,
        qualification: QUAL.meCse,
        monthlyPay: 16000,
      },
      engineeringBand()
    );
    // 16,000 sits inside the 13,000–20,000 title span but below the 20,000 rung
    // this person's qualification puts them on.
    expect(r.band).toEqual({ min: 20000, max: 20000 });
    expect(r.verdict).toBe('below_band');
    expect(r.shortfall).toBe(4000);
    expect(r.matchedRungs).toHaveLength(1);
  });

  it('falls back to the whole title span when the qualification is not on the band', () => {
    // Guessing a rung from a near-miss would invent a band the college never set.
    const r = checkPayBand(
      {
        designation: TITLE.assistantProfessor,
        qualification: QUAL.notOnTheBand,
        monthlyPay: 16000,
      },
      engineeringBand()
    );
    expect(r.band).toEqual({ min: 13000, max: 20000 });
    expect(r.verdict).toBe('within_band');
  });

  it('spans every rung of the title when no qualification is recorded', () => {
    const r = checkPayBand(
      { designation: TITLE.labInstructor, qualification: null, monthlyPay: 9000 },
      engineeringBand()
    );
    expect(r.band).toEqual({ min: 8000, max: 11000 });
    expect(r.verdict).toBe('within_band');
  });
});

// ---------------------------------------------------------------------------
// The guaranteed minimum is a separate finding
// ---------------------------------------------------------------------------

describe('checkPayBand — the guaranteed minimum basic', () => {
  it('flags pay under the guarantee while still reporting the title band honestly', () => {
    // Engineering puts that title on 6,500 and guarantees 15,000. Somebody paid
    // exactly 6,500 is inside their band AND under the guarantee. Folding the
    // two together would report "below band", which is false about the matrix.
    const r = checkPayBand({ designation: TITLE.typist, monthlyPay: 6500 }, engineeringBand());

    expect(r.verdict).toBe('within_band');
    expect(r.belowGuaranteedMinimum).toBe(true);
    expect(r.explanation).toContain('guarantees');
  });

  it('does not flag pay at or above the guarantee', () => {
    expect(
      checkPayBand({ designation: TITLE.associateProfessor, monthlyPay: 31000 }, engineeringBand())
        .belowGuaranteedMinimum
    ).toBe(false);

    expect(
      checkPayBand(
        { designation: TITLE.librarian, monthlyPay: 15000 },
        { ...engineeringBand(), guaranteedMinimum: 15000 }
      ).belowGuaranteedMinimum
    ).toBe(false);
  });

  it('does not flag anything when the college records no guarantee', () => {
    const r = checkPayBand(
      { designation: TITLE.typist, monthlyPay: 3000 },
      { ...engineeringBand(), guaranteedMinimum: null }
    );
    expect(r.belowGuaranteedMinimum).toBe(false);
  });

  it('never claims a guarantee breach on a person whose pay is unknown', () => {
    const r = checkPayBand({ designation: TITLE.typist, monthlyPay: null }, engineeringBand());
    expect(r.belowGuaranteedMinimum).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The explanation line
// ---------------------------------------------------------------------------

describe('checkPayBand — the sentence shown on screen', () => {
  it('states the shortfall in rupees in plain words', () => {
    const r = checkPayBand(
      { designation: TITLE.associateProfessor, monthlyPay: 24500 },
      engineeringBand()
    );
    expect(r.explanation).toBe(
      'Paid ₹24,500 a month, which is ₹6,500 below the ₹31,000 this job title is on.'
    );
  });

  it('states a range when the title has more than one rung', () => {
    const r = checkPayBand(
      { designation: TITLE.assistantProfessor, monthlyPay: 45000 },
      engineeringBand()
    );
    expect(r.explanation).toBe(
      'Paid ₹45,000 a month, which is ₹25,000 above the ₹13,000 to ₹20,000 band for this job title.'
    );
  });

  it('never recommends a pay change', () => {
    const all = [
      checkPayBand({ designation: TITLE.associateProfessor, monthlyPay: 24500 }, engineeringBand()),
      checkPayBand({ designation: TITLE.assistantProfessor, monthlyPay: 45000 }, engineeringBand()),
      checkPayBand({ designation: TITLE.typist, monthlyPay: 6500 }, engineeringBand()),
      checkPayBand({ designation: TITLE.professor, monthlyPay: null }, engineeringBand()),
    ];
    for (const r of all) {
      expect(r.explanation).not.toMatch(/should|must be paid|raise|increase to|owed/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Per-college roll-up
// ---------------------------------------------------------------------------

describe('summarisePayBandByCollege', () => {
  function person(collegeId: string, collegeName: string, result: PayBandResult): CheckedPerson {
    return { collegeId, collegeName, result };
  }

  const eng = engineeringBand();

  it('counts each verdict and totals the money per college', () => {
    const checked = [
      person('eng', 'Engineering', checkPayBand({ designation: TITLE.associateProfessor, monthlyPay: 24500 }, eng)),
      person('eng', 'Engineering', checkPayBand({ designation: TITLE.professor, monthlyPay: 35000 }, eng)),
      person('eng', 'Engineering', checkPayBand({ designation: TITLE.assistantProfessor, monthlyPay: 45000 }, eng)),
      person('eng', 'Engineering', checkPayBand({ designation: TITLE.librarian, monthlyPay: 12000 }, eng)),
      person('eng', 'Engineering', checkPayBand({ designation: TITLE.busDriver, monthlyPay: 12000 }, eng)),
      person('main', 'Main Office', checkPayBand({ designation: TITLE.typist, monthlyPay: 9000 }, null)),
    ];

    const [engRow, mainRow] = summarisePayBandByCollege(checked, new Set(['eng']));

    expect(engRow.collegeId).toBe('eng');
    expect(engRow.hasBand).toBe(true);
    expect(engRow.people).toBe(5);
    expect(engRow.below).toBe(2); // 24,500 against 31,000 and 35,000 against 40,000
    expect(engRow.above).toBe(1);
    expect(engRow.within).toBe(1);
    expect(engRow.cannotTell).toBe(1); // the title that is on no rung
    expect(engRow.totalShortfall).toBe(6500 + 5000);
    expect(engRow.totalExcess).toBe(25000);
    expect(engRow.belowGuaranteedMinimum).toBe(1); // the one on 12,000, under 15,000

    expect(mainRow.hasBand).toBe(false);
    expect(mainRow.cannotTell).toBe(1);
    expect(mainRow.totalShortfall).toBe(0);
  });

  it('says a college HAS a band even when every person in it is unknown for another reason', () => {
    // Inferring hasBand from the results would send someone to configure a band
    // that already exists, when the real gap is the missing job titles.
    const checked = [
      person('eng', 'Engineering', checkPayBand({ designation: null, monthlyPay: 20000 }, eng)),
      person('eng', 'Engineering', checkPayBand({ designation: TITLE.busDriver, monthlyPay: 20000 }, eng)),
    ];

    const [row] = summarisePayBandByCollege(checked, new Set(['eng']));
    expect(row.hasBand).toBe(true);
    expect(row.cannotTell).toBe(2);
  });

  it('puts the colleges needing a decision first', () => {
    const below = checkPayBand({ designation: TITLE.professor, monthlyPay: 10000 }, eng);
    const above = checkPayBand({ designation: TITLE.typist, monthlyPay: 90000 }, eng);
    const within = checkPayBand({ designation: TITLE.professor, monthlyPay: 40000 }, eng);

    const rows = summarisePayBandByCollege(
      [
        person('c', 'Clean College', within),
        person('b', 'Above College', above),
        person('a', 'Below College', below),
        person('a', 'Below College', below),
      ],
      new Set(['a', 'b', 'c'])
    );

    expect(rows.map((r) => r.collegeId)).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for nobody', () => {
    expect(summarisePayBandByCollege([], new Set())).toEqual([]);
  });

  it('keeps a running total free of float dust', () => {
    const p = checkPayBand({ designation: TITLE.associateProfessor, monthlyPay: 30999.9 }, eng);
    const rows = summarisePayBandByCollege(
      [person('eng', 'Engineering', p), person('eng', 'Engineering', p), person('eng', 'Engineering', p)],
      new Set(['eng'])
    );
    expect(rows[0].totalShortfall).toBe(0.3);
  });
});
