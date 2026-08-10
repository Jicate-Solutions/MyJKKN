// Self-service category-upgrade option + result shapes.
// Bed options reuse RoomOption from self-allocation-service (fn_my_room_options).

export interface UpgradeRoomCategoryOption {
  category_id: string;
  name: string;
  type: string;
  allocation_mode: string | null; // 'auto' => fee-only upgrade (room via auto-allocation); 'manual' => pick a room
  current_year_fee: number; // the target category's full (base) fee
  upgrade_fee: number; // PAYABLE after any discount (else full-fee difference)
  /** Pre-discount list price — equals upgrade_fee when no discount is configured. */
  upgrade_fee_original: number;
  /** upgrade_fee_original − upgrade_fee; 0 when undiscounted. Drives the strikethrough. */
  upgrade_discount: number;
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
  /** Pay-to-confirm: the pending upgrade-fee bill (NULL until the academic
   *  threshold is met — the bill is generated at that point). */
  upgrade_bill_id: string | null;
  upgrade_fee_amount: number | null;
  upgrade_fee_paid: number | null;
}

export interface UpgradeMessCategoryOption {
  mess_category_id: string;
  name: string;
  current_year_fee: number;
  /** PAYABLE after any discount. */
  upgrade_fee: number;
  upgrade_fee_original: number;
  upgrade_discount: number;
}

export interface UpgradeBillResult {
  action: 'created' | 'replaced' | 'differential' | 'none' | 'exists' | 'linked';
  new_amount?: number;
  billed?: number;
  bill_id?: string | null;
  old_bill_id?: string | null;
}

export interface RoomUpgradeResult {
  success: boolean;
  /** 'booked' = first allocation (threshold met), instant + no bill;
   *  'upgraded' = move executed (zero-fee instant path, or confirmed after the
   *  upgrade bill was fully paid); 'pending_payment' = threshold met, bed
   *  reserved + upgrade bill generated — confirms when the bill is FULLY paid;
   *  'waitlisted' = below threshold, bed hard-reserved until payments reach the
   *  threshold or hold_expires_at (no move, no bill yet). */
  state: 'booked' | 'upgraded' | 'waitlisted' | 'pending_payment';
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
  // state === 'waitlisted' | 'pending_payment'
  waitlist_id?: string;
  total_billed?: number | null;
  total_paid?: number | null;
  hold_expires_at?: string;
  held_room_id?: string;
  held_bed_id?: string;
  // state === 'pending_payment'
  upgrade_bill_id?: string | null;
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
