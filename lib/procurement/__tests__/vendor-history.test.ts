import { describe, expect, it } from 'vitest';
import { buildVendorHistory } from '../vendor-history';
import type { VendorKpis } from '../vendor-score';
import type { ItemVendorRating } from '@/types/procurement';

const kpi = (supplier_id: string, over: Partial<VendorKpis> = {}): VendorKpis => ({
  supplier_id, grn_count: 0, on_time_eligible: 0, on_time: 0, ordered_qty: 0, received_qty: 0, accepted_qty: 0,
  invoice_lines: 0, invoice_matched: 0, price_lines: 0, price_held: 0, delivery_star_sum: 0, delivery_star_n: 0,
  item_star_sum: 0, item_star_n: 0, quote_requests: 0, quote_fast: 0, ...over,
});
const rating = (over: Partial<ItemVendorRating>): ItemVendorRating => ({
  item_id: 'i1', supplier_id: 's1', supplier_name: 'S1', manufacturer: null, star_sum: 4, star_n: 1,
  meets_no: 0, latest_comment: null, last_rated_at: '2026-10-01', ...over,
});
const names = new Map([['i1', 'Beaker 250ml']]);

describe('buildVendorHistory', () => {
  it('a vendor with no deliveries is New with no low ratings', () => {
    const h = buildVendorHistory([kpi('s1')], { delivery_mean: null, item_mean: null }, [], names).get('s1')!;
    expect(h.grade).toBeNull();
    expect(h.deliveries).toBe(0);
    expect(h.low_item_ratings).toEqual([]);
  });

  it('flags many poor ratings on an item, with the raw average and comment', () => {
    const h = buildVendorHistory(
      [kpi('s1')],
      { delivery_mean: 4, item_mean: 4 },
      [rating({ star_sum: 6, star_n: 4, latest_comment: 'cracks on heating' })],
      names,
    ).get('s1')!;
    expect(h.low_item_ratings).toEqual([{ item: 'Beaker 250ml', avg_stars: 1.5, ratings: 4, comment: 'cracks on heating' }]);
  });

  it('one 1★ alone is shrunk above the poor line, but "not to spec" still flags it', () => {
    const one = rating({ star_sum: 1, star_n: 1 });
    expect(buildVendorHistory([kpi('s1')], { delivery_mean: 4, item_mean: 4 }, [one], names).get('s1')!.low_item_ratings).toHaveLength(0);
    expect(
      buildVendorHistory([kpi('s1')], { delivery_mean: 4, item_mean: 4 }, [{ ...one, meets_no: 1 }], names).get('s1')!
        .low_item_ratings,
    ).toHaveLength(1);
  });

  it("ignores other vendors' ratings", () => {
    const h = buildVendorHistory([kpi('s1')], { delivery_mean: 4, item_mean: 4 }, [rating({ supplier_id: 's2', star_sum: 4, star_n: 4 })], names);
    expect(h.get('s1')!.low_item_ratings).toHaveLength(0);
  });
});
