-- Institution-wise leave balance analytics for /hr/admin/leave-balances.
--
-- WHY: the page could generate balances but showed nothing about what already
-- exists. Admins had no way to see which institutions were covered, how many
-- days were provisioned, or which orgs were silently producing zero rows.
--
-- AUTHORIZATION: gated on hr.leave.balance.MANAGE, deliberately NOT .view.
-- `hr.leave.balance.view` is a self-service key ("see my own balance") granted
-- to 69 roles including Student, Guest, Parent and Driver. Gating org-wide HR
-- analytics on it would leak every institution's staffing and entitlement
-- figures to learners. `.manage` is held by 6 admin roles and already guards
-- this page.
--
-- ACADEMIC YEAR MODEL: academic_years rows are PER INSTITUTION — the name
-- '2026-2027' exists 11 times with differing start/end dates. A single
-- academic_year_id therefore cannot address a cross-institution view, so this
-- function takes the year NAME and resolves one row per institution.
-- Names are compared with btrim(): production contains '2026-2027 ' with a
-- trailing space, which is what made an earlier year picker resolve Pharmacy
-- to 2030-2031.

CREATE OR REPLACE FUNCTION public.hr_leave_balance_analytics(
  p_academic_year_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_out jsonb;
BEGIN
  -- SECURITY DEFINER functions callable by `authenticated` must authorize
  -- themselves — the caller's RLS does not apply inside this body.
  IF NOT public.user_has_permission('hr.leave.balance.manage') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
  END IF;

  WITH scoped_org AS (
    -- role_has_institution_access() special-cases super admins internally.
    SELECT o.id AS org_id, o.institution_id, i.name AS institution_name
    FROM public.hr_organizations o
    JOIN public.institutions i ON i.id = o.institution_id
    WHERE public.role_has_institution_access(o.institution_id)
  ),
  -- Exactly one academic year per institution. NULL parameter = "the year that
  -- contains today". DISTINCT ON guards against overlapping ranges (production
  -- has junk rows like '2025-2026 Additional 3' that overlap real years).
  ay AS (
    SELECT DISTINCT ON (s.institution_id)
           s.org_id,
           s.institution_id,
           a.id                          AS ay_id,
           btrim(a.academic_year_name)   AS ay_name,
           a.start_date,
           a.end_date
    FROM scoped_org s
    JOIN public.academic_years a ON a.institution_id = s.institution_id
    WHERE (p_academic_year_name IS NULL
             AND CURRENT_DATE BETWEEN a.start_date AND a.end_date)
       OR (p_academic_year_name IS NOT NULL
             AND btrim(a.academic_year_name) = btrim(p_academic_year_name))
    ORDER BY s.institution_id, a.start_date DESC
  ),
  staff_ct AS (
    SELECT s.org_id,
           count(*) FILTER (WHERE st.is_active)                            AS active_staff,
           count(*) FILTER (WHERE st.is_active AND d.cadre_id IS NOT NULL) AS staff_with_cadre
    FROM scoped_org s
    JOIN public.staff st ON st.institution_id = s.institution_id
    -- LEFT JOIN: ~190 active staff have no hr_staff_details row at all and
    -- must still be counted in the denominator.
    LEFT JOIN public.hr_staff_details d ON d.staff_id = st.id
    GROUP BY s.org_id
  ),
  type_ct AS (
    SELECT s.org_id,
           count(t.id) FILTER (WHERE t.is_active)                              AS active_types,
           COALESCE(sum(t.default_entitled_days) FILTER (WHERE t.is_active),0) AS days_per_head
    FROM scoped_org s
    -- LEFT JOIN: three orgs have zero leave types; they must appear as a gap,
    -- not vanish from the report.
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
    JOIN ay ON ay.org_id = s.org_id
    JOIN public.hr_leave_balances b
      ON b.hr_organization_id = s.org_id
     AND b.academic_year_id  = ay.ay_id
    GROUP BY s.org_id
  ),
  per_inst AS (
    SELECT
      s.org_id,
      s.institution_id,
      s.institution_name,
      ay.ay_id,
      ay.ay_name,
      ay.start_date,
      ay.end_date,
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
        WHEN ay.ay_id IS NULL                THEN 'no_academic_year'
        WHEN COALESCE(b.balance_rows,0) = 0  THEN 'not_generated'
        WHEN COALESCE(b.staff_covered,0) < COALESCE(sc.active_staff,0) THEN 'partial'
        ELSE 'complete'
      END AS status
    FROM scoped_org s
    LEFT JOIN ay       ON ay.org_id = s.org_id
    LEFT JOIN staff_ct sc ON sc.org_id = s.org_id
    LEFT JOIN type_ct  tc ON tc.org_id = s.org_id
    LEFT JOIN bal      b  ON b.org_id  = s.org_id
  ),
  -- Leave-type mix across every accessible org for the resolved years.
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
      -- hr_leave_balances has a COMPOSITE pk (employee_id, leave_type_id,
      -- academic_year_id) and no surrogate id column; count a NOT NULL member
      -- so the LEFT JOIN's non-matching rows still count as 0.
      count(b.employee_id)                    AS balance_rows,
      count(DISTINCT b.employee_id)           AS staff_count
    FROM scoped_org s
    JOIN public.hr_leave_types t
      ON t.hr_organization_id = s.org_id AND t.is_active
    LEFT JOIN ay ON ay.org_id = s.org_id
    -- LEFT JOIN so a configured-but-never-generated type still shows with 0s.
    LEFT JOIN public.hr_leave_balances b
      ON b.leave_type_id    = t.id
     AND b.academic_year_id = ay.ay_id
    GROUP BY t.leave_type_code
  ),
  -- Every academic year name visible to this caller, for the picker.
  year_opts AS (
    SELECT btrim(a.academic_year_name) AS ay_name,
           count(DISTINCT a.institution_id) AS institutions,
           bool_or(CURRENT_DATE BETWEEN a.start_date AND a.end_date) AS is_current,
           min(a.start_date) AS earliest_start
    FROM public.academic_years a
    WHERE a.institution_id IN (SELECT institution_id FROM scoped_org)
    GROUP BY btrim(a.academic_year_name)
  )
  SELECT jsonb_build_object(
    'academic_year_name', (SELECT max(ay_name) FROM ay),
    'resolved_by',        CASE WHEN p_academic_year_name IS NULL THEN 'current_date' ELSE 'explicit' END,
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
      SELECT jsonb_agg(to_jsonb(y) ORDER BY y.earliest_start DESC)
      FROM year_opts y
    ), '[]'::jsonb)
  )
  INTO v_out;

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.hr_leave_balance_analytics(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_balance_analytics(text) TO authenticated;
