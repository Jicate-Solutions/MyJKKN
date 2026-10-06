-- Hostel attendance: institution / department / block breakdown for the
-- /campus-living/attendance dashboard.
--
-- WHY A CUBE: the page cross-filters (click an institution → every chart and table
-- narrows). One small, pre-aggregated result at grain (date, block, institution,
-- department) lets the browser re-aggregate instantly with no refetch. Production
-- today: 28,433 marks → 986 cube rows for the whole history.
--
-- WHY fn_cl_learner_dims IS A DEFINER HELPER: a learner's department / institution
-- live on learners_profiles, whose SELECT RLS hides cross-college residents from a
-- block-scoped warden (see HostelAttendanceService.getMarkableResidents). A plain
-- INVOKER join would silently DROP those rows. The helper returns only
-- (profile, institution, department + their names) for people who are hostellers,
-- behind the attendance.view gate — nothing else on learners_profiles.
--
-- Presence rules reuse fn_cl_attendance_is_present / counts_in_pct, so every number
-- agrees with fn_cl_attendance_dashboard and the analytics page.

CREATE OR REPLACE FUNCTION public.fn_cl_learner_dims(p_profile_ids uuid[])
RETURNS TABLE (
  profile_id        uuid,
  institution_id    uuid,
  institution_name  text,
  department_id     uuid,
  department_name   text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT ((SELECT public.is_super_admin())
          OR (SELECT public.is_admin())
          OR (SELECT public.user_has_permission('campus_living.attendance.view'))) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, lp.institution_id, i.name::text, lp.department_id, d.department_name::text
  FROM public.profiles p
  JOIN public.learners_profiles lp ON lp.id = p.learner_id
  LEFT JOIN public.institutions i ON i.id = lp.institution_id
  LEFT JOIN public.departments  d ON d.id = lp.department_id
  WHERE p.id = ANY (p_profile_ids)
    AND (EXISTS (SELECT 1 FROM public.hostel_attendance ha WHERE ha.learner_id = p.id)
         OR EXISTS (SELECT 1 FROM public.hostel_allocations a WHERE a.learner_id = p.id));
END $$;

CREATE OR REPLACE FUNCTION public.fn_cl_attendance_breakdown(
  p_from     date,
  p_to       date,
  p_block_id uuid    DEFAULT NULL,
  p_risk_pct numeric DEFAULT 75
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = '22007';
  END IF;
  IF p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Range too long (max 366 days)' USING ERRCODE = '22007';
  END IF;

  WITH base AS (
    -- INVOKER: hostel_attendance RLS scopes these rows to the caller.
    SELECT ha.date, ha.block_id, ha.learner_id, ha.evening_status
    FROM hostel_attendance ha
    WHERE ha.date BETWEEN p_from AND p_to
      AND (p_block_id IS NULL OR ha.block_id = p_block_id)
  ),
  alloc AS (
    SELECT a.learner_id, a.block_id
    FROM hostel_allocations a
    WHERE a.status = 'active'
      AND (p_block_id IS NULL OR a.block_id = p_block_id)
  ),
  ids AS (
    SELECT array_agg(DISTINCT x) AS a
    FROM (SELECT learner_id AS x FROM base UNION SELECT learner_id FROM alloc) u
  ),
  dims AS (
    SELECT * FROM fn_cl_learner_dims(COALESCE((SELECT a FROM ids), ARRAY[]::uuid[]))
  ),
  j AS (
    SELECT b.date, b.block_id, b.learner_id, b.evening_status,
           d.institution_id, d.department_id
    FROM base b LEFT JOIN dims d ON d.profile_id = b.learner_id
  ),
  cube AS (
    SELECT date, block_id, institution_id, department_id,
           count(*)                                          AS m,
           count(*) FILTER (WHERE evening_status = 'present')    AS pr,
           count(*) FILTER (WHERE evening_status = 'late_entry') AS la,
           count(*) FILTER (WHERE evening_status = 'absent')     AS ab,
           count(*) FILTER (WHERE evening_status = 'on_leave')   AS ol,
           count(*) FILTER (WHERE evening_status = 'medical')    AS me
    FROM j
    GROUP BY date, block_id, institution_id, department_id
  ),
  residents AS (
    SELECT al.block_id, d.institution_id, d.department_id,
           count(DISTINCT al.learner_id) AS residents,
           count(DISTINCT al.learner_id) FILTER (
             WHERE al.learner_id IN (SELECT learner_id FROM base)) AS marked
    FROM alloc al LEFT JOIN dims d ON d.profile_id = al.learner_id
    GROUP BY al.block_id, d.institution_id, d.department_id
  ),
  learner_pct AS (
    -- Learner-level rate over the range; latest block wins for a learner who moved.
    SELECT j.learner_id,
           (array_agg(j.block_id ORDER BY j.date DESC))[1] AS block_id,
           max(j.institution_id::text)::uuid AS institution_id,
           max(j.department_id::text)::uuid  AS department_id,
           count(*) FILTER (WHERE fn_cl_attendance_counts_in_pct(j.evening_status)) AS denom,
           count(*) FILTER (WHERE fn_cl_attendance_is_present(j.evening_status))    AS pres
    FROM j
    GROUP BY j.learner_id
  ),
  risk AS (
    SELECT block_id, institution_id, department_id,
           count(*) AS learners,
           count(*) FILTER (WHERE denom >= 3 AND 100.0 * pres / denom < p_risk_pct) AS at_risk
    FROM learner_pct
    GROUP BY block_id, institution_id, department_id
  )
  SELECT jsonb_build_object(
    'range',  jsonb_build_object('from', p_from, 'to', p_to),
    'block_id', p_block_id,
    'risk_pct', p_risk_pct,
    'cube', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'd', to_char(date, 'YYYY-MM-DD'), 'b', block_id, 'i', institution_id, 'p', department_id,
              'm', m, 'pr', pr, 'la', la, 'ab', ab, 'ol', ol, 'me', me)
            ORDER BY date) FROM cube), '[]'::jsonb),
    'residents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'b', block_id, 'i', institution_id, 'p', department_id, 'residents', residents, 'marked', marked))
            FROM residents), '[]'::jsonb),
    'risk', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'b', block_id, 'i', institution_id, 'p', department_id, 'learners', learners, 'at_risk', at_risk))
            FROM risk), '[]'::jsonb),
    'institutions', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('id', institution_id, 'name', institution_name))
            FROM dims WHERE institution_id IS NOT NULL), '[]'::jsonb),
    'departments', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object(
              'id', department_id, 'name', department_name, 'institution_id', institution_id))
            FROM dims WHERE department_id IS NOT NULL), '[]'::jsonb),
    'blocks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', hb.id, 'name', hb.name, 'code', hb.code))
            FROM hostel_blocks hb
            WHERE hb.id IN (SELECT block_id FROM cube UNION SELECT block_id FROM residents)), '[]'::jsonb),
    -- hostel_allocations is gated by campus_living.allocations.view, a different key
    -- from attendance.view. When the caller cannot read it, residents[] is empty and
    -- the UI must say so instead of showing "N of 0".
    'residents_visible', EXISTS (SELECT 1 FROM alloc)
  ) INTO v_out;

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.fn_cl_learner_dims(uuid[])                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_cl_attendance_breakdown(date, date, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_learner_dims(uuid[])                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cl_attendance_breakdown(date, date, uuid, numeric) TO authenticated, service_role;
