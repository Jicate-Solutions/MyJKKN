import { describe, expect, it } from 'vitest';
import {
  applySecondLook,
  buildExtractPrompt,
  buildSecondLookPrompt,
  normalizeExtraction,
  openForSecondLook,
} from '../quotation-extract-core';

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

  it('keeps whether a line is a part of a set or one of several options', () => {
    const r = normalizeExtraction(
      {
        lines: [
          { rfq_item_id: 'comp', match: 'similar', role: 'part', item_name: 'Intel i5 processor', unit_price: 12000 },
          { rfq_item_id: 'comp', match: 'same', role: 'option', item_name: 'Dell Optiplex', unit_price: 52000 },
          { rfq_item_id: 'comp', match: 'same', role: 'nonsense', item_name: 'HP Pro', unit_price: 50000 },
        ],
      },
      ITEMS
    );
    expect(r.lines.map((l) => l.role)).toEqual(['part', 'option', 'item']);
  });
});

describe('buildExtractPrompt', () => {
  it('tells the reader the names team members already confirmed for an item', () => {
    const p = buildExtractPrompt([{ id: 'fp', item_name: 'Filter paper', aka: ['Whatman No.1 125mm'] }]);
    expect(p).toContain('I1 — Filter paper — also called: Whatman No.1 125mm');
  });

  it('sends short refs, not ids, and maps them back', () => {
    const items = [{ id: 'uuid-a', item_name: 'Pen' }, { id: 'uuid-b', item_name: 'Filter paper' }];
    expect(buildExtractPrompt(items)).not.toContain('uuid-b');
    const r = normalizeExtraction({ lines: [{ item: 'I2', match: 'same', item_name: 'Filter paper', unit_price: 5 }, { item: 'I9', match: 'same', item_name: 'Ink', unit_price: 3 }] }, items);
    expect(r.lines.map((l) => l.rfq_item_id)).toEqual(['uuid-b', null]);
  });
});

describe('second look', () => {
  const items = [
    { id: 'fp', item_name: 'Filter paper' },
    { id: 'naoh', item_name: 'Sodium hydroxide' },
  ];
  const read = () =>
    normalizeExtraction(
      {
        lines: [
          { rfq_item_id: 'fp', match: 'similar', item_name: 'Whatman No.1 125mm', unit_price: 450 },
          { rfq_item_id: '', match: 'none', item_name: 'Caustic soda flakes', unit_price: 120 },
          { rfq_item_id: '', match: 'none', item_name: 'Borosil beaker 250ml', unit_price: 90 },
        ],
      },
      items
    );

  it('asks only about what is still open', () => {
    const { openItems, openLines } = openForSecondLook(read(), items);
    expect(openItems.map((i) => i.id)).toEqual(['fp', 'naoh']);
    expect(openLines.map((o) => o.n)).toEqual([0, 1, 2]);
    expect(buildSecondLookPrompt(openItems, openLines)).toContain('L1: Caustic soda flakes');
  });

  it('marks agreement as checked, places new matches as still to confirm, and ignores invented lines', () => {
    const r = read();
    const { openLines } = openForSecondLook(r, items);
    applySecondLook(r, items, openLines, {
      pairs: [
        { line: 0, item: 'fp', verdict: 'same', reason: 'Whatman No.1 is filter paper' },
        { line: 1, item: 'naoh', verdict: 'same', reason: 'Caustic soda is sodium hydroxide' },
        { line: 2, item: 'naoh', verdict: 'not', reason: 'a beaker' },
        { line: 9, item: 'fp', verdict: 'same', reason: 'made up' },
        { line: 2, item: 'ghost', verdict: 'same', reason: 'unknown id' },
      ],
    });
    expect(r.lines[0]).toMatchObject({ rfq_item_id: 'fp', checked: true, reason: 'Whatman No.1 is filter paper' });
    expect(r.lines[1]).toMatchObject({ rfq_item_id: 'naoh', uncertain: true, reason: 'Caustic soda is sodium hydroxide' });
    expect(r.lines[1].checked).toBeUndefined();
    expect(r.lines[2].rfq_item_id).toBeNull();
  });

  it('never removes a first-read guess — a person confirms it in one click', () => {
    const r = read();
    const { openLines } = openForSecondLook(r, items);
    applySecondLook(r, items, openLines, { pairs: [{ line: 0, item: 'fp', verdict: 'not', reason: 'unsure' }] });
    expect(r.lines[0]).toMatchObject({ rfq_item_id: 'fp', uncertain: true });
    expect(r.lines[0].checked).toBeUndefined();
  });
});

describe('dropped lines', () => {
  it('flags a reading with fewer lines than the quotation numbers, and asks for a re-read', async () => {
    const { checkQuotationMath, needsReread } = await import('../quotation-math');
    const lines = Array.from({ length: 39 }, (_, i) => ({ item_name: `L${i}`, unit_price: 10 }));
    const m = checkQuotationMath({ lines, last_serial_no: 59 });
    expect(m.issues[0]).toBe('The quotation numbers 59 lines, but 39 were read — 20 may be missing');
    expect(needsReread({ lines, last_serial_no: 59 })).toBe(true);
    expect(needsReread({ lines, last_serial_no: 39 })).toBe(false);
  });
});

describe('early stop on a long PDF', () => {
  it('counts PDF pages and treats a line or two from four pages as a failed reading', async () => {
    const { needsReread, pdfPageCount } = await import('../quotation-math');
    const fake = new TextEncoder().encode('<< /Type /Pages /Count 4 >> ' + '<< /Type /Page >> '.repeat(4));
    expect(pdfPageCount(fake)).toBe(4);
    expect(needsReread({ lines: [{ item_name: 'Molisch', unit_price: 135 }] }, 4)).toBe(true);
    expect(needsReread({ lines: [{ item_name: 'Molisch', unit_price: 135 }] }, 1)).toBe(false);
  });
});
