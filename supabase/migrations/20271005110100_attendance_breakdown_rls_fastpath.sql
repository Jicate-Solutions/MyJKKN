-- fn_cl_attendance_breakdown timed out (57014) for a block-scoped warden.
--
-- MEASURED 2026-10-05: one RLS-filtered scan of hostel_attendance as a warden =
-- 8.9 s for 28k rows. The SELECT policy calls role_has_institution_access() /
-- role_has_block_access() PER ROW, and those are plpgsql hitting user_block_access
-- each time. Super admins skip it (is_super_admin() is an InitPlan), which is why
-- only wardens saw it.
--
-- FIX: evaluate the same access rule once per DISTINCT (institution_id, block_id)
-- pair — a handful — and keep the rows that pass. The helper mirrors the SELECT
-- policy exactly:
--   is_super_admin OR is_admin OR
--   (user_has_permission('campus_living.attendance.view')
--      AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id)))
-- It is SECURITY DEFINER only to skip the per-row policy call; it returns NOTHING
-- the policy would not (empty when the caller lacks the view key), and exposes only
-- four columns.

CREATE OR REPLACE FUNCTION public.fn_cl_attendance_rows(
  p_from     date,
  p_to       date,
  p_block_id uuid DEFAULT NULL
)
RETURNS TABLE (att_date date, blk_id uuid, lrn_id uuid, status public.hostel_attendance_status_enum)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_all boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  v_all := (SELECT public.is_super_admin()) OR (SELECT public.is_admin());
  IF NOT v_all AND NOT (SELECT public.user_has_permission('campus_living.attendance.view')) THEN
    RETURN;   -- what the SELECT policy would return: nothing
  END IF;

  RETURN QUERY
  WITH pairs AS MATERIALIZED (
    SELECT DISTINCT ha.institution_id AS inst, ha.block_id AS blk
    FROM public.hostel_attendance ha
    WHERE ha.date BETWEEN p_from AND p_to
      AND (p_block_id IS NULL OR ha.block_id = p_block_id)
  ),
  ok AS MATERIALIZED (
    SELECT inst, blk FROM pairs
    WHERE v_all
       OR public.role_has_institution_access(inst)
       OR public.role_has_block_access(blk)
  )
  SELECT ha.date, ha.block_id, ha.learner_id, ha.evening_status
  FROM public.hostel_attendance ha
  JOIN ok ON ok.inst IS NOT DISTINCT FROM ha.institution_id
         AND ok.blk  IS NOT DISTINCT FROM ha.block_id
  WHERE ha.date BETWEEN p_from AND p_to
    AND (p_block_id IS NULL OR ha.block_id = p_block_id);
END $$;

REVOKE ALL ON FUNCTION public.fn_cl_attendance_rows(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_attendance_rows(date, date, uuid) TO authenticated, service_role;

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

  WITH base AS MATERIALIZED (
    -- Rows the caller may see, access rule evaluated once per block/institution
    -- pair (see fn_cl_attendance_rows) instead of once per row.
    SELECT r.att_date AS date, r.blk_id AS block_id, r.lrn_id AS learner_id, r.status AS evening_status
    FROM fn_cl_attendance_rows(p_from, p_to, p_block_id) r
  ),
  alloc AS MATERIALIZED (
    SELECT a.learner_id, a.block_id
    FROM hostel_allocations a
    WHERE a.status = 'active'
      AND (p_block_id IS NULL OR a.block_id = p_block_id)
  ),
  ids AS (
    SELECT array_agg(DISTINCT x) AS a
    FROM (SELECT learner_id AS x FROM base UNION SELECT learner_id FROM alloc) u
  ),
  dims AS MATERIALIZED (
    SELECT * FROM fn_cl_learner_dims(COALESCE((SELECT a FROM ids), ARRAY[]::uuid[]))
  ),
  j AS MATERIALIZED (
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
  marked AS MATERIALIZED (SELECT DISTINCT learner_id FROM base),
  residents AS (
    SELECT al.block_id, d.institution_id, d.department_id,
           count(DISTINCT al.learner_id) AS residents,
           count(DISTINCT al.learner_id) FILTER (
             WHERE al.learner_id IN (SELECT learner_id FROM marked)) AS marked
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
    'residents_visible', EXISTS (SELECT 1 FROM alloc)
  ) INTO v_out;

  RETURN v_out;
END $$;
