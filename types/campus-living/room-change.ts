// One-time self-service room change — same category, different room.
// Backed by fn_my_room_change_status / fn_my_room_change_options / fn_self_change_room.
// Distinct from the category UPGRADE flow: no category change, no bill.

/** Why the option is unavailable. `null` when the resident may change rooms. */
export type RoomChangeBlockedReason =
  | 'not_resident'
  | 'no_allocation'
  | 'category_not_eligible'
  | 'already_used'
  | 'no_rooms';

export interface RoomChangeStatus {
  /** true only when the allowance is unspent AND at least one other room is free. */
  allowed: boolean;
  /** The single per-academic-year allowance has been spent. */
  used: boolean;
  reason: RoomChangeBlockedReason | null;
  category_name: string | null;
  available_rooms: number;
  current_room_number: string | null;
  current_block_name: string | null;
  current_bed_number: string | null;
  current_floor: number | null;
}

export interface RoomChangeResult {
  success: boolean;
  old_allocation_id: string;
  new_allocation_id: string;
  old_room_id: string;
  new_room_id: string;
  new_bed_id: string;
  new_room_number: string | null;
}
