// Turns the rating-loop read RPCs into the per-vendor history the Ask AI facts carry.
// Pure: the route fetches, this shapes.

import { computeVendorScore, shrinkStars, type RatingMeans, type VendorKpis } from './vendor-score';
import type { VendorHistory } from './quotation-compare-facts';
import type { ItemVendorRating } from '@/types/procurement';

/**
 * An item's rating counts as poor at or below this SHRUNK average (prior 3 × the global
 * mean, ~4), or with any "not to spec". Calibrated: one 1★ → 3.25 (an outlier, not
 * flagged); two 1★ → 2.8 and four 1.5★ → 2.57 (flagged).
 */
export const POOR_ITEM_STARS = 3;

/** Poor = shrunk average at/below POOR_ITEM_STARS, or anyone said it was not to spec. */
export function isPoorItemRating(r: Pick<ItemVendorRating, 'star_sum' | 'star_n' | 'meets_no'>, itemMean = 4): boolean {
  return shrinkStars(Number(r.star_sum), Number(r.star_n), itemMean) <= POOR_ITEM_STARS || Number(r.meets_no) > 0;
}

/** What people actually gave, to one decimal — for display. */
export const rawAverage = (r: Pick<ItemVendorRating, 'star_sum' | 'star_n'>) =>
  Math.round((Number(r.star_sum) / Number(r.star_n)) * 10) / 10;

export function buildVendorHistory(
  kpis: VendorKpis[],
  means: RatingMeans,
  itemRatings: ItemVendorRating[],
  itemNameById: Map<string, string>,
): Map<string, VendorHistory> {
  const out = new Map<string, VendorHistory>();
  const itemMean = means.item_mean == null ? 4 : Number(means.item_mean);
  for (const k of kpis) {
    const s = computeVendorScore(k, means);
    const low = itemRatings
      .filter((r) => r.supplier_id === k.supplier_id && isPoorItemRating(r, itemMean))
      .map((r) => ({
        item: itemNameById.get(r.item_id) ?? 'item',
        avg_stars: rawAverage(r),
        ratings: Number(r.star_n),
        comment: r.latest_comment,
      }));
    out.set(k.supplier_id, { score: s.score, grade: s.grade, deliveries: s.grnCount, low_item_ratings: low });
  }
  return out;
}
