-- 20260807180000_campus_living_self_room_change.sql
-- ONE-TIME self-service room change, WITHIN the resident's own category.
--
-- WHY: Premium / Premium + AC residents pick their own room. A resident who picked the
-- wrong one has no way back — the upgrade flow only moves you UP a tier, and the office
-- transfer is a staff action. This gives exactly one self-service correction per
-- academic year: same category, different room.
--
-- NOT an upgrade: the category does not change and NO bill is raised. It reuses the
-- upgrade module's proven room/bed machinery (_cl_room_options for validation) but none
-- of its pricing.
--
-- The allowance is recorded on the NEW allocation row as
-- metadata->>'self_room_change' = 'true', so the audit trail IS the counter — no
-- separate flag to keep in sync, and the from-room/bed are captured alongside it.

-- 1) Which categories offer it ------------------------------------------------
ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS allow_self_room_change boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hostel_categories.allow_self_room_change IS
  'Residents of this category may self-change their room ONCE per academic year '
  '(same category, different room). Intended for self-picked tiers where a wrong '
  'choice would otherwise need office intervention.';

UPDATE public.hostel_categories
   SET allow_self_room_change = true, updated_at = now()
 WHERE is_active AND name IN ('Premium Room', 'Premium Room + AC');

-- 2) Status — drives the card, the once-only notice and the disabled state -----
CREATE OR REPLACE FUNCTION public.fn_my_room_change_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id(); v_profile uuid := auth.uid();
  v_cat uuid; v_cat_name text; v_allow boolean := false;
  v_alloc RECORD; v_used boolean := false; v_rooms int := 0;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RETURN jsonb_build_object('allowed', false, 'used', false, 'reason', 'not_resident');
  END IF;

  SELECT hostel_category_id INTO v_cat FROM learners_profiles WHERE id = v_lp;
  SELECT name, allow_self_room_change INTO v_cat_name, v_allow
    FROM hostel_categories WHERE id = v_cat;
  IF NOT COALESCE(v_allow, false) THEN
    RETURN jsonb_build_object('allowed', false, 'used', false,
      'reason', 'category_not_eligible', 'category_name', v_cat_name);
  END IF;

  SELECT ha.id, ha.room_id, ha.bed_id, ha.academic_year_id,
         r.room_number, r.floor, bl.name AS block_name, bd.bed_number
    INTO v_alloc
    FROM hostel_allocations ha
    JOIN hostel_rooms  r  ON r.id  = ha.room_id
    JOIN hostel_blocks bl ON bl.id = r.block_id
    JOIN hostel_beds   bd ON bd.id = ha.bed_id
   WHERE ha.learner_id = v_profile AND ha.status = 'active'
   ORDER BY ha.allocation_date DESC LIMIT 1;
  IF v_alloc.id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'used', false,
      'reason', 'no_allocation', 'category_name', v_cat_name);
  END IF;

  -- The audit trail is the counter: one tagged allocation per academic year.
  v_used := EXISTS (
    SELECT 1 FROM hostel_allocations ha
     WHERE ha.learner_id = v_profile
       AND ha.academic_year_id = v_alloc.academic_year_id
       AND ha.metadata->>'self_room_change' = 'true');

  SELECT count(DISTINCT o.room_id) INTO v_rooms
    FROM _cl_room_options(v_profile, v_lp, v_cat) o
   WHERE o.room_id <> v_alloc.room_id;

  RETURN jsonb_build_object(
    'allowed', (NOT v_used AND v_rooms > 0),
    'used', v_used,
    'reason', CASE WHEN v_used THEN 'already_used'
                   WHEN v_rooms = 0 THEN 'no_rooms'
                   ELSE NULL END,
    'category_name', v_cat_name,
    'available_rooms', v_rooms,
    'current_room_number', v_alloc.room_number,
    'current_block_name', v_alloc.block_name,
    'current_bed_number', v_alloc.bed_number,
    'current_floor', v_alloc.floor);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_room_change_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_my_room_change_status() TO authenticated, service_role;

-- 3) Options — same category only, current room excluded ----------------------
-- Delegates to fn_my_upgrade_room_options so the gender / institution / eligibility /
-- availability rules stay defined in exactly ONE place. auth.uid() survives the nested
-- SECURITY DEFINER call (it reads session JWT claims, not the executing role).
CREATE OR REPLACE FUNCTION public.fn_my_room_change_options()
RETURNS TABLE(room_id uuid, room_number text, floor integer, block_name text,
              capacity integer, occupied_beds integer, available_beds integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id(); v_profile uuid := auth.uid();
  v_cat uuid; v_cur_room uuid; v_allow boolean := false; v_ay uuid;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cat FROM learners_profiles WHERE id = v_lp;
  SELECT allow_self_room_change INTO v_allow FROM hostel_categories WHERE id = v_cat;
  IF NOT COALESCE(v_allow, false) THEN RETURN; END IF;

  SELECT ha.room_id, ha.academic_year_id INTO v_cur_room, v_ay
    FROM hostel_allocations ha
   WHERE ha.learner_id = v_profile AND ha.status = 'active'
   ORDER BY ha.allocation_date DESC LIMIT 1;
  IF v_cur_room IS NULL THEN RETURN; END IF;

  -- Do not enumerate rooms once the single allowance is spent.
  IF EXISTS (SELECT 1 FROM hostel_allocations ha
              WHERE ha.learner_id = v_profile AND ha.academic_year_id = v_ay
                AND ha.metadata->>'self_room_change' = 'true') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.room_id, o.room_number, o.floor, o.block_name,
         o.capacity, o.occupied_beds, o.available_beds
  FROM fn_my_upgrade_room_options(v_cat) o
  WHERE o.room_id <> v_cur_room;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_room_change_options() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_my_room_change_options() TO authenticated, service_role;

-- 4) Execute — vacate the old bed, occupy the new one, spend the allowance -----
CREATE OR REPLACE FUNCTION public.fn_self_change_room(p_room_id uuid, p_bed_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id(); v_profile uuid := auth.uid();
  v_cat uuid; v_allow boolean := false; v_old RECORD; v_new_alloc uuid;
  v_bed_status text; v_new_room RECORD;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can change their room';
  END IF;

  SELECT hostel_category_id INTO v_cat FROM learners_profiles WHERE id = v_lp;
  SELECT allow_self_room_change INTO v_allow FROM hostel_categories WHERE id = v_cat;
  IF NOT COALESCE(v_allow, false) THEN
    RAISE EXCEPTION 'Room change is not available for your category';
  END IF;

  SELECT ha.id, ha.room_id, ha.bed_id, ha.tier_id, ha.academic_year_id, ha.semester_id,
         ha.institution_id, ha.batch_id, ha.emergency_contact_name,
         ha.emergency_contact_phone, ha.emergency_contact_relation
    INTO v_old
    FROM hostel_allocations ha
   WHERE ha.learner_id = v_profile AND ha.status = 'active'
   ORDER BY ha.allocation_date DESC LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'You have no active allocation to change'; END IF;

  IF EXISTS (SELECT 1 FROM hostel_allocations ha
              WHERE ha.learner_id = v_profile AND ha.academic_year_id = v_old.academic_year_id
                AND ha.metadata->>'self_room_change' = 'true') THEN
    RAISE EXCEPTION 'You have already used your one room change for this academic year';
  END IF;

  IF p_room_id = v_old.room_id THEN
    RAISE EXCEPTION 'That is already your room. Pick a different one.';
  END IF;

  -- Same-category guard. _cl_room_options is scoped to v_cat, so a room outside the
  -- resident's own category can never validate below — this only makes the failure loud.
  SELECT r.id, r.room_number, r.block_id, r.category_id INTO v_new_room
    FROM hostel_rooms r WHERE r.id = p_room_id;
  IF v_new_room.id IS NULL
     OR v_new_room.category_id IS DISTINCT FROM
        (SELECT COALESCE(room_source_category_id, id) FROM hostel_categories WHERE id = v_cat) THEN
    RAISE EXCEPTION 'You can only move to another room in your own category';
  END IF;

  IF p_bed_id IS NULL THEN
    SELECT o.bed_id INTO p_bed_id
      FROM _cl_room_options(v_profile, v_lp, v_cat) o
     WHERE o.room_id = p_room_id ORDER BY o.bed_number LIMIT 1;
    IF p_bed_id IS NULL THEN RAISE EXCEPTION 'No available bed left in that room. Pick another room.'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _cl_room_options(v_profile, v_lp, v_cat) o
                  WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for you';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'That bed is no longer available';
  END IF;

  -- 2026-08-06: check_out_date is what hostel_allocations_room_bed_active_uidx reads.
  -- Without it the vacated row keeps reserving (room_id, bed_id) and the old bed can
  -- never be re-used, even though hostel_beds says 'available'.
  UPDATE hostel_allocations
     SET status='vacated', actual_vacate_date=CURRENT_DATE,
         check_out_date=CURRENT_DATE, updated_at=now()
   WHERE id = v_old.id;
  UPDATE hostel_beds SET status='available', current_occupant_id=NULL WHERE id = v_old.bed_id;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, batch_id, metadata
  ) VALUES (
    v_old.institution_id, v_profile, v_new_room.block_id, p_room_id, p_bed_id,
    v_old.academic_year_id, v_old.semester_id, 'transfer', CURRENT_DATE, 'active',
    v_old.emergency_contact_name, v_old.emergency_contact_phone, v_old.emergency_contact_relation,
    v_old.tier_id, v_profile, v_old.batch_id,
    jsonb_build_object('self_room_change', true,
                       'from_room_id', v_old.room_id,
                       'from_bed_id',  v_old.bed_id,
                       'changed_at',   to_jsonb(now()))
  ) RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile WHERE id = p_bed_id;

  RETURN jsonb_build_object('success', true,
    'old_allocation_id', v_old.id, 'new_allocation_id', v_new_alloc,
    'old_room_id', v_old.room_id, 'new_room_id', p_room_id,
    'new_bed_id', p_bed_id, 'new_room_number', v_new_room.room_number);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_self_change_room(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_self_change_room(uuid, uuid) TO authenticated, service_role;
