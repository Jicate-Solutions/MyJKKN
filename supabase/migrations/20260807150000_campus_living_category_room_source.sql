-- 20260807150000_campus_living_category_room_source.sql
-- Campus Living: let a category draw its rooms from ANOTHER category's stock.
--
-- WHY: "Deluxe Plus Room" is not a physical room tier — it owns ZERO rooms and ZERO
-- beds. It is the SELF-PICK tier over the Deluxe pool: a Deluxe resident (who was
-- auto-allocated and never chose a room) pays the add-on to hand-pick their own
-- Deluxe room. Without this, the upgrade is unusable end to end:
--   * fn_my_upgrade_room_options(Deluxe Plus) -> no rooms, picker is empty
--   * fn_my_room_options(Deluxe Plus)         -> 0 available beds, card says "No room free"
--   * _cl_room_options(...)                   -> bed validation rejects every pick with
--                                                "That room/bed is not an available option"
--
-- room_source_category_id is resolved ONE level via COALESCE(room_source_category_id, id).
-- NULL (every pre-existing category) means "use my own rooms", so behaviour is unchanged
-- everywhere else. Deliberately not recursive: a chain would need cycle detection for no
-- real benefit.

-- 1) Column ------------------------------------------------------------------
ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS room_source_category_id uuid REFERENCES public.hostel_categories(id);

ALTER TABLE public.hostel_categories
  DROP CONSTRAINT IF EXISTS chk_room_source_not_self;
ALTER TABLE public.hostel_categories
  ADD CONSTRAINT chk_room_source_not_self
  CHECK (room_source_category_id IS NULL OR room_source_category_id <> id);

COMMENT ON COLUMN public.hostel_categories.room_source_category_id IS
  'Draw this category''s room/bed inventory from another category (one level, via '
  'COALESCE(room_source_category_id, id)). NULL = own rooms. Used by the "Plus" '
  'self-pick tiers, which have no stock of their own. MUST point at a category of '
  'the same `type` (gender) - not enforceable as a CHECK, so seed it carefully.';

-- Deluxe Plus draws from Deluxe, per gender.
UPDATE public.hostel_categories dp
   SET room_source_category_id = d.id, updated_at = now()
  FROM public.hostel_categories d
 WHERE dp.name = 'Deluxe Plus Room'
   AND d.name  = 'Deluxe Room'
   AND d.type  = dp.type
   AND d.is_active;

-- 2) Room/bed loaders resolve the source category -----------------------------
-- All three keep their signatures, so CREATE OR REPLACE is safe (no DROP => grants
-- and dependent plpgsql callers are untouched).

CREATE OR REPLACE FUNCTION public.fn_my_room_options(p_category_id uuid)
RETURNS TABLE(bed_id uuid, room_id uuid, room_number text, floor integer, block_name text, bed_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid := get_my_learner_id(); v_inst uuid; v_gender text; v_src uuid;
BEGIN
  IF v_lp IS NULL THEN RETURN; END IF;
  -- A "Plus" tier has no rooms of its own; resolve to the pool it sells from.
  SELECT COALESCE(room_source_category_id, id) INTO v_src
    FROM hostel_categories WHERE id = p_category_id;
  IF v_src IS NULL THEN RETURN; END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id=v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id = auth.uid();
  RETURN QUERY
  SELECT b.id, r.id, r.room_number, r.floor, bl.name, b.bed_number
  FROM hostel_beds b
  JOIN hostel_rooms r ON r.id=b.room_id
  JOIN hostel_blocks bl ON bl.id=r.block_id
  WHERE r.category_id=v_src AND r.room_purpose='student' AND b.status='available'
    AND (bl.hostel_type::text='mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text='boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text='girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
    AND fn_learner_eligible_for_room(v_lp, r.id)
  ORDER BY bl.name, r.floor, r.room_number, b.bed_number;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_options(p_category_id uuid)
RETURNS TABLE(room_id uuid, room_number text, floor integer, block_name text, capacity integer, occupied_beds integer, available_beds integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid := get_my_learner_id(); v_inst uuid; v_gender text; v_src uuid;
BEGIN
  IF v_lp IS NULL THEN RETURN; END IF;
  SELECT COALESCE(room_source_category_id, id) INTO v_src
    FROM hostel_categories WHERE id = p_category_id;
  IF v_src IS NULL THEN RETURN; END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id = auth.uid();
  RETURN QUERY
  SELECT r.id, r.room_number, r.floor, bl.name,
         COALESCE(r.actual_capacity, r.capacity)::int,
         GREATEST(COALESCE(r.actual_capacity, r.capacity)::int - av.free, 0),
         av.free
  FROM hostel_rooms r
  JOIN hostel_blocks bl ON bl.id = r.block_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS free
    FROM hostel_beds b
    WHERE b.room_id = r.id AND b.status = 'available'
      AND NOT EXISTS (
        SELECT 1 FROM hostel_allocations a
        WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval')
      )
  ) av
  WHERE r.category_id = v_src AND r.room_purpose = 'student'
    AND (bl.hostel_type::text = 'mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND fn_learner_eligible_for_room(v_lp, r.id)
    AND av.free > 0
  ORDER BY bl.name, r.floor, r.room_number;
END $function$;

CREATE OR REPLACE FUNCTION public._cl_room_options(p_profile uuid, p_lp uuid, p_category_id uuid)
RETURNS TABLE(bed_id uuid, room_id uuid, room_number text, floor integer, block_name text, bed_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_gender text; v_src uuid;
BEGIN
  IF p_lp IS NULL THEN RETURN; END IF;
  SELECT COALESCE(room_source_category_id, id) INTO v_src
    FROM hostel_categories WHERE id = p_category_id;
  IF v_src IS NULL THEN RETURN; END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.id = p_profile WHERE lp.id = p_lp;
  RETURN QUERY
  SELECT b.id, r.id, r.room_number, r.floor, bl.name, b.bed_number
  FROM hostel_beds b
  JOIN hostel_rooms r ON r.id = b.room_id
  JOIN hostel_blocks bl ON bl.id = r.block_id
  WHERE r.category_id = v_src AND r.room_purpose = 'student' AND b.status = 'available'
    AND (bl.hostel_type::text = 'mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
    AND fn_learner_eligible_for_room(p_lp, r.id)
  ORDER BY bl.name, r.floor, r.room_number, b.bed_number;
END $function$;

-- 3) Stop the allocation trigger reverting a self-pick upgrade ----------------
-- This trigger unconditionally did:
--     hostel_category_id = (SELECT category_id FROM hostel_rooms WHERE id = NEW.room_id)
-- A Deluxe Plus resident LIVES IN A DELUXE ROOM, so every re-activation of their
-- allocation silently demoted them back to Deluxe — voiding the add-on they paid
-- for. Now it only re-syncs when the room genuinely belongs to a different tier
-- than the one the resident is on. For every category with room_source_category_id
-- NULL the source resolves to its own id, so the old behaviour is preserved
-- exactly (including an office room-transfer across tiers, which still re-syncs).
CREATE OR REPLACE FUNCTION public._on_allocation_sync_learner_categories()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid; v_mess uuid; v_room_cat uuid; v_cur_src uuid;
BEGIN
  -- Never block an allocation write over category syncing.
  BEGIN
    SELECT learner_id INTO v_lp FROM profiles WHERE id = NEW.learner_id;
    IF v_lp IS NULL THEN RETURN NEW; END IF;
    SELECT mc.category_id INTO v_mess
    FROM fn_hostel_learner_mess_categories(v_lp) mc
    LIMIT 1;

    SELECT category_id INTO v_room_cat FROM hostel_rooms WHERE id = NEW.room_id;
    SELECT COALESCE(hc.room_source_category_id, hc.id) INTO v_cur_src
      FROM learners_profiles lp
      JOIN hostel_categories hc ON hc.id = lp.hostel_category_id
     WHERE lp.id = v_lp;

    UPDATE learners_profiles
       SET hostel_category_id = CASE
             WHEN v_cur_src IS NOT DISTINCT FROM v_room_cat THEN hostel_category_id
             ELSE v_room_cat
           END,
           mess_category_id   = COALESCE(mess_category_id, v_mess),
           updated_at = now()
     WHERE id = v_lp;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_on_allocation_sync_learner_categories: %', SQLERRM;
  END;
  RETURN NEW;
END $function$;
