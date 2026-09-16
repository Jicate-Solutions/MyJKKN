// lib/procurement/comparison-rows.ts
//
// Item-wise quotation comparison, with no client/server dependencies.

import type { ComparisonRow, QuotationWithItems } from '@/types/procurement';

/**
 * Pure builder for the item-wise comparison — one row per RFQ item with every
 * vendor's quote + the lowest price. Extracted so the client can compute it from
 * already-loaded RFQ items + quotations WITHOUT a second server round-trip (the
 * quotations page already holds both), and so the service can reuse it on the server.
 */
export function buildComparisonRows(
  rfqItems: Array<{
    id: string;
    item_name: string;
    item_spec: string | null;
    quantity: number;
    unit_label: string | null;
    is_chemical?: boolean;
  }>,
  quotations: QuotationWithItems[]
): ComparisonRow[] {
  return rfqItems.map((ri): ComparisonRow => {
    const quotes = quotations
      .flatMap((q) =>
        q.items
          .filter((qi) => qi.rfq_item_id === ri.id)
          .map((qi) => ({
            quotation_id: q.id,
            quotation_item_id: qi.id,
            supplier_id: q.supplier_id,
            supplier_name: q.supplier?.name ?? q.supplier_id,
            unit_price: qi.unit_price,
            quantity: qi.quantity,
            delivery_time_days: qi.delivery_time_days,
            manufacturer: qi.manufacturer,
            quality_grade: qi.quality_grade,
            concentration: qi.concentration,
            other_specs: qi.other_specs,
            awarded: qi.awarded,
          }))
      )
      // Not-quoted (unit_price null) sorts last — plain `a - b` would coerce null to 0
      // and put "didn't quote this" ahead of every real price.
      .sort((a, b) => {
        if (a.unit_price === null) return b.unit_price === null ? 0 : 1;
        if (b.unit_price === null) return -1;
        return a.unit_price - b.unit_price;
      });
    const lowestQuote = quotes.find((q) => q.unit_price !== null);
    return {
      rfq_item_id: ri.id,
      item_name: ri.item_name,
      item_spec: ri.item_spec,
      quantity: ri.quantity,
      unit_label: ri.unit_label,
      is_chemical: ri.is_chemical ?? false,
      quotes,
      lowest_price: lowestQuote ? lowestQuote.unit_price : null,
    };
  });
}
