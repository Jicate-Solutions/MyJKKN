import { describe, expect, it } from 'vitest';
import { checkQuotationMath } from '../quotation-math';

// Jyothi Infotech "JKKN REVISED.pdf": one computer priced as nine parts, total ₹21,800.
const JYOTHI = [2500, 400, 4600, 4500, 700, 2650, 1450, 2600, 2400].map((p, i) => ({
  item_name: `part ${i + 1}`,
  unit_price: p,
  quantity: 1,
  line_total: p,
}));

describe('checkQuotationMath', () => {
  it('accepts the parts list when it adds up to the printed total', () => {
    const r = checkQuotationMath({ lines: JYOTHI, stated_total: 21800 });
    expect(r.lines_sum).toBe(21800);
    expect(r.total_agrees).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('flags a misread line: processor read as 25,000 instead of 2,500', () => {
    const lines = JYOTHI.map((l, i) => (i === 0 ? { ...l, unit_price: 25000, line_total: 25000 } : l));
    const r = checkQuotationMath({ lines, stated_total: 21800 });
    expect(r.total_agrees).toBe(false);
    expect(r.issues[0]).toMatch(/add up to ₹44,300/);
  });

  it('flags a missed line (one of the nine parts never read)', () => {
    const r = checkQuotationMath({ lines: JYOTHI.slice(1), stated_total: 21800 });
    expect(r.total_agrees).toBe(false);
  });

  it('flags qty × rate that disagrees with the line amount', () => {
    const r = checkQuotationMath({
      lines: [{ item_name: 'Printer', unit_price: 8000, quantity: 3, line_total: 28000 }],
    });
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatch(/3 × ₹8,000 is ₹24,000/);
  });

  it('accepts a total that includes GST', () => {
    const lines = [
      { item_name: 'A', unit_price: 1000, quantity: 2, line_total: 2000, gst_percent: 18 },
      { item_name: 'B', unit_price: 500, quantity: 1, line_total: 500, gst_percent: 5 },
    ];
    // 2000×1.18 + 500×1.05 = 2885
    const r = checkQuotationMath({ lines, stated_total: 2885 });
    expect(r.total_agrees).toBe(true);
  });

  it('accepts a total with one standard GST rate even when no line rate was captured', () => {
    // Amman IT Park: lines add to 124,915.20, printed total 147,400 (= +18%).
    const r = checkQuotationMath({ lines: [{ item_name: 'A', unit_price: 124915.2, quantity: 1 }], stated_total: 147400 });
    expect(r.total_agrees).toBe(true);
  });

  it('still flags a total that no standard rate explains', () => {
    const r = checkQuotationMath({ lines: [{ item_name: 'A', unit_price: 100000, quantity: 1 }], stated_total: 140000 });
    expect(r.total_agrees).toBe(false);
  });

  it('accepts a per-line total that already includes the line GST', () => {
    // Global Scientific: net 134.55, GST 5%, "Total" column 141.28.
    const r = checkQuotationMath({
      lines: [{ item_name: "Molisch's reagent", unit_price: 134.55, quantity: 1, line_total: 141.28, gst_percent: 5 }],
      stated_total: 141.28,
    });
    expect(r.issues).toEqual([]);
    expect(r.lines_sum).toBe(134.55);
    expect(r.total_agrees).toBe(true);
  });

  it('allows round-off on the printed total', () => {
    const r = checkQuotationMath({ lines: [{ unit_price: 1000.4, quantity: 1 }], stated_total: 1000 });
    expect(r.total_agrees).toBe(true);
  });

  it('flags the list price being read instead of the discounted rate', () => {
    // Global Scientific: MRP 299, net 134.55 — the reader once returned 299.
    const r = checkQuotationMath({
      lines: [{ item_name: "Molisch's reagent", unit_price: 299, quantity: 1, line_total: 134.55, list_price: 299, discount_percent: 55 }],
    });
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('accepts the discounted rate when list rate and discount agree with it', () => {
    const r = checkQuotationMath({
      lines: [{ item_name: "Molisch's reagent", unit_price: 134.55, quantity: 1, line_total: 134.55, list_price: 299, discount_percent: 55 }],
    });
    expect(r.issues).toEqual([]);
  });

  it('accepts a 5 × 185.38 line when the quote prints 5 × 299 less 38%', () => {
    const r = checkQuotationMath({
      lines: [{ item_name: 'Molisch', unit_price: 185.38, quantity: 5, line_total: 926.9, list_price: 299, discount_percent: 38 }],
    });
    expect(r.issues).toEqual([]);
  });

  it('says nothing when the quotation prints no total', () => {
    const r = checkQuotationMath({ lines: JYOTHI });
    expect(r.total_agrees).toBeNull();
    expect(r.issues).toEqual([]);
  });

  it('uses the printed line total when rate is per pack and amount differs by quantity', () => {
    const r = checkQuotationMath({
      lines: [{ item_name: 'Ethanol', unit_price: 160, quantity: 12, line_total: 1920 }],
      stated_total: 1920,
    });
    expect(r.total_agrees).toBe(true);
    expect(r.issues).toEqual([]);
  });
});
