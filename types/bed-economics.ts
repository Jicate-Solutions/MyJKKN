/**
 * Bed Economics dashboard — RPC result types (Bed Economics PR A, 2026-06-07).
 *
 * These interfaces are the CONTRACT for PR B (dashboard) and PR C (config CRUD).
 * Field names map EXACTLY to the jsonb keys / RETURNS TABLE column names emitted
 * by the fn_bed_econ_* RPCs in
 * supabase/migrations/20260607120000_bed_economics_substrate.sql. Do not rename
 * a field here without changing the RPC (and vice versa).
 *
 * Spec: specs/bed-economics-dashboard-spec-2026-06-07.md §5 (metrics), §9 (RPCs).
 */

/** fn_bed_econ_readiness(p_hostel_year_id) — R1-R4 day-1 checklist. */
export interface BedEconReadiness {
  hostel_year_id: string;
  /** R1 — rates configured for the year, by kind. */
  rates_configured: {
    room: number;
    mess: number;
    package: number;
    /** true if any rate (room|mess|package) is configured. */
    any: boolean;
  };
  /** R2 — hostel-source bills generated for the year. */
  hostel_bills_count: number;
  /** R3 — active allocations (check_out_date IS NULL) network-wide. */
  active_allocations: number;
  /** R3 — sellable beds (per the denominator policy). */
  sellable_beds: number;
  /** R3 — active_allocations / sellable_beds × 100, or null when no beds. */
  allocation_ramp_pct: number | null;
  /** R4 — earliest snapshot date, or null until the cron has run once. */
  snapshot_recording_since: string | null;
  /** Resolved bed_econ.denominator policy value. */
  denominator: string;
}

/** fn_bed_econ_summary(p_hostel_year_id, p_institution_id) — U1-U3 + V1-V10. */
export interface BedEconSummary {
  hostel_year_id: string;
  /** null = network (all institutions). */
  institution_id: string | null;
  include_mess_in_revenue: boolean;
  denominator: string;
  // Utilization
  sellable_beds: number;
  occupied_beds: number;
  sellable_rooms: number;
  occupied_rooms: number;
  /** U1 — bed occupancy %. null when no sellable beds. */
  bed_occupancy_pct: number | null;
  /** U2 — room occupancy %. */
  room_occupancy_pct: number | null;
  /** U3 — beds per occupied room. */
  density_beds_per_occupied_room: number | null;
  // Revenue
  /** V1 — Σ final_amount (hostel-source bills). */
  billed: number;
  /** V2 — collected net of approved refunds (floored at 0). */
  collected: number;
  /** V2 gross (before refund netting). */
  collected_gross: number;
  /** Approved refunds attributable to this year's hostel bills. */
  refunds: number;
  /** V3 — collected / billed × 100. */
  collection_pct: number | null;
  /** V4 — potential revenue at full occupancy (room-category fees, no AC). */
  potential: number;
  /** V5 — RevPAB (billed / sellable beds). */
  rev_pab: number | null;
  /** V6 — RevPOB (billed / occupied beds). */
  rev_pob: number | null;
  /** V7 — realization % (billed / potential). */
  realization_pct: number | null;
  /** V8 — annualized vacancy loss (empty beds × category fee). */
  vacancy_loss: number;
  /** V9 — projected revenue from active allocations (rate config), pre-bills. */
  projected: number;
  /** V10 (partial) — premium add-on differentials billed via allocation metadata. */
  premium_addon_billed: number;
}

/** fn_bed_econ_block_grid(p_hostel_year_id, p_institution_id) — league table row. */
export interface BedEconBlockRow {
  block_id: string;
  block_name: string;
  /** Comma-joined institution names, or '—' when none. */
  institution_names: string;
  /** true when the block is shared by >1 institution. */
  is_shared: boolean;
  sellable_beds: number;
  occupied_beds: number;
  bed_occupancy_pct: number | null;
  billed: number;
  collected: number;
  rev_pab: number | null;
  vacancy_loss: number;
  opex_total: number;
  capex_total: number;
  /** Contribution margin per bed (gated on opex entered). null until opex exists. */
  margin_per_bed: number | null;
  has_opex: boolean;
  has_capex: boolean;
}

/** fn_bed_econ_vacancy_detail(p_hostel_year_id, p_institution_id) — vacancy row. */
export interface BedEconVacancyRow {
  room_id: string;
  room_number: string;
  block_id: string;
  block_name: string;
  category_name: string | null;
  capacity_beds: number;
  occupied_beds: number;
  vacant_beds: number;
  category_fee: number;
  /** vacant_beds × category_fee — annualized loss for this room. */
  vacancy_loss: number;
  /** Open premium-vacancy discount % for the room, if any. */
  premium_discount_pct: number | null;
}

/** fn_bed_econ_cost_grid(p_hostel_year_id, p_institution_id) — C1-C5 per block. */
export interface BedEconCostRow {
  block_id: string;
  block_name: string;
  sellable_beds: number;
  billed: number;
  opex_total: number;
  capex_total: number;
  /** C2 — contribution margin per bed (gated on opex). */
  contribution_margin_per_bed: number | null;
  /** C3 — GOPPAB (gated on opex). */
  goppab: number | null;
  /** C4 — ROI per bed % (gated on opex + capex). */
  roi_per_bed: number | null;
  /** C5 — payback in years (gated on opex + capex). */
  payback_years: number | null;
  has_opex: boolean;
  has_capex: boolean;
  /** true when opex OR capex is missing — render "enter costs →" link. */
  missing_data: boolean;
}

/** fn_bed_econ_trend(p_hostel_year_id, p_institution_id, p_days) — snapshot row. */
export interface BedEconTrendRow {
  snapshot_date: string;
  block_id: string;
  block_name: string;
  rooms_total: number;
  rooms_occupied: number;
  beds_sellable: number;
  beds_occupied: number;
  capacity_nominal: number;
}

/**
 * fn_bed_econ_premium_potential(p_hostel_year_id, p_institution_id, p_assumed_base_inr)
 * — Premium Revenue model (Director request 2026-06-08). One row per gender×tier
 * with inventory + real levers (uplift %, AC) and the ₹-gap vs current billing.
 */
export interface BedEconPremiumPotentialRow {
  gender: string;
  tier: string;
  tier_key: string;
  beds: number;
  occupied_beds: number;
  empty_beds: number;
  uplift_pct: number;
  ac_rooms: number;
  base_potential: number;
  uplift_potential: number;
  ac_potential: number;
  total_potential: number;
  currently_billed: number;
  gap: number;
}

/** fn_bed_econ_consolidation(p_hostel_year_id, p_institution_id) — C6 scenario. */
export interface BedEconConsolidation {
  hostel_year_id: string;
  institution_id: string | null;
  occupied_beds: number;
  occupied_rooms: number;
  partially_occupied_rooms: number;
  rooms_if_packed: number;
  rooms_freed_by_packing: number;
  ac_annual_savings: number;
  housekeeping_annual_savings: number;
  total_annual_cost_savings: number;
  /** Always 0 — consolidation is a cost lever, not a revenue lever (flat billing). */
  revenue_impact: number;
  note: string;
}
