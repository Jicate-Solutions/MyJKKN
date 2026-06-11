// Self-service category-upgrade option + result shapes.
// Bed options reuse RoomOption from self-allocation-service (fn_my_room_options).

export interface UpgradeRoomCategoryOption {
  category_id: string;
  name: string;
  type: string;
  current_year_fee: number; // the target category's full (base) fee
  upgrade_fee: number; // configured from→to upgrade payment (else full-fee difference)
  available_beds: number; // 0 => waitlist branch
  threshold_pct: number | null; // category gate; null = no gate
  paid_pct: number | null; // learner's current-AY academic paid %; null = no AY-tagged bills
  meets_threshold: boolean; // false => upgrade reserves the bed instead of confirming
  hold_days: number; // how long a below-threshold reservation is held
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
// held_* fields are set when a below-threshold upgrade hard-reserved a bed.
export interface MyUpgradeWaitlistEntry {
  waitlist_id: string;
  target_category_id: string;
  target_category_name: string | null;
  status: string;
  created_at: string;
  held_room_id: string | null;
  held_room_number: string | null;
  held_block_name: string | null;
  held_bed_number: string | null;
  hold_expires_at: string | null;
  threshold_pct: number | null;
  paid_pct: number | null;
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
  /** 'upgraded' = instant move + bill; 'waitlisted' = below threshold, bed
   *  hard-reserved until paid or hold_expires_at (no move, no bill yet). */
  state: 'upgraded' | 'waitlisted';
  threshold_pct: number | null;
  paid_pct: number | null;
  old_category_id: string | null;
  new_category_id: string;
  old_fee: number;
  new_fee: number;
  // state === 'upgraded'
  old_allocation_id?: string | null;
  new_allocation_id?: string | null;
  new_bed_id?: string | null;
  upgrade_fee?: number;
  bill?: UpgradeBillResult;
  // state === 'waitlisted'
  waitlist_id?: string;
  total_billed?: number | null;
  total_paid?: number | null;
  hold_expires_at?: string;
  held_room_id?: string;
  held_bed_id?: string;
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
