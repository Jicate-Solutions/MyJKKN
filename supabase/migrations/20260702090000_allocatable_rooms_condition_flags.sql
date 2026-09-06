-- Allocate dialog "why not allocatable" diagnostics: return ALL student rooms
-- in the block with per-condition verdict flags (mirrors the auto-allocate
-- preview pattern) instead of pre-filtering, so the dialog can explain exactly
-- which condition excluded each room (gender, college served, cohort
-- reservation, room category, free beds). Return type changes, so DROP +
-- CREATE (CREATE OR REPLACE cannot change RETURNS TABLE) and re-grant.
DROP FUNCTION IF EXISTS public.fn_cl_admin_allocatable_rooms(uuid, uuid);

CREATE FUNCTION public.fn_cl_admin_allocatable_rooms(
  p_learner_profile_id uuid,
  p_block_id uuid
)
RETURNS TABLE(
  room_id uuid, room_number text, floor integer,
  category_id uuid, category_name text,
  capacity integer, available_beds integer,
  is_allocatable boolean,
  gender_ok boolean, institution_ok boolean, eligibility_ok boolean,
  category_ok boolean, has_free_beds boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inst   uuid;
  v_gender text;
  v_has_elig boolean;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view allocatable rooms' USING ERRCODE = '42501';
  END IF;

  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_profile_id;
  IF v_inst IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE = '42501';
  END IF;

  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id
   WHERE lp.id = p_learner_profile_id;

  -- Fail-open on category: only narrow to the learner's eligible categories when
  -- some are configured (matches the dialog's prior fail-open behavior).
  SELECT EXISTS (SELECT 1 FROM fn_hostel_learner_room_categories(p_learner_profile_id))
    INTO v_has_elig;

  RETURN QUERY
  SELECT r.id, r.room_number, r.floor, r.category_id, hc.name,
         COALESCE(r.actual_capacity, r.capacity)::int,
         av.free,
         (chk.c_gender AND chk.c_institution AND chk.c_eligibility AND chk.c_category AND av.free > 0),
         chk.c_gender, chk.c_institution, chk.c_eligibility, chk.c_category,
         av.free > 0
  FROM hostel_rooms r
  JOIN hostel_blocks bl ON bl.id = r.block_id
  LEFT JOIN hostel_categories hc ON hc.id = r.category_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS free FROM hostel_beds b
    WHERE b.room_id = r.id AND b.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                       WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
  ) av
  CROSS JOIN LATERAL (
    SELECT
      (bl.hostel_type::text = 'mixed'
        OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
        OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls')) AS c_gender,
      fn_room_serves_institution(r.id, v_inst)                              AS c_institution,
      fn_learner_eligible_for_room(p_learner_profile_id, r.id)             AS c_eligibility,
      (NOT v_has_elig
        OR r.category_id IN (SELECT elig.category_id
                             FROM fn_hostel_learner_room_categories(p_learner_profile_id) elig)) AS c_category
  ) chk
  WHERE r.block_id = p_block_id
    AND r.room_purpose = 'student'
  ORDER BY 8 DESC, r.floor, r.room_number;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_rooms(uuid, uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_rooms(uuid, uuid) TO authenticated;
