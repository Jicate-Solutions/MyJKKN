-- 20260807170000_campus_living_upgrade_skip_room_eligibility.sql
-- Per-PAIR override: let a configured upgrade ignore the physical-room eligibility
-- rules (hostel_room_eligibility_rules / Program Eligibility -> Physical Rooms).
--
-- WHY: those rules exist to steer AUTO-ALLOCATION cohorts into reserved blocks. They
-- are the wrong constraint for a paid, self-service move WITHIN a tier the resident
-- already occupies:
--   * Deluxe -> Deluxe Plus is literally "swap my auto-allocated Deluxe room for
--     another Deluxe room" — the resident is already in that pool.
--   * Premium -> Premium + AC is a move inside the premium tier.
-- Without the override a cohort rule added later would silently empty the picker for
-- these upgrades, with no error — the same class of silent failure this module keeps
-- producing.
--
-- SCOPE — deliberately narrow:
--   * Flag lives on the PAIR (hostel_category_upgrade_fees), not the category, because
--     that table is already the curated ladder (20260807140000). Only the two pairs
--     below are flagged; Classic -> * keeps its cohort reservations intact.
--   * fn_room_serves_institution is NOT bypassed. Blocks belong to colleges (Girls
--     Hostel B serves 1 institution, C serves 2); skipping it would place a resident
--     in a block their institution has no access to. It is also the DOMINANT gate — a
--     Classic resident sees 13 of 44 Deluxe rooms because of it, not because of the
--     eligibility rules (those only trim 13.3 -> 12.2).
--   * Gender/hostel-type, room_purpose, bed availability and the not-already-allocated
--     check are all still enforced.
--
-- KNOWN TRADE-OFF: a flagged upgrade can land on a room reserved for another cohort.
-- That is the leak 20260610130000_pin_reserved_cohorts closed for auto-allocation.
-- Here it is one paying resident at a time, opt-in per pair, and accepted.

-- 1) Column ------------------------------------------------------------------
ALTER TABLE public.hostel_category_upgrade_fees
  ADD COLUMN IF NOT EXISTS skip_room_eligibility boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hostel_category_upgrade_fees.skip_room_eligibility IS
  'When true, this from->to upgrade ignores hostel_room_eligibility_rules so the '
  'resident may pick ANY available room in the target pool. Institution scoping, '
  'gender and bed availability are still enforced. Read by fn_my_room_options, '
  'fn_my_upgrade_room_options and _cl_room_options - all three must agree or the '
  'picker offers rooms the bed validator then rejects.';

UPDATE public.hostel_category_upgrade_fees uf
   SET skip_room_eligibility = true, updated_at = now()
  FROM public.hostel_categories f, public.hostel_categories t
 WHERE uf.from_hostel_category_id = f.id
   AND uf.to_hostel_category_id   = t.id
   AND (   (f.name = 'Deluxe Room'  AND t.name = 'Deluxe Plus Room')
        OR (f.name = 'Premium Room' AND t.name = 'Premium Room + AC'));

-- 2) The three room/bed loaders honour the flag -------------------------------
-- Each resolves the pair from the LEARNER'S CURRENT category -> p_category_id, so the
-- override applies only on the configured edge. No signature changes => CREATE OR
-- REPLACE keeps grants and dependent callers intact.

CREATE OR REPLACE FUNCTION public.fn_my_room_options(p_category_id uuid)
RETURNS TABLE(bed_id uuid, room_id uuid, room_number text, floor integer, block_name text, bed_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_inst uuid; v_gender text; v_src uuid; v_cur_cat uuid; v_year uuid; v_skip boolean := false;
BEGIN
  IF v_lp IS NULL THEN RETURN; END IF;
  -- A "Plus" tier has no rooms of its own; resolve to the pool it sells from.
  SELECT COALESCE(room_source_category_id, id) INTO v_src
    FROM hostel_categories WHERE id = p_category_id;
  IF v_src IS NULL THEN RETURN; END IF;
  SELECT institution_id, hostel_category_id INTO v_inst, v_cur_cat FROM learners_profiles WHERE id=v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id = auth.uid();
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  SELECT COALESCE(bool_or(uf.skip_room_eligibility), false) INTO v_skip
    FROM hostel_category_upgrade_fees uf
   WHERE uf.hostel_year_id = v_year AND uf.is_active
     AND uf.from_hostel_category_id = v_cur_cat
     AND uf.to_hostel_category_id   = p_category_id;
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
    AND (v_skip OR fn_learner_eligible_for_room(v_lp, r.id))
  ORDER BY bl.name, r.floor, r.room_number, b.bed_number;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_options(p_category_id uuid)
RETURNS TABLE(room_id uuid, room_number text, floor integer, block_name text, capacity integer, occupied_beds integer, available_beds integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_inst uuid; v_gender text; v_src uuid; v_cur_cat uuid; v_year uuid; v_skip boolean := false;
BEGIN
  IF v_lp IS NULL THEN RETURN; END IF;
  SELECT COALESCE(room_source_category_id, id) INTO v_src
    FROM hostel_categories WHERE id = p_category_id;
  IF v_src IS NULL THEN RETURN; END IF;
  SELECT institution_id, hostel_category_id INTO v_inst, v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id = auth.uid();
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  SELECT COALESCE(bool_or(uf.skip_room_eligibility), false) INTO v_skip
    FROM hostel_category_upgrade_fees uf
   WHERE uf.hostel_year_id = v_year AND uf.is_active
     AND uf.from_hostel_category_id = v_cur_cat
     AND uf.to_hostel_category_id   = p_category_id;
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
    AND (v_skip OR fn_learner_eligible_for_room(v_lp, r.id))
    AND av.free > 0
  ORDER BY bl.name, r.floor, r.room_number;
END $function$;

CREATE OR REPLACE FUNCTION public._cl_room_options(p_profile uuid, p_lp uuid, p_category_id uuid)
RETURNS TABLE(bed_id uuid, room_id uuid, room_number text, floor integer, block_name text, bed_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_gender text; v_src uuid; v_cur_cat uuid; v_year uuid; v_skip boolean := false;
BEGIN
  IF p_lp IS NULL THEN RETURN; END IF;
  SELECT COALESCE(room_source_category_id, id) INTO v_src
    FROM hostel_categories WHERE id = p_category_id;
  IF v_src IS NULL THEN RETURN; END IF;
  SELECT institution_id, hostel_category_id INTO v_inst, v_cur_cat FROM learners_profiles WHERE id = p_lp;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.id = p_profile WHERE lp.id = p_lp;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  SELECT COALESCE(bool_or(uf.skip_room_eligibility), false) INTO v_skip
    FROM hostel_category_upgrade_fees uf
   WHERE uf.hostel_year_id = v_year AND uf.is_active
     AND uf.from_hostel_category_id = v_cur_cat
     AND uf.to_hostel_category_id   = p_category_id;
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
    AND (v_skip OR fn_learner_eligible_for_room(p_lp, r.id))
  ORDER BY bl.name, r.floor, r.room_number, b.bed_number;
END $function$;
