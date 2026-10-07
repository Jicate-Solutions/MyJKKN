/**
 * Vendor score — turns the raw KPIs from procurement_vendor_kpis() into a 0–100 score and a
 * grade. Weights live here (not in SQL) so they can be tuned with a reviewed, tested change.
 *
 * Design (docs/plans/2026-10-06-procurement-vendor-item-rating-loop.md):
 *  - 8 weighted parts, each a 0..1 value or null when there is no data for it yet.
 *  - Star averages are shrunk toward the global mean so one 5★ can't top the list.
 *  - "New" (no grade) until MIN_GRNS_FOR_GRADE verified deliveries.
 */

export interface VendorKpis {
  supplier_id: string;
  grn_count: number;
  on_time_eligible: number;
  on_time: number;
  ordered_qty: number;
  received_qty: number;
  accepted_qty: number;
  invoice_lines: number;
  invoice_matched: number;
  price_lines: number;
  price_held: number;
  delivery_star_sum: number;
  delivery_star_n: number;
  item_star_sum: number;
  item_star_n: number;
  quote_requests: number;
  quote_fast: number;
}

export interface RatingMeans {
  delivery_mean: number | null;
  item_mean: number | null;
}

export type Grade = 'A' | 'B' | 'C' | 'D';

export interface ScorePart {
  key: 'on_time' | 'fill' | 'acceptance' | 'item_stars' | 'invoice' | 'price' | 'delivery' | 'quote';
  label: string;
  weight: number;
  /** 0..1, or null when there is nothing to measure yet. */
  value: number | null;
}

export interface VendorScore {
  /** 0–100, or null when no part has data. Shown in the tooltip even while the vendor is New. */
  score: number | null;
  /** null while New or without a score. D = Watch. */
  grade: Grade | null;
  isNew: boolean;
  grnCount: number;
  parts: ScorePart[];
}

export const MIN_GRNS_FOR_GRADE = 3;
/** How many "average" ratings a vendor starts with — the shrinkage strength. */
const PRIOR_WEIGHT = 3;
/** Prior used before anyone has rated anything. */
const DEFAULT_MEAN = 4;

/** Bayesian average: (prior × mean + Σstars) / (prior + n). */
export function shrinkStars(sum: number, n: number, mean: number, prior = PRIOR_WEIGHT): number {
  return (prior * mean + sum) / (prior + n);
}

// PostgREST returns numeric columns as strings.
const num = (v: unknown) => Number(v) || 0;

function ratio(numerator: unknown, denominator: unknown): number | null {
  const d = num(denominator);
  return d > 0 ? Math.min(num(numerator) / d, 1) : null;
}

function stars01(sum: unknown, n: unknown, mean: number | null): number | null {
  const count = num(n);
  if (count <= 0) return null;
  return (shrinkStars(num(sum), count, mean == null ? DEFAULT_MEAN : Number(mean)) - 1) / 4;
}

export function gradeFor(score: number): Grade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

export const GRADE_LABEL: Record<Grade, string> = {
  A: 'Strong',
  B: 'Good',
  C: 'Fair',
  D: 'Watch',
};

export function computeVendorScore(k: VendorKpis, m: RatingMeans): VendorScore {
  const parts: ScorePart[] = [
    { key: 'on_time',    label: 'On time',              weight: 20, value: ratio(k.on_time, k.on_time_eligible) },
    { key: 'fill',       label: 'Full quantity',        weight: 10, value: ratio(k.received_qty, k.ordered_qty) },
    { key: 'acceptance', label: 'Accepted at receipt',  weight: 20, value: ratio(k.accepted_qty, k.received_qty) },
    { key: 'item_stars', label: 'Requester rating',     weight: 20, value: stars01(k.item_star_sum, k.item_star_n, m.item_mean) },
    { key: 'invoice',    label: 'Invoice matched',      weight: 10, value: ratio(k.invoice_matched, k.invoice_lines) },
    { key: 'price',      label: 'Price held',           weight: 5,  value: ratio(k.price_held, k.price_lines) },
    { key: 'delivery',   label: 'Store admin rating',   weight: 10, value: stars01(k.delivery_star_sum, k.delivery_star_n, m.delivery_mean) },
    { key: 'quote',      label: 'Quotes within 3 days', weight: 5,  value: ratio(k.quote_fast, k.quote_requests) },
  ];

  // Missing data: leave the part out and spread its weight over the parts that have data,
  // so a vendor is never punished for something nobody could measure yet. The New badge
  // (MIN_GRNS_FOR_GRADE) is what stops a thin record from earning a grade.
  const known = parts.filter((p) => p.value !== null);
  const totalWeight = known.reduce((s, p) => s + p.weight, 0);
  const score =
    totalWeight > 0
      ? Math.round((known.reduce((s, p) => s + p.weight * (p.value as number), 0) / totalWeight) * 100)
      : null;

  const grnCount = num(k.grn_count);
  const isNew = grnCount < MIN_GRNS_FOR_GRADE;
  return { score, grade: isNew || score === null ? null : gradeFor(score), isNew, grnCount, parts };
}
