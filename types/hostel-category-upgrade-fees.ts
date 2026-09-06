// Category upgrade fees — explicit from→to upgrade pricing (room or mess), per hostel
// year. Each row is EXACTLY ONE kind: a room pair (from/to hostel category) or a mess
// pair (from/to mess category). Enforced by the chk_upgrade_one_kind CHECK.

export type UpgradeFeeKind = 'room' | 'mess';

/** Gender bucket of a category — both room and mess categories are gender-typed,
 *  so every upgrade-fee pair is implicitly scoped to one hostel type. */
export type UpgradeFeeGender = 'boys' | 'girls' | 'mixed';

export const UPGRADE_FEE_GENDER_LABELS: Record<UpgradeFeeGender, string> = {
  boys: 'Boys',
  girls: 'Girls',
  mixed: 'Mixed',
};

/** How a concession on an upgrade is expressed: a flat rupee cut or a percentage. */
export type UpgradeDiscountType = 'amount' | 'percent';

export const UPGRADE_DISCOUNT_TYPE_LABELS: Record<UpgradeDiscountType, string> = {
  amount: 'Flat (₹)',
  percent: 'Percent (%)',
};

export interface UpgradeFee {
  id: string;
  hostel_year_id: string;
  from_hostel_category_id: string | null;
  to_hostel_category_id: string | null;
  from_mess_category_id: string | null;
  to_mess_category_id: string | null;
  /** GROSS — the pre-discount list price, shown struck through when discounted. */
  amount: number;
  discount_type: UpgradeDiscountType;
  discount_value: number;
  /** Payable after discount. Generated in Postgres — every read site bills THIS. */
  net_amount: number;
  /** When true this pair ignores the physical-room eligibility rules, so the resident
   *  may pick ANY available room in the target pool. Institution scoping and gender
   *  are still enforced. Set per-pair in SQL; not editable from the dialog yet. */
  skip_room_eligibility: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Row enriched for display: resolved category names + their base (full) fees. */
export interface UpgradeFeeRow extends UpgradeFee {
  kind: UpgradeFeeKind;
  from_name: string | null;
  to_name: string | null;
  /** Gender of the from/to categories — pairs are configured per hostel type. */
  from_type: UpgradeFeeGender | null;
  to_type: UpgradeFeeGender | null;
  from_base_fee: number | null;
  to_base_fee: number | null;
}

export interface CreateUpgradeFeeDto {
  hostel_year_id: string;
  from_hostel_category_id?: string | null;
  to_hostel_category_id?: string | null;
  from_mess_category_id?: string | null;
  to_mess_category_id?: string | null;
  amount: number;
  discount_type?: UpgradeDiscountType;
  discount_value?: number;
  is_active?: boolean;
}

export interface UpdateUpgradeFeeDto {
  amount?: number;
  discount_type?: UpgradeDiscountType;
  discount_value?: number;
  is_active?: boolean;
}

/** Mirrors the Postgres `net_amount` generated column so the dialog can preview the
 *  payable before saving. Keep the two formulas identical — a drift here shows the
 *  operator one price and bills the resident another. */
export function computeUpgradeNetAmount(
  amount: number,
  discountType: UpgradeDiscountType,
  discountValue: number
): number {
  const gross = Number.isFinite(amount) ? amount : 0;
  const value = Number.isFinite(discountValue) ? discountValue : 0;
  const off = discountType === 'percent' ? (gross * Math.min(value, 100)) / 100 : value;
  return Math.max(0, Math.round((gross - off) * 100) / 100);
}

/** Which kind a row is (exactly one pair is set). */
export function getUpgradeFeeKind(
  row: Pick<UpgradeFee, 'from_hostel_category_id' | 'from_mess_category_id'>
): UpgradeFeeKind {
  return row.from_hostel_category_id ? 'room' : 'mess';
}

export const UPGRADE_FEE_KIND_LABELS: Record<UpgradeFeeKind, string> = {
  room: 'Room',
  mess: 'Mess',
};
