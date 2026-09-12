-- ============================================================================
-- Campus Living — the office-side room picker uses the same pool as the learner
-- ============================================================================
-- 2026-11-28 · follows 20261128000000_hostel_category_room_sources.sql
--
-- fn_cl_admin_room_options is what the hostel office sees when it upgrades a
-- learner from the Residents screen. It was matching rooms on
-- `r.category_id = p_category_id` verbatim — it never even honoured
-- room_source_category_id, so it could not offer a "Deluxe Plus" room either.
--
-- The write path it feeds (fn_cl_admin_upgrade_room -> _cl_upgrade_room_category
-- -> _cl_room_options) now accepts the widened pool, so leaving this read path
-- narrow would mean the office can no longer see the rooms its own RPC accepts —
-- exactly the placements it has been making by hand since August.
--
-- Same three columns as the learner picker (source_category_id,
-- source_category_name, is_native) so both share one TypeScript type.
-- RETURNS TABLE changes, so DROP + CREATE; dropping re-grants EXECUTE to PUBLIC,
-- hence the REVOKE/GRANT pair restoring the original ACL.
--
-- Deliberately NOT changed: this function still ignores skip_room_eligibility,
-- which _cl_room_options applies. That difference predates this work and is left
-- for a separate fix rather than widened here by accident.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_cl_admin_room_options(uuid, uuid);

CREATE FUNCTION public.fn_cl_admin_room_options(p_learner_id uuid, p_category_id uuid)
 RETURNS TABLE(room_id uuid, room_number text, floor integer, block_name text,
               capacity integer, occupied_beds integer, available_beds integer,
               source_category_id uuid, source_category_name text, is_native boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_gender text;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_id;
  IF v_inst IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE='42501';
  END IF;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id WHERE lp.id = p_learner_id;

  RETURN QUERY
  SELECT r.id, r.room_number, r.floor, bl.name,
         COALESCE(r.actual_capacity, r.capacity)::int,
         GREATEST(COALESCE(r.actual_capacity, r.capacity)::int - av.free, 0),
         av.free,
         rc.id, rc.name, src.is_native
  FROM fn_cl_category_room_sources(p_category_id) src
  JOIN hostel_rooms r       ON r.category_id = src.source_category_id
  JOIN hostel_categories rc ON rc.id = r.category_id
  JOIN hostel_blocks bl     ON bl.id = r.block_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS free FROM hostel_beds b
    WHERE b.room_id = r.id AND b.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
  ) av
  WHERE r.room_purpose = 'student'
    AND (bl.hostel_type::text = 'mixed'
         OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
         OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls'))
    AND fn_room_serves_institution(r.id, v_inst)
    AND fn_learner_eligible_for_room(p_learner_id, r.id)
    AND av.free > 0
  ORDER BY src.is_native DESC, src.pool_rank, bl.name, r.floor, r.room_number;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_room_options(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_room_options(uuid, uuid) TO authenticated, service_role;
