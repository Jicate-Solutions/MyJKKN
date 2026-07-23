// lib/procurement/quotation-import.ts
//
// Structured import for vendor quotations (PRD step 5). A store admin downloads a
// price template for an RFQ, the vendor (or admin) fills the unit_price column, and
// the filled CSV/Excel is parsed back into per-line prices — no manual re-keying.
//
// Matching is by rfq_item_id (embedded in the template) so prices land on the exact
// RFQ line even if rows are renamed/reordered; item_name is a case-insensitive
// fallback for hand-filled blank sheets. Parsing is tolerant of column-header casing
// and currency symbols/commas in the price cell.
//
// NOTE: PDFs are NOT auto-parsed — arbitrary vendor PDF layouts can't be mapped to
// item prices reliably. A PDF is kept as the attached reference document; its prices
// are entered via this template or manually.

import * as XLSX from 'xlsx';

export interface QuotationTemplateItem {
  id: string;
  item_name: string;
  item_spec?: string | null;
  quantity: number;
  unit_label?: string | null;
}

const TEMPLATE_COLUMNS = ['rfq_item_id', 'item_name', 'specification', 'quantity', 'unit', 'unit_price'] as const;

/** Build + download an xlsx price template pre-filled with the RFQ's line items. */
export function downloadQuotationTemplate(rfqNumber: string, items: QuotationTemplateItem[]): void {
  const rows = items.map((it) => ({
    rfq_item_id: it.id,
    item_name: it.item_name,
    specification: it.item_spec ?? '',
    quantity: it.quantity,
    unit: it.unit_label ?? '',
    unit_price: '', // vendor fills this
  }));
  const ws = XLSX.utils.json_to_sheet(rows, { header: TEMPLATE_COLUMNS as unknown as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Quotation');
  XLSX.writeFile(wb, `quotation-template-${rfqNumber}.xlsx`);
}

export interface ParsedQuotation {
  /** rfq_item_id -> unit_price */
  prices: Record<string, number>;
  matched: number;
  /** item names/rows that couldn't be matched to an RFQ line */
  unmatched: string[];
}

/** Parse a filled CSV/Excel back into per-line prices, matched to the RFQ's items. */
export async function parseQuotationFile(
  file: File,
  items: QuotationTemplateItem[]
): Promise<ParsedQuotation> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { prices: {}, matched: 0, unmatched: [] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const byId = new Map(items.map((i) => [i.id, i]));
  const byName = new Map(items.map((i) => [i.item_name.trim().toLowerCase(), i]));

  const prices: Record<string, number> = {};
  const unmatched: string[] = [];

  for (const row of rows) {
    const keys = Object.keys(row);
    const get = (...wants: string[]): unknown => {
      for (const want of wants) {
        const k = keys.find((kk) => kk.trim().toLowerCase() === want);
        if (k) return row[k];
      }
      return undefined;
    };

    const id = String(get('rfq_item_id') ?? '').trim();
    const name = String(get('item_name', 'item', 'description') ?? '').trim();
    const priceRaw = get('unit_price', 'price', 'rate', 'unit price');
    const price = Number(String(priceRaw ?? '').replace(/[^0-9.]/g, ''));
    if (!(price > 0)) continue;

    const item = (id && byId.get(id)) || (name && byName.get(name.toLowerCase()));
    if (item) prices[item.id] = price;
    else if (name) unmatched.push(name);
  }

  return { prices, matched: Object.keys(prices).length, unmatched };
}
