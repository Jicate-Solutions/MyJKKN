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

export interface UpgradeFee {
  id: string;
  hostel_year_id: string;
  from_hostel_category_id: string | null;
  to_hostel_category_id: string | null;
  from_mess_category_id: string | null;
  to_mess_category_id: string | null;
  amount: number;
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
  is_active?: boolean;
}

export interface UpdateUpgradeFeeDto {
  amount?: number;
  is_active?: boolean;
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
