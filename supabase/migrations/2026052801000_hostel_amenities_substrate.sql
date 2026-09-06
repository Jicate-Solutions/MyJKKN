-- ============================================================================
-- Hostel Amenities — PR 1: Substrate (catalog + block defaults + room overrides)
-- ============================================================================
-- Spec lock 2026-05-28 (Director).
--
-- WHY (full picture across the 4-PR stack):
--   PR 1 (this file): substrate-only DDL — 6 new tables + 2 effective-views +
--                     seed. Additive: does NOT touch the existing
--                     hostel_rooms.ac_status column (PR 4 migrates AC).
--   PR 2 (parallel):  catalog UI under /admin/hostel/amenities (first visual
--                     surface).
--   PR 3 (next):      services/ + hooks/ — read/write paths for block defaults
--                     and room overrides; UI for the assignment screens.
--   PR 4 (later):     destructive — migrate hostel_rooms.ac_status data into
--                     hostel_room_billable_amenities (Air Conditioner row),
--                     then drop the column.
--
-- WHAT THIS PR CHANGES (verified against prod kvizhngldtiuufknvehv 2026-05-28):
--   1. CREATE TABLE hostel_amenity_tags            — informational tags catalog.
--   2. CREATE TABLE hostel_billable_amenities      — fee-bearing catalog.
--   3. CREATE TABLE hostel_block_amenity_tags      — block-default tags.
--   4. CREATE TABLE hostel_block_billable_amenities — block-default billables
--                                                    (+ per-block config).
--   5. CREATE TABLE hostel_room_amenity_tags       — room override tags
--                                                    (present=true add /
--                                                     present=false exclude).
--   6. CREATE TABLE hostel_room_billable_amenities — room override billables
--                                                    (+ per-room config override).
--   7. CREATE VIEW v_room_effective_amenity_tags        — resolves block default
--                                                          ∪ room add, minus
--                                                          room-excluded.
--   8. CREATE VIEW v_room_effective_billable_amenities  — same, plus config
--                                                          fallback chain
--                                                          (override → default).
--   9. RLS on all 6 tables — read-all-authenticated, write-admin (mirrors
--      the existing hostel_block_institutions pattern: is_super_admin() /
--      is_admin() / user_has_permission('campus_living.rooms.view')).
--  10. SEED — 8 informational tags + 1 billable (Air Conditioner).
--
-- ADDITIVE ONLY — DOES NOT TOUCH:
--   ─ hostel_rooms.ac_status     (PR 4 territory)
--   ─ Any existing service/hook  (PR 3 territory)
--   ─ Any existing migration     (NEVER edit applied migrations)
--
-- APPLY VIA SUPABASE MANAGEMENT API (per feedback_supabase_management_api*
-- and feedback_supabase_db_url_skip_permanent). All statements idempotent
-- where possible (IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────
-- Step 1: hostel_amenity_tags — informational catalog (no fees)
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hostel_amenity_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  icon        text,
  description text,
  sort_order  int  NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.profiles(id),
  updated_by  uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.hostel_amenity_tags IS
  'Informational amenity tags (no fee machinery). Surfaced as chips on '
  'room/block detail pages. icon = lucide-react icon name.';

DROP TRIGGER IF EXISTS trg_hostel_amenity_tags_updated_at
  ON public.hostel_amenity_tags;
CREATE TRIGGER trg_hostel_amenity_tags_updated_at
  BEFORE UPDATE ON public.hostel_amenity_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────
-- Step 2: hostel_billable_amenities — fee-bearing catalog
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hostel_billable_amenities (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                   text NOT NULL UNIQUE,
  name                   text NOT NULL,
  icon                   text,
  description            text,
  fee_calculation_type   text NOT NULL CHECK (fee_calculation_type IN (
    'ac_per_room_active_share',
    'per_resident_flat',
    'per_room_flat'
  )),
  default_config_schema  jsonb NOT NULL DEFAULT '{}'::jsonb,
  commitment_months      int NOT NULL DEFAULT 12 CHECK (commitment_months > 0),
  late_joiner_min_months int NOT NULL DEFAULT 6  CHECK (late_joiner_min_months > 0),
  upfront_required       boolean NOT NULL DEFAULT true,
  refund_mode            text NOT NULL DEFAULT 'credit_to_next'
    CHECK (refund_mode IN ('credit_to_next','cash','none')),
  sort_order             int  NOT NULL DEFAULT 0,
  active                 boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES public.profiles(id),
  updated_by             uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.hostel_billable_amenities IS
  'Fee-bearing amenity catalog. fee_calculation_type drives how PR 3 services '
  'compute charges. default_config_schema describes the JSON shape stored on '
  'hostel_block_billable_amenities.default_config (e.g. {"tonnage":1.5}).';

DROP TRIGGER IF EXISTS trg_hostel_billable_amenities_updated_at
  ON public.hostel_billable_amenities;
CREATE TRIGGER trg_hostel_billable_amenities_updated_at
  BEFORE UPDATE ON public.hostel_billable_amenities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────
-- Step 3: hostel_block_amenity_tags — per-block default tags
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hostel_block_amenity_tags (
  block_id   uuid NOT NULL REFERENCES public.hostel_blocks(id)        ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES public.hostel_amenity_tags(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  PRIMARY KEY (block_id, tag_id)
);

COMMENT ON TABLE public.hostel_block_amenity_tags IS
  'Block-default amenity tags. Every room in the block inherits these unless '
  'a hostel_room_amenity_tags row with present=false suppresses inheritance.';

-- ──────────────────────────────────────────────────────────────────────
-- Step 4: hostel_block_billable_amenities — per-block default billables
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hostel_block_billable_amenities (
  block_id       uuid NOT NULL REFERENCES public.hostel_blocks(id)              ON DELETE CASCADE,
  billable_id    uuid NOT NULL REFERENCES public.hostel_billable_amenities(id)  ON DELETE CASCADE,
  default_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.profiles(id),
  PRIMARY KEY (block_id, billable_id)
);

COMMENT ON TABLE public.hostel_block_billable_amenities IS
  'Block-default billable amenities + per-block config (e.g. AC tonnage 1.5 '
  'in this block). Inherited by every room unless room-level config_override '
  'is set or hostel_room_billable_amenities.present=false suppresses.';

-- ──────────────────────────────────────────────────────────────────────
-- Step 5: hostel_room_amenity_tags — room-level override for tags
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hostel_room_amenity_tags (
  room_id    uuid NOT NULL REFERENCES public.hostel_rooms(id)         ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES public.hostel_amenity_tags(id)  ON DELETE CASCADE,
  present    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  PRIMARY KEY (room_id, tag_id)
);

COMMENT ON TABLE public.hostel_room_amenity_tags IS
  'Room-level override of inherited block-default tags. present=true adds a '
  'tag that block does not have OR keeps an inherited one. present=false '
  'suppresses inheritance of a block-default tag for this specific room.';

-- ──────────────────────────────────────────────────────────────────────
-- Step 6: hostel_room_billable_amenities — room-level override for billables
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hostel_room_billable_amenities (
  room_id         uuid NOT NULL REFERENCES public.hostel_rooms(id)              ON DELETE CASCADE,
  billable_id     uuid NOT NULL REFERENCES public.hostel_billable_amenities(id) ON DELETE CASCADE,
  present         boolean NOT NULL DEFAULT true,
  config_override jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.profiles(id),
  PRIMARY KEY (room_id, billable_id)
);

COMMENT ON TABLE public.hostel_room_billable_amenities IS
  'Room-level override of inherited block-default billables. present=false '
  'suppresses inheritance. config_override (when non-NULL) replaces the '
  'block default_config for this specific room.';

-- ──────────────────────────────────────────────────────────────────────
-- Step 7: v_room_effective_amenity_tags — effective tags per room
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_room_effective_amenity_tags AS
SELECT
  r.id    AS room_id,
  t.id    AS tag_id,
  t.code,
  t.name,
  t.icon,
  'block_default'::text AS source
FROM public.hostel_rooms r
JOIN public.hostel_blocks b              ON b.id = r.block_id
JOIN public.hostel_block_amenity_tags bt ON bt.block_id = b.id
JOIN public.hostel_amenity_tags t        ON t.id = bt.tag_id AND t.active
LEFT JOIN public.hostel_room_amenity_tags rt
  ON rt.room_id = r.id AND rt.tag_id = t.id
WHERE COALESCE(rt.present, TRUE) = TRUE
UNION
SELECT
  rt.room_id,
  rt.tag_id,
  t.code,
  t.name,
  t.icon,
  'room_added'::text AS source
FROM public.hostel_room_amenity_tags rt
JOIN public.hostel_amenity_tags t        ON t.id = rt.tag_id AND t.active
JOIN public.hostel_rooms r               ON r.id = rt.room_id
LEFT JOIN public.hostel_block_amenity_tags bt
  ON bt.block_id = r.block_id AND bt.tag_id = rt.tag_id
WHERE bt.tag_id IS NULL AND rt.present = TRUE;

COMMENT ON VIEW public.v_room_effective_amenity_tags IS
  'Effective informational amenity tags per room. Resolves block defaults '
  '∪ room-added, minus room-suppressed. source = block_default | room_added.';

-- ──────────────────────────────────────────────────────────────────────
-- Step 8: v_room_effective_billable_amenities — effective billables per room
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_room_effective_billable_amenities AS
SELECT
  r.id   AS room_id,
  ba.id  AS billable_id,
  ba.code,
  ba.name,
  ba.fee_calculation_type,
  COALESCE(rba.config_override, bba.default_config) AS effective_config,
  'block_default'::text AS source
FROM public.hostel_rooms r
JOIN public.hostel_blocks b                      ON b.id = r.block_id
JOIN public.hostel_block_billable_amenities bba  ON bba.block_id = b.id
JOIN public.hostel_billable_amenities ba         ON ba.id = bba.billable_id AND ba.active
LEFT JOIN public.hostel_room_billable_amenities rba
  ON rba.room_id = r.id AND rba.billable_id = ba.id
WHERE COALESCE(rba.present, TRUE) = TRUE
UNION
SELECT
  rba.room_id,
  rba.billable_id,
  ba.code,
  ba.name,
  ba.fee_calculation_type,
  rba.config_override AS effective_config,
  'room_added'::text  AS source
FROM public.hostel_room_billable_amenities rba
JOIN public.hostel_billable_amenities ba ON ba.id = rba.billable_id AND ba.active
JOIN public.hostel_rooms r               ON r.id = rba.room_id
LEFT JOIN public.hostel_block_billable_amenities bba
  ON bba.block_id = r.block_id AND bba.billable_id = rba.billable_id
WHERE bba.billable_id IS NULL AND rba.present = TRUE;

COMMENT ON VIEW public.v_room_effective_billable_amenities IS
  'Effective billable amenities per room. effective_config resolves to '
  'room.config_override when non-NULL, else block.default_config. source = '
  'block_default | room_added.';

-- ──────────────────────────────────────────────────────────────────────
-- Step 9: RLS — mirrors hostel_block_institutions pattern
-- ──────────────────────────────────────────────────────────────────────
-- Read: any authenticated user with campus_living.rooms.view permission,
--       OR admin / super_admin.
-- Write: admin / super_admin only.
-- (No institution_id on amenity catalogs — these are global. The
-- block/room junction tables inherit access through the parent block/room
-- via foreign-key cascades; their RLS allows read-all to authenticated
-- and write to admins.)

ALTER TABLE public.hostel_amenity_tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_billable_amenities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_block_amenity_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_block_billable_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_room_amenity_tags        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_room_billable_amenities  ENABLE ROW LEVEL SECURITY;

-- ── hostel_amenity_tags ──
DROP POLICY IF EXISTS hostel_amenity_tags_select_permission ON public.hostel_amenity_tags;
CREATE POLICY hostel_amenity_tags_select_permission
  ON public.hostel_amenity_tags FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('campus_living.rooms.view'::text)
  );

DROP POLICY IF EXISTS hostel_amenity_tags_insert_permission ON public.hostel_amenity_tags;
CREATE POLICY hostel_amenity_tags_insert_permission
  ON public.hostel_amenity_tags FOR INSERT
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_amenity_tags_update_permission ON public.hostel_amenity_tags;
CREATE POLICY hostel_amenity_tags_update_permission
  ON public.hostel_amenity_tags FOR UPDATE
  USING (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_amenity_tags_delete_permission ON public.hostel_amenity_tags;
CREATE POLICY hostel_amenity_tags_delete_permission
  ON public.hostel_amenity_tags FOR DELETE
  USING (is_super_admin() OR is_admin());

-- ── hostel_billable_amenities ──
DROP POLICY IF EXISTS hostel_billable_amenities_select_permission ON public.hostel_billable_amenities;
CREATE POLICY hostel_billable_amenities_select_permission
  ON public.hostel_billable_amenities FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('campus_living.rooms.view'::text)
  );

DROP POLICY IF EXISTS hostel_billable_amenities_insert_permission ON public.hostel_billable_amenities;
CREATE POLICY hostel_billable_amenities_insert_permission
  ON public.hostel_billable_amenities FOR INSERT
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_billable_amenities_update_permission ON public.hostel_billable_amenities;
CREATE POLICY hostel_billable_amenities_update_permission
  ON public.hostel_billable_amenities FOR UPDATE
  USING (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_billable_amenities_delete_permission ON public.hostel_billable_amenities;
CREATE POLICY hostel_billable_amenities_delete_permission
  ON public.hostel_billable_amenities FOR DELETE
  USING (is_super_admin() OR is_admin());

-- ── hostel_block_amenity_tags ──
DROP POLICY IF EXISTS hostel_block_amenity_tags_select_permission ON public.hostel_block_amenity_tags;
CREATE POLICY hostel_block_amenity_tags_select_permission
  ON public.hostel_block_amenity_tags FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('campus_living.rooms.view'::text)
  );

DROP POLICY IF EXISTS hostel_block_amenity_tags_insert_permission ON public.hostel_block_amenity_tags;
CREATE POLICY hostel_block_amenity_tags_insert_permission
  ON public.hostel_block_amenity_tags FOR INSERT
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_block_amenity_tags_update_permission ON public.hostel_block_amenity_tags;
CREATE POLICY hostel_block_amenity_tags_update_permission
  ON public.hostel_block_amenity_tags FOR UPDATE
  USING (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_block_amenity_tags_delete_permission ON public.hostel_block_amenity_tags;
CREATE POLICY hostel_block_amenity_tags_delete_permission
  ON public.hostel_block_amenity_tags FOR DELETE
  USING (is_super_admin() OR is_admin());

-- ── hostel_block_billable_amenities ──
DROP POLICY IF EXISTS hostel_block_billable_amenities_select_permission ON public.hostel_block_billable_amenities;
CREATE POLICY hostel_block_billable_amenities_select_permission
  ON public.hostel_block_billable_amenities FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('campus_living.rooms.view'::text)
  );

DROP POLICY IF EXISTS hostel_block_billable_amenities_insert_permission ON public.hostel_block_billable_amenities;
CREATE POLICY hostel_block_billable_amenities_insert_permission
  ON public.hostel_block_billable_amenities FOR INSERT
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_block_billable_amenities_update_permission ON public.hostel_block_billable_amenities;
CREATE POLICY hostel_block_billable_amenities_update_permission
  ON public.hostel_block_billable_amenities FOR UPDATE
  USING (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_block_billable_amenities_delete_permission ON public.hostel_block_billable_amenities;
CREATE POLICY hostel_block_billable_amenities_delete_permission
  ON public.hostel_block_billable_amenities FOR DELETE
  USING (is_super_admin() OR is_admin());

-- ── hostel_room_amenity_tags ──
DROP POLICY IF EXISTS hostel_room_amenity_tags_select_permission ON public.hostel_room_amenity_tags;
CREATE POLICY hostel_room_amenity_tags_select_permission
  ON public.hostel_room_amenity_tags FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('campus_living.rooms.view'::text)
  );

DROP POLICY IF EXISTS hostel_room_amenity_tags_insert_permission ON public.hostel_room_amenity_tags;
CREATE POLICY hostel_room_amenity_tags_insert_permission
  ON public.hostel_room_amenity_tags FOR INSERT
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_room_amenity_tags_update_permission ON public.hostel_room_amenity_tags;
CREATE POLICY hostel_room_amenity_tags_update_permission
  ON public.hostel_room_amenity_tags FOR UPDATE
  USING (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_room_amenity_tags_delete_permission ON public.hostel_room_amenity_tags;
CREATE POLICY hostel_room_amenity_tags_delete_permission
  ON public.hostel_room_amenity_tags FOR DELETE
  USING (is_super_admin() OR is_admin());

-- ── hostel_room_billable_amenities ──
DROP POLICY IF EXISTS hostel_room_billable_amenities_select_permission ON public.hostel_room_billable_amenities;
CREATE POLICY hostel_room_billable_amenities_select_permission
  ON public.hostel_room_billable_amenities FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('campus_living.rooms.view'::text)
  );

DROP POLICY IF EXISTS hostel_room_billable_amenities_insert_permission ON public.hostel_room_billable_amenities;
CREATE POLICY hostel_room_billable_amenities_insert_permission
  ON public.hostel_room_billable_amenities FOR INSERT
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_room_billable_amenities_update_permission ON public.hostel_room_billable_amenities;
CREATE POLICY hostel_room_billable_amenities_update_permission
  ON public.hostel_room_billable_amenities FOR UPDATE
  USING (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hostel_room_billable_amenities_delete_permission ON public.hostel_room_billable_amenities;
CREATE POLICY hostel_room_billable_amenities_delete_permission
  ON public.hostel_room_billable_amenities FOR DELETE
  USING (is_super_admin() OR is_admin());

-- ──────────────────────────────────────────────────────────────────────
-- Step 10: SEED — 8 informational tags + 1 billable (Air Conditioner)
-- ──────────────────────────────────────────────────────────────────────

INSERT INTO public.hostel_amenity_tags (code, name, icon, sort_order) VALUES
  ('attached_bath',     'Attached Bath',      'Bath',         10),
  ('balcony',           'Balcony',            'Wind',         20),
  ('wardrobe',          'Wardrobe',           'Archive',      30),
  ('study_table',       'Study Table',        'BookOpen',     40),
  ('hot_water_geyser',  'Hot Water (Geyser)', 'Droplets',     50),
  ('wifi_basic',        'Wi-Fi (Basic)',      'Wifi',         60),
  ('lift_access',       'Lift Access',        'MoveVertical', 70),
  ('window_view',       'Window View',        'Sun',          80)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.hostel_billable_amenities (
  code, name, icon, description,
  fee_calculation_type,
  default_config_schema,
  commitment_months, late_joiner_min_months,
  upfront_required, refund_mode, sort_order
) VALUES (
  'air_conditioner',
  'Air Conditioner',
  'Snowflake',
  'Per-room AC billed as (tonnage × 24h cost / active occupants). '
  || '12-month commitment; 6-month minimum for late joiners; refund as '
  || 'credit to subsequent fees.',
  'ac_per_room_active_share',
  '{"tonnage":"number","base_inr_per_month_24h":"number"}'::jsonb,
  12, 6, true, 'credit_to_next', 10
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- END — PR 1 substrate (additive only; PR 4 will migrate ac_status data).
-- ============================================================================
