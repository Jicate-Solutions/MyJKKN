// Vendor & item ratings (procurement_ratings) — see
// docs/plans/2026-10-06-procurement-vendor-item-rating-loop.md

export type RatingKind = 'delivery' | 'item_quality';
export type MeetsSpec = 'yes' | 'partly' | 'no';

export interface ProcurementRating {
  id: string;
  kind: RatingKind;
  grn_id: string;
  grn_item_id: string | null;
  supplier_id: string;
  item_id: string | null;
  manufacturer: string | null;
  request_id: string | null;
  rater_id: string;
  stars: number;
  meets_spec: MeetsSpec | null;
  tags: string[];
  comment: string | null;
  created_at: string;
  updated_at: string;
}

/** One accepted GRN line the requester can rate (procurement_rateable_lines). */
export interface RateableLine {
  grn_item_id: string;
  grn_id: string;
  grn_number: string;
  received_on: string;
  item_name: string;
  accepted_quantity: number;
  supplier_id: string;
  supplier_name: string;
  manufacturer: string | null;
  my_stars: number | null;
  my_meets_spec: MeetsSpec | null;
  my_comment: string | null;
}

/** Item × vendor × manufacturer rating summary (procurement_item_vendor_ratings). */
export interface ItemVendorRating {
  item_id: string;
  supplier_id: string;
  supplier_name: string;
  manufacturer: string | null;
  star_sum: number;
  star_n: number;
  meets_no: number;
  latest_comment: string | null;
  last_rated_at: string;
}

export const DELIVERY_TAGS = [
  'Damaged packing',
  'Wrong documents',
  'Late without notice',
  'Courteous',
] as const;
