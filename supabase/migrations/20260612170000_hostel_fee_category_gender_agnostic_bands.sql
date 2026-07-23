-- Make fee-condition (hostel_program_eligibility) category write-back GENDER-AGNOSTIC.
--
-- Requirement (2026-06-12): the category CONDITION (fee band -> room/mess category)
-- is the SAME for boys and girls. Operators configure a band ONCE; each learner
-- should land in their OWN gender's physical category of that name.
--
-- Previously (mig 20260612130000) fn_apply gender-FILTERED band results
-- (`WHERE hc.type = v_gender_type`), so a girls-typed band could never match a boy
-- -> all boys fell back to Classic. Since every band was saved girls-typed, no boy
-- ever received a band category.
--
-- Fix: resolve the band's category by NAME (gender-blind), then map to the
-- learner's-gender variant of that same name. One band now serves both genders:
--   band "Deluxe Room" -> boy gets Deluxe Room (boys), girl gets Deluxe Room (girls).
-- Backward-compatible: girls keep their exact current result; boys begin matching.
-- Category names are identical across genders (Classic Room / Deluxe Room ; Classic
-- / Premium), so the name join is reliable. NULL/unknown gender => no band (unchanged).
--
-- Precedence unchanged: allocation wins ROOM; Classic-default for bill-holders with
-- no band; overwrite-never-wipe.

CREATE OR REPLACE FUNCTION public.fn_apply_hostel_fee_categories(p_learner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gender      text;
  v_gender_type text;   -- 'boys' | 'girls' | NULL
  v_allocated   boolean;
  v_has_bill    boolean;
  v_room        uuid;
  v_mess        uuid;
  v_cur_room    uuid;
  v_cur_mess    uuid;
  v_new_room    uuid;
  v_new_mess    uuid;
BEGIN
  -- Only stamp HOSTEL learners.
  SELECT lp.gender
    INTO v_gender
  FROM learners_profiles lp
  JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
  WHERE lp.id = p_learner_id AND acc.code = 'hostel';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_gender_type := CASE
                     WHEN lower(v_gender) LIKE 'm%' THEN 'boys'
                     WHEN lower(v_gender) LIKE 'f%' THEN 'girls'
                     ELSE NULL
                   END;

  -- Default-to-Classic only applies to learners who actually have a bill.
  v_has_bill := EXISTS (
    SELECT 1 FROM billing_student_bills b
    WHERE b.student_id = p_learner_id
      AND b.fee_source = 'academic'
      AND b.status NOT IN ('cancelled','superseded')
  );

  -- Allocation wins for ROOM.
  v_allocated := EXISTS (
    SELECT 1
    FROM hostel_allocations ha
    JOIN profiles p ON p.id = ha.learner_id
    WHERE p.learner_id = p_learner_id
      AND ha.status = 'active'
  );

  -- (1) Fee-band category, GENDER-AGNOSTIC: the band condition is the same for both
  --     genders. Resolve the band's category NAME (gender-blind), then map to the
  --     learner's-gender variant of that name. (NULL gender => no band.)
  SELECT gv.id INTO v_room
  FROM fn_hostel_learner_room_categories(p_learner_id) r
  JOIN hostel_categories bc ON bc.id = r.category_id
  JOIN hostel_categories gv ON gv.name = bc.name
                           AND gv.type = v_gender_type
                           AND gv.is_active
  LIMIT 1;

  SELECT gv.id INTO v_mess
  FROM fn_hostel_learner_mess_categories(p_learner_id) m
  JOIN mess_categories bc ON bc.id = m.category_id
  JOIN mess_categories gv ON gv.name = bc.name
                         AND gv.type = v_gender_type
                         AND gv.is_active
  LIMIT 1;

  -- (2) Classic default (gender-matched) for bill-holders with no band match.
  IF v_room IS NULL AND v_has_bill AND v_gender_type IS NOT NULL THEN
    SELECT id INTO v_room
    FROM hostel_categories
    WHERE name = 'Classic Room' AND type = v_gender_type AND is_active
    ORDER BY sort_order
    LIMIT 1;
  END IF;

  IF v_mess IS NULL AND v_has_bill AND v_gender_type IS NOT NULL THEN
    SELECT id INTO v_mess
    FROM mess_categories
    WHERE name = 'Classic' AND type = v_gender_type AND is_active
    ORDER BY sort_order
    LIMIT 1;
  END IF;

  -- Apply: allocation-wins (room) + overwrite-never-wipe.
  SELECT hostel_category_id, mess_category_id
    INTO v_cur_room, v_cur_mess
  FROM learners_profiles
  WHERE id = p_learner_id;

  v_new_room := CASE WHEN v_allocated THEN v_cur_room
                     ELSE COALESCE(v_room, v_cur_room) END;
  v_new_mess := COALESCE(v_mess, v_cur_mess);

  IF v_new_room IS DISTINCT FROM v_cur_room
     OR v_new_mess IS DISTINCT FROM v_cur_mess THEN
    UPDATE learners_profiles
       SET hostel_category_id = v_new_room,
           mess_category_id   = v_new_mess,
           updated_at         = now()
     WHERE id = p_learner_id;
    RETURN true;
  END IF;

  RETURN false;
END
$function$;

-- Re-run the backfill with the gender-agnostic logic (all institutions).
SELECT public.fn_apply_hostel_fee_categories_bulk(NULL);
