-- "Who does this leave type actually reach?"
--
-- The admin screen must answer this BEFORE the generator runs, because the
-- generator's own answer only becomes visible as balance rows afterwards.
-- Two failure modes this makes visible up front:
--
--   * a department-scoped type misses the 309 active staff who have no
--     department_id at all — they are counted separately, not silently
--     dropped;
--   * an assignment that matches nobody (empty department, inactive staff)
--     reads as 0 reached rather than looking configured-and-fine.
--
-- Mirrors the generator's eligibility and precedence exactly. If the two ever
-- disagree, this preview is the one that is wrong — the generator writes the
-- rows.

CREATE OR REPLACE FUNCTION public.hr_leave_type_coverage(p_leave_type_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_org   uuid;
  v_inst  uuid;
  v_count integer;
  v_out   jsonb;
BEGIN
  SELECT t.hr_organization_id, o.institution_id
    INTO v_org, v_inst
  FROM public.hr_leave_types t
  JOIN public.hr_organizations o ON o.id = t.hr_organization_id
  WHERE t.id = p_leave_type_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Unknown leave_type_id %', p_leave_type_id;
  END IF;

  -- SECURITY DEFINER bypasses the caller's RLS, so this must scope itself:
  -- permission AND membership of the owning organization, matching hlta_write.
  IF NOT public.is_super_admin()
     AND NOT (public.user_has_permission('hr.leave.types.manage')
              AND v_org IN (SELECT unnest(public.fn_my_hr_organization_ids()))) THEN
    RAISE EXCEPTION 'Not authorized to inspect this leave type';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.hr_leave_type_assignments
  WHERE leave_type_id = p_leave_type_id AND is_active;

  WITH eligible AS (
    SELECT s.id, s.department_id, m.scope_kind, m.entitled_days
    FROM public.staff s
    LEFT JOIN LATERAL (
      SELECT a.entitled_days, a.scope_kind
      FROM public.hr_leave_type_assignments a
      WHERE a.leave_type_id = p_leave_type_id
        AND a.is_active
        AND (
             (a.scope_kind = 'staff'      AND a.staff_id      = s.id)
          OR (a.scope_kind = 'department' AND a.department_id = s.department_id)
          OR (a.scope_kind = 'organization')
        )
      ORDER BY CASE a.scope_kind
                 WHEN 'staff' THEN 1 WHEN 'department' THEN 2 ELSE 3 END
      LIMIT 1
    ) m ON true
    WHERE s.institution_id = v_inst
      AND s.is_active
      AND (v_count = 0 OR m.scope_kind IS NOT NULL)
  )
  SELECT jsonb_build_object(
    'assignment_count', v_count,
    'is_org_wide',      (v_count = 0),
    'reached',          (SELECT count(*) FROM eligible),
    'active_staff',     (SELECT count(*) FROM public.staff
                          WHERE institution_id = v_inst AND is_active),
    'by_scope', COALESCE((
      SELECT jsonb_object_agg(k, c) FROM (
        SELECT COALESCE(scope_kind, 'unassigned') AS k, count(*) AS c
        FROM eligible GROUP BY 1
      ) z
    ), '{}'::jsonb),
    -- Staff with no department are unreachable by any department-scoped
    -- assignment. Surfaced whenever such an assignment exists, so the gap is
    -- stated at configuration time rather than discovered from a support call.
    'without_department', (
      SELECT count(*) FROM public.staff
      WHERE institution_id = v_inst AND is_active AND department_id IS NULL
    ),
    'has_department_scope', EXISTS (
      SELECT 1 FROM public.hr_leave_type_assignments
      WHERE leave_type_id = p_leave_type_id AND is_active AND scope_kind = 'department'
    )
  )
  INTO v_out;

  RETURN v_out;
END $fn$;

REVOKE ALL ON FUNCTION public.hr_leave_type_coverage(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_type_coverage(uuid) TO authenticated;
