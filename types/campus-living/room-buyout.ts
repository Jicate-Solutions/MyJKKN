/**
 * Room buyout — paying for the empty beds to hold a room.
 *
 * Every rupee here is produced server-side by fn_room_buyout_quote, which reads
 * fn_settle_room_annual_cost and deducts the one bed the resident already pays
 * for. The UI displays these numbers; it never derives them.
 */

/** Why a room cannot be bought out right now. Null when it can. */
export type BuyoutIneligibleReason =
  /** hostel.settle_bill.enabled is false — the whole mechanism is off. */
  | 'mechanism_disabled'
  /** The room's category is not opted into empty-bed settlement. */
  | 'category_not_in_scope'
  | 'no_hostel_year'
  | 'room_not_found'
  | 'room_has_no_category'
  | 'no_active_fee_row'
  | 'no_occupants'
  /** Every bed is taken — there is nothing left to buy. */
  | 'room_full'
  /** A request or an active hold already exists on this room. */
  | 'buyout_already_live';

export interface RoomBuyoutQuote {
  eligible: boolean;
  reason: BuyoutIneligibleReason | null;
  room_id: string;
  hostel_year_id: string | null;
  capacity: number;
  occupants: number;
  empty_beds: number;
  /** The category's annual rate for ONE bed — what she is already billed. */
  per_bed_annual_rate: number;
  /** The whole room divided by today's occupants. NOT what she is charged. */
  settled_share: number;
  /** settled_share − per_bed_annual_rate: the empty beds, and the actual bill. */
  amount_per_resident: number;
  /** True when someone else lives here, so everyone must agree first. */
  consent_required: boolean;
  existing_buyout_id: string | null;
  existing_status: RoomBuyoutStatus | null;
}

export type RoomBuyoutStatus =
  | 'pending_consent'
  | 'active'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'released';

export type BuyoutConsentDecision = 'pending' | 'agreed' | 'declined';

export interface RoomBuyoutConsent {
  id: string;
  buyout_id: string;
  allocation_id: string;
  /** profiles.id of the roommate being asked. */
  learner_id: string;
  decision: BuyoutConsentDecision;
  decided_at: string | null;
  bill_id: string | null;
}

export interface RoomBuyout {
  id: string;
  room_id: string;
  hostel_year_id: string;
  requested_by_learner_id: string;
  capacity_at_request: number;
  occupants_at_request: number;
  empty_beds: number;
  amount_per_resident: number;
  status: RoomBuyoutStatus;
  consent_deadline: string;
  activated_at: string | null;
  cancelled_reason: string | null;
  released_at: string | null;
  created_at: string;
}

/** A buyout plus who still has to agree — what the card renders. */
export interface RoomBuyoutWithConsents extends RoomBuyout {
  consents: RoomBuyoutConsent[];
}

/**
 * Outcome of requesting or responding. `status` mirrors the buyout's own state,
 * with two extras the row never holds: 'refused' (the quote said no, nothing was
 * written) and 'not_found'.
 */
export interface RoomBuyoutActionResult {
  status: RoomBuyoutStatus | 'refused' | 'not_found' | 'no_billing_category';
  buyout_id?: string;
  room_id?: string;
  reason?: string;
  /** Roommates yet to decide, while status is 'pending_consent'. */
  awaiting?: number;
  amount_per_resident?: number;
  bills_raised?: number;
  quote?: RoomBuyoutQuote;
  /** Set when activation was refused because occupancy moved under the quote. */
  quoted?: number;
  now?: number;
}

/** Her own room's countdown. Null when no window is open on it. */
export interface MySettleWindow {
  window_id: string;
  room_id: string;
  opened_at: string;
  /** The date she must act by. Restarts every time someone new moves in. */
  current_deadline: string;
  /** The outer limit no restart can push past. */
  hard_deadline: string;
  restart_count: number;
  status: string;
}
