-- Staff Balances tab: carry the attributes the /staff/list filter bar keys on.
--
-- WHY: the tab shipped with a name/code search and one "needs attention"
-- toggle. Finding "the non-teaching Ayaahs in Dental whose CL is negative"
-- meant exporting to Excel and filtering there. The staff directory already
-- solves this with six filters -- department, employment category, teaching
-- flag, role, plus designation/email search -- but every one of them keys on a
-- staff column this RPC dropped on the floor.
--
-- WHY WIDEN THE PAYLOAD rather than add filter parameters: the tab renders one
-- institution at a time and the largest is 152 active staff (Dental). The rows
-- are already fetched; carrying eight more scalars costs one payload and lets
-- the facet counts be computed against the loaded set, which is the only way
-- an option count can agree with the table when the filters are ANDed.
--
-- JOIN SAFETY: every added join is 1:1 and verified as such --
-- custom_roles.role_key is unique (0 dups), employment_categories.id is the PK.
-- A fan-out here would not error: jsonb_object_agg would quietly keep the last
-- duplicate key while the count(*) FILTER flag counters below would double.
--
-- NOT ADDED, deliberately:
--   * is_active -- v_hr_leave_balance_src joins `AND s.is_active`, so an
--     inactive person cannot reach this RPC. A status filter would be a
--     control that changes nothing.
--   * employment_type -- 'full_time' for all 754 active staff.
--   * role_type -- 'teacher' for all of them. The real teaching split is
--     employment_categories.is_teaching, which is populated 861/861.

CREATE OR REPLACE FUNCTION public.hr_leave_balance_staff_detail(
  p_hr_org_id          uuid,
  p_hr_academic_year_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ay  record;
  v_org record;
  v_out jsonb;
BEGIN
  -- Gated on .manage, NOT on hr.leave.approve. Reading v_hr_leave_balance
  -- directly would have gated on approve + org membership, and those are
  -- different keys -- Board Member holds manage without approve and would have
  -- seen a silently empty table. Same gate as hr_leave_balance_analytics.
  IF NOT public.user_has_permission('hr.leave.balance.manage') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
  END IF;

  SELECT o.id, o.institution_id, i.name AS institution_name
    INTO v_org
  FROM public.hr_organizations o
  JOIN public.institutions i ON i.id = o.institution_id
  WHERE o.id = p_hr_org_id;

  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_organization_id %', p_hr_org_id;
  END IF;

  IF NOT public.role_has_institution_access(v_org.institution_id) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to institution %',
      v_org.institution_id;
  END IF;

  IF p_hr_academic_year_id IS NULL THEN
    SELECT * INTO v_ay FROM public.hr_academic_years
    WHERE is_active AND CURRENT_DATE BETWEEN start_date AND end_date;
  ELSE
    SELECT * INTO v_ay FROM public.hr_academic_years WHERE id = p_hr_academic_year_id;
  END IF;

  -- No year configured is a page-level empty state, not an error.
  IF v_ay.id IS NULL THEN
    RETURN jsonb_build_object(
      'hr_academic_year_id', NULL, 'year_name', NULL,
      'org_id', v_org.id, 'institution_name', v_org.institution_name,
      'leave_types', '[]'::jsonb, 'staff', '[]'::jsonb
    );
  END IF;

  WITH types AS (
    -- request_category='leave' only. Compensatory Off is credit-backed and
    -- Permission is minute-backed; hr_trig_update_leave_balance skips both, so
    -- their `used` is never maintained and rendering them in a days-denominated
    -- table would show a permanently full balance that means nothing.
    SELECT t.id, t.leave_type_code AS code, t.leave_type_name AS name,
           t.default_entitled_days AS default_days, t.display_order
    FROM public.hr_leave_types t
    WHERE t.hr_organization_id = v_org.id
      AND t.is_active
      AND t.request_category = 'leave'
  ),
  bal AS (
    -- v_hr_leave_balance_src, not hr_leave_balances: the view already resolves
    -- COALESCE(override, balance.entitled, type.default) and reports which one
    -- won. Re-implementing that here would drift from what the staff member
    -- sees in their own apply-leave drawer. It also emits a row for every
    -- eligible (staff, type) pair even with no ledger row -- created_at IS NULL
    -- is how "never provisioned" is detected.
    SELECT v.employee_id, v.leave_type_id, v.entitled, v.used,
           v.carried_forward, v.available, v.entitlement_source,
           (v.created_at IS NOT NULL) AS has_row
    FROM public.v_hr_leave_balance_src v
    JOIN types ty ON ty.id = v.leave_type_id
    WHERE v.hr_organization_id  = v_org.id
      AND v.hr_academic_year_id = v_ay.id
  ),
  people AS (
    SELECT s.id AS employee_id,
           s.staff_id AS staff_code,
           trim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) AS name,
           s.department_id,
           d.department_name,
           -- Filter attributes, mirroring the /staff/list filter bar.
           s.designation,
           s.institution_email,
           s.gender,
           s.category_id,
           ec.category_name,
           ec.is_teaching,
           s.role_key,
           cr.role_name,
           jsonb_object_agg(b.leave_type_id::text, jsonb_build_object(
             'entitled',  b.entitled,
             'used',      b.used,
             'carried',   b.carried_forward,
             'available', b.available,
             'source',    b.entitlement_source,
             'has_row',   b.has_row
           )) AS balances,
           count(*) FILTER (WHERE NOT b.has_row)                              AS missing_rows,
           count(*) FILTER (WHERE b.available < 0)                            AS negative,
           count(*) FILTER (WHERE b.used > b.entitled + b.carried_forward)    AS overdrawn,
           count(*) FILTER (WHERE b.entitlement_source <> 'policy')           AS off_policy
    FROM bal b
    JOIN public.staff s ON s.id = b.employee_id
    LEFT JOIN public.departments d            ON d.id  = s.department_id
    LEFT JOIN public.employment_categories ec ON ec.id = s.category_id
    LEFT JOIN public.custom_roles cr          ON cr.role_key = s.role_key
    GROUP BY s.id, s.staff_id, s.first_name, s.last_name,
             s.department_id, d.department_name,
             s.designation, s.institution_email, s.gender,
             s.category_id, ec.category_name, ec.is_teaching,
             s.role_key, cr.role_name
  )
  SELECT jsonb_build_object(
    'hr_academic_year_id', v_ay.id,
    'year_name',           v_ay.year_name,
    'start_date',          v_ay.start_date,
    'end_date',            v_ay.end_date,
    'org_id',              v_org.id,
    'institution_name',    v_org.institution_name,
    'leave_types', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', id, 'code', code, 'name', name, 'default_days', default_days
             ) ORDER BY display_order, name)
      FROM types), '[]'::jsonb),
    'staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'employee_id',   employee_id,
               'staff_code',    staff_code,
               'name',          name,
               'department_id', department_id,
               'department',    department_name,
               'designation',   designation,
               'email',         institution_email,
               'gender',        gender,
               'category_id',   category_id,
               'category_name', category_name,
               'is_teaching',   is_teaching,
               'role_key',      role_key,
               'role_name',     role_name,
               'balances',      balances,
               'flags', jsonb_build_object(
                 'missing_rows', missing_rows,
                 'negative',     negative,
                 'overdrawn',    overdrawn,
                 'off_policy',   off_policy
               )
             ) ORDER BY name)
      FROM people), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END $$;

-- Re-asserted, not assumed: CREATE OR REPLACE keeps existing grants, but a
-- fresh apply against a database that never ran 20260822180000 would otherwise
-- leave the function executable by anon. REVOKE targets anon specifically --
-- authenticated inherits PUBLIC, so revoking PUBLIC would strip it too.
REVOKE EXECUTE ON FUNCTION public.hr_leave_balance_staff_detail(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_balance_staff_detail(uuid, uuid) TO authenticated;
