// lib/procurement/po-document-model.ts
//
// Resolves a PO + its selected document format into a render-ready model.
// Pure — no jsPDF/docx imports — consumed by both purchase-order-pdf.ts and
// purchase-order-docx.ts so the two renderers never diverge on what a PO
// document actually contains.

import type {
  PoWithItems,
  ProcurementPurchaseOrderItem,
  ProcurementPoFormat,
  PoFieldSource,
  PoFieldFormat,
  PoHeaderFieldDef,
  PoItemColumnDef,
  PoFooterColumnDef,
} from '@/types/procurement';
import { formatDateDMY } from '@/lib/utils/date-format';

export interface ResolvedField {
  key: string;
  label: string;
  value: string;
}

export interface ResolvedItemRow {
  cells: { key: string; label: string; value: string; align?: 'left' | 'center' | 'right' }[];
}

export interface ResolvedFooterGroup {
  title: string;
  freeText?: boolean;
  text?: string;
  fields?: ResolvedField[];
}

export interface PoDocumentModel {
  orgName: string;
  poNumber: string;
  headerFields: ResolvedField[];
  itemColumns: { key: string; label: string; align?: 'left' | 'center' | 'right' }[];
  itemRows: ResolvedItemRow[];
  totals: { subtotal: number; tax: number; total: number };
  footerGroups: ResolvedFooterGroup[];
  termsAndConditions: string | null;
}

/**
 * Reproduces today's hardcoded PDF layout exactly: no per-vendor footer, no
 * item_extra columns. Used whenever a PO has no po_format_id assigned, so
 * existing documents keep rendering unchanged.
 */
export const STANDARD_PO_FORMAT: ProcurementPoFormat = {
  id: '',
  institution_id: '',
  name: 'Standard',
  description: 'Default layout (no vendor-specific customization).',
  is_default: false,
  is_active: true,
  header_fields: [
    { key: 'po_number', label: 'PO No', source: 'po.po_number' },
    { key: 'created_at', label: 'Date', source: 'po.created_at', format: 'date' },
    { key: 'vendor_name', label: 'Vendor', source: 'supplier.name' },
    { key: 'vendor_gstin', label: 'Vendor GSTIN', source: 'supplier.gstin' },
    { key: 'payment_terms', label: 'Payment terms', source: 'po.payment_terms' },
    { key: 'expected_delivery_date', label: 'Expected delivery', source: 'po.expected_delivery_date', format: 'date' },
  ],
  item_columns: [
    { key: 'row_index', label: '#', source: 'row_index', align: 'left' },
    { key: 'item_name', label: 'Item', source: 'item.item_name', align: 'left' },
    { key: 'item_spec', label: 'Specification', source: 'item.item_spec', align: 'left' },
    { key: 'ordered_quantity', label: 'Qty', source: 'item.ordered_quantity', align: 'left' },
    { key: 'unit_label', label: 'Unit', source: 'item.unit_label', align: 'left' },
    { key: 'unit_price', label: 'Unit Price', source: 'item.unit_price', align: 'right', format: 'currency' },
    { key: 'line_total', label: 'Line Total', source: 'item.line_total', align: 'right', format: 'currency' },
  ],
  footer_columns: [],
  terms_and_conditions_default: null,
  created_by: null,
  created_at: '',
  updated_at: '',
};

function formatValue(raw: unknown, format?: PoFieldFormat): string {
  if (raw === null || raw === undefined || raw === '') return format ? '-' : '';
  switch (format) {
    case 'date':
      return formatDateDMY(String(raw));
    case 'currency':
      return Number(raw).toLocaleString();
    case 'percent':
      return `${raw}%`;
    default:
      return String(raw);
  }
}

function resolveValue(
  source: PoFieldSource,
  po: PoWithItems,
  ctx: { item?: ProcurementPurchaseOrderItem; rowIndex?: number } = {}
): unknown {
  if (source === 'row_index') return (ctx.rowIndex ?? 0) + 1;

  const [scope, ...rest] = source.split('.');
  const key = rest.join('.');

  switch (scope) {
    case 'po':
      return (po as unknown as Record<string, unknown>)[key];
    case 'supplier':
      return po.supplier ? (po.supplier as unknown as Record<string, unknown>)[key] : undefined;
    case 'header_values':
      return po.header_field_values?.[key];
    case 'footer_values':
      return po.footer_field_values?.[key];
    case 'item':
      return ctx.item ? (ctx.item as unknown as Record<string, unknown>)[key] : undefined;
    case 'item_extra':
      return ctx.item ? ctx.item.extra_fields?.[key] : undefined;
    default:
      return undefined;
  }
}

function resolveHeaderField(field: PoHeaderFieldDef, po: PoWithItems): ResolvedField {
  return {
    key: field.key,
    label: field.label,
    value: formatValue(resolveValue(field.source, po), field.format),
  };
}

function resolveItemCell(col: PoItemColumnDef, po: PoWithItems, item: ProcurementPurchaseOrderItem, rowIndex: number) {
  return {
    key: col.key,
    label: col.label,
    value: formatValue(resolveValue(col.source, po, { item, rowIndex }), col.format),
    align: col.align,
  };
}

function resolveFooterGroup(group: PoFooterColumnDef, po: PoWithItems): ResolvedFooterGroup {
  if (group.freeText) {
    const text = group.source ? formatValue(resolveValue(group.source, po)) : '';
    return { title: group.title, freeText: true, text: text || undefined };
  }
  const fields = (group.fields || [])
    .map((f) => ({ key: f.key, label: f.label, value: formatValue(resolveValue(f.source, po)) }))
    .filter((f) => f.value);
  return { title: group.title, fields };
}

export function resolvePoDocumentModel(po: PoWithItems, orgName = 'JKKN'): PoDocumentModel {
  const format = po.po_format ?? STANDARD_PO_FORMAT;

  const headerFields = format.header_fields.map((f) => resolveHeaderField(f, po)).filter((f) => f.value);

  const itemColumns = format.item_columns.map((c) => ({ key: c.key, label: c.label, align: c.align }));
  const itemRows: ResolvedItemRow[] = po.items.map((item, i) => ({
    cells: format.item_columns.map((c) => resolveItemCell(c, po, item, i)),
  }));

  const footerGroups = format.footer_columns
    .map((g) => resolveFooterGroup(g, po))
    .filter((g) => g.freeText ? !!g.text : (g.fields?.length ?? 0) > 0);

  return {
    orgName,
    poNumber: po.po_number,
    headerFields,
    itemColumns,
    itemRows,
    totals: {
      subtotal: Number(po.subtotal),
      tax: Number(po.tax_amount),
      total: Number(po.total_amount),
    },
    footerGroups,
    termsAndConditions: po.terms_and_conditions || format.terms_and_conditions_default || null,
  };
}
