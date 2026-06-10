// Self-service category-upgrade option + result shapes.
// Bed options reuse RoomOption from self-allocation-service (fn_my_room_options).

export interface UpgradeRoomCategoryOption {
  category_id: string;
  name: string;
  type: string;
  current_year_fee: number; // the target category's full (base) fee
  upgrade_fee: number; // configured from→to upgrade payment (else full-fee difference)
  available_beds: number; // 0 => waitlist branch
}

export interface UpgradeMessCategoryOption {
  mess_category_id: string;
  name: string;
  current_year_fee: number;
  upgrade_fee: number;
}

export interface UpgradeBillResult {
  action: 'created' | 'replaced' | 'differential' | 'none' | 'exists';
  new_amount: number;
  billed: number;
  old_bill_id: string | null;
}

export interface RoomUpgradeResult {
  success: boolean;
  old_allocation_id: string | null;
  new_allocation_id: string | null;
  new_bed_id: string | null;
  old_category_id: string | null;
  new_category_id: string;
  old_fee: number;
  new_fee: number;
  upgrade_fee: number;
  bill: UpgradeBillResult;
}

export interface MessUpgradeResult {
  success: boolean;
  old_category_id: string | null;
  new_category_id: string;
  old_fee: number;
  new_fee: number;
  upgrade_fee: number;
  bill: UpgradeBillResult;
}
