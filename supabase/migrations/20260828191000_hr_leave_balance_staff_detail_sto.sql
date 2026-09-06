-- Staff Balances tab: report Short Time Off alongside the day-denominated types.
--
-- WHY THIS WAS EXCLUDED, AND WHY THE EXCLUSION WAS ONLY HALF RIGHT
--
-- The previous version filtered the pivot to request_category='leave' with a
-- correct reason: hr_trig_update_leave_balance() early-returns for
-- short_time_off and compensatory_off, so their `used` is never incremented --
-- sum(used) = 0.00 across every such row in production. A days column for STO
-- would have shown a permanently full bar meaning nothing.
--
-- The half that was wrong is that STO has a real, live budget; it is simply
-- denominated in MINUTES, not days. sto_limit_mode='total_duration' with
-- sto_total_minutes per period is what hr_trig_sto_enforce_limits() actually
-- enforces and what the staff apply-drawer already displays via hr_sto_usage().
-- Dropping the category left HR with no way to see it at all -- and no way to
-- notice that 101 staff could not submit a Permission request (fixed in
-- 20260828190000_hr_sto_entitled_days_uncapped.sql).
--
-- So: two column groups, each in its own currency. Days from
-- v_hr_leave_balance_src as before; minutes recomputed here with the SAME
-- functions the trigger and the drawer use --
--
--   hr_resolve_sto_limits()   -- assignment scope beats the type's own block
--   hr_leave_period_window()  -- month is calendar; quarter/half/year run from
--                                the academic year start
--
-- -- so the admin figure and the figure the staff member sees can never
-- disagree. Reimplementing the precedence here is exactly how they would.
--
-- Not a loop over hr_sto_usage(): that RPC is per (person, type) and would be
-- 300+ round trips for one institution. The lateral joins below compute the
-- same numbers set-based in one pass.
--
-- Gates are unchanged: hr.leave.balance.manage plus role_has_institution_access.
-- A permission check alone is never a tenant boundary.

CREATE OR REPLACE FUNCTION public.hr_leave_balance_staff_detail(
  p_hr_org_id uuid,
  p_hr_academic_year_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ay  record;
  v_org record;
  v_on  date;
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
      'leave_types', '[]'::jsonb, 'sto_types', '[]'::jsonb, 'staff', '[]'::jsonb
    );
  END IF;

  -- Which day the STO period window is measured from. CURRENT_DATE for the
  -- live year, clamped into the selected one otherwise: asking for 2024-2025
  -- and getting "August 2026, 0 minutes used" would be a window that has
  -- nothing to do with the year on screen.
  v_on := LEAST(GREATEST(CURRENT_DATE, v_ay.start_date), v_ay.end_date);

  WITH types AS (
    -- The DAY pivot: request_category='leave' only. Compensatory Off is
    -- credit-backed and never lands here; Short Time Off gets its own column
    -- group below rather than being forced into a days figure.
    SELECT t.id, t.leave_type_code AS code, t.leave_type_name AS name,
           t.default_entitled_days AS default_days, t.display_order
    FROM public.hr_leave_types t
    WHERE t.hr_organization_id = v_org.id
      AND t.is_active
      AND t.request_category = 'leave'
  ),
  sto_types AS (
    -- The MINUTE pivot. limit_mode/limit_period are the TYPE's values and are
    -- carried for the column header only -- an hr_leave_type_assignments row
    -- can override the whole limit block for one staff member or department,
    -- so the authoritative per-person figures are resolved per cell below.
    SELECT t.id, t.leave_type_code AS code, t.leave_type_name AS name,
           t.sto_limit_mode AS limit_mode, t.sto_limit_period AS limit_period,
           t.sto_total_minutes AS total_minutes, t.sto_max_requests AS max_requests,
           t.display_order
    FROM public.hr_leave_types t
    WHERE t.hr_organization_id = v_org.id
      AND t.is_active
      AND t.request_category = 'short_time_off'
  ),
  cells AS (
    -- v_hr_leave_balance_src, not hr_leave_balances: the view already resolves
    -- COALESCE(override, balance.entitled, type.default) and reports which one
    -- won. Re-implementing that here would drift from what the staff member
    -- sees in their own apply-leave drawer. It also emits a row for every
    -- eligible (staff, type) pair even with no ledger row -- created_at IS NULL
    -- is how "never provisioned" is detected -- and applies the gender, cadre
    -- and assignment eligibility rules, which is what makes it the right source
    -- for the STO column set too.
    SELECT v.employee_id, v.leave_type_id, v.request_category,
           v.entitled, v.used, v.carried_forward, v.available,
           v.entitlement_source,
           (v.created_at IS NOT NULL) AS has_row
    FROM public.v_hr_leave_balance_src v
    WHERE v.hr_organization_id  = v_org.id
      AND v.hr_academic_year_id = v_ay.id
      AND v.request_category IN ('leave', 'short_time_off')
  ),
  bal AS (
    SELECT * FROM cells WHERE request_category = 'leave'
  ),
  sto AS (
    SELECT c.employee_id,
           c.leave_type_id,
           lim.limit_mode,
           lim.limit_period,
           lim.source,
           lim.max_requests,
           lim.total_minutes,
           lim.min_minutes,
           lim.max_minutes,
           w.period_start,
           w.period_end,
           COALESCE(u.requests_used, 0) AS requests_used,
           COALESCE(u.minutes_used, 0)  AS minutes_used
    FROM cells c
    -- LEFT, not CROSS: hr_resolve_sto_limits returns no row if the type
    -- vanished mid-query, and a CROSS JOIN would silently drop the cell.
    LEFT JOIN LATERAL public.hr_resolve_sto_limits(c.leave_type_id, c.employee_id) lim
           ON true
    LEFT JOIN LATERAL public.hr_leave_period_window(
                COALESCE(lim.limit_period, 'month'), v_ay.id, v_on) w
           ON true
    LEFT JOIN LATERAL (
      -- Byte-for-byte the counting clause in hr_trig_sto_enforce_limits and
      -- hr_sto_usage: pending/approved/escalated all consume the budget,
      -- because a pending request is money already committed.
      SELECT count(*) AS requests_used,
             COALESCE(sum(
               CASE
                 WHEN a.duration_type = 'hourly'
                  AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL
                  AND a.end_time > a.start_time
                 THEN ROUND(EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60.0)::integer
                 ELSE 0
               END
             ), 0) AS minutes_used
      FROM public.hr_leave_applications a
      WHERE a.employee_id   = c.employee_id
        AND a.leave_type_id = c.leave_type_id
        AND a.status IN ('pending', 'approved', 'escalated')
        AND a.start_date BETWEEN w.period_start AND w.period_end
    ) u ON true
    WHERE c.request_category = 'short_time_off'
  ),
  day_agg AS (
    SELECT b.employee_id,
           jsonb_object_agg(b.leave_type_id::text, jsonb_build_object(
             'entitled',  b.entitled,
             'used',      b.used,
             'carried',   b.carried_forward,
             'available', b.available,
             'source',    b.entitlement_source,
             'has_row',   b.has_row
           )) AS balances,
           count(*) FILTER (WHERE NOT b.has_row)                           AS missing_rows,
           count(*) FILTER (WHERE b.available < 0)                         AS negative,
           count(*) FILTER (WHERE b.used > b.entitled + b.carried_forward) AS overdrawn,
           count(*) FILTER (WHERE b.entitlement_source <> 'policy')        AS off_policy
    FROM bal b
    GROUP BY b.employee_id
  ),
  sto_agg AS (
    SELECT s.employee_id,
           jsonb_object_agg(s.leave_type_id::text, jsonb_build_object(
             'limit_mode',    COALESCE(s.limit_mode, 'none'),
             'limit_period',  s.limit_period,
             'source',        s.source,
             -- The window failing to resolve is reported, not flattened into
             -- limit_mode 'none': the database refuses every submission in that
             -- state, and telling an admin the person is unlimited would be the
             -- worse lie. Same contract as hr_sto_usage.
             'window_unresolved', (s.period_start IS NULL OR s.period_end IS NULL),
             'period_start',  s.period_start,
             'period_end',    s.period_end,
             'total_minutes', s.total_minutes,
             'max_requests',  s.max_requests,
             'min_minutes',   s.min_minutes,
             'max_minutes',   s.max_minutes,
             'requests_used', s.requests_used,
             'minutes_used',  s.minutes_used,
             'minutes_left',  CASE WHEN s.limit_mode = 'total_duration'
                                   THEN GREATEST(0, s.total_minutes - s.minutes_used) END,
             'requests_left', CASE WHEN s.limit_mode = 'request_count'
                                   THEN GREATEST(0, s.max_requests - s.requests_used) END,
             -- Budget spent for the period. The one STO state an admin needs to
             -- act on, and the reason this column group exists.
             'exhausted',
               CASE
                 WHEN s.limit_mode = 'total_duration'
                   THEN s.minutes_used  >= COALESCE(s.total_minutes, 0)
                 WHEN s.limit_mode = 'request_count'
                   THEN s.requests_used >= COALESCE(s.max_requests, 0)
                 ELSE false
               END
           )) AS sto,
           count(*) FILTER (
             WHERE (s.limit_mode = 'total_duration'
                    AND s.minutes_used  >= COALESCE(s.total_minutes, 0))
                OR (s.limit_mode = 'request_count'
                    AND s.requests_used >= COALESCE(s.max_requests, 0))
           ) AS sto_exhausted
    FROM sto s
    GROUP BY s.employee_id
  ),
  people AS (
    -- Driven off the UNION of both currencies, not off the day cells: an
    -- institution can run one day type and two STO types (Matric and the two
    -- Nattraja orgs do), and keying the roster on day cells alone would drop
    -- every staff member the moment an org ran STO only.
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
           COALESCE(da.balances, '{}'::jsonb) AS balances,
           COALESCE(sa.sto,      '{}'::jsonb) AS sto,
           COALESCE(da.missing_rows,  0) AS missing_rows,
           COALESCE(da.negative,      0) AS negative,
           COALESCE(da.overdrawn,     0) AS overdrawn,
           COALESCE(da.off_policy,    0) AS off_policy,
           COALESCE(sa.sto_exhausted, 0) AS sto_exhausted
    FROM (
      SELECT employee_id FROM bal
      UNION
      SELECT employee_id FROM sto
    ) ids
    JOIN public.staff s ON s.id = ids.employee_id
    LEFT JOIN public.departments d            ON d.id  = s.department_id
    LEFT JOIN public.employment_categories ec ON ec.id = s.category_id
    LEFT JOIN public.custom_roles cr          ON cr.role_key = s.role_key
    LEFT JOIN day_agg da ON da.employee_id = s.id
    LEFT JOIN sto_agg sa ON sa.employee_id = s.id
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
    'sto_types', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', id, 'code', code, 'name', name,
               'limit_mode', limit_mode, 'limit_period', limit_period,
               'total_minutes', total_minutes, 'max_requests', max_requests
             ) ORDER BY display_order, name)
      FROM sto_types), '[]'::jsonb),
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
               'sto',           sto,
               'flags', jsonb_build_object(
                 'missing_rows',  missing_rows,
                 'negative',      negative,
                 'overdrawn',     overdrawn,
                 'off_policy',    off_policy,
                 'sto_exhausted', sto_exhausted
               )
             ) ORDER BY name)
      FROM people), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END $function$;
