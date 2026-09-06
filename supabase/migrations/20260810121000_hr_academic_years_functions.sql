-- Point the HR leave engine at hr_academic_years.
--
-- Companion to 20260810120000_hr_academic_years.sql. Every function and trigger
-- below read hr_leave_*.academic_year_id (an academic_years FK); they now read
-- hr_academic_year_id.
--
-- Two workarounds die here:
--
--   1. hr_leave_period_window's v_eff_end stretch. An academic year runs
--      Jun 1 -> Mar 31, so leave taken in April or May fell outside every year
--      and the window had to be padded to 12 months artificially. An HR year IS
--      12 months (Apr 1 -> Mar 31), so the end date is used directly and
--      quarter/half-year blocks tile onto clean FY boundaries.
--
--   2. hr_leave_balance_analytics' name matching. It took the year NAME because
--      academic_years rows are per-institution and no single id could address a
--      cross-institution view -- hence btrim() comparisons and a
--      DISTINCT ON (institution_id) CTE. HR years are group-wide, so it now
--      takes an id and joins.
--
-- Parameter names change, which CREATE OR REPLACE cannot do, so these are
-- DROP + CREATE. That discards EXECUTE grants and reverts them to PUBLIC only,
-- so authenticated and service_role are re-granted explicitly at the end.

-- ---------------------------------------------------------------------------
-- hr_leave_period_window
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.hr_leave_period_window(text, uuid, date);

CREATE FUNCTION public.hr_leave_period_window(
  p_period              text,
  p_hr_academic_year_id uuid,
  p_on                  date DEFAULT CURRENT_DATE
)
RETURNS TABLE(period_start date, period_end date)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ay_start date;
  v_ay_end   date;
  v_idx      integer;
  v_len      integer;
BEGIN
  IF p_period = 'month' THEN
    period_start := date_trunc('month', p_on)::date;
    period_end   := (date_trunc('month', p_on) + INTERVAL '1 month - 1 day')::date;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT start_date, end_date INTO v_ay_start, v_ay_end
  FROM public.hr_academic_years WHERE id = p_hr_academic_year_id;

  -- HR years are group-wide and non-overlapping, so exactly one contains any
  -- given day. That makes the id optional: resolve from the date when it is
  -- absent. The old per-institution model could not do this, which is why an
  -- unresolved id used to degrade to a calendar year that matched no entitlement.
  IF v_ay_start IS NULL THEN
    SELECT start_date, end_date INTO v_ay_start, v_ay_end
    FROM public.hr_academic_years
    WHERE is_active AND p_on BETWEEN start_date AND end_date;
  END IF;

  -- Last resort: HR has configured no year covering p_on at all.
  IF v_ay_start IS NULL THEN
    v_ay_start := date_trunc('year', p_on)::date;
    v_ay_end   := (date_trunc('year', p_on) + INTERVAL '1 year - 1 day')::date;
  END IF;

  IF p_period = 'year' THEN
    period_start := v_ay_start;
    period_end   := v_ay_end;
    RETURN NEXT;
    RETURN;
  END IF;

  v_len := CASE p_period WHEN 'quarter' THEN 3 WHEN 'half_year' THEN 6 ELSE 12 END;

  -- Which whole block of v_len months from the year start contains p_on.
  -- Months-between rather than day arithmetic, so blocks land on month
  -- boundaries regardless of the year's start day.
  v_idx := GREATEST(0, (
    (EXTRACT(YEAR FROM p_on)::int - EXTRACT(YEAR FROM v_ay_start)::int) * 12
    + (EXTRACT(MONTH FROM p_on)::int - EXTRACT(MONTH FROM v_ay_start)::int)
  ) / v_len);

  period_start := (v_ay_start + (v_idx * v_len) * INTERVAL '1 month')::date;
  period_end   := LEAST(
    v_ay_end,
    (v_ay_start + ((v_idx + 1) * v_len) * INTERVAL '1 month' - INTERVAL '1 day')::date);
  RETURN NEXT;
END $function$;

-- ---------------------------------------------------------------------------
-- hr_leave_period_usage
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.hr_leave_period_usage(uuid, uuid, uuid, date);

CREATE FUNCTION public.hr_leave_period_usage(
  p_staff_id            uuid,
  p_leave_type_id       uuid,
  p_hr_academic_year_id uuid DEFAULT NULL::uuid,
  p_on                  date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  t record;
  w record;
  v_used numeric := 0;
BEGIN
  IF NOT public.is_super_admin()
     AND NOT (p_staff_id IN (SELECT unnest(public.fn_my_staff_ids())))
     AND NOT public.user_has_permission('hr.leave.approve') THEN
    RAISE EXCEPTION 'Not authorized to read this usage';
  END IF;

  SELECT request_category, leave_limit_period, leave_max_days_per_period,
         skip_weekends, skip_holidays
    INTO t
  FROM public.hr_leave_types
  WHERE id = p_leave_type_id;

  IF t.request_category IS DISTINCT FROM 'leave'
     OR t.leave_limit_period IS NULL THEN
    RETURN jsonb_build_object('limited', false);
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window(
    t.leave_limit_period, p_hr_academic_year_id, p_on);

  IF w.period_start IS NULL THEN
    RETURN jsonb_build_object(
      'limited', true, 'window_unresolved', true,
      'limit_period', t.leave_limit_period,
      'max_days', t.leave_max_days_per_period);
  END IF;

  SELECT COALESCE(sum(
           public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
             a.hr_organization_id)
         ), 0)
    INTO v_used
  FROM public.hr_leave_applications a
  WHERE a.employee_id   = p_staff_id
    AND a.leave_type_id = p_leave_type_id
    AND a.status IN ('pending','approved','escalated')
    AND a.start_date BETWEEN w.period_start AND w.period_end;

  RETURN jsonb_build_object(
    'limited',      true,
    'limit_period', t.leave_limit_period,
    'period_start', w.period_start,
    'period_end',   w.period_end,
    'max_days',     t.leave_max_days_per_period,
    'days_used',    v_used,
    'days_left',    GREATEST(0, t.leave_max_days_per_period - v_used)
  );
END $function$;

-- ---------------------------------------------------------------------------
-- hr_sto_usage
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.hr_sto_usage(uuid, uuid, uuid, date);

CREATE FUNCTION public.hr_sto_usage(
  p_staff_id            uuid,
  p_leave_type_id       uuid,
  p_hr_academic_year_id uuid DEFAULT NULL::uuid,
  p_on                  date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  lim record; w record;
  v_requests integer := 0; v_minutes integer := 0;
BEGIN
  -- The approver branch carries an organization term. A permission check alone
  -- is never a tenant boundary -- fourth time in this module.
  IF NOT public.is_super_admin()
     AND NOT (p_staff_id IN (SELECT unnest(public.fn_my_staff_ids())))
     AND NOT (
       public.user_has_permission('hr.leave.approve')
       AND EXISTS (
         SELECT 1 FROM public.staff s
         JOIN public.hr_organizations o ON o.institution_id = s.institution_id
         WHERE s.id = p_staff_id
           AND o.id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
       )
     ) THEN
    RAISE EXCEPTION 'Not authorized to read this usage';
  END IF;

  SELECT * INTO lim FROM public.hr_resolve_sto_limits(p_leave_type_id, p_staff_id);
  IF lim.limit_mode IS NULL OR lim.limit_mode = 'none' THEN
    RETURN jsonb_build_object('limit_mode','none');
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window(
    lim.limit_period, p_hr_academic_year_id, p_on);

  -- Both bounds, matching enforcement. Reporting 'none' here for a window the
  -- enforcer refuses would tell the user they are unlimited while the database
  -- blocks every submission.
  IF w.period_start IS NULL OR w.period_end IS NULL THEN
    RETURN jsonb_build_object(
      'limit_mode', lim.limit_mode,
      'limit_period', lim.limit_period,
      'window_unresolved', true
    );
  END IF;

  SELECT count(*),
         COALESCE(sum(
           CASE
             WHEN a.duration_type = 'hourly'
              AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL
              AND a.end_time > a.start_time
             THEN ROUND(EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60.0)::integer
             ELSE 0
           END
         ), 0)
    INTO v_requests, v_minutes
  FROM public.hr_leave_applications a
  WHERE a.employee_id = p_staff_id AND a.leave_type_id = p_leave_type_id
    AND a.status IN ('pending','approved','escalated')
    AND a.start_date BETWEEN w.period_start AND w.period_end;

  RETURN jsonb_build_object(
    'limit_mode', lim.limit_mode, 'limit_period', lim.limit_period, 'source', lim.source,
    'period_start', w.period_start, 'period_end', w.period_end,
    'max_requests', lim.max_requests, 'total_minutes', lim.total_minutes,
    'min_minutes', lim.min_minutes, 'max_minutes', lim.max_minutes,
    'requests_used', v_requests, 'minutes_used', v_minutes,
    'requests_left', CASE WHEN lim.limit_mode='request_count'
                          THEN GREATEST(0, lim.max_requests - v_requests) END,
    'minutes_left',  CASE WHEN lim.limit_mode='total_duration'
                          THEN GREATEST(0, lim.total_minutes - v_minutes) END
  );
END $function$;

-- ---------------------------------------------------------------------------
-- generate_hr_leave_balances
--
-- The institution term stays: hr_organizations.institution_id is still how the
-- generator decides WHICH STAFF to provision and whether the caller may act for
-- that org. What it no longer does is use the institution to find a YEAR.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.generate_hr_leave_balances(uuid, uuid, boolean);

CREATE FUNCTION public.generate_hr_leave_balances(
  p_hr_org_id           uuid,
  p_hr_academic_year_id uuid,
  p_dry_run             boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_created   integer := 0;
  v_skipped   integer := 0;
  v_fallback  jsonb   := '[]'::jsonb;
  v_inst_id   uuid;
  v_prior_ay  uuid;
  v_start     date;
  r           record;
BEGIN
  IF NOT public.user_has_permission('hr.leave.balance.manage') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
  END IF;

  SELECT institution_id INTO v_inst_id FROM public.hr_organizations WHERE id = p_hr_org_id;
  IF v_inst_id IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_organization_id %', p_hr_org_id;
  END IF;

  IF NOT public.role_has_institution_access(v_inst_id) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to institution %', v_inst_id;
  END IF;

  SELECT start_date INTO v_start FROM public.hr_academic_years WHERE id = p_hr_academic_year_id;
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_academic_year_id %', p_hr_academic_year_id;
  END IF;

  -- Group-wide years, so the prior year is simply the previous one -- no
  -- institution term, and no risk of picking another college's row.
  SELECT id INTO v_prior_ay
  FROM public.hr_academic_years
  WHERE end_date < v_start
  ORDER BY end_date DESC
  LIMIT 1;

  FOR r IN
    SELECT
      s.id  AS staff_id,
      s.staff_id AS staff_code,
      s.first_name,
      s.last_name,
      d.cadre_id,
      t.id  AS leave_type_id,
      t.default_entitled_days,
      t.allow_carry_forward,
      t.max_carry_forward_days,
      e.entitled_days AS cadre_entitled,
      asg.n           AS assignment_count,
      m.entitled_days AS assigned_entitled,
      m.scope_kind    AS assigned_scope
    FROM public.staff s
    CROSS JOIN public.hr_leave_types t
    LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
    LEFT JOIN public.hr_leave_type_entitlements e
           ON e.leave_type_id = t.id AND e.cadre_id = d.cadre_id
    -- Does this type restrict itself at all?
    LEFT JOIN LATERAL (
      SELECT count(*) AS n
      FROM public.hr_leave_type_assignments a
      WHERE a.leave_type_id = t.id AND a.is_active
    ) asg ON true
    -- Most specific assignment matching this person: staff > dept > org.
    LEFT JOIN LATERAL (
      SELECT a.entitled_days, a.scope_kind
      FROM public.hr_leave_type_assignments a
      WHERE a.leave_type_id = t.id
        AND a.is_active
        AND (
             (a.scope_kind = 'staff'        AND a.staff_id      = s.id)
          OR (a.scope_kind = 'department'   AND a.department_id = s.department_id)
          OR (a.scope_kind = 'organization')
        )
      ORDER BY CASE a.scope_kind
                 WHEN 'staff' THEN 1 WHEN 'department' THEN 2 ELSE 3 END
      LIMIT 1
    ) m ON true
    WHERE s.institution_id = v_inst_id
      AND s.is_active
      AND t.hr_organization_id = p_hr_org_id
      AND t.is_active
      -- Unassigned type = organization-wide (backward compatible).
      -- Assigned type = only those the assignment reaches.
      AND (asg.n = 0 OR m.scope_kind IS NOT NULL)
      AND (t.applicable_cadre_ids IS NULL OR d.cadre_id = ANY(t.applicable_cadre_ids))
      AND (
        t.applicable_gender = 'all'
        OR lower(coalesce(s.gender, '')) = t.applicable_gender
      )
  LOOP
    DECLARE
      v_entitled numeric;
      v_carried  numeric := 0;
      v_written  boolean := false;
    BEGIN
      -- IS NOT NULL, not COALESCE-truthiness: an override of 0 is a real
      -- decision ("eligible, but no days"), not an absent one.
      v_entitled := CASE
        WHEN r.assigned_entitled IS NOT NULL THEN r.assigned_entitled
        WHEN r.cadre_entitled    IS NOT NULL THEN r.cadre_entitled
        ELSE r.default_entitled_days
      END;

      IF r.allow_carry_forward AND v_prior_ay IS NOT NULL THEN
        SELECT GREATEST(0, (b.entitled + b.carried_forward - b.used))
          INTO v_carried
        FROM public.hr_leave_balances b
        WHERE b.employee_id         = r.staff_id
          AND b.leave_type_id       = r.leave_type_id
          AND b.hr_academic_year_id = v_prior_ay;

        v_carried := COALESCE(v_carried, 0);
        IF r.max_carry_forward_days IS NOT NULL THEN
          v_carried := LEAST(v_carried, r.max_carry_forward_days);
        END IF;
      END IF;

      IF p_dry_run THEN
        IF EXISTS (
          SELECT 1 FROM public.hr_leave_balances b
          WHERE b.employee_id         = r.staff_id
            AND b.leave_type_id       = r.leave_type_id
            AND b.hr_academic_year_id = p_hr_academic_year_id
        ) THEN
          v_skipped := v_skipped + 1;
        ELSE
          v_created := v_created + 1;
          v_written := true;
        END IF;
      ELSE
        INSERT INTO public.hr_leave_balances (
          employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
          entitled, used, carried_forward
        ) VALUES (
          r.staff_id, r.leave_type_id, p_hr_academic_year_id, p_hr_org_id,
          v_entitled, 0, v_carried
        )
        ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id) DO NOTHING;

        IF FOUND THEN
          v_created := v_created + 1;
          v_written := true;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;
      END IF;

      -- Report only rows that fell all the way through to the type default.
      -- An assignment override is a deliberate figure, not a fallback.
      IF v_written
         AND r.assigned_entitled IS NULL
         AND r.cadre_entitled IS NULL THEN
        v_fallback := v_fallback || jsonb_build_object(
          'staff_code', r.staff_code,
          'name', trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')),
          'reason', CASE WHEN r.cadre_id IS NULL
                         THEN 'no cadre assigned'
                         ELSE 'no entitlement row for cadre' END
        );
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run',        p_dry_run,
    'created',        v_created,
    'skipped',        v_skipped,
    'prior_year_id',  v_prior_ay,
    'fallback_count', jsonb_array_length(v_fallback),
    'fallback',       v_fallback
  );
END $function$;

-- ---------------------------------------------------------------------------
-- hr_leave_balance_analytics
--
-- One year serves every institution, so the per-institution `ay` CTE, the
-- DISTINCT ON (institution_id), the btrim() name comparison and the year_opts
-- aggregation are all gone. The 'no_academic_year' coverage status goes with
-- them: a year is now either configured for all of HR or for none of it, which
-- is a page-level condition rather than a per-institution one.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.hr_leave_balance_analytics(text);

CREATE FUNCTION public.hr_leave_balance_analytics(
  p_hr_academic_year_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_out jsonb;
  v_ay  record;
BEGIN
  IF NOT public.user_has_permission('hr.leave.balance.manage') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
  END IF;

  IF p_hr_academic_year_id IS NULL THEN
    SELECT * INTO v_ay FROM public.hr_academic_years
    WHERE is_active AND CURRENT_DATE BETWEEN start_date AND end_date;
  ELSE
    SELECT * INTO v_ay FROM public.hr_academic_years
    WHERE id = p_hr_academic_year_id;
  END IF;

  WITH scoped_org AS (
    SELECT o.id AS org_id, o.institution_id, i.name AS institution_name
    FROM public.hr_organizations o
    JOIN public.institutions i ON i.id = o.institution_id
    WHERE public.role_has_institution_access(o.institution_id)
  ),
  staff_ct AS (
    SELECT s.org_id,
           count(*) FILTER (WHERE st.is_active)                            AS active_staff,
           count(*) FILTER (WHERE st.is_active AND d.cadre_id IS NOT NULL) AS staff_with_cadre
    FROM scoped_org s
    JOIN public.staff st ON st.institution_id = s.institution_id
    LEFT JOIN public.hr_staff_details d ON d.staff_id = st.id
    GROUP BY s.org_id
  ),
  type_ct AS (
    SELECT s.org_id,
           count(t.id) FILTER (WHERE t.is_active)                              AS active_types,
           COALESCE(sum(t.default_entitled_days) FILTER (WHERE t.is_active),0) AS days_per_head
    FROM scoped_org s
    LEFT JOIN public.hr_leave_types t ON t.hr_organization_id = s.org_id
    GROUP BY s.org_id
  ),
  bal AS (
    SELECT s.org_id,
           count(*)                            AS balance_rows,
           count(DISTINCT b.employee_id)       AS staff_covered,
           COALESCE(sum(b.entitled),0)         AS entitled,
           COALESCE(sum(b.carried_forward),0)  AS carried,
           COALESCE(sum(b.used),0)             AS used
    FROM scoped_org s
    JOIN public.hr_leave_balances b
      ON b.hr_organization_id  = s.org_id
     AND b.hr_academic_year_id = v_ay.id
    GROUP BY s.org_id
  ),
  per_inst AS (
    SELECT
      s.org_id,
      s.institution_id,
      s.institution_name,
      COALESCE(sc.active_staff,0)     AS active_staff,
      COALESCE(sc.staff_with_cadre,0) AS staff_with_cadre,
      COALESCE(tc.active_types,0)     AS active_types,
      COALESCE(tc.days_per_head,0)    AS days_per_head,
      COALESCE(b.balance_rows,0)      AS balance_rows,
      COALESCE(b.staff_covered,0)     AS staff_covered,
      COALESCE(b.entitled,0)          AS entitled,
      COALESCE(b.carried,0)           AS carried,
      COALESCE(b.used,0)              AS used,
      CASE
        WHEN COALESCE(sc.active_staff,0) = 0 THEN 'no_staff'
        WHEN COALESCE(tc.active_types,0) = 0 THEN 'no_types'
        WHEN COALESCE(b.balance_rows,0) = 0  THEN 'not_generated'
        WHEN COALESCE(b.staff_covered,0) < COALESCE(sc.active_staff,0) THEN 'partial'
        ELSE 'complete'
      END AS status
    FROM scoped_org s
    LEFT JOIN staff_ct sc ON sc.org_id = s.org_id
    LEFT JOIN type_ct  tc ON tc.org_id = s.org_id
    LEFT JOIN bal      b  ON b.org_id  = s.org_id
  ),
  per_type AS (
    SELECT
      t.leave_type_code                       AS code,
      max(t.leave_type_name)                  AS name,
      max(t.color_code)                       AS color_code,
      count(DISTINCT t.hr_organization_id)    AS orgs_offering,
      max(t.default_entitled_days)            AS default_days,
      COALESCE(sum(b.entitled),0)             AS entitled,
      COALESCE(sum(b.carried_forward),0)      AS carried,
      COALESCE(sum(b.used),0)                 AS used,
      count(b.employee_id)                    AS balance_rows,
      count(DISTINCT b.employee_id)           AS staff_count
    FROM scoped_org s
    JOIN public.hr_leave_types t
      ON t.hr_organization_id = s.org_id AND t.is_active
    LEFT JOIN public.hr_leave_balances b
      ON b.leave_type_id       = t.id
     AND b.hr_academic_year_id = v_ay.id
    GROUP BY t.leave_type_code
  ),
  year_opts AS (
    SELECT y.id, y.year_name, y.start_date, y.end_date,
           (CURRENT_DATE BETWEEN y.start_date AND y.end_date) AS is_current
    FROM public.hr_academic_years y
    WHERE y.is_active
  )
  SELECT jsonb_build_object(
    'hr_academic_year_id', v_ay.id,
    'year_name',           v_ay.year_name,
    'start_date',          v_ay.start_date,
    'end_date',            v_ay.end_date,
    'resolved_by',         CASE WHEN p_hr_academic_year_id IS NULL THEN 'current_date' ELSE 'explicit' END,
    'totals', jsonb_build_object(
      'institutions',        (SELECT count(*) FROM per_inst),
      'institutions_covered',(SELECT count(*) FROM per_inst WHERE status IN ('complete','partial')),
      'active_staff',        (SELECT COALESCE(sum(active_staff),0)     FROM per_inst),
      'staff_covered',       (SELECT COALESCE(sum(staff_covered),0)    FROM per_inst),
      'staff_with_cadre',    (SELECT COALESCE(sum(staff_with_cadre),0) FROM per_inst),
      'balance_rows',        (SELECT COALESCE(sum(balance_rows),0)     FROM per_inst),
      'entitled',            (SELECT COALESCE(sum(entitled),0)         FROM per_inst),
      'carried',             (SELECT COALESCE(sum(carried),0)          FROM per_inst),
      'used',                (SELECT COALESCE(sum(used),0)             FROM per_inst),
      'uncovered_staff',     (SELECT COALESCE(sum(active_staff - staff_covered),0) FROM per_inst),
      'orgs_without_types',  (SELECT count(*) FROM per_inst WHERE status = 'no_types'),
      'orgs_not_generated',  (SELECT count(*) FROM per_inst WHERE status = 'not_generated')
    ),
    'institutions', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.entitled DESC, p.institution_name)
      FROM per_inst p
    ), '[]'::jsonb),
    'leave_types', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.entitled DESC, t.code)
      FROM per_type t
    ), '[]'::jsonb),
    'academic_years', COALESCE((
      SELECT jsonb_agg(to_jsonb(y) ORDER BY y.start_date DESC)
      FROM year_opts y
    ), '[]'::jsonb)
  )
  INTO v_out;

  RETURN v_out;
END $function$;

-- ---------------------------------------------------------------------------
-- Triggers (no parameters, so CREATE OR REPLACE keeps their grants)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hr_trig_update_leave_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_delta numeric;
  v_category text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;

  -- Comp off is credit-backed; short time off is minute-backed. Neither draws
  -- on a day entitlement.
  IF v_category IN ('compensatory_off', 'short_time_off') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    v_delta := NEW.total_days;
    INSERT INTO hr_leave_balances (employee_id, leave_type_id, hr_academic_year_id, hr_organization_id, entitled, used, carried_forward)
    VALUES (NEW.employee_id, NEW.leave_type_id, NEW.hr_academic_year_id, NEW.hr_organization_id, 0, v_delta, 0)
    ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id)
    DO UPDATE SET
      used = hr_leave_balances.used + EXCLUDED.used,
      updated_at = now();

  ELSIF NEW.status IN ('cancelled', 'rejected', 'withdrawn') AND OLD.status = 'approved' THEN
    v_delta := NEW.total_days;
    UPDATE hr_leave_balances
       SET used = GREATEST(0, used - v_delta),
           updated_at = now()
     WHERE employee_id         = NEW.employee_id
       AND leave_type_id       = NEW.leave_type_id
       AND hr_academic_year_id = NEW.hr_academic_year_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_period_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  t record;
  w record;
  v_this numeric;
  v_used numeric := 0;
BEGIN
  IF NEW.status NOT IN ('pending','approved','escalated') THEN
    RETURN NEW;
  END IF;

  SELECT request_category, leave_type_name, leave_limit_period,
         leave_max_days_per_period, skip_weekends, skip_holidays
    INTO t
  FROM public.hr_leave_types
  WHERE id = NEW.leave_type_id;

  IF t.request_category IS DISTINCT FROM 'leave'
     OR t.leave_limit_period IS NULL THEN
    RETURN NEW;
  END IF;

  v_this := public.hr_calc_leave_days(
    NEW.start_date, NEW.end_date, NEW.duration_type,
    COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
    NEW.hr_organization_id
  );

  IF v_this > t.leave_max_days_per_period THEN
    RAISE EXCEPTION
      'This request is % day(s); the maximum per % for % is % day(s).',
      v_this, t.leave_limit_period, t.leave_type_name, t.leave_max_days_per_period;
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window(
    t.leave_limit_period, NEW.hr_academic_year_id, NEW.start_date);

  IF w.period_start IS NULL OR w.period_end IS NULL THEN
    RAISE EXCEPTION 'Cannot determine the % period for this request; contact HR.',
      t.leave_limit_period;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':' || NEW.leave_type_id::text, 0)
  );

  SELECT COALESCE(sum(
           public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(t.skip_weekends, true), COALESCE(t.skip_holidays, true),
             a.hr_organization_id)
         ), 0)
    INTO v_used
  FROM public.hr_leave_applications a
  WHERE a.employee_id   = NEW.employee_id
    AND a.leave_type_id = NEW.leave_type_id
    AND a.id IS DISTINCT FROM NEW.id
    AND a.status IN ('pending','approved','escalated')
    AND a.start_date BETWEEN w.period_start AND w.period_end;

  IF v_used + v_this > t.leave_max_days_per_period THEN
    RAISE EXCEPTION
      'Limit reached: % of % day(s) of % already used between % and %; this request needs %.',
      v_used, t.leave_max_days_per_period, t.leave_type_name,
      w.period_start, w.period_end, v_this;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_trig_sto_enforce_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_category text;
  lim  record;
  w    record;
  v_requests integer := 0;
  v_minutes  integer := 0;
  v_this     integer;
  v_name     text;
  v_needs_duration boolean;
BEGIN
  IF NEW.status NOT IN ('pending','approved','escalated') THEN
    RETURN NEW;
  END IF;

  SELECT request_category, leave_type_name INTO v_category, v_name
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_category IS DISTINCT FROM 'short_time_off' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO lim FROM public.hr_resolve_sto_limits(NEW.leave_type_id, NEW.employee_id);
  IF lim.limit_mode IS NULL OR lim.limit_mode = 'none' THEN
    RETURN NEW;
  END IF;

  -- A duration is needed to cap total time, and equally to check a per-request
  -- bound. Under request_count with no bounds, length is irrelevant.
  v_needs_duration := lim.limit_mode = 'total_duration'
                      OR lim.min_minutes IS NOT NULL
                      OR lim.max_minutes IS NOT NULL;

  IF NEW.duration_type = 'hourly'
     AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    IF NEW.end_time <= NEW.start_time THEN
      RAISE EXCEPTION 'End time must be after start time.';
    END IF;
    v_this := ROUND(EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60.0)::integer;
  ELSIF v_needs_duration THEN
    -- Name the real reason. "Limited by duration" describes total_duration and
    -- reads as wrong under request_count, where the constraint is the
    -- per-request bound rather than a running total.
    IF lim.limit_mode = 'total_duration' THEN
      RAISE EXCEPTION
        '% is limited by total duration, so a request needs a start and end time.',
        v_name;
    ELSE
      RAISE EXCEPTION
        '% sets a minimum or maximum length per request, so a request needs a start and end time.',
        v_name;
    END IF;
  ELSE
    v_this := 0;
  END IF;

  IF lim.min_minutes IS NOT NULL AND v_this < lim.min_minutes THEN
    RAISE EXCEPTION 'This request is % minute(s); the minimum for % is % minute(s).',
      v_this, v_name, lim.min_minutes;
  END IF;

  IF lim.max_minutes IS NOT NULL AND v_this > lim.max_minutes THEN
    RAISE EXCEPTION 'This request is % minute(s); the maximum per request for % is % minute(s).',
      v_this, v_name, lim.max_minutes;
  END IF;

  SELECT * INTO w FROM public.hr_leave_period_window(
    lim.limit_period, NEW.hr_academic_year_id, NEW.start_date);
  IF w.period_start IS NULL OR w.period_end IS NULL THEN
    RAISE EXCEPTION
      'Cannot determine the % period for this request; contact HR.', lim.limit_period;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':' || NEW.leave_type_id::text, 0)
  );

  SELECT count(*),
         COALESCE(sum(
           CASE
             WHEN a.duration_type = 'hourly'
              AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL
              AND a.end_time > a.start_time
             THEN ROUND(EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60.0)::integer
             ELSE 0
           END
         ), 0)
    INTO v_requests, v_minutes
  FROM public.hr_leave_applications a
  WHERE a.employee_id   = NEW.employee_id
    AND a.leave_type_id = NEW.leave_type_id
    AND a.id IS DISTINCT FROM NEW.id
    AND a.status IN ('pending','approved','escalated')
    AND a.start_date BETWEEN w.period_start AND w.period_end;

  IF lim.limit_mode = 'request_count' AND v_requests + 1 > lim.max_requests THEN
    RAISE EXCEPTION 'Limit reached: % of % request(s) already used between % and %.',
      v_requests, lim.max_requests, w.period_start, w.period_end;
  END IF;

  IF lim.limit_mode = 'total_duration' AND v_minutes + v_this > lim.total_minutes THEN
    RAISE EXCEPTION 'Limit reached: % of % minute(s) already used between % and %; this request needs %.',
      v_minutes, lim.total_minutes, w.period_start, w.period_end, v_this;
  END IF;

  RETURN NEW;
END $function$;

-- ---------------------------------------------------------------------------
-- New: default the year from the date
--
-- Group-wide, non-overlapping years mean start_date alone identifies the year.
-- A leave application can therefore no longer be yearless, which removes the
-- failure mode the UI used to have to warn about ("no academic year covers
-- today") and makes the column safe against a stale client that does not send
-- it.
--
-- Named trg_hla_aa_* deliberately: BEFORE triggers fire in name order and this
-- must run before trg_hla_leave_period_cap and trg_hla_sto_limits, both of
-- which read NEW.hr_academic_year_id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hr_trig_default_hr_academic_year()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.hr_academic_year_id IS NULL THEN
    -- Aliased: unqualified start_date/end_date would sit next to NEW.start_date
    -- and read ambiguously.
    SELECT y.id INTO NEW.hr_academic_year_id
    FROM public.hr_academic_years y
    WHERE y.is_active AND NEW.start_date BETWEEN y.start_date AND y.end_date;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_hla_aa_default_hr_ay ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_aa_default_hr_ay
  BEFORE INSERT OR UPDATE ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_default_hr_academic_year();

-- ---------------------------------------------------------------------------
-- Restore the EXECUTE grants that DROP FUNCTION discarded.
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.hr_leave_period_window(text, uuid, date)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_leave_period_usage(uuid, uuid, uuid, date)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_sto_usage(uuid, uuid, uuid, date)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_hr_leave_balances(uuid, uuid, boolean)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_leave_balance_analytics(uuid)                      TO authenticated, service_role;
