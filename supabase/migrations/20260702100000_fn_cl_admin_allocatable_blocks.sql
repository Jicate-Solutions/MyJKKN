-- Block-level companion to fn_cl_admin_allocatable_rooms: every hostel block
-- annotated with how many rooms/beds THIS learner can actually be allocated
-- (same predicates: gender, free beds, institution-serving, cohort
-- eligibility, category fail-open). Lets the AllocateRoomDialog rank blocks
-- and auto-select one that works instead of making the admin guess.
-- Gender is checked at block level first so non-matching blocks skip the
-- per-room eligibility functions entirely (they report 0 without the cost).
CREATE OR REPLACE FUNCTION public.fn_cl_admin_allocatable_blocks(
  p_learner_profile_id uuid
)
RETURNS TABLE(
  block_id uuid, block_name text, block_code text, hostel_type text,
  gender_ok boolean, allocatable_rooms integer, free_beds integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inst   uuid;
  v_gender text;
  v_has_elig boolean;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view allocatable blocks' USING ERRCODE = '42501';
  END IF;

  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_profile_id;
  IF v_inst IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE = '42501';
  END IF;

  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id
   WHERE lp.id = p_learner_profile_id;

  SELECT EXISTS (SELECT 1 FROM fn_hostel_learner_room_categories(p_learner_profile_id))
    INTO v_has_elig;

  RETURN QUERY
  SELECT bl.id, bl.name, bl.code, bl.hostel_type::text,
         g.c_gender,
         COALESCE(cnt.rooms, 0), COALESCE(cnt.beds, 0)
  FROM hostel_blocks bl
  CROSS JOIN LATERAL (
    SELECT (bl.hostel_type::text = 'mixed'
      OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
      OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls')) AS c_gender
  ) g
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS rooms, COALESCE(sum(av.free), 0)::int AS beds
    FROM hostel_rooms r
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS free FROM hostel_beds b
      WHERE b.room_id = r.id AND b.status = 'available'
        AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                         WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
    ) av
    WHERE r.block_id = bl.id
      AND r.room_purpose = 'student'
      AND g.c_gender
      AND av.free > 0
      AND fn_room_serves_institution(r.id, v_inst)
      AND fn_learner_eligible_for_room(p_learner_profile_id, r.id)
      AND (NOT v_has_elig
           OR r.category_id IN (SELECT elig.category_id
                                FROM fn_hostel_learner_room_categories(p_learner_profile_id) elig))
  ) cnt ON true
  ORDER BY COALESCE(cnt.rooms, 0) DESC, bl.name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_blocks(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_blocks(uuid) TO authenticated;
