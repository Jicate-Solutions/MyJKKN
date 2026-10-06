// lib/procurement/price-checks.ts
//
// The one place that decides whether a quoted price can be trusted. The compare
// table, "Choose lowest" and Ask AI all use these, so a ₹0.01 placeholder can no
// longer win "lowest" in one place while the AI ignores it in another.

import { isSuspectPrice } from '@/lib/procurement/quotation-compare-facts';

export { isSuspectPrice };

/** The cheapest price that isn't a suspect placeholder; null when none is usable. */
export function trustedLowest<T extends { price: number }>(quotes: T[]): T | null {
  let best: T | null = null;
  for (const q of quotes) {
    const others = quotes.filter((o) => o !== q).map((o) => o.price);
    if (isSuspectPrice(q.price, others)) continue;
    if (!best || q.price < best.price) best = q;
  }
  return best;
}

/**
 * A price 5× away from the average of the other vendors' prices for the same item
 * is almost always a misread (a total read as a unit price, a missing zero).
 */
export function priceWarning(price: number, otherPrices: number[]): string | null {
  if (isSuspectPrice(price, otherPrices)) return 'Looks like a placeholder price — check the quote';
  if (!otherPrices.length) return null;
  const ref = otherPrices.reduce((a, b) => a + b, 0) / otherPrices.length;
  if (price * 5 < ref) return 'Far lower than others — check the quote';
  if (price > ref * 5) return 'Far higher than others — check the quote';
  return null;
}
