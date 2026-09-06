CREATE OR REPLACE FUNCTION public.fn_cl_room_bed_occupancy(p_room_id uuid)
RETURNS TABLE(bed_id uuid, bed_number text, is_occupied boolean,
              occupant_profile_id uuid, occupant_name text, occupant_roll text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view room occupancy' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.id,
         b.bed_number::text,
         (a.id IS NOT NULL) AS is_occupied,
         a.learner_id AS occupant_profile_id,
         NULLIF(btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), '') AS occupant_name,
         lp.roll_number AS occupant_roll
  FROM hostel_beds b
  LEFT JOIN hostel_allocations a
         ON a.bed_id = b.id AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL
  LEFT JOIN profiles p ON p.id = a.learner_id
  LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
  WHERE b.room_id = p_room_id
  ORDER BY b.bed_number;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_room_bed_occupancy(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_cl_room_bed_occupancy(uuid) TO authenticated;
