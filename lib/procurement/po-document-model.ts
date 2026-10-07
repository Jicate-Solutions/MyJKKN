// lib/procurement/po-document-model.ts
//
// Resolves a PO + its selected document format into a render-ready model.
// Pure — no jsPDF/docx imports — consumed by both purchase-order-pdf.ts and
// purchase-order-docx.ts so the two renderers never diverge on what a PO
// document actually contains.
//
// The printed skeleton follows the institution's paper PO (one bordered table):
//   Ref / Date · PURCHASE ORDER
//   To M/s. vendor block | Proforma invoice quotation no. / Quotation date / Email-telephonic call dated
//   Items (columns come from the format)
//   Total · Round off · Grand Total
//   TERMS & CONDITION | ENCLOSURE | SPECIAL NOTE
// A format only changes the item columns and adds header fields; the skeleton stays.

import type {
  PoWithItems,
  ProcurementPurchaseOrderItem,
  ProcurementPoFormat,
  PoFieldSource,
  PoFieldFormat,
  PoItemColumnDef,
} from '@/types/procurement';
import { qtyWithPack } from './pack-size';

export interface ResolvedField {
  key: string;
  label: string;
  value: string;
}

export interface ResolvedItemRow {
  cells: { key: string; label: string; value: string; align?: 'left' | 'center' | 'right' }[];
}

export interface PoDocumentModel {
  refNo: string;
  refDate: string;
  vendor: { name: string; lines: string[]; phone: string };
  /** Right of the vendor block: quotation no., quotation date, call dated, then any extra format fields. */
  quoteFields: ResolvedField[];
  itemColumns: { key: string; label: string; align?: 'left' | 'center' | 'right' }[];
  itemRows: ResolvedItemRow[];
  /** Total / Round off / Grand Total rows under the items. */
  totals: ResolvedField[];
  terms: ResolvedField[];
  enclosure: { mode: string; dated: string; bank: string; amount: string };
  specialNote: string;
}

/** header_values.* keys the standard skeleton reads (editable in "Format fields"). */
const SKELETON_KEYS = new Set([
  'quotation_no',
  'quotation_date',
  'call_dated',
  'delivery',
  'warranty',
  'payment',
  'others',
  'payment_mode',
  'paid_on',
  'bank',
  'amount_paid',
]);

/**
 * Default layout — the institution's standard PO (dental-supplies style columns).
 * Used whenever a PO has no po_format_id assigned.
 */
export const STANDARD_PO_FORMAT: ProcurementPoFormat = {
  id: '',
  institution_id: '',
  name: 'Standard',
  description: 'Default layout (no vendor-specific customization).',
  is_default: false,
  is_active: true,
  header_fields: [
    { key: 'quotation_no', label: 'Quotation no.', source: 'header_values.quotation_no' },
    { key: 'quotation_date', label: 'Quotation date', source: 'header_values.quotation_date' },
    { key: 'call_dated', label: 'Email/telephonic call dated', source: 'header_values.call_dated' },
    { key: 'delivery', label: 'Delivery', source: 'header_values.delivery' },
    { key: 'warranty', label: 'Warranty', source: 'header_values.warranty' },
    { key: 'payment', label: 'Payment', source: 'header_values.payment' },
    { key: 'others', label: 'Others', source: 'header_values.others' },
    { key: 'payment_mode', label: 'Enclosure (Cheque No. / NEFT)', source: 'header_values.payment_mode' },
    { key: 'paid_on', label: 'Enclosure dated', source: 'header_values.paid_on' },
    { key: 'bank', label: 'Enclosure bank', source: 'header_values.bank' },
    { key: 'amount_paid', label: 'Enclosure amount (Rs.)', source: 'header_values.amount_paid' },
  ],
  item_columns: [
    { key: 'row_index', label: 'S. No', source: 'row_index', align: 'center' },
    { key: 'item_name', label: 'Description of Goods', source: 'calc.item_description', align: 'left' },
    { key: 'hsn', label: 'HSN/ SAC', source: 'item_extra.hsn', align: 'left' },
    { key: 'qty', label: 'Qty', source: 'calc.qty_with_unit', align: 'left' },
    { key: 'unit_price', label: 'Rate', source: 'item.unit_price', align: 'right', format: 'currency' },
    { key: 'line_total', label: 'Amount', source: 'item.line_total', align: 'right', format: 'currency' },
    { key: 'gst_percent', label: 'GST (%)', source: 'item_extra.gst_percent', align: 'center' },
    { key: 'gst_amount', label: 'GST (Rs.)', source: 'calc.gst_amount', align: 'right', format: 'currency' },
    { key: 'amount_with_gst', label: 'Grand Total', source: 'calc.amount_with_gst', align: 'right', format: 'currency' },
  ],
  footer_columns: [
    { key: 'special_note', title: 'Special note', freeText: true, source: 'footer_values.special_note' },
  ],
  terms_and_conditions_default: null,
  created_by: null,
  created_at: '',
  updated_at: '',
};

const rupees = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 2026-04-27 / ISO timestamp -> 27.04.2026 (the paper PO's date style). */
function dotDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : raw;
}

function formatValue(raw: unknown, format?: PoFieldFormat): string {
  if (raw === null || raw === undefined || raw === '') return '';
  switch (format) {
    case 'date':
      return dotDate(String(raw));
    case 'currency':
      return Number.isFinite(Number(raw)) ? rupees(Number(raw)) : String(raw);
    case 'percent':
      return `${raw}%`;
    default:
      return String(raw);
  }
}

const gstOn = (amount: number, pct: number) => Math.round(amount * pct) / 100;

/** GST on every line that has a rate, summed (0 when no line has one). */
export function poGstTotal(po: PoWithItems): number {
  return po.items.reduce((sum, it) => {
    const g = gstPercentOf(it);
    return g === null ? sum : sum + gstOn(Number(it.line_total), g);
  }, 0);
}

/** A line's GST %: typed on the order, else the vendor's quotation, else the item master. */
export function gstPercentOf(item: ProcurementPurchaseOrderItem): number | null {
  const own = item.extra_fields?.gst_percent;
  const raw = own !== undefined && own !== '' ? own : catalogExtra(item, 'gst_percent');
  const n = raw === undefined || raw === '' ? NaN : Number(String(raw).replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * "2 × 500 ml", not "2 ml". Chemicals are requested as "2" with unit "ml" and
 * the pack ("500 ml") in the specification — the quantity counts packs, so the
 * unit alone would tell the vendor to send 2 millilitres.
 */
const qtyWithUnit = (item: ProcurementPurchaseOrderItem) => qtyWithPack(item.ordered_quantity, item);

/** Name plus the specification the requester asked for ("4N Conc., 500 ml"). */
function itemDescription(item: ProcurementPurchaseOrderItem): string {
  const spec = item.item_spec?.trim();
  return spec ? `${item.item_name} (${spec})` : item.item_name;
}

function resolveValue(
  source: PoFieldSource,
  po: PoWithItems,
  ctx: { item?: ProcurementPurchaseOrderItem; rowIndex?: number } = {}
): unknown {
  if (source === 'row_index') return (ctx.rowIndex ?? 0) + 1;

  const [scope, ...rest] = source.split('.');
  const key = rest.join('.');
  const item = ctx.item;

  switch (scope) {
    case 'po':
      return (po as unknown as Record<string, unknown>)[key];
    case 'supplier':
      return po.supplier ? (po.supplier as unknown as Record<string, unknown>)[key] : undefined;
    case 'header_values': {
      const own = po.header_field_values?.[key];
      return own !== undefined && String(own).trim() ? own : suggestedHeaderValues(po)[key]?.value;
    }
    case 'footer_values':
      return po.footer_field_values?.[key];
    case 'item':
      return item ? (item as unknown as Record<string, unknown>)[key] : undefined;
    case 'item_extra': {
      if (!item) return undefined;
      const own = item.extra_fields?.[key];
      return own !== undefined && own !== '' ? own : catalogExtra(item, key);
    }
    case 'calc': {
      if (!item) return undefined;
      const gst = gstPercentOf(item);
      const amount = Number(item.line_total);
      if (key === 'qty_with_unit') return qtyWithUnit(item);
      if (key === 'item_description') return itemDescription(item);
      // A quoted rate is before GST (the vendor's "Total" column is rate + GST),
      // so GST is added on top of the amount.
      if (key === 'gst_amount') return gst === null ? undefined : gstOn(amount, gst);
      if (key === 'amount_with_gst') return gst === null ? amount : amount + gstOn(amount, gst);
      return undefined;
    }
    default:
      return undefined;
  }
}

function resolveItemCell(col: PoItemColumnDef, po: PoWithItems, item: ProcurementPurchaseOrderItem, rowIndex: number) {
  return {
    key: col.key,
    label: col.label,
    value: formatValue(resolveValue(col.source, po, { item, rowIndex }), col.format),
    align: col.align,
  };
}

/** DD-MM-YYYY, as typed on the order. */
const dmy = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}-${m}-${y}` : '';
};

/**
 * What each empty "printed on the order" box defaults to, and where it came from:
 * the vendor's quotation first, then what the last order to this vendor printed.
 * The page shows these filled in; the PDF prints them even before anyone saves.
 */
export function suggestedHeaderValues(po: PoWithItems): Record<string, { value: string; from: 'quotation' | 'last order' }> {
  const out: Record<string, { value: string; from: 'quotation' | 'last order' }> = {};
  for (const [k, v] of Object.entries(po.vendor_defaults ?? {})) {
    if (String(v ?? '').trim()) out[k] = { value: String(v), from: 'last order' };
  }
  const q = po.source_quotation;
  if (q?.vendor_quote_number) out.quotation_no = { value: q.vendor_quote_number, from: 'quotation' };
  if (q?.quote_date) out.quotation_date = { value: dmy(q.quote_date), from: 'quotation' };
  if (q?.delivery_time_days) out.delivery = { value: `${q.delivery_time_days} days`, from: 'quotation' };
  if (q?.payment_terms) out.payment = { value: q.payment_terms, from: 'quotation' };
  if (q?.warranty) out.warranty = { value: q.warranty, from: 'quotation' };
  return out;
}

/** What a printed order can't go out without; everything else may stay blank. */
export const PO_REQUIRED_FIELDS: Record<string, string> = {
  quotation_no: 'Quotation no.',
  quotation_date: 'Quotation date',
  delivery: 'Delivery',
  payment: 'Payment',
};

/** Required boxes still empty after the quotation / last order filled what they could. */
export function missingPoFields(po: PoWithItems): string[] {
  const suggested = suggestedHeaderValues(po);
  return Object.keys(PO_REQUIRED_FIELDS).filter(
    (k) => !String(po.header_field_values?.[k] ?? '').trim() && !suggested[k]?.value?.trim()
  );
}

/** An item's HSN / GST % when the order has none of its own: the item master. */
export function catalogExtra(item: ProcurementPurchaseOrderItem, key: string): string | undefined {
  if (key === 'hsn' && item.catalog?.hsn) return item.catalog.hsn;
  if (key === 'gst_percent' && item.catalog?.gst_percent != null) return String(item.catalog.gst_percent);
  return undefined;
}

export function resolvePoDocumentModel(po: PoWithItems): PoDocumentModel {
  const format = po.po_format ?? STANDARD_PO_FORMAT;
  const suggested = suggestedHeaderValues(po);
  const hv = (k: string) => (po.header_field_values?.[k] ?? '').trim() || suggested[k]?.value || '';
  const quote = po.source_quotation ?? null;

  // Vendor block: "M/s. NAME.," then the address lines, then the phone.
  const address = (po.supplier?.address ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const vendor = {
    name: `M/s. ${po.supplier?.name ?? ''}.,`,
    lines: address,
    phone: po.supplier?.phone ? `Ph : ${po.supplier.phone}` : '',
  };

  // Any other header field a custom format declares is shown under the quotation boxes.
  const extraHeader = format.header_fields
    .filter((f) => !(f.source.startsWith('header_values.') && SKELETON_KEYS.has(f.source.slice('header_values.'.length))))
    .map((f) => ({ key: f.key, label: f.label, value: formatValue(resolveValue(f.source, po), f.format) }))
    .filter((f) => f.value);

  const quoteFields: ResolvedField[] = [
    { key: 'quotation_no', label: 'PROFORMA INVOICE QUOTATION No.', value: hv('quotation_no') || quote?.vendor_quote_number || '' },
    { key: 'quotation_date', label: 'QUOTATION DATE', value: hv('quotation_date') || dotDate(quote?.quote_date) },
    { key: 'call_dated', label: 'EMAIL/TELEPHONIC CALL DATED', value: hv('call_dated') || '--' },
    ...extraHeader.map((f) => ({ ...f, label: f.label.toUpperCase() })),
  ];

  // Every column of the format prints, HSN / GST included — the institution's paper PO has them.
  const printedColumns = format.item_columns;
  const itemColumns = printedColumns.map((c) => ({ key: c.key, label: c.label, align: c.align }));
  const itemRows: ResolvedItemRow[] = po.items.map((item, i) => ({
    cells: printedColumns.map((c) => resolveItemCell(c, po, item, i)),
  }));

  // Total -> GST -> Round off -> Grand Total, rounded to the rupee as on the paper PO.
  const total = Number(po.total_amount);
  const gstTotal = Math.round(poGstTotal(po) * 100) / 100;
  const payable = total + gstTotal;
  const grand = Math.round(payable);
  const roundOff = +(grand - payable).toFixed(2);
  const totals: ResolvedField[] = [
    ...(gstTotal > 0 || roundOff !== 0 ? [{ key: 'total', label: 'Total', value: rupees(total) }] : []),
    ...(gstTotal > 0 ? [{ key: 'gst', label: 'GST', value: rupees(gstTotal) }] : []),
    ...(roundOff !== 0
      ? [{ key: 'round_off', label: `Round off (${roundOff > 0 ? '+' : '-'})`, value: Math.abs(roundOff).toFixed(2) }]
      : []),
    { key: 'grand_total', label: 'Grand Total', value: rupees(grand) },
  ];

  const delivery =
    hv('delivery') ||
    (po.expected_delivery_date ? `By ${dotDate(po.expected_delivery_date)}` : '') ||
    (quote?.delivery_time_days != null ? `${quote.delivery_time_days} days` : '') ||
    '--';
  const terms: ResolvedField[] = [
    { key: 'delivery', label: 'Delivery', value: delivery },
    { key: 'warranty', label: 'Warranty', value: hv('warranty') || '--' },
    { key: 'payment', label: 'Payment', value: hv('payment') || po.payment_terms || quote?.payment_terms || '--' },
    { key: 'others', label: 'Others', value: hv('others') || po.terms_and_conditions || po.vendor_default_terms || format.terms_and_conditions_default || '--' },
  ];

  const noteGroup = format.footer_columns.find((g) => g.freeText);
  const specialNote =
    (noteGroup?.source ? formatValue(resolveValue(noteGroup.source, po)) : '') ||
    (po.footer_field_values?.special_note ?? '') ||
    (gstTotal > 0 ? 'Prices including Delivery; GST as shown' : 'Prices including Tax & Delivery');

  return {
    // A renegotiated order keeps its number; the vendor sees which revision this is.
    refNo: po.revision_no ? `${po.po_number} (Rev ${po.revision_no})` : po.po_number,
    refDate: dotDate(po.approved_at ?? po.created_at),
    vendor,
    quoteFields,
    itemColumns,
    itemRows,
    totals,
    terms,
    enclosure: {
      mode: hv('payment_mode') || 'Cheque No.',
      dated: hv('paid_on'),
      bank: hv('bank'),
      amount: hv('amount_paid'),
    },
    specialNote,
  };
}
