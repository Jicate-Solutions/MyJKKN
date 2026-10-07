import { describe, expect, it } from 'vitest';
import { normalizeExtraction } from '../quotation-extract-core';

const ITEMS = [{ id: 'comp', item_name: 'Computer', quantity: 25 }];

describe('normalizeExtraction', () => {
  it('reads the list rate as the net price when the quote prints qty × list less discount', () => {
    // Precision Scientific: 5 × 299 less 38% = 926.90 → net 185.38 each.
    const r = normalizeExtraction(
      { lines: [{ rfq_item_id: '', match: 'none', item_name: 'Molisch', unit_price: 299, quantity: 5, line_total: 926.9, discount_percent: 38 }] },
      []
    );
    expect(r.lines[0].unit_price).toBe(185.38);
    expect(r.lines[0].list_price).toBe(299);
    expect(r.read_notes).toHaveLength(1);
  });

  it('replaces a list price the model made up after correcting the rate', () => {
    // Precision Scientific again: the model grossed 299 up to 483.87 and also read it as the rate.
    const r = normalizeExtraction(
      { lines: [{ rfq_item_id: '', match: 'none', item_name: 'Molisch', unit_price: 299, quantity: 5, line_total: 926.9, list_price: 483.87, discount_percent: 38 }] },
      []
    );
    expect(r.lines[0].unit_price).toBe(185.38);
    expect(r.lines[0].list_price).toBe(299);
  });

  it('leaves a price alone when the amount already includes GST', () => {
    const r = normalizeExtraction(
      { lines: [{ rfq_item_id: '', match: 'none', item_name: 'Molisch', unit_price: 134.55, quantity: 1, line_total: 141.28, gst_percent: 5 }] },
      []
    );
    expect(r.lines[0].unit_price).toBe(134.55);
    expect(r.read_notes).toEqual([]);
  });

  it('leaves a clean line alone', () => {
    const r = normalizeExtraction(
      { lines: [{ rfq_item_id: '', match: 'none', item_name: 'Pen', unit_price: 10, quantity: 5, line_total: 50 }] },
      []
    );
    expect(r.lines[0].unit_price).toBe(10);
    expect(r.read_notes).toEqual([]);
  });

  it('does not "fix" a gap that the printed discount % does not explain', () => {
    const r = normalizeExtraction(
      { lines: [{ rfq_item_id: '', match: 'none', item_name: 'X', unit_price: 100, quantity: 1, line_total: 70, discount_percent: 5 }] },
      []
    );
    expect(r.lines[0].unit_price).toBe(100);
  });

  it('keeps only item ids it was given, and carries the printed total', () => {
    const r = normalizeExtraction(
      {
        stated_total: 21800,
        lines: [
          { rfq_item_id: 'comp', match: 'similar', item_name: 'Intel processor', unit_price: 2500, quantity: 1, line_total: 2500 },
          { rfq_item_id: 'made-up', match: 'same', item_name: 'Fan', unit_price: 400 },
        ],
      },
      ITEMS
    );
    expect(r.lines[0].rfq_item_id).toBe('comp');
    expect(r.lines[1].rfq_item_id).toBeNull();
    expect(r.stated_total).toBe(21800);
  });

  it('accepts lines handed back as a JSON string', () => {
    const r = normalizeExtraction({ lines: JSON.stringify([{ rfq_item_id: '', match: 'none', item_name: 'Pen', unit_price: 10 }]) }, []);
    expect(r.lines).toHaveLength(1);
  });

  it('returns no lines for an empty answer', () => {
    expect(normalizeExtraction({}, []).lines).toEqual([]);
    expect(normalizeExtraction(undefined, []).lines).toEqual([]);
  });
});
