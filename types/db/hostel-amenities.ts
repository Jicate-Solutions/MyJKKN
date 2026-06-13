/**
 * Hostel Amenities — DB row types
 *
 * Mirrors the 6 tables + 2 views from
 * supabase/migrations/2026052801000_hostel_amenities_substrate.sql.
 *
 * Source of truth = the migration file. If the migration changes, update
 * the matching interface here and regenerate types/supabase.ts.
 *
 * UUIDs are typed as `string` (Supabase JS returns them as strings).
 * timestamptz / date / json are typed per their JS-side representation:
 *   - timestamptz → ISO string (`string`)
 *   - jsonb       → `Record<string, unknown>` for free-form, or a stricter
 *                   shape where the schema is known (e.g. AC config).
 */

// ────────────────────────────────────────────────────────────────────────
// Enums (mirrors of CHECK constraints — keep in sync with the migration)
// ────────────────────────────────────────────────────────────────────────

/** hostel_billable_amenities.fee_calculation_type CHECK values. */
export type HostelBillableFeeCalculationType =
  | 'ac_per_room_active_share'
  | 'per_resident_flat'
  | 'per_room_flat';

/** hostel_billable_amenities.refund_mode CHECK values. */
export type HostelBillableRefundMode =
  | 'credit_to_next'
  | 'cash'
  | 'none';

/** v_room_effective_* views' `source` discriminator. */
export type RoomEffectiveAmenitySource = 'block_default' | 'room_added';

/** hostel_amenity_tags.scope CHECK values — where the amenity applies. */
export type HostelAmenityScope = 'block' | 'room' | 'both';

// ────────────────────────────────────────────────────────────────────────
// Catalog tables
// ────────────────────────────────────────────────────────────────────────

/** Row in `hostel_amenity_tags` — informational amenity catalog (no fees). */
export interface HostelAmenityTag {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  description: string | null;
  scope: HostelAmenityScope;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** Row in `hostel_billable_amenities` — fee-bearing amenity catalog. */
export interface HostelBillableAmenity {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  description: string | null;
  fee_calculation_type: HostelBillableFeeCalculationType;
  default_config_schema: Record<string, unknown>;
  commitment_months: number;
  late_joiner_min_months: number;
  upfront_required: boolean;
  refund_mode: HostelBillableRefundMode;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// Block-default junction tables
// ────────────────────────────────────────────────────────────────────────

/** Row in `hostel_block_amenity_tags` — block-default informational tags. */
export interface HostelBlockAmenityTag {
  block_id: string;
  tag_id: string;
  created_at: string;
  created_by: string | null;
}

/** Row in `hostel_block_billable_amenities` — block-default billables with per-block config. */
export interface HostelBlockBillableAmenity {
  block_id: string;
  billable_id: string;
  default_config: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// Room-override junction tables
// ────────────────────────────────────────────────────────────────────────

/**
 * Row in `hostel_room_amenity_tags`.
 *
 * `present = true`  → add/keep this tag for this room
 * `present = false` → suppress an inherited block-default tag for this room
 */
export interface HostelRoomAmenityTag {
  room_id: string;
  tag_id: string;
  present: boolean;
  created_at: string;
  created_by: string | null;
}

/**
 * Row in `hostel_room_billable_amenities`.
 *
 * `present = true`             → add/keep this billable for this room
 * `present = false`            → suppress an inherited block-default
 * `config_override` (non-null) → replaces the block default_config for this room
 */
export interface HostelRoomBillableAmenity {
  room_id: string;
  billable_id: string;
  present: boolean;
  config_override: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// Effective views (read-only)
// ────────────────────────────────────────────────────────────────────────

/** Row in `v_room_effective_amenity_tags` — resolved tags per room. */
export interface RoomEffectiveAmenityTag {
  room_id: string;
  tag_id: string;
  code: string;
  name: string;
  icon: string | null;
  source: RoomEffectiveAmenitySource;
}

/**
 * Row in `v_room_effective_billable_amenities`.
 *
 * `effective_config` resolves to room.config_override when non-null,
 * else block.default_config.
 */
export interface RoomEffectiveBillableAmenity {
  room_id: string;
  billable_id: string;
  code: string;
  name: string;
  fee_calculation_type: HostelBillableFeeCalculationType;
  effective_config: Record<string, unknown> | null;
  source: RoomEffectiveAmenitySource;
}
