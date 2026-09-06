import { describe, it, expect } from 'vitest';
import {
  countDisadvantagedLearners,
  escsPercentage,
  namesGovernmentScheme,
  qualifiesOnIncome,
  usableAnnualIncome,
  ESCS_INCOME_CEILING_INR,
  type EscsLearnerRow,
} from '@/app/(routes)/accreditation/_lib/escs-disadvantaged';

// ---------------------------------------------------------------------------
// Two columns decide whether a learner counts towards NIRF's ESCS parameter,
// and both of them lie in the ways free text lies. `scholarship_type` holds a
// controlled vocabulary that arrived through forms and spreadsheet imports, so
// case and stray spaces vary. `annual_income` is a TEXT column: on production
// 1,346 rows hold an EMPTY STRING, which is present enough to survive a NULL
// check and means nothing at all.
//
// The failure these tests exist to prevent is an empty string reaching a
// comparison as 0 — every one of those learners would silently qualify as
// destitute, and the figure JKKN files with NIRF would be inflated by a
// data-entry artefact.
// ---------------------------------------------------------------------------
const learner = (
  scholarship_type: string | null,
  annual_income: string | null,
): EscsLearnerRow => ({ scholarship_type, annual_income });

describe('namesGovernmentScheme', () => {
  it('accepts each of the three government schemes', () => {
    expect(namesGovernmentScheme('FIRST GRADUATE')).toBe(true);
    expect(namesGovernmentScheme('PMS SCHOLARSHIP')).toBe(true);
    expect(namesGovernmentScheme('7.5% SCHOLARSHIP')).toBe(true);
  });

  it('rejects NOT APPLICABLE — it is the answer "no scheme", not a scheme', () => {
    expect(namesGovernmentScheme('NOT APPLICABLE')).toBe(false);
  });

  it('rejects a blank or missing value', () => {
    expect(namesGovernmentScheme('')).toBe(false);
    expect(namesGovernmentScheme(null)).toBe(false);
    expect(namesGovernmentScheme(undefined)).toBe(false);
  });

  it('matches case-insensitively and past surrounding whitespace', () => {
    // The column is free text; imports and form entry disagree about both.
    expect(namesGovernmentScheme('first graduate')).toBe(true);
    expect(namesGovernmentScheme('  PMS Scholarship  ')).toBe(true);
    expect(namesGovernmentScheme('\t7.5% scholarship\n')).toBe(true);
  });

  it('rejects a scheme name JKKN never agreed to', () => {
    // The rule names three State means tests. A local coinage has not been
    // verified by anybody, so it cannot stand in for one.
    expect(namesGovernmentScheme('GOVT SCHOLARSHIP')).toBe(false);
    expect(namesGovernmentScheme('FIRST GRADUATE APPLIED')).toBe(false);
  });
});

describe('usableAnnualIncome', () => {
  it('reads a bare number', () => {
    expect(usableAnnualIncome('500000')).toBe(500000);
    expect(usableAnnualIncome('72000.50')).toBe(72000.5);
  });

  it('treats an EMPTY STRING as no answer, never as zero', () => {
    // The whole point. 1,346 production rows hold this value.
    expect(usableAnnualIncome('')).toBeNull();
    expect(usableAnnualIncome('   ')).toBeNull();
  });

  it('treats a missing value as no answer', () => {
    expect(usableAnnualIncome(null)).toBeNull();
    expect(usableAnnualIncome(undefined)).toBeNull();
  });

  it('returns no answer for non-numeric text instead of crashing the cast', () => {
    expect(usableAnnualIncome('N/A')).toBeNull();
    expect(usableAnnualIncome('not disclosed')).toBeNull();
    expect(usableAnnualIncome('8 lakh')).toBeNull();
    expect(usableAnnualIncome('₹500000')).toBeNull();
  });

  it('refuses formats the verified predicate refused', () => {
    // The live figures were verified with `annual_income ~ '^[0-9]+(\.[0-9]+)?$'`.
    // Reading these leniently here would admit rows that count excluded, and the
    // screen would disagree with the figure that was signed off.
    expect(usableAnnualIncome('1,50,000')).toBeNull();
    expect(usableAnnualIncome('-50000')).toBeNull();
    expect(usableAnnualIncome('5e5')).toBeNull();
    expect(usableAnnualIncome(' 500000')).toBeNull();
  });
});

describe('qualifiesOnIncome', () => {
  it('counts income at the ceiling and below', () => {
    expect(qualifiesOnIncome('0')).toBe(true);
    expect(qualifiesOnIncome('250000')).toBe(true);
    expect(qualifiesOnIncome(String(ESCS_INCOME_CEILING_INR))).toBe(true);
  });

  it('does not count income above the ceiling', () => {
    expect(qualifiesOnIncome(String(ESCS_INCOME_CEILING_INR + 1))).toBe(false);
    expect(qualifiesOnIncome('1200000')).toBe(false);
  });

  it('does not count an unanswered income', () => {
    expect(qualifiesOnIncome('')).toBe(false);
    expect(qualifiesOnIncome(null)).toBe(false);
    expect(qualifiesOnIncome('N/A')).toBe(false);
  });
});

describe('countDisadvantagedLearners', () => {
  it('counts a learner who qualifies only on the government scheme', () => {
    const counts = countDisadvantagedLearners([learner('FIRST GRADUATE', '1500000')]);
    expect(counts.scholarshipOnly).toBe(1);
    expect(counts.incomeOnly).toBe(0);
    expect(counts.either).toBe(1);
    expect(counts.total).toBe(1);
  });

  it('counts a learner who qualifies only on income', () => {
    const counts = countDisadvantagedLearners([learner('NOT APPLICABLE', '200000')]);
    expect(counts.scholarshipOnly).toBe(0);
    expect(counts.incomeOnly).toBe(1);
    expect(counts.either).toBe(1);
  });

  it('counts a learner qualifying on both halves exactly once in `either`', () => {
    const counts = countDisadvantagedLearners([learner('PMS SCHOLARSHIP', '120000')]);
    expect(counts.scholarshipOnly).toBe(1);
    expect(counts.incomeOnly).toBe(1);
    // One person, not two. This is the figure NIRF's N is taken from.
    expect(counts.either).toBe(1);
    expect(counts.total).toBe(1);
  });

  it('excludes NOT APPLICABLE with a comfortable income', () => {
    const counts = countDisadvantagedLearners([learner('NOT APPLICABLE', '2400000')]);
    expect(counts.scholarshipOnly).toBe(0);
    expect(counts.incomeOnly).toBe(0);
    expect(counts.either).toBe(0);
    // Answered, just not disadvantaged — this learner was assessed.
    expect(counts.assessed).toBe(1);
    expect(counts.total).toBe(1);
  });

  it('never lets an EMPTY-STRING income qualify a learner as if it were zero', () => {
    const counts = countDisadvantagedLearners([
      learner('NOT APPLICABLE', ''),
      learner(null, ''),
      learner('', null),
    ]);
    expect(counts.incomeOnly).toBe(0);
    expect(counts.either).toBe(0);
    // And none of them counts as a family we asked.
    expect(counts.assessed).toBe(0);
    expect(counts.total).toBe(3);
  });

  it('survives non-numeric income text without crashing or counting it', () => {
    const counts = countDisadvantagedLearners([
      learner('NOT APPLICABLE', 'N/A'),
      learner('NOT APPLICABLE', 'not disclosed'),
      learner('NOT APPLICABLE', '8 lakh'),
    ]);
    expect(counts.incomeOnly).toBe(0);
    expect(counts.assessed).toBe(0);
    expect(counts.total).toBe(3);
  });

  it('keeps a scheme learner counted even when their income was never asked', () => {
    // The State already means-tested this learner. A blank income does not undo
    // that — but it does mean the income question is still open for them, so
    // they are in `either` and out of `assessed`.
    const counts = countDisadvantagedLearners([learner('FIRST GRADUATE', '')]);
    expect(counts.scholarshipOnly).toBe(1);
    expect(counts.either).toBe(1);
    expect(counts.assessed).toBe(0);
    expect(counts.total).toBe(1);
  });

  it('reports the two halves separately, and they overlap rather than add up', () => {
    const rows = [
      learner('FIRST GRADUATE', '1500000'), // scheme only
      learner('7.5% SCHOLARSHIP', '90000'), // both
      learner('NOT APPLICABLE', '300000'), // income only
      learner('NOT APPLICABLE', '5000000'), // neither, answered
      learner(null, ''), // neither, never asked
    ];
    const counts = countDisadvantagedLearners(rows);

    expect(counts.scholarshipOnly).toBe(2);
    expect(counts.incomeOnly).toBe(2);
    // 3, not 4 — adding the halves would double-count the learner in both.
    expect(counts.either).toBe(3);
    expect(counts.scholarshipOnly + counts.incomeOnly).toBeGreaterThan(counts.either);
    expect(counts.assessed).toBe(4);
    expect(counts.total).toBe(5);
  });

  it('keeps the government-verified half recoverable on its own', () => {
    // If the income half is ever challenged, this is the fallback figure and it
    // must not need a recompute to produce.
    const rows = [
      learner('PMS SCHOLARSHIP', '100000'),
      learner('NOT APPLICABLE', '100000'),
      learner('NOT APPLICABLE', '100000'),
    ];
    const counts = countDisadvantagedLearners(rows);
    expect(counts.either).toBe(3);
    expect(counts.scholarshipOnly).toBe(1);
  });

  it('returns zeroes for an empty population without dividing by anything', () => {
    expect(countDisadvantagedLearners([])).toEqual({
      scholarshipOnly: 0,
      incomeOnly: 0,
      either: 0,
      assessed: 0,
      total: 0,
    });
  });

  it('counts every row handed in, leaving scope to the caller', () => {
    // The module holds no opinion about which learners it was given — the read
    // filters to the colleges NIRF ranks, and `total` is exactly what arrived.
    const rows = Array.from({ length: 40 }, (_, i) =>
      learner(i % 4 === 0 ? 'FIRST GRADUATE' : 'NOT APPLICABLE', String(i * 50000)),
    );
    expect(countDisadvantagedLearners(rows).total).toBe(40);
  });
});

describe('escsPercentage', () => {
  it('states a share of the population', () => {
    // The two figures the Director signed off on, at the precision they are
    // quoted in: 4,507 of 6,351 is the either-rule count, 2,087 the
    // government-verified half that has to survive on its own.
    expect(escsPercentage(4507, 6351)).toBeCloseTo(71.0, 1);
    expect(escsPercentage(2087, 6351)).toBeCloseTo(32.9, 1);
  });

  it('returns null rather than 0% when there is nobody to take a share of', () => {
    // A read that produced no rows — RLS hid them, or the filter matched none —
    // has produced no answer. "0% disadvantaged" would be an answer, and a wrong one.
    expect(escsPercentage(0, 0)).toBeNull();
    expect(escsPercentage(0, -1)).toBeNull();
  });
});
