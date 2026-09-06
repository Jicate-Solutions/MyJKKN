import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseQuotationFile } from '@/lib/procurement/quotation-import';

// Build a File-like whose arrayBuffer() returns a real xlsx byte array.
function makeFile(rows: Record<string, unknown>[]): File {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Q');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return { arrayBuffer: async () => buf } as unknown as File;
}

const items = [
  { id: 'a1', item_name: 'AUTO CLOVE TRAY', quantity: 10 },
  { id: 'b2', item_name: 'Beaker 500ml', quantity: 5 },
];

describe('parseQuotationFile', () => {
  it('matches by rfq_item_id and strips currency symbols/commas', async () => {
    const f = makeFile([
      { rfq_item_id: 'a1', item_name: 'AUTO CLOVE TRAY', unit_price: '₹1,200.50' },
      { rfq_item_id: 'b2', item_name: 'Beaker 500ml', unit_price: 90 },
    ]);
    const r = await parseQuotationFile(f, items);
    expect(r.matched).toBe(2);
    expect(r.prices['a1']).toBeCloseTo(1200.5);
    expect(r.prices['b2']).toBe(90);
    expect(r.unmatched).toHaveLength(0);
  });

  it('falls back to case-insensitive item_name when id is absent, and reports unmatched', async () => {
    const f = makeFile([
      { item_name: 'beaker 500ml', unit_price: 88 }, // name-only, different case
      { item_name: 'Unknown Widget', unit_price: 50 }, // no matching RFQ line
    ]);
    const r = await parseQuotationFile(f, items);
    expect(r.prices['b2']).toBe(88);
    expect(r.unmatched).toContain('Unknown Widget');
  });

  it('tolerates alternate column headers (Price / Item)', async () => {
    const f = makeFile([{ Item: 'AUTO CLOVE TRAY', Price: '75' }]);
    const r = await parseQuotationFile(f, items);
    expect(r.prices['a1']).toBe(75);
  });

  it('ignores rows with blank or zero price', async () => {
    const f = makeFile([
      { rfq_item_id: 'a1', unit_price: '' },
      { rfq_item_id: 'b2', unit_price: 0 },
    ]);
    const r = await parseQuotationFile(f, items);
    expect(r.matched).toBe(0);
  });
});
