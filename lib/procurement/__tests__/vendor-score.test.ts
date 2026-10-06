import { describe, expect, it } from 'vitest';
import { computeVendorScore, gradeFor, shrinkStars, type VendorKpis } from '../vendor-score';

const base: VendorKpis = {
  supplier_id: 's1', grn_count: 5, on_time_eligible: 5, on_time: 5,
  ordered_qty: 100, received_qty: 100, accepted_qty: 100,
  invoice_lines: 10, invoice_matched: 10, price_lines: 4, price_held: 4,
  delivery_star_sum: 25, delivery_star_n: 5, item_star_sum: 25, item_star_n: 5,
  quote_requests: 2, quote_fast: 2,
};
const means = { delivery_mean: 4, item_mean: 4 };

describe('shrinkStars', () => {
  it('pulls a single 5★ toward the mean', () => {
    expect(shrinkStars(5, 1, 4)).toBeCloseTo(4.25);
  });
  it('returns the mean when there are no ratings', () => {
    expect(shrinkStars(0, 0, 4)).toBe(4);
  });
});

describe('gradeFor', () => {
  it('uses the A/B/C/D bands', () => {
    expect(gradeFor(85)).toBe('A');
    expect(gradeFor(84)).toBe('B');
    expect(gradeFor(70)).toBe('B');
    expect(gradeFor(50)).toBe('C');
    expect(gradeFor(49)).toBe('D');
  });
});

describe('computeVendorScore', () => {
  it('a perfect vendor with history is A', () => {
    const r = computeVendorScore(base, means);
    expect(r.isNew).toBe(false);
    expect(r.grade).toBe('A');
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('fewer than 3 GRNs is New, no grade, but still has a score to show in the tooltip', () => {
    const r = computeVendorScore({ ...base, grn_count: 2 }, means);
    expect(r.isNew).toBe(true);
    expect(r.grade).toBeNull();
    expect(r.score).not.toBeNull();
  });

  it('late, short, rejected vendor is Watch', () => {
    const r = computeVendorScore(
      { ...base, on_time: 1, received_qty: 60, accepted_qty: 30, item_star_sum: 8,
        delivery_star_sum: 8, invoice_matched: 3 },
      means,
    );
    expect(r.grade).toBe('D');
  });

  it('parts with no data are left out, not counted as zero', () => {
    const r = computeVendorScore(
      { ...base, on_time_eligible: 0, on_time: 0, quote_requests: 0, quote_fast: 0 }, means);
    expect(r.parts.find((p) => p.key === 'on_time')?.value).toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('a vendor with no data at all has no score', () => {
    const empty: VendorKpis = {
      ...base, grn_count: 0, on_time_eligible: 0, on_time: 0, ordered_qty: 0, received_qty: 0,
      accepted_qty: 0, invoice_lines: 0, invoice_matched: 0, price_lines: 0, price_held: 0,
      delivery_star_sum: 0, delivery_star_n: 0, item_star_sum: 0, item_star_n: 0,
      quote_requests: 0, quote_fast: 0,
    };
    const r = computeVendorScore(empty, means);
    expect(r.score).toBeNull();
    expect(r.grade).toBeNull();
  });

  it('accepts numeric strings from PostgREST', () => {
    const r = computeVendorScore(
      { ...base, ordered_qty: '100' as unknown as number, received_qty: '50' as unknown as number }, means);
    expect(r.parts.find((p) => p.key === 'fill')?.value).toBeCloseTo(0.5);
  });

  it('falls back to a 4★ prior when there are no ratings anywhere yet', () => {
    const r = computeVendorScore(base, { delivery_mean: null, item_mean: null });
    expect(r.parts.find((p) => p.key === 'item_stars')?.value).toBeCloseTo((shrinkStars(25, 5, 4) - 1) / 4);
  });
});
