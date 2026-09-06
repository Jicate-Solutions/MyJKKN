-- Residual findings from the second review pass on PR #2282.
--
-- MEDIUM — colleague privacy. hlta_select let ANY staff member at the owning
-- institution read every assignment row, including staff-scoped ones. Those
-- rows say "this named person gets N days", so the policy let the whole
-- institution enumerate who was granted more leave than whom. Organization and
-- department rules are legitimately public (they describe a group you can see
-- yourself in); an individual override is about one person.
--
-- LOW — the coverage preview ignored hr_leave_types.is_active while the
-- generator requires it, so an archived type being edited reported a reach it
-- would never deliver.
--
-- LOW — hr_leave_type_coverage raised 'Unknown leave_type_id %' BEFORE the
-- permission check, so the two messages distinguished "does not exist" from
-- "not yours" — an existence oracle for another tenant's UUIDs. Both paths now
-- return the same message.
--
-- NOT changed, with reasons:
--   * hr_staff_details fan-out was raised as a risk; it has a primary key and
--     543 rows for 543 distinct staff_id, so the join is strictly 1:1 and
--     cannot multiply rows.
--   * hlta_write does not yet assert that department_id / staff_id belong to
--     the same institution as hr_organization_id. A mismatched id produces a
--     row that matches nobody rather than a leak, because the generator only
--     joins targets within the institution. Worth a trigger later; not a
--     correctness hole now.
--
-- Verified after applying:
--   colleague reads a peer's individual 30-day override -> not visible
--   same colleague reads the organization rule          -> visible

DROP POLICY IF EXISTS hlta_select ON public.hr_leave_type_assignments;
CREATE POLICY hlta_select ON public.hr_leave_type_assignments
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    -- Managers: permission AND membership, mirroring hlta_write exactly.
    OR (
      public.user_has_permission('hr.leave.types.manage')
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    )
    -- Everyone else at the institution sees GROUP rules only — those describe
    -- a set you can already tell you belong to.
    OR (
      scope_kind IN ('organization','department')
      AND hr_organization_id IN (SELECT unnest(public.hr_staff_visible_org_ids()))
    )
    -- An individual rule is visible to its own subject, and to nobody else.
    OR (
      scope_kind = 'staff'
      AND staff_id IN (SELECT unnest(public.fn_my_staff_ids()))
    )
  );

CREATE OR REPLACE FUNCTION public.hr_leave_type_coverage(p_leave_type_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_org    uuid;
  v_inst   uuid;
  v_active boolean;
  v_count  integer;
  v_out    jsonb;
BEGIN
  SELECT t.hr_organization_id, o.institution_id, t.is_active
    INTO v_org, v_inst, v_active
  FROM public.hr_leave_types t
  JOIN public.hr_organizations o ON o.id = t.hr_organization_id
  WHERE t.id = p_leave_type_id;

  -- One message for "does not exist" and "not yours". Distinguishing them
  -- tells an outsider which UUIDs are real.
  IF v_org IS NULL
     OR (NOT public.is_super_admin()
         AND NOT (public.user_has_permission('hr.leave.types.manage')
                  AND v_org IN (SELECT unnest(public.fn_my_hr_organization_ids())))) THEN
    RAISE EXCEPTION 'Leave type not found or not accessible';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.hr_leave_type_assignments
  WHERE leave_type_id = p_leave_type_id AND is_active;

  WITH lt AS (
    SELECT applicable_cadre_ids, applicable_gender
    FROM public.hr_leave_types WHERE id = p_leave_type_id
  ),
  eligible AS (
    SELECT s.id, s.department_id, m.scope_kind, m.entitled_days
    FROM public.staff s
    CROSS JOIN lt
    LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
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
      -- The generator requires an active type; an archived one reaches nobody.
      AND v_active
      AND (v_count = 0 OR m.scope_kind IS NOT NULL)
      AND (lt.applicable_cadre_ids IS NULL OR d.cadre_id = ANY(lt.applicable_cadre_ids))
      AND (
        lt.applicable_gender = 'all'
        OR lower(coalesce(s.gender, '')) = lt.applicable_gender
      )
  )
  SELECT jsonb_build_object(
    'assignment_count', v_count,
    'is_org_wide',      (v_count = 0),
    'is_type_active',   v_active,
    'reached',          (SELECT count(*) FROM eligible),
    'active_staff',     (SELECT count(*) FROM public.staff
                          WHERE institution_id = v_inst AND is_active),
    'by_scope', COALESCE((
      SELECT jsonb_object_agg(k, c) FROM (
        SELECT COALESCE(scope_kind, 'unassigned') AS k, count(*) AS c
        FROM eligible GROUP BY 1
      ) z
    ), '{}'::jsonb),
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
