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

// Room-level picker row from fn_my_upgrade_room_options (only rooms with free beds).
export interface UpgradeRoomOption {
  room_id: string;
  room_number: string;
  floor: number;
  block_name: string;
  capacity: number;
  occupied_beds: number;
  available_beds: number;
}

// Resident's own pending upgrade intents from fn_my_upgrade_waitlist.
export interface MyUpgradeWaitlistEntry {
  waitlist_id: string;
  target_category_id: string;
  target_category_name: string | null;
  status: string;
  created_at: string;
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
