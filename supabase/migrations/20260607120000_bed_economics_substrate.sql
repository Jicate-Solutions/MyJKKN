-- ============================================================================
-- Bed Economics Dashboard — PR A: Substrate
-- ============================================================================
-- Spec: specs/bed-economics-dashboard-spec-2026-06-07.md (v2, verified live).
-- Date: 2026-06-07. Audience: super-admins ONLY.
--
-- This migration creates the read-substrate for the Bed Economics dashboard:
--   1. hostel_occupancy_snapshots          — MANDATORY daily snapshot table
--                                              (transfers mutate allocation rows
--                                              in place, so occupancy history is
--                                              NOT reconstructable; we snapshot).
--   2. hostel_block_economics_entries       — typed cost/capex config table
--      + hostel_block_economics_entries_audit  (config-table-pattern mixin, RLS,
--      + audit trigger                          audit log per the platform std).
--   3. platform_policies seeds              — 7 scalar tunables (spec §7.1).
--   4. 7 RPCs                               — fn_bed_econ_* (spec §9.2).
--
-- VERIFIED LIVE-SCHEMA FACTS honored here (do NOT trust stale setup/01_tables.sql):
--   - hostel_rooms: block_id, capacity, actual_capacity, room_purpose, category_id,
--     ac_annual_cost_inr, tier_access, room_number. NO status / current_occupancy /
--     institution_id (dropped 2026-05-26 by 20260703100000).
--   - Active allocation = hostel_allocations.check_out_date IS NULL (canonical,
--     matches v_hostel_room_occupancy). Occupancy counted at room level via
--     hostel_allocations.room_id.
--   - Bills: billing_student_bills(student_id, institution_id, item_category_id,
--     package_id, hostel_year_id, fee_source, final_amount, balance_amount, status).
--     Hostel revenue = fee_source IN ('hostel_category','hostel_package')
--     AND status NOT IN ('cancelled','superseded').
--   - Mess split: item_category_id joins to mess_categories (mess) vs
--     hostel_categories (room) — fee_source CANNOT distinguish mess.
--   - Refund netting: billing_refunds(receipt_id, net_refund_amount, approval_status)
--     → billing_receipts(id) → billing_receipt_items(receipt_id, bill_id) → bills.
--   - Rates: hostel_fees(hostel_year_id, hostel_category_id|mess_category_id|
--     package_id, amount, is_active). Potential = Σ sellable beds × room-category fee.
--   - Institution attribution: revenue via billing_student_bills.institution_id;
--     inventory via hostel_block_institutions M2M, aggregated at BLOCK level first
--     so a shared block counts once at network level.
--   - Premium differential: hostel_allocations.metadata->>'upgrade_billed_inr'.
--
-- SECURITY (mandatory — PR #1225 / 20260605191101 incident):
--   - Every RPC: SECURITY DEFINER STABLE SET search_path = public.
--   - Every RPC body starts with an is_super_admin() gate (42501 on failure).
--   - Every RPC: REVOKE EXECUTE FROM anon, PUBLIC; GRANT EXECUTE TO authenticated.
--     (Supabase default-grants anon on every new function — REVOKE FROM PUBLIC
--     alone is INSUFFICIENT.)
--
-- LOCAL-ONLY during build. Applied to prod post-merge via the authorized
-- exec_sql flow. Idempotent (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────
-- 1. hostel_occupancy_snapshots — daily per-block occupancy snapshot
-- ────────────────────────────────────────────────────────────────────────
-- Written ONLY by the service-role cron (app/api/cron/campus-living/
-- occupancy-snapshot). RLS: SELECT for any authenticated user; NO write
-- policies (service-role bypasses RLS, so writes still work; no other actor
-- can INSERT/UPDATE).

CREATE TABLE IF NOT EXISTS public.hostel_occupancy_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date   date NOT NULL,
  block_id        uuid NOT NULL REFERENCES public.hostel_blocks(id) ON DELETE CASCADE,
  rooms_total     int,
  rooms_occupied  int,
  beds_sellable   int,
  beds_occupied   int,
  capacity_nominal int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hostel_occupancy_snapshots_date_block_uq UNIQUE (snapshot_date, block_id)
);

COMMENT ON TABLE public.hostel_occupancy_snapshots IS
  'Daily per-block occupancy snapshot. MANDATORY because hostel_allocations '
  'transfers mutate the allocation row in place (destroying the old interval), '
  'so occupancy history cannot be reconstructed from allocations alone. '
  'Written by the occupancy-snapshot cron (service-role, idempotent on '
  '(snapshot_date, block_id)). Read by fn_bed_econ_trend. Accumulates from deploy.';

CREATE INDEX IF NOT EXISTS idx_hostel_occupancy_snapshots_block_date
  ON public.hostel_occupancy_snapshots (block_id, snapshot_date DESC);

ALTER TABLE public.hostel_occupancy_snapshots ENABLE ROW LEVEL SECURITY;

-- READ: any authenticated user (downstream RPCs are super-admin-gated anyway).
DROP POLICY IF EXISTS hostel_occupancy_snapshots_select ON public.hostel_occupancy_snapshots;
CREATE POLICY hostel_occupancy_snapshots_select
  ON public.hostel_occupancy_snapshots
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- NO INSERT/UPDATE/DELETE policies: only the service-role cron writes (bypasses RLS).


-- ────────────────────────────────────────────────────────────────────────
-- 2. hostel_block_economics_entries — typed cost/capex config table
-- ────────────────────────────────────────────────────────────────────────
-- Follows docs/architecture/config-table-pattern.md (shared mixin VERBATIM +
-- typed columns + audit table + audit trigger + RLS read=authenticated /
-- write=super_admin). CRUD UI lands in PR C (/campus-living/settings/
-- block-economics).

CREATE TABLE IF NOT EXISTS public.hostel_block_economics_entries (
  -- Common mixin (paste verbatim into every per-module config table) ----------
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    TEXT NOT NULL,                  -- machine-readable key
  display_name  TEXT NOT NULL,                  -- shown in super-admin UI
  description   TEXT,                            -- tooltip beside the field
  is_active     BOOLEAN NOT NULL DEFAULT true,  -- soft-disable without deletion
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES profiles(id),
  change_reason TEXT,                            -- super-admin types why (audit trail)
  -- Per-module typed columns --------------------------------------------------
  block_id        UUID NOT NULL REFERENCES public.hostel_blocks(id) ON DELETE CASCADE,
  hostel_year_id  UUID NULL REFERENCES public.hostel_years(id) ON DELETE CASCADE,
  cost_kind       TEXT NOT NULL CHECK (cost_kind IN ('opex','capex')),
  cost_category   TEXT NOT NULL CHECK (cost_category IN (
                    'staff','utilities','housekeeping','maintenance',
                    'mess_subsidy','other','capex_building','capex_renovation')),
  annual_amount   NUMERIC(15,2) NOT NULL CHECK (annual_amount >= 0),
  notes           TEXT
);

COMMENT ON TABLE public.hostel_block_economics_entries IS
  'Per-block opex/capex cost entries for the Bed Economics dashboard cost & '
  'return surfaces (C1-C6). Config-table-pattern mixin + typed columns. '
  'hostel_year_id is NULL for one-time capex; set for recurring opex. '
  'Written via /campus-living/settings/block-economics (super-admin only). '
  'Read by fn_bed_econ_cost_grid / fn_bed_econ_block_grid / fn_bed_econ_consolidation. '
  'NEVER fabricate zeros — a missing row means "not entered", surfaced as a '
  'missing_data flag in the RPCs.';

-- One active row per (block, year, category). COALESCE the null year so the
-- partial-unique index treats "capex with no year" as a single slot per category.
CREATE UNIQUE INDEX IF NOT EXISTS hostel_block_economics_entries_active_uq
  ON public.hostel_block_economics_entries (
    block_id,
    COALESCE(hostel_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    cost_category
  )
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_hostel_block_economics_entries_block
  ON public.hostel_block_economics_entries (block_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_hostel_block_economics_entries_year
  ON public.hostel_block_economics_entries (hostel_year_id) WHERE is_active = true;

-- updated_at trigger (shared fn, matches the hostel_* table family).
DROP TRIGGER IF EXISTS trg_hostel_block_economics_entries_updated_at
  ON public.hostel_block_economics_entries;
CREATE TRIGGER trg_hostel_block_economics_entries_updated_at
  BEFORE UPDATE ON public.hostel_block_economics_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: read = any authenticated user; write = super_admin only (pattern doc).
ALTER TABLE public.hostel_block_economics_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hostel_block_economics_entries_read ON public.hostel_block_economics_entries;
CREATE POLICY hostel_block_economics_entries_read
  ON public.hostel_block_economics_entries
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS hostel_block_economics_entries_write ON public.hostel_block_economics_entries;
CREATE POLICY hostel_block_economics_entries_write
  ON public.hostel_block_economics_entries
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Audit log (one row per UPDATE; whole-row before/after snapshots).
CREATE TABLE IF NOT EXISTS public.hostel_block_economics_entries_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id     UUID NOT NULL REFERENCES public.hostel_block_economics_entries(id) ON DELETE CASCADE,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by    UUID REFERENCES profiles(id),
  old_value     JSONB,
  new_value     JSONB,
  change_reason TEXT
);

COMMENT ON TABLE public.hostel_block_economics_entries_audit IS
  'Append-only audit trail for hostel_block_economics_entries changes '
  '(config-table-pattern). One row per UPDATE via the AFTER UPDATE trigger.';

ALTER TABLE public.hostel_block_economics_entries_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hostel_block_economics_entries_audit_read
  ON public.hostel_block_economics_entries_audit;
CREATE POLICY hostel_block_economics_entries_audit_read
  ON public.hostel_block_economics_entries_audit
  FOR SELECT
  USING (is_super_admin());

CREATE OR REPLACE FUNCTION public.fn_hostel_block_economics_entries_audit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.hostel_block_economics_entries_audit
    (config_id, changed_by, old_value, new_value, change_reason)
  VALUES (NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW), NEW.change_reason);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS hostel_block_economics_entries_audit_trg
  ON public.hostel_block_economics_entries;
CREATE TRIGGER hostel_block_economics_entries_audit_trg
  AFTER UPDATE ON public.hostel_block_economics_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_hostel_block_economics_entries_audit();


-- ────────────────────────────────────────────────────────────────────────
-- 3. platform_policies seeds — 7 scalar tunables (spec §7.1)
-- ────────────────────────────────────────────────────────────────────────
-- Edited via the existing platform-policies admin UI (zero deploys).
-- Constant keys are mirrored in lib/policies/keys.ts by PR C.

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system)
VALUES
  ('bed_econ.denominator', 'global', NULL, '"actual_capacity"'::jsonb,
   'Bed-count denominator for occupancy % and RevPAB: actual_capacity | capacity | beds.',
   'enum', '["actual_capacity","capacity","beds"]'::jsonb, true),
  ('bed_econ.include_mess_in_revenue', 'global', NULL, 'false'::jsonb,
   'Include mess-category fees in billed/potential revenue metrics (V1/V4/V5). Default OFF.',
   'boolean', NULL, true),
  ('bed_econ.sellable_room_purposes', 'global', NULL, '["student"]'::jsonb,
   'room_purpose values that count as sellable inventory for occupancy + potential revenue.',
   'array', NULL, true),
  ('bed_econ.occupancy_target_pct', 'global', NULL, '85'::jsonb,
   'Target bed-occupancy percent — drives the stoplight colour on the U1 headline card.',
   'number', NULL, true),
  ('bed_econ.collection_target_pct', 'global', NULL, '90'::jsonb,
   'Target collection percent — drives the stoplight colour on the V3 collection card.',
   'number', NULL, true),
  ('bed_econ.stale_vacancy_days', 'global', NULL, '60'::jsonb,
   'A sellable bed empty for this many days is flagged in the stale-vacancy action panel.',
   'number', NULL, true),
  ('bed_econ.housekeeping_cost_per_room_month', 'global', NULL, '0'::jsonb,
   'Monthly housekeeping cost per occupied room. Feeds C6 consolidation cost-savings.',
   'number', NULL, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────
-- 4. RPCs (spec §9.2) — all super-admin-gated, anon-revoked
-- ────────────────────────────────────────────────────────────────────────


-- 4.1 fn_bed_econ_readiness — R1-R4 day-1 checklist
-- Returns jsonb: rates configured (by kind), hostel bills count, allocation
-- ramp (active vs sellable beds), earliest snapshot date.
CREATE OR REPLACE FUNCTION public.fn_bed_econ_readiness(p_hostel_year_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sellable_purposes text[];
  v_rates_room    int := 0;
  v_rates_mess    int := 0;
  v_rates_package int := 0;
  v_bills_count   int := 0;
  v_active_alloc  int := 0;
  v_sellable_beds int := 0;
  v_denominator   text;
  v_earliest_snapshot date;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super admin only' USING ERRCODE = '42501';
  END IF;

  -- Policy reads (defensive defaults).
  v_sellable_purposes := COALESCE(
    (SELECT array_agg(elem::text)
       FROM jsonb_array_elements_text(fn_get_policy('bed_econ.sellable_room_purposes', NULL)) elem),
    ARRAY['student']);
  v_denominator := COALESCE(fn_get_policy_text('bed_econ.denominator', 'actual_capacity', NULL),
                            'actual_capacity');

  -- R1: rates configured for the year, by kind.
  SELECT
    COUNT(*) FILTER (WHERE hf.hostel_category_id IS NOT NULL),
    COUNT(*) FILTER (WHERE hf.mess_category_id   IS NOT NULL),
    COUNT(*) FILTER (WHERE hf.package_id         IS NOT NULL)
  INTO v_rates_room, v_rates_mess, v_rates_package
  FROM public.hostel_fees hf
  WHERE hf.hostel_year_id = p_hostel_year_id AND hf.is_active = true;

  -- R2: hostel-source bills generated for the year.
  SELECT COUNT(*)
  INTO v_bills_count
  FROM public.billing_student_bills b
  WHERE b.hostel_year_id = p_hostel_year_id
    AND b.fee_source IN ('hostel_category','hostel_package')
    AND b.status NOT IN ('cancelled','superseded');

  -- R3: active allocations vs sellable beds.
  SELECT COUNT(*)
  INTO v_active_alloc
  FROM public.hostel_allocations a
  WHERE a.check_out_date IS NULL;

  SELECT COALESCE(SUM(
           CASE v_denominator
             WHEN 'capacity' THEN COALESCE(r.capacity, 0)
             WHEN 'beds'     THEN (SELECT COUNT(*) FROM public.hostel_beds hb WHERE hb.room_id = r.id)
             ELSE COALESCE(r.actual_capacity, r.capacity, 0)
           END), 0)
  INTO v_sellable_beds
  FROM public.hostel_rooms r
  WHERE r.room_purpose = ANY(v_sellable_purposes);

  -- R4: trend recording since earliest snapshot.
  SELECT MIN(snapshot_date) INTO v_earliest_snapshot
  FROM public.hostel_occupancy_snapshots;

  RETURN jsonb_build_object(
    'hostel_year_id', p_hostel_year_id,
    'rates_configured', jsonb_build_object(
      'room', v_rates_room, 'mess', v_rates_mess, 'package', v_rates_package,
      'any', (v_rates_room + v_rates_mess + v_rates_package) > 0),
    'hostel_bills_count', v_bills_count,
    'active_allocations', v_active_alloc,
    'sellable_beds', v_sellable_beds,
    'allocation_ramp_pct',
      CASE WHEN v_sellable_beds > 0
           THEN round((v_active_alloc::numeric / v_sellable_beds) * 100, 2)
           ELSE NULL END,
    'snapshot_recording_since', v_earliest_snapshot,
    'denominator', v_denominator
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_bed_econ_readiness(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bed_econ_readiness(uuid) TO authenticated;


-- 4.2 fn_bed_econ_summary — U1-U3, V1-V9 headline metrics
-- p_institution_id NULL = network (all). Revenue attributed via bills.institution_id;
-- inventory attributed via hostel_block_institutions M2M (block-level, count-once).
CREATE OR REPLACE FUNCTION public.fn_bed_econ_summary(
  p_hostel_year_id uuid,
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sellable_purposes text[];
  v_denominator       text;
  v_include_mess      boolean;
  -- inventory
  v_sellable_beds  int := 0;
  v_occupied_beds  int := 0;
  v_sellable_rooms int := 0;
  v_occupied_rooms int := 0;
  -- revenue
  v_billed       numeric := 0;
  v_collected_gross numeric := 0;
  v_refunds      numeric := 0;
  v_potential    numeric := 0;
  v_projected    numeric := 0;
  v_premium_addon numeric := 0;
  -- block scope (inventory): blocks the institution can claim (count-once)
  v_block_ids uuid[];
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super admin only' USING ERRCODE = '42501';
  END IF;

  v_sellable_purposes := COALESCE(
    (SELECT array_agg(elem::text)
       FROM jsonb_array_elements_text(fn_get_policy('bed_econ.sellable_room_purposes', NULL)) elem),
    ARRAY['student']);
  v_denominator  := COALESCE(fn_get_policy_text('bed_econ.denominator', 'actual_capacity', NULL),
                             'actual_capacity');
  v_include_mess := COALESCE(fn_get_policy_bool('bed_econ.include_mess_in_revenue', false, NULL),
                             false);

  -- Blocks in scope (inventory). NULL institution = all blocks (count once).
  SELECT array_agg(DISTINCT bk.id)
  INTO v_block_ids
  FROM public.hostel_blocks bk
  WHERE p_institution_id IS NULL
     OR EXISTS (
       SELECT 1 FROM public.hostel_block_institutions hbi
       WHERE hbi.block_id = bk.id AND hbi.institution_id = p_institution_id);
  v_block_ids := COALESCE(v_block_ids, ARRAY[]::uuid[]);

  -- Inventory: sellable beds + occupied beds (room-level, active = check_out_date IS NULL),
  -- aggregated once per block (shared blocks count once at network scope).
  SELECT
    COALESCE(SUM(
      CASE v_denominator
        WHEN 'capacity' THEN COALESCE(r.capacity, 0)
        WHEN 'beds'     THEN (SELECT COUNT(*) FROM public.hostel_beds hb WHERE hb.room_id = r.id)
        ELSE COALESCE(r.actual_capacity, r.capacity, 0)
      END), 0),
    COALESCE(SUM(occ.active_residents), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE occ.active_residents > 0)
  INTO v_sellable_beds, v_occupied_beds, v_sellable_rooms, v_occupied_rooms
  FROM public.hostel_rooms r
  LEFT JOIN LATERAL (
    SELECT COUNT(a.id)::int AS active_residents
    FROM public.hostel_allocations a
    WHERE a.room_id = r.id AND a.check_out_date IS NULL
  ) occ ON true
  WHERE r.room_purpose = ANY(v_sellable_purposes)
    AND r.block_id = ANY(v_block_ids);

  -- V1 Billed (Σ final_amount), with mess toggle (item_category_id → mess_categories).
  SELECT COALESCE(SUM(b.final_amount), 0)
  INTO v_billed
  FROM public.billing_student_bills b
  WHERE b.hostel_year_id = p_hostel_year_id
    AND b.fee_source IN ('hostel_category','hostel_package')
    AND b.status NOT IN ('cancelled','superseded')
    AND (p_institution_id IS NULL OR b.institution_id = p_institution_id)
    AND (v_include_mess OR NOT EXISTS (
          SELECT 1 FROM public.mess_categories mc WHERE mc.id = b.item_category_id));

  -- V2 Collected (gross) = Σ(final - balance), same filter.
  SELECT COALESCE(SUM(b.final_amount - COALESCE(b.balance_amount, 0)), 0)
  INTO v_collected_gross
  FROM public.billing_student_bills b
  WHERE b.hostel_year_id = p_hostel_year_id
    AND b.fee_source IN ('hostel_category','hostel_package')
    AND b.status NOT IN ('cancelled','superseded')
    AND (p_institution_id IS NULL OR b.institution_id = p_institution_id)
    AND (v_include_mess OR NOT EXISTS (
          SELECT 1 FROM public.mess_categories mc WHERE mc.id = b.item_category_id));

  -- Approved refunds attributable to this year's hostel bills
  -- (refund → receipt → receipt_items → bill chain).
  SELECT COALESCE(SUM(rf.net_refund_amount), 0)
  INTO v_refunds
  FROM public.billing_refunds rf
  JOIN public.billing_receipts rc ON rc.id = rf.receipt_id
  WHERE rf.approval_status IN ('approved','processed')
    AND EXISTS (
      SELECT 1
      FROM public.billing_receipt_items ri
      JOIN public.billing_student_bills b ON b.id = ri.bill_id
      WHERE ri.receipt_id = rc.id
        AND b.hostel_year_id = p_hostel_year_id
        AND b.fee_source IN ('hostel_category','hostel_package')
        AND b.status NOT IN ('cancelled','superseded')
        AND (p_institution_id IS NULL OR b.institution_id = p_institution_id)
    );

  -- V4 Potential (full occupancy): Σ over sellable beds of the room's category fee.
  -- NO AC (never billed). Mess per toggle is N/A here (room-category rate only).
  -- Per-bed potential = room-category fee × the bed-count denominator for that room.
  SELECT COALESCE(SUM(
           COALESCE(hf.amount, 0) *
           CASE v_denominator
             WHEN 'capacity' THEN COALESCE(r.capacity, 0)
             WHEN 'beds'     THEN (SELECT COUNT(*) FROM public.hostel_beds hb WHERE hb.room_id = r.id)
             ELSE COALESCE(r.actual_capacity, r.capacity, 0)
           END), 0)
  INTO v_potential
  FROM public.hostel_rooms r
  LEFT JOIN public.hostel_fees hf
    ON hf.hostel_category_id = r.category_id
   AND hf.hostel_year_id = p_hostel_year_id
   AND hf.is_active = true
  WHERE r.room_purpose = ANY(v_sellable_purposes)
    AND r.block_id = ANY(v_block_ids);

  -- V9 Projected: Σ over ACTIVE allocations of resolved fee, even before bills.
  -- Uses campus_living_resolve_hostel_fee (per-learner). Honors mess toggle.
  SELECT COALESCE(SUM(
           (SELECT SUM((item->>'amount')::numeric)
            FROM jsonb_array_elements(
                   public.campus_living_resolve_hostel_fee(a.learner_id, p_hostel_year_id)) item
            WHERE v_include_mess OR NOT EXISTS (
                    SELECT 1 FROM public.mess_categories mc
                    WHERE mc.id = NULLIF(item->>'category_id','')::uuid))
           ), 0)
  INTO v_projected
  FROM public.hostel_allocations a
  WHERE a.check_out_date IS NULL
    AND a.learner_id IS NOT NULL
    AND a.block_id = ANY(v_block_ids);

  -- V10 (partial): premium add-on differentials billed via allocation metadata
  -- (NOT in bills). Active allocations only.
  SELECT COALESCE(SUM(NULLIF(a.metadata->>'upgrade_billed_inr','')::numeric), 0)
  INTO v_premium_addon
  FROM public.hostel_allocations a
  WHERE a.check_out_date IS NULL
    AND a.block_id = ANY(v_block_ids)
    AND a.metadata ? 'upgrade_billed_inr';

  RETURN jsonb_build_object(
    'hostel_year_id', p_hostel_year_id,
    'institution_id', p_institution_id,
    'include_mess_in_revenue', v_include_mess,
    'denominator', v_denominator,
    -- Utilization
    'sellable_beds',  v_sellable_beds,
    'occupied_beds',  v_occupied_beds,
    'sellable_rooms', v_sellable_rooms,
    'occupied_rooms', v_occupied_rooms,
    'bed_occupancy_pct',
      CASE WHEN v_sellable_beds > 0
           THEN round((v_occupied_beds::numeric / v_sellable_beds) * 100, 2) ELSE NULL END,        -- U1
    'room_occupancy_pct',
      CASE WHEN v_sellable_rooms > 0
           THEN round((v_occupied_rooms::numeric / v_sellable_rooms) * 100, 2) ELSE NULL END,      -- U2
    'density_beds_per_occupied_room',
      CASE WHEN v_occupied_rooms > 0
           THEN round(v_occupied_beds::numeric / v_occupied_rooms, 2) ELSE NULL END,               -- U3
    -- Revenue
    'billed', v_billed,                                                                            -- V1
    'collected', GREATEST(v_collected_gross - v_refunds, 0),                                       -- V2
    'collected_gross', v_collected_gross,
    'refunds', v_refunds,
    'collection_pct',
      CASE WHEN v_billed > 0
           THEN round((GREATEST(v_collected_gross - v_refunds, 0) / v_billed) * 100, 2) ELSE NULL END,  -- V3
    'potential', v_potential,                                                                      -- V4
    'rev_pab',
      CASE WHEN v_sellable_beds > 0 THEN round(v_billed / v_sellable_beds, 2) ELSE NULL END,       -- V5
    'rev_pob',
      CASE WHEN v_occupied_beds > 0 THEN round(v_billed / v_occupied_beds, 2) ELSE NULL END,       -- V6
    'realization_pct',
      CASE WHEN v_potential > 0 THEN round((v_billed / v_potential) * 100, 2) ELSE NULL END,       -- V7
    'vacancy_loss',
      GREATEST(
        round(v_potential * (1 - (CASE WHEN v_sellable_beds > 0
              THEN v_occupied_beds::numeric / v_sellable_beds ELSE 0 END)), 2), 0),                -- V8
    'projected', v_projected,                                                                      -- V9
    'premium_addon_billed', v_premium_addon                                                        -- V10 partial
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_bed_econ_summary(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bed_econ_summary(uuid, uuid) TO authenticated;


-- 4.3 fn_bed_econ_block_grid — per-block league table (incl. cost columns + flags)
CREATE OR REPLACE FUNCTION public.fn_bed_econ_block_grid(
  p_hostel_year_id uuid,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  block_id            uuid,
  block_name          text,
  institution_names   text,
  is_shared           boolean,
  sellable_beds       int,
  occupied_beds       int,
  bed_occupancy_pct   numeric,
  billed              numeric,
  collected           numeric,
  rev_pab             numeric,
  vacancy_loss        numeric,
  opex_total          numeric,
  capex_total         numeric,
  margin_per_bed      numeric,
  has_opex            boolean,
  has_capex           boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sellable_purposes text[];
  v_denominator       text;
  v_include_mess      boolean;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super admin only' USING ERRCODE = '42501';
  END IF;

  v_sellable_purposes := COALESCE(
    (SELECT array_agg(elem::text)
       FROM jsonb_array_elements_text(fn_get_policy('bed_econ.sellable_room_purposes', NULL)) elem),
    ARRAY['student']);
  v_denominator  := COALESCE(fn_get_policy_text('bed_econ.denominator', 'actual_capacity', NULL),
                             'actual_capacity');
  v_include_mess := COALESCE(fn_get_policy_bool('bed_econ.include_mess_in_revenue', false, NULL),
                             false);

  RETURN QUERY
  WITH scoped_blocks AS (
    SELECT bk.id, bk.name
    FROM public.hostel_blocks bk
    WHERE p_institution_id IS NULL
       OR EXISTS (SELECT 1 FROM public.hostel_block_institutions hbi
                  WHERE hbi.block_id = bk.id AND hbi.institution_id = p_institution_id)
  ),
  block_inst AS (
    SELECT hbi.block_id,
           string_agg(i.name, ', ' ORDER BY i.name) AS inst_names,
           COUNT(*) > 1 AS shared
    FROM public.hostel_block_institutions hbi
    JOIN public.institutions i ON i.id = hbi.institution_id
    GROUP BY hbi.block_id
  ),
  block_inventory AS (
    SELECT r.block_id,
           SUM(CASE v_denominator
                 WHEN 'capacity' THEN COALESCE(r.capacity, 0)
                 WHEN 'beds'     THEN (SELECT COUNT(*) FROM public.hostel_beds hb WHERE hb.room_id = r.id)
                 ELSE COALESCE(r.actual_capacity, r.capacity, 0)
               END)::int AS sellable_beds,
           SUM(occ.active_residents)::int AS occupied_beds,
           SUM(COALESCE(hf.amount,0) *
               CASE v_denominator
                 WHEN 'capacity' THEN COALESCE(r.capacity, 0)
                 WHEN 'beds'     THEN (SELECT COUNT(*) FROM public.hostel_beds hb WHERE hb.room_id = r.id)
                 ELSE COALESCE(r.actual_capacity, r.capacity, 0)
               END) AS potential
    FROM public.hostel_rooms r
    LEFT JOIN LATERAL (
      SELECT COUNT(a.id)::int AS active_residents
      FROM public.hostel_allocations a
      WHERE a.room_id = r.id AND a.check_out_date IS NULL
    ) occ ON true
    LEFT JOIN public.hostel_fees hf
      ON hf.hostel_category_id = r.category_id
     AND hf.hostel_year_id = p_hostel_year_id
     AND hf.is_active = true
    WHERE r.room_purpose = ANY(v_sellable_purposes)
    GROUP BY r.block_id
  ),
  -- Revenue is bill-attributed (institution_id), not block-attributed; we map
  -- bills to blocks via the allocation of the billed learner for the year.
  block_revenue AS (
    SELECT a.block_id,
           SUM(b.final_amount) AS billed,
           SUM(b.final_amount - COALESCE(b.balance_amount,0)) AS collected
    FROM public.billing_student_bills b
    -- One block per billed learner (latest active allocation) — prevents
    -- double-counting a bill across blocks if a learner ever has >1 active
    -- allocation row (review finding M2, 2026-06-07).
    JOIN LATERAL (
      SELECT ia.block_id
      FROM public.hostel_allocations ia
      WHERE ia.learner_id = b.student_id AND ia.check_out_date IS NULL
      ORDER BY ia.allocation_date DESC, ia.created_at DESC
      LIMIT 1
    ) a ON true
    WHERE b.hostel_year_id = p_hostel_year_id
      AND b.fee_source IN ('hostel_category','hostel_package')
      AND b.status NOT IN ('cancelled','superseded')
      AND (p_institution_id IS NULL OR b.institution_id = p_institution_id)
      AND (v_include_mess OR NOT EXISTS (
            SELECT 1 FROM public.mess_categories mc WHERE mc.id = b.item_category_id))
    GROUP BY a.block_id
  ),
  block_costs AS (
    SELECT e.block_id,
           SUM(e.annual_amount) FILTER (WHERE e.cost_kind = 'opex'
             AND (e.hostel_year_id = p_hostel_year_id OR e.hostel_year_id IS NULL)) AS opex_total,
           SUM(e.annual_amount) FILTER (WHERE e.cost_kind = 'capex') AS capex_total,
           bool_or(e.cost_kind = 'opex') AS has_opex,
           bool_or(e.cost_kind = 'capex') AS has_capex
    FROM public.hostel_block_economics_entries e
    WHERE e.is_active = true
    GROUP BY e.block_id
  )
  SELECT
    sb.id,
    sb.name,
    COALESCE(bi.inst_names, '—'),
    COALESCE(bi.shared, false),
    COALESCE(inv.sellable_beds, 0),
    COALESCE(inv.occupied_beds, 0),
    CASE WHEN COALESCE(inv.sellable_beds,0) > 0
         THEN round((COALESCE(inv.occupied_beds,0)::numeric / inv.sellable_beds) * 100, 2)
         ELSE NULL END,
    COALESCE(rev.billed, 0),
    COALESCE(rev.collected, 0),
    CASE WHEN COALESCE(inv.sellable_beds,0) > 0
         THEN round(COALESCE(rev.billed,0) / inv.sellable_beds, 2) ELSE NULL END,
    GREATEST(round(COALESCE(inv.potential,0) * (1 - (CASE WHEN COALESCE(inv.sellable_beds,0) > 0
           THEN COALESCE(inv.occupied_beds,0)::numeric / inv.sellable_beds ELSE 0 END)), 2), 0),
    COALESCE(bc.opex_total, 0),
    COALESCE(bc.capex_total, 0),
    CASE WHEN COALESCE(inv.sellable_beds,0) > 0 AND bc.has_opex
         THEN round((COALESCE(rev.billed,0) - COALESCE(bc.opex_total,0)) / inv.sellable_beds, 2)
         ELSE NULL END,
    COALESCE(bc.has_opex, false),
    COALESCE(bc.has_capex, false)
  FROM scoped_blocks sb
  LEFT JOIN block_inst bi      ON bi.block_id = sb.id
  LEFT JOIN block_inventory inv ON inv.block_id = sb.id
  LEFT JOIN block_revenue rev  ON rev.block_id = sb.id
  LEFT JOIN block_costs bc     ON bc.block_id = sb.id
  ORDER BY sb.name;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_bed_econ_block_grid(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bed_econ_block_grid(uuid, uuid) TO authenticated;


-- 4.4 fn_bed_econ_vacancy_detail — vacant sellable rooms/beds + days vacant + discount
CREATE OR REPLACE FUNCTION public.fn_bed_econ_vacancy_detail(
  p_hostel_year_id uuid,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  room_id          uuid,
  room_number      text,
  block_id         uuid,
  block_name       text,
  category_name    text,
  capacity_beds    int,
  occupied_beds    int,
  vacant_beds      int,
  category_fee     numeric,
  vacancy_loss     numeric,
  premium_discount_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sellable_purposes text[];
  v_denominator       text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super admin only' USING ERRCODE = '42501';
  END IF;

  v_sellable_purposes := COALESCE(
    (SELECT array_agg(elem::text)
       FROM jsonb_array_elements_text(fn_get_policy('bed_econ.sellable_room_purposes', NULL)) elem),
    ARRAY['student']);
  v_denominator := COALESCE(fn_get_policy_text('bed_econ.denominator', 'actual_capacity', NULL),
                            'actual_capacity');

  RETURN QUERY
  SELECT
    r.id,
    r.room_number,
    r.block_id,
    bk.name,
    hc.name,
    cap.beds,
    COALESCE(occ.active_residents, 0),
    GREATEST(cap.beds - COALESCE(occ.active_residents, 0), 0),
    COALESCE(hf.amount, 0),
    GREATEST(cap.beds - COALESCE(occ.active_residents, 0), 0) * COALESCE(hf.amount, 0),
    pv.current_discount_pct
  FROM public.hostel_rooms r
  JOIN public.hostel_blocks bk ON bk.id = r.block_id
  LEFT JOIN public.hostel_categories hc ON hc.id = r.category_id
  LEFT JOIN LATERAL (
    SELECT CASE v_denominator
             WHEN 'capacity' THEN COALESCE(r.capacity, 0)
             WHEN 'beds'     THEN (SELECT COUNT(*)::int FROM public.hostel_beds hb WHERE hb.room_id = r.id)
             ELSE COALESCE(r.actual_capacity, r.capacity, 0)
           END AS beds
  ) cap ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(a.id)::int AS active_residents
    FROM public.hostel_allocations a
    WHERE a.room_id = r.id AND a.check_out_date IS NULL
  ) occ ON true
  LEFT JOIN public.hostel_fees hf
    ON hf.hostel_category_id = r.category_id
   AND hf.hostel_year_id = p_hostel_year_id
   AND hf.is_active = true
  LEFT JOIN LATERAL (
    SELECT v.current_discount_pct
    FROM public.hostel_premium_vacancies v
    WHERE v.room_id = r.id AND v.status = 'open'
    ORDER BY v.current_discount_pct DESC NULLS LAST
    LIMIT 1
  ) pv ON true
  WHERE r.room_purpose = ANY(v_sellable_purposes)
    AND (p_institution_id IS NULL OR EXISTS (
          SELECT 1 FROM public.hostel_block_institutions hbi
          WHERE hbi.block_id = r.block_id AND hbi.institution_id = p_institution_id))
    AND cap.beds - COALESCE(occ.active_residents, 0) > 0
  ORDER BY (cap.beds - COALESCE(occ.active_residents, 0)) * COALESCE(hf.amount, 0) DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_bed_econ_vacancy_detail(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bed_econ_vacancy_detail(uuid, uuid) TO authenticated;


-- 4.5 fn_bed_econ_cost_grid — C1-C5 per block, with missing_data flags
CREATE OR REPLACE FUNCTION public.fn_bed_econ_cost_grid(
  p_hostel_year_id uuid,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  block_id          uuid,
  block_name        text,
  sellable_beds     int,
  billed            numeric,
  opex_total        numeric,
  capex_total       numeric,
  contribution_margin_per_bed numeric,
  goppab            numeric,
  roi_per_bed       numeric,
  payback_years     numeric,
  has_opex          boolean,
  has_capex         boolean,
  missing_data      boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sellable_purposes text[];
  v_denominator       text;
  v_include_mess      boolean;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super admin only' USING ERRCODE = '42501';
  END IF;

  v_sellable_purposes := COALESCE(
    (SELECT array_agg(elem::text)
       FROM jsonb_array_elements_text(fn_get_policy('bed_econ.sellable_room_purposes', NULL)) elem),
    ARRAY['student']);
  v_denominator  := COALESCE(fn_get_policy_text('bed_econ.denominator', 'actual_capacity', NULL),
                             'actual_capacity');
  v_include_mess := COALESCE(fn_get_policy_bool('bed_econ.include_mess_in_revenue', false, NULL),
                             false);

  RETURN QUERY
  WITH scoped_blocks AS (
    SELECT bk.id, bk.name
    FROM public.hostel_blocks bk
    WHERE p_institution_id IS NULL
       OR EXISTS (SELECT 1 FROM public.hostel_block_institutions hbi
                  WHERE hbi.block_id = bk.id AND hbi.institution_id = p_institution_id)
  ),
  block_inventory AS (
    SELECT r.block_id,
           SUM(CASE v_denominator
                 WHEN 'capacity' THEN COALESCE(r.capacity, 0)
                 WHEN 'beds'     THEN (SELECT COUNT(*) FROM public.hostel_beds hb WHERE hb.room_id = r.id)
                 ELSE COALESCE(r.actual_capacity, r.capacity, 0)
               END)::int AS sellable_beds
    FROM public.hostel_rooms r
    WHERE r.room_purpose = ANY(v_sellable_purposes)
    GROUP BY r.block_id
  ),
  block_revenue AS (
    SELECT a.block_id, SUM(b.final_amount) AS billed
    FROM public.billing_student_bills b
    -- One block per billed learner (latest active allocation) — prevents
    -- double-counting a bill across blocks if a learner ever has >1 active
    -- allocation row (review finding M2, 2026-06-07).
    JOIN LATERAL (
      SELECT ia.block_id
      FROM public.hostel_allocations ia
      WHERE ia.learner_id = b.student_id AND ia.check_out_date IS NULL
      ORDER BY ia.allocation_date DESC, ia.created_at DESC
      LIMIT 1
    ) a ON true
    WHERE b.hostel_year_id = p_hostel_year_id
      AND b.fee_source IN ('hostel_category','hostel_package')
      AND b.status NOT IN ('cancelled','superseded')
      AND (p_institution_id IS NULL OR b.institution_id = p_institution_id)
      AND (v_include_mess OR NOT EXISTS (
            SELECT 1 FROM public.mess_categories mc WHERE mc.id = b.item_category_id))
    GROUP BY a.block_id
  ),
  block_costs AS (
    SELECT e.block_id,
           SUM(e.annual_amount) FILTER (WHERE e.cost_kind = 'opex'
             AND (e.hostel_year_id = p_hostel_year_id OR e.hostel_year_id IS NULL)) AS opex_total,
           SUM(e.annual_amount) FILTER (WHERE e.cost_kind = 'capex') AS capex_total,
           bool_or(e.cost_kind = 'opex') AS has_opex,
           bool_or(e.cost_kind = 'capex') AS has_capex
    FROM public.hostel_block_economics_entries e
    WHERE e.is_active = true
    GROUP BY e.block_id
  )
  SELECT
    sb.id,
    sb.name,
    COALESCE(inv.sellable_beds, 0),
    COALESCE(rev.billed, 0),
    COALESCE(bc.opex_total, 0),
    COALESCE(bc.capex_total, 0),
    -- C2 contribution margin / bed (gated on opex)
    CASE WHEN COALESCE(inv.sellable_beds,0) > 0 AND bc.has_opex
         THEN round((COALESCE(rev.billed,0) - COALESCE(bc.opex_total,0)) / inv.sellable_beds, 2)
         ELSE NULL END,
    -- C3 GOPPAB ((billed - all opex) / sellable beds), same gating
    CASE WHEN COALESCE(inv.sellable_beds,0) > 0 AND bc.has_opex
         THEN round((COALESCE(rev.billed,0) - COALESCE(bc.opex_total,0)) / inv.sellable_beds, 2)
         ELSE NULL END,
    -- C4 ROI / bed = annual margin per bed ÷ (capex per bed)
    CASE WHEN COALESCE(inv.sellable_beds,0) > 0 AND bc.has_opex AND bc.has_capex
              AND COALESCE(bc.capex_total,0) > 0
         THEN round(
                ((COALESCE(rev.billed,0) - COALESCE(bc.opex_total,0)) / inv.sellable_beds)
                / (COALESCE(bc.capex_total,0) / inv.sellable_beds) * 100, 2)
         ELSE NULL END,
    -- C5 payback (years) = capex per bed ÷ annual margin per bed
    CASE WHEN COALESCE(inv.sellable_beds,0) > 0 AND bc.has_opex AND bc.has_capex
              AND (COALESCE(rev.billed,0) - COALESCE(bc.opex_total,0)) > 0
         THEN round(
                (COALESCE(bc.capex_total,0) / inv.sellable_beds)
                / ((COALESCE(rev.billed,0) - COALESCE(bc.opex_total,0)) / inv.sellable_beds), 2)
         ELSE NULL END,
    COALESCE(bc.has_opex, false),
    COALESCE(bc.has_capex, false),
    NOT (COALESCE(bc.has_opex, false) AND COALESCE(bc.has_capex, false))
  FROM scoped_blocks sb
  LEFT JOIN block_inventory inv ON inv.block_id = sb.id
  LEFT JOIN block_revenue rev  ON rev.block_id = sb.id
  LEFT JOIN block_costs bc     ON bc.block_id = sb.id
  ORDER BY sb.name;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_bed_econ_cost_grid(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bed_econ_cost_grid(uuid, uuid) TO authenticated;


-- 4.6 fn_bed_econ_trend — snapshot rows for the occupancy trend chart
-- p_institution_id NULL = all blocks; else only blocks the institution claims.
-- p_days bounds the window (default 365 days).
CREATE OR REPLACE FUNCTION public.fn_bed_econ_trend(
  p_hostel_year_id uuid,
  p_institution_id uuid DEFAULT NULL,
  p_days int DEFAULT 365
)
RETURNS TABLE (
  snapshot_date    date,
  block_id         uuid,
  block_name       text,
  rooms_total      int,
  rooms_occupied   int,
  beds_sellable    int,
  beds_occupied    int,
  capacity_nominal int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end   date;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super admin only' USING ERRCODE = '42501';
  END IF;

  -- Bound the window to the hostel-year window when known, else last p_days.
  SELECT hy.start_date, hy.end_date INTO v_start, v_end
  FROM public.hostel_years hy WHERE hy.id = p_hostel_year_id;

  RETURN QUERY
  SELECT
    s.snapshot_date,
    s.block_id,
    bk.name,
    s.rooms_total,
    s.rooms_occupied,
    s.beds_sellable,
    s.beds_occupied,
    s.capacity_nominal
  FROM public.hostel_occupancy_snapshots s
  JOIN public.hostel_blocks bk ON bk.id = s.block_id
  WHERE (v_start IS NULL OR s.snapshot_date >= v_start)
    AND (v_end   IS NULL OR s.snapshot_date <= v_end)
    AND s.snapshot_date >= (CURRENT_DATE - GREATEST(COALESCE(p_days, 365), 1))
    AND (p_institution_id IS NULL OR EXISTS (
          SELECT 1 FROM public.hostel_block_institutions hbi
          WHERE hbi.block_id = s.block_id AND hbi.institution_id = p_institution_id))
  ORDER BY s.snapshot_date, bk.name;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_bed_econ_trend(uuid, uuid, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bed_econ_trend(uuid, uuid, int) TO authenticated;


-- 4.7 fn_bed_econ_consolidation — C6 consolidation cost-savings scenario
-- Packing occupied beds into fewer rooms frees rooms; freed rooms save AC
-- (ac_annual_cost_inr) + housekeeping (policy per-room-month × 12). Under flat
-- per-learner billing this does NOT change billed revenue (explicit in copy).
CREATE OR REPLACE FUNCTION public.fn_bed_econ_consolidation(
  p_hostel_year_id uuid,
  p_institution_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sellable_purposes text[];
  v_denominator       text;
  v_housekeeping_pm   numeric;
  v_occupied_beds     int := 0;
  v_occupied_rooms    int := 0;
  v_partial_rooms     int := 0;
  v_rooms_if_packed   int := 0;
  v_rooms_freed       int := 0;
  v_ac_savings        numeric := 0;
  v_housekeeping_savings numeric := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super admin only' USING ERRCODE = '42501';
  END IF;

  v_sellable_purposes := COALESCE(
    (SELECT array_agg(elem::text)
       FROM jsonb_array_elements_text(fn_get_policy('bed_econ.sellable_room_purposes', NULL)) elem),
    ARRAY['student']);
  v_denominator     := COALESCE(fn_get_policy_text('bed_econ.denominator', 'actual_capacity', NULL),
                                'actual_capacity');
  v_housekeeping_pm := COALESCE(
    (fn_get_policy('bed_econ.housekeeping_cost_per_room_month', NULL))::numeric, 0);

  -- Per-room occupancy on sellable rooms in scope.
  WITH room_occ AS (
    SELECT r.id,
           r.ac_annual_cost_inr,
           CASE v_denominator
             WHEN 'capacity' THEN COALESCE(r.capacity, 0)
             WHEN 'beds'     THEN (SELECT COUNT(*)::int FROM public.hostel_beds hb WHERE hb.room_id = r.id)
             ELSE COALESCE(r.actual_capacity, r.capacity, 0)
           END AS cap,
           (SELECT COUNT(a.id)::int FROM public.hostel_allocations a
            WHERE a.room_id = r.id AND a.check_out_date IS NULL) AS occ
    FROM public.hostel_rooms r
    WHERE r.room_purpose = ANY(v_sellable_purposes)
      AND (p_institution_id IS NULL OR EXISTS (
            SELECT 1 FROM public.hostel_block_institutions hbi
            WHERE hbi.block_id = r.block_id AND hbi.institution_id = p_institution_id))
  )
  SELECT
    COALESCE(SUM(occ), 0),
    COUNT(*) FILTER (WHERE occ > 0),
    COUNT(*) FILTER (WHERE occ > 0 AND occ < cap),
    -- rooms needed if we pack occupied beds into full rooms (greedy upper bound
    -- using the average sellable capacity of occupied rooms)
    CASE WHEN COALESCE(SUM(cap) FILTER (WHERE occ > 0), 0) = 0 THEN 0
         ELSE CEIL(SUM(occ)::numeric /
              GREATEST((SUM(cap) FILTER (WHERE occ > 0))::numeric
                       / NULLIF(COUNT(*) FILTER (WHERE occ > 0), 0), 1))::int END,
    COALESCE(SUM(ac_annual_cost_inr) FILTER (WHERE occ > 0 AND occ < cap), 0)
  INTO v_occupied_beds, v_occupied_rooms, v_partial_rooms, v_rooms_if_packed, v_ac_savings;

  v_rooms_freed := GREATEST(v_occupied_rooms - v_rooms_if_packed, 0);
  -- AC saving is bounded by the rooms actually freed (use partial-room AC as the
  -- conservative pool; cap at rooms_freed share to avoid overstating).
  v_ac_savings := CASE WHEN v_partial_rooms > 0
                       THEN round(v_ac_savings * (LEAST(v_rooms_freed, v_partial_rooms)::numeric
                                  / v_partial_rooms), 2)
                       ELSE 0 END;
  v_housekeeping_savings := round(v_rooms_freed * v_housekeeping_pm * 12, 2);

  RETURN jsonb_build_object(
    'hostel_year_id', p_hostel_year_id,
    'institution_id', p_institution_id,
    'occupied_beds', v_occupied_beds,
    'occupied_rooms', v_occupied_rooms,
    'partially_occupied_rooms', v_partial_rooms,
    'rooms_if_packed', v_rooms_if_packed,
    'rooms_freed_by_packing', v_rooms_freed,
    'ac_annual_savings', v_ac_savings,
    'housekeeping_annual_savings', v_housekeeping_savings,
    'total_annual_cost_savings', round(v_ac_savings + v_housekeeping_savings, 2),
    'revenue_impact', 0,
    'note', 'Consolidation is a COST lever only. Under flat per-learner billing, '
         || 'packing students changes billed revenue by approximately zero.'
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_bed_econ_consolidation(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bed_econ_consolidation(uuid, uuid) TO authenticated;


-- ============================================================================
-- End of Bed Economics substrate migration.
-- ============================================================================
