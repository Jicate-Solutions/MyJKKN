// lib/procurement/quotation-compare-facts.ts
//
// Every number the quotation-compare chat is allowed to state, computed here.
// The model explains these figures; it never does its own arithmetic. Items and
// vendors get short refs (I1, V2) so the model can point at them in a tool call
// without copying UUIDs.
//
// Line totals are priced at the REQUESTED quantity, so vendors are compared like
// for like. A vendor offering a different quantity is flagged, not re-priced.
//
// Suspect prices: people enter Rs 0.01 for "didn't really quote". Such a price
// would win every comparison, so it is flagged and left out of lowest prices,
// vendor totals and every scenario.

import { buildComparisonRows } from '@/lib/procurement/comparison-rows';
import type { QuotationWithItems } from '@/types/procurement';

export interface CompareRfqInput {
  id: string;
  rfq_number: string;
  status: string;
  items: Array<{
    id: string;
    item_name: string;
    item_spec: string | null;
    quantity: number;
    unit_label: string | null;
    is_chemical?: boolean;
  }>;
}

export interface FactQuote {
  vendor_ref: string;
  vendor: string;
  supplier_id: string;
  quotation_item_id: string;
  unit_price: number | null;
  qty_offered: number | null;
  /** unit_price × requested quantity; null when not quoted. */
  line_total: number | null;
  delivery_days: number | null;
  offered: string | null;
  remarks: string | null;
  awarded: boolean;
  is_lowest: boolean;
  /** Price looks like a data-entry placeholder; excluded from all totals. */
  suspect: boolean;
}

export interface FactItem {
  ref: string;
  rfq_item_id: string;
  name: string;
  spec: string | null;
  quantity: number;
  unit: string | null;
  quotes: FactQuote[];
  priced_quotes: number;
  lowest_price: number | null;
  highest_price: number | null;
  /** (highest − lowest) / lowest × 100, rounded; null with fewer than 2 prices. */
  spread_pct: number | null;
  awarded_vendor: string | null;
  awarded_line_total: number | null;
}

export interface FactVendor {
  ref: string;
  supplier_id: string;
  name: string;
  quote_number: string | null;
  quote_date: string | null;
  validity_date: string | null;
  validity_expired: boolean;
  payment_terms: string | null;
  delivery_days: number | null;
  items_quoted: number;
  covers_all_items: boolean;
  /** Sum of this vendor's usable line totals. */
  quoted_total: number;
  /** quoted_total minus the cheapest full-coverage vendor's total; null unless this vendor covers every item. */
  above_cheapest_full: number | null;
  suspect_prices: number;
  notes: string | null;
}

export interface ScenarioLine {
  item_ref: string;
  vendor_ref: string;
  vendor: string;
  line_total: number;
}

/** A plan's amount per vendor, so the model never has to add lines up. */
export interface VendorSubtotal {
  vendor_ref: string;
  vendor: string;
  item_refs: string[];
  subtotal: number;
}

function subtotalsByVendor(lines: ScenarioLine[]): VendorSubtotal[] {
  const map = new Map<string, VendorSubtotal>();
  for (const l of lines) {
    const cur = map.get(l.vendor_ref) ?? { vendor_ref: l.vendor_ref, vendor: l.vendor, item_refs: [], subtotal: 0 };
    cur.item_refs.push(l.item_ref);
    cur.subtotal = Math.round((cur.subtotal + l.line_total) * 100) / 100;
    map.set(l.vendor_ref, cur);
  }
  return [...map.values()].sort((a, b) => a.vendor_ref.localeCompare(b.vendor_ref, 'en', { numeric: true }));
}

export interface CompareFacts {
  rfq: { id: string; rfq_number: string; status: string };
  today: string;
  items: FactItem[];
  vendors: FactVendor[];
  scenarios: {
    cheapest_split: {
      total: number;
      lines: ScenarioLine[];
      by_vendor: VendorSubtotal[];
      items_without_quotes: string[];
    };
    best_single_vendor: { vendor_ref: string; vendor: string; total: number } | null;
    /** best_single_vendor.total − cheapest_split.total, when both are complete. */
    split_saving: number | null;
    current_award: { total: number; awarded_items: number; total_items: number; by_vendor: VendorSubtotal[] };
    /** current_award.total minus cheapest_split.total, when every item is awarded and priced. */
    current_above_split: number | null;
    /** current_award.total minus best_single_vendor.total, when every item is awarded. */
    current_above_single: number | null;
    suspect_price_count: number;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A classic placeholder, or under 2% of the median of the item's other prices. */
export function isSuspectPrice(price: number, otherPrices: number[]): boolean {
  if (price <= 0.01) return true;
  if (!otherPrices.length) return false;
  const sorted = [...otherPrices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return price < median * 0.02;
}

export function buildCompareFacts(
  rfq: CompareRfqInput,
  quotations: QuotationWithItems[],
  today: string = new Date().toISOString().slice(0, 10),
): CompareFacts {
  const rows = buildComparisonRows(rfq.items, quotations);

  // Vendor refs in the order quotations arrived.
  const vendorRef = new Map<string, string>();
  quotations.forEach((q, i) => vendorRef.set(q.supplier_id, `V${i + 1}`));

  const items: FactItem[] = rows.map((row, i) => {
    const suspectIds = new Set(
      row.quotes
        .filter((q, qi) => {
          if (q.unit_price === null) return false;
          const others = row.quotes
            .filter((o, oi) => oi !== qi && o.unit_price !== null)
            .map((o) => o.unit_price as number);
          return isSuspectPrice(q.unit_price, others);
        })
        .map((q) => q.quotation_item_id),
    );
    const prices = row.quotes
      .filter((q) => q.unit_price !== null && !suspectIds.has(q.quotation_item_id))
      .map((q) => q.unit_price as number);
    const lowest = prices.length ? Math.min(...prices) : null;
    const highest = prices.length ? Math.max(...prices) : null;
    const quotes: FactQuote[] = row.quotes.map((q) => ({
      vendor_ref: vendorRef.get(q.supplier_id) ?? '?',
      vendor: q.supplier_name,
      supplier_id: q.supplier_id,
      quotation_item_id: q.quotation_item_id,
      unit_price: q.unit_price,
      qty_offered: q.quantity,
      line_total: q.unit_price === null ? null : round2(q.unit_price * row.quantity),
      delivery_days: q.delivery_time_days,
      offered:
        [q.manufacturer, q.quality_grade, row.is_chemical ? q.concentration : null, q.other_specs]
          .filter(Boolean)
          .join(' · ') || null,
      remarks: null,
      awarded: q.awarded,
      is_lowest: q.unit_price !== null && !suspectIds.has(q.quotation_item_id) && q.unit_price === lowest,
      suspect: suspectIds.has(q.quotation_item_id),
    }));
    const awarded = quotes.find((q) => q.awarded) ?? null;
    return {
      ref: `I${i + 1}`,
      rfq_item_id: row.rfq_item_id,
      name: row.item_name,
      spec: row.item_spec,
      quantity: row.quantity,
      unit: row.unit_label,
      quotes,
      priced_quotes: prices.length,
      lowest_price: lowest,
      highest_price: highest,
      spread_pct:
        prices.length >= 2 && lowest && highest !== null
          ? Math.round(((highest - lowest) / lowest) * 100)
          : null,
      awarded_vendor: awarded?.vendor ?? null,
      awarded_line_total: awarded?.line_total ?? null,
    };
  });

  // Remarks live on quotation lines; attach them (vendor text — untrusted data).
  const remarksById = new Map<string, string | null>();
  for (const q of quotations) for (const qi of q.items) remarksById.set(qi.id, qi.remarks ?? null);
  for (const it of items) for (const q of it.quotes) q.remarks = remarksById.get(q.quotation_item_id) ?? null;

  const vendors: FactVendor[] = quotations.map((q) => {
    const ref = vendorRef.get(q.supplier_id) ?? '?';
    const priced = items.flatMap((it) =>
      it.quotes.filter((x) => x.supplier_id === q.supplier_id && x.line_total !== null),
    );
    const mine = priced.filter((x) => !x.suspect);
    return {
      ref,
      supplier_id: q.supplier_id,
      name: q.supplier?.name ?? q.supplier_id,
      quote_number: q.vendor_quote_number,
      quote_date: q.quote_date,
      validity_date: q.validity_date,
      validity_expired: !!q.validity_date && q.validity_date < today,
      payment_terms: q.payment_terms,
      delivery_days: q.delivery_time_days,
      items_quoted: mine.length,
      covers_all_items: items.length > 0 && mine.length === items.length,
      quoted_total: round2(mine.reduce((s, x) => s + (x.line_total ?? 0), 0)),
      above_cheapest_full: null,
      suspect_prices: priced.length - mine.length,
      notes: q.notes,
    };
  });

  // Cheapest split: lowest priced line per item (ties → first vendor to quote).
  const splitLines: ScenarioLine[] = [];
  const withoutQuotes: string[] = [];
  for (const it of items) {
    const best = it.quotes
      .filter((q) => q.line_total !== null && !q.suspect)
      .sort((a, b) => a.line_total! - b.line_total!)[0];
    if (best) {
      splitLines.push({ item_ref: it.ref, vendor_ref: best.vendor_ref, vendor: best.vendor, line_total: best.line_total! });
    } else {
      withoutQuotes.push(it.ref);
    }
  }
  const splitTotal = round2(splitLines.reduce((s, l) => s + l.line_total, 0));

  const fullVendors = vendors.filter((v) => v.covers_all_items).sort((a, b) => a.quoted_total - b.quoted_total);
  const bestSingle = fullVendors[0]
    ? { vendor_ref: fullVendors[0].ref, vendor: fullVendors[0].name, total: fullVendors[0].quoted_total }
    : null;
  if (bestSingle) {
    for (const v of fullVendors) v.above_cheapest_full = round2(v.quoted_total - bestSingle.total);
  }

  const awardedLines = items.filter((it) => it.awarded_line_total !== null);
  const currentLines: ScenarioLine[] = items.flatMap((it) =>
    it.quotes
      .filter((q) => q.awarded && q.line_total !== null)
      .map((q) => ({ item_ref: it.ref, vendor_ref: q.vendor_ref, vendor: q.vendor, line_total: q.line_total! })),
  );
  const currentTotal = round2(awardedLines.reduce((s, it) => s + (it.awarded_line_total ?? 0), 0));
  const allAwarded = items.length > 0 && awardedLines.length === items.length;
  const splitComplete = withoutQuotes.length === 0;

  return {
    rfq: { id: rfq.id, rfq_number: rfq.rfq_number, status: rfq.status },
    today,
    items,
    vendors,
    scenarios: {
      cheapest_split: {
        total: splitTotal,
        lines: splitLines,
        by_vendor: subtotalsByVendor(splitLines),
        items_without_quotes: withoutQuotes,
      },
      best_single_vendor: bestSingle,
      split_saving: bestSingle && withoutQuotes.length === 0 ? round2(bestSingle.total - splitTotal) : null,
      current_award: {
        total: currentTotal,
        awarded_items: awardedLines.length,
        total_items: items.length,
        by_vendor: subtotalsByVendor(currentLines),
      },
      current_above_split: allAwarded && splitComplete ? round2(currentTotal - splitTotal) : null,
      current_above_single: allAwarded && bestSingle ? round2(currentTotal - bestSingle.total) : null,
      suspect_price_count: items.reduce((n, it) => n + it.quotes.filter((q) => q.suspect).length, 0),
    },
  };
}

const inr = (n: number | null) =>
  n === null ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
// Vendor-supplied text goes into table cells: keep it on one line and unable to
// break the table structure.
const cell = (s: string | null | undefined) =>
  s ? s.replace(/[\r\n|]+/g, ' ').slice(0, 160) : '—';

/** Compact markdown for the system prompt. */
export function renderFactsForPrompt(f: CompareFacts): string {
  const out: string[] = [];
  out.push(`RFQ ${f.rfq.rfq_number} · status ${f.rfq.status} · today ${f.today}`);
  out.push('Line totals are unit price × REQUESTED quantity.');

  out.push('\n### Vendors');
  out.push(
    '| Ref | Vendor | Items with usable price | Total of those | Above cheapest full vendor | Delivery | Payment terms | Valid until | Quote # |',
  );
  out.push('|---|---|---|---|---|---|---|---|---|');
  for (const v of f.vendors) {
    out.push(
      `| ${v.ref} | ${cell(v.name)} | ${v.items_quoted}/${f.items.length}${v.covers_all_items ? ' (all)' : ''}${
        v.suspect_prices ? ` (+${v.suspect_prices} suspect)` : ''
      } | ${inr(v.quoted_total)} | ${v.above_cheapest_full === null ? '—' : inr(v.above_cheapest_full)} | ${
        v.delivery_days ?? '—'
      }${v.delivery_days !== null ? 'd' : ''} | ${cell(v.payment_terms)} | ${v.validity_date ?? '—'}${
        v.validity_expired ? ' (EXPIRED)' : ''
      } | ${cell(v.quote_number)} |`,
    );
  }

  out.push('\n### Items');
  for (const it of f.items) {
    const head = [`${it.ref}: ${cell(it.name)} — requested ${it.quantity} ${it.unit ?? ''}`.trim()];
    if (it.spec) head.push(`spec: ${cell(it.spec)}`);
    if (it.spread_pct !== null) head.push(`highest usable price is ${it.spread_pct}% above the lowest`);
    if (it.priced_quotes === 0) head.push('NO PRICED QUOTES');
    else if (it.priced_quotes === 1) head.push('ONLY ONE PRICED QUOTE');
    head.push(it.awarded_vendor ? `awarded to ${cell(it.awarded_vendor)}` : 'not awarded');
    out.push(head.join(' · '));
    out.push('| Vendor | Unit price | Line total | Qty offered | Delivery | Offered | Remarks |');
    out.push('|---|---|---|---|---|---|---|');
    for (const q of it.quotes) {
      const qtyNote =
        q.qty_offered !== null && q.qty_offered !== it.quantity ? `${q.qty_offered} (differs)` : q.qty_offered ?? '—';
      out.push(
        `| ${q.vendor_ref} ${cell(q.vendor)}${q.awarded ? ' [AWARDED]' : ''}${q.is_lowest ? ' [LOWEST]' : ''}${
          q.suspect ? ' [SUSPECT PRICE, likely a placeholder, excluded from totals]' : ''
        } | ${
          q.unit_price === null ? 'not quoted' : inr(q.unit_price)
        } | ${inr(q.line_total)} | ${qtyNote} | ${q.delivery_days ?? '—'} | ${cell(q.offered)} | ${cell(q.remarks)} |`,
      );
    }
  }

  const s = f.scenarios;
  out.push('\n### Scenarios (pre-computed — quote these, never add or subtract amounts yourself)');
  if (s.suspect_price_count) {
    out.push(
      `- ${s.suspect_price_count} price(s) are marked SUSPECT and excluded from everything below. They should be checked with the vendor.`,
    );
  }
  out.push(
    `- Cheapest split award: ${inr(s.cheapest_split.total)} — ` +
      (s.cheapest_split.lines.map((l) => `${l.item_ref}→${l.vendor_ref}`).join(', ') || 'nothing priced') +
      (s.cheapest_split.items_without_quotes.length
        ? ` (no quotes for ${s.cheapest_split.items_without_quotes.join(', ')})`
        : ''),
  );
  out.push(
    s.best_single_vendor
      ? `- Cheapest single vendor for ALL items: ${s.best_single_vendor.vendor_ref} ${cell(s.best_single_vendor.vendor)} at ${inr(
          s.best_single_vendor.total,
        )}`
      : '- No vendor has a usable price for every item, so a single-vendor award is not possible.',
  );
  const bySub = (subs: VendorSubtotal[]) =>
    subs.map((v) => `${v.vendor_ref} ${cell(v.vendor)} ${inr(v.subtotal)} (${v.item_refs.join(', ')})`).join('; ');
  if (s.cheapest_split.by_vendor.length) out.push(`  - Split per vendor (items this plan gives them): ${bySub(s.cheapest_split.by_vendor)}`);
  if (s.split_saving !== null) out.push(`- Splitting saves ${inr(s.split_saving)} versus the cheapest single vendor.`);
  out.push(
    `- Current awards: ${s.current_award.awarded_items} of ${s.current_award.total_items} items, total ${inr(
      s.current_award.total,
    )}`,
  );
  if (s.current_award.by_vendor.length) out.push(`  - Current awards per vendor (items awarded to them): ${bySub(s.current_award.by_vendor)}`);
  if (s.current_above_split !== null) {
    out.push(`- Current awards cost ${inr(s.current_above_split)} more than the cheapest split (negative means less).`);
  }
  if (s.current_above_single !== null) {
    out.push(
      `- Current awards cost ${inr(s.current_above_single)} more than the cheapest single vendor (negative means less).`,
    );
  }
  return out.join('\n');
}
