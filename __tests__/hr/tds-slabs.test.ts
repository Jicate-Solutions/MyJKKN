/**
 * TDS bands — resolving a monthly gross to a rate and an amount.
 *
 * THE HALF-OPEN BOUNDARY IS THE POINT OF MOST OF THESE CASES. Bands written the
 * way people say them ("1,06,250 to 2,00,000", next one starting at 2,00,001)
 * leave every paise value between them matching nothing, and a salary of
 * ₹2,00,000.50 would be silently untaxed. [min, max) closes that. The database
 * enforces the same convention in hr_tds_slabs' EXCLUDE constraint, so these
 * assertions and the constraint agree by construction.
 *
 * Run: npx vitest run __tests__/hr/tds-slabs.test.ts
 */

import { describe, expect, it } from 'vitest';

import { describeSlab, resolveTds, sortSlabs } from '@/lib/hr/payroll/tds-slabs';
import type { HrTdsSlab } from '@/lib/services/hr/payroll/tds-slab-service';

function band(
  min: number,
  max: number | null,
  rate: number,
  id = `${min}-${max ?? 'inf'}`
): HrTdsSlab {
  return {
    id,
    min_monthly_gross: min,
    max_monthly_gross: max,
    rate_pct: rate,
    label: null,
    created_at: '2026-09-02T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
  };
}

/** The configuration this feature was specified against. */
const BANDS: HrTdsSlab[] = [band(106250, 200000, 5), band(200000, null, 10)];

describe('resolveTds — the worked example', () => {
  it('takes 5% of the WHOLE gross, not of the amount above the floor', () => {
    const r = resolveTds(150000, BANDS);
    expect(r.rate_pct).toBe(5);
    // 5% of 43,750 (the excess) would be 2,187.50 — a different scheme entirely.
    expect(r.amount).toBe(7500);
  });

  it('names the band it matched', () => {
    expect(resolveTds(150000, BANDS).slab?.id).toBe('106250-200000');
    expect(resolveTds(245000, BANDS).slab?.id).toBe('200000-inf');
  });
});

describe('resolveTds — the half-open boundary', () => {
  it.each([
    ['just below the ceiling', 199999.99, 5],
    ['exactly on the ceiling', 200000, 10],
    // The case an inclusive-both convention would drop on the floor.
    ['a paise above the ceiling', 200000.5, 10],
    ['exactly on the floor', 106250, 5],
    ['a paise below the floor', 106249.99, 0],
  ])('%s: %d → %d%%', (_name, gross, expectedRate) => {
    expect(resolveTds(gross, BANDS).rate_pct).toBe(expectedRate);
  });
});

describe('resolveTds — outside every band', () => {
  it('deducts nothing below the lowest floor', () => {
    // 376 of the 433 real salaries sit here.
    const r = resolveTds(26500, BANDS);
    expect(r.slab).toBeNull();
    expect(r.rate_pct).toBe(0);
    expect(r.amount).toBe(0);
  });

  it('deducts nothing when no bands are configured at all', () => {
    const r = resolveTds(245000, []);
    expect(r.slab).toBeNull();
    expect(r.amount).toBe(0);
  });

  /**
   * THE SHAPE THE COVERAGE WARNING EXISTS FOR. With a capped top band, the
   * highest earner in the organisation pays nothing while a colleague on
   * ₹1,09,000 pays ₹5,450.
   *
   * The database ALLOWS this (the trigger that refused it was dropped on
   * 2026-09-02 — its rules could not be satisfied by any single row, so adding
   * one band at all was impossible). It is a legitimate configuration: "outside
   * every band = no TDS" applies above the highest band as much as below the
   * lowest. So this is not a regression test, it is the contract — and the TDS
   * Bands screen names the affected staff rather than refusing the set.
   */
  it('leaves the highest earner untaxed when the top band is capped', () => {
    const capped = [band(106250, 200000, 5)];
    expect(resolveTds(245000, capped).amount).toBe(0);
    expect(resolveTds(109000, capped).amount).toBe(5450);
  });
});

describe('resolveTds — the open-ended top band', () => {
  it('has no upper limit', () => {
    expect(resolveTds(245000, BANDS).amount).toBe(24500);
    expect(resolveTds(10_000_000, BANDS).rate_pct).toBe(10);
  });
});

describe('resolveTds — degenerate salaries', () => {
  it.each([
    ['zero', 0],
    ['negative', -5000],
    ['NaN', Number.NaN],
  ])('%s is not a tax question', (_name, gross) => {
    const r = resolveTds(gross as number, BANDS);
    expect(r.slab).toBeNull();
    expect(r.amount).toBe(0);
  });

  it('handles a 0% band as a real answer, not a missing one', () => {
    // The explicit escape hatch for exempting a range without leaving a gap.
    const withZero = [band(50000, 106250, 0), band(106250, null, 5)];
    const r = resolveTds(80000, withZero);
    expect(r.slab).not.toBeNull();
    expect(r.amount).toBe(0);
  });
});

describe('resolveTds — rounding', () => {
  it('keeps amounts at two decimals, like every other money figure', () => {
    // 5% of 106,251.55 = 5312.5775
    expect(resolveTds(106251.55, BANDS).amount).toBe(5312.58);
  });
});

describe('sortSlabs / describeSlab', () => {
  it('orders bands by floor regardless of what the database returned', () => {
    const jumbled = [band(200000, null, 10), band(106250, 200000, 5)];
    expect(sortSlabs(jumbled).map((b) => b.min_monthly_gross)).toEqual([106250, 200000]);
  });

  it('renders the open-ended band as a range, never as a blank', () => {
    const fmt = (n: number) => `₹${n}`;
    expect(describeSlab(BANDS[0], fmt)).toBe('₹106250 – ₹200000');
    expect(describeSlab(BANDS[1], fmt)).toBe('₹200000 and above');
  });
});

describe('resolveTds — the allowance is outside the tax base', () => {
  /**
   * WHY THIS TEST EXISTS. resolveTds only ever receives the gross — its
   * signature makes passing the allowance impossible — but the three call sites
   * (the salary dialog, the TDS column, the register loader) each have a
   * `total = gross + allowance` in scope, and passing that one instead would be
   * a one-word mistake with no symptom other than a bigger deduction.
   *
   * This pins what that mistake would cost, so it is documented rather than
   * merely prevented.
   */
  it('would move a person into a higher band if the allowance were counted', () => {
    const gross = 195000;
    const allowance = 20000; // total 2,15,000 — over the 2,00,000 boundary

    expect(resolveTds(gross, BANDS).rate_pct).toBe(5);
    expect(resolveTds(gross, BANDS).amount).toBe(9750);

    // The wrong answer, priced: a different band AND a bigger base.
    expect(resolveTds(gross + allowance, BANDS).rate_pct).toBe(10);
    expect(resolveTds(gross + allowance, BANDS).amount).toBe(21500);
  });

  it('would tax somebody who owes nothing at all', () => {
    const gross = 100000; // below every band
    const allowance = 10000; // total 1,10,000 — inside the 5% band

    expect(resolveTds(gross, BANDS).amount).toBe(0);
    expect(resolveTds(gross + allowance, BANDS).amount).toBe(5500);
  });
});
