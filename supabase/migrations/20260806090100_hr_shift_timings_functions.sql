-- =====================================================================
-- hr_shift_timings — resolver + coverage RPCs
-- =====================================================================
-- Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
--
-- Both are SECURITY DEFINER and SELF-AUTHORIZING. A DEFINER function
-- callable by `authenticated` that trusts its caller is a privilege
-- escalation; these check the caller before returning anything.
-- =====================================================================

-- ---------------------------------------------------------------------
-- fn_resolve_shift_timing(staff, date)
-- Returns the single applicable timing row for a staff member on a date.
-- Resolution is most-specific-wins: staff_scope='category' beats
-- 'teaching'/'non_teaching'. Effective-dated, so a past date resolves
-- against the rule that was actually in force then.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_shift_timing(
  p_staff_id uuid,
  p_date     date
)
RETURNS TABLE (
  timing_id uuid,
  institution_id uuid,
  staff_scope text,
  employment_category_id uuid,
  day_of_week smallint,
  is_working_day boolean,
  first_half_start time,
  first_half_end time,
  second_half_start time,
  second_half_end time,
  grace_minutes integer,
  grace_deadline time,
  matched_by text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_dow            smallint;
  v_second_sat     boolean;
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.staff s
                WHERE s.id = p_staff_id AND s.profile_id = auth.uid())
    OR (public.user_has_permission('hr.shift_timings.view')
        AND EXISTS (SELECT 1 FROM public.staff s
                     WHERE s.id = p_staff_id
                       AND public.role_has_institution_access(s.institution_id)))
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve shift timing for this staff member'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching
    INTO v_institution_id, v_category_id, v_is_teaching
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN
    RETURN;
  END IF;

  v_dow := EXTRACT(ISODOW FROM p_date)::smallint;
  -- Nth Saturday of a month = ceil(day_of_month / 7). The 2nd falls on days 8..14.
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  RETURN QUERY
  SELECT
    t.id,
    t.institution_id,
    t.staff_scope,
    t.employment_category_id,
    t.day_of_week,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN false ELSE t.is_working_day END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_start  END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_end    END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_start END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) OR NOT t.is_working_day THEN NULL
         ELSE (t.first_half_start + make_interval(mins => t.grace_minutes))::time END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END
  FROM public.hr_shift_timings t
  WHERE t.institution_id = v_institution_id
    AND t.day_of_week    = v_dow
    AND t.is_active
    AND t.effective_from <= p_date
    AND (t.effective_until IS NULL OR t.effective_until > p_date)
    AND (
         (t.staff_scope = 'category'     AND t.employment_category_id = v_category_id)
      OR (t.staff_scope = 'teaching'     AND v_is_teaching)
      OR (t.staff_scope = 'non_teaching' AND NOT v_is_teaching)
    )
  ORDER BY CASE t.staff_scope WHEN 'category' THEN 0 ELSE 1 END,  -- most specific wins
           t.effective_from DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.fn_resolve_shift_timing(uuid, date) IS
  'Resolve the applicable hr_shift_timings row for a staff member on a date. Most-specific-wins (category > teaching/non_teaching), effective-dated, and folds in the second-Saturday rule. Self-authorizing.';

REVOKE ALL ON FUNCTION public.fn_resolve_shift_timing(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_shift_timing(uuid, date) TO authenticated;

-- ---------------------------------------------------------------------
-- fn_shift_timing_coverage(institution, date)
-- One row per employment category actually present in that institution,
-- with the timing it resolves to. A NULL resolved_timing_id means those
-- staff have NO timing on that date.
--
-- Exists because the data is legitimately uneven — Main Office is 114/114
-- non-teaching, both schools are 100% teaching — so the UI must be able to
-- tell "correctly empty" from "misconfigured".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_shift_timing_coverage(
  p_institution_id uuid,
  p_date           date
)
RETURNS TABLE (
  employment_category_id uuid,
  category_name text,
  is_teaching boolean,
  staff_count bigint,
  resolved_timing_id uuid,
  resolved_via text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow smallint;
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR ((public.user_has_permission('hr.shift_timings.view')
         OR public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(p_institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to view shift timing coverage for this institution'
      USING ERRCODE = '42501';
  END IF;

  v_dow := EXTRACT(ISODOW FROM p_date)::smallint;

  RETURN QUERY
  WITH cats AS (
    SELECT ec.id AS cat_id,
           ec.category_name AS cat_name,
           ec.is_teaching AS cat_is_teaching,
           count(s.id) AS cat_staff_count
    FROM public.staff s
    JOIN public.employment_categories ec ON ec.id = s.category_id
    WHERE s.institution_id = p_institution_id
    GROUP BY ec.id, ec.category_name, ec.is_teaching
  )
  SELECT c.cat_id, c.cat_name, c.cat_is_teaching, c.cat_staff_count, t.id, t.staff_scope
  FROM cats c
  LEFT JOIN LATERAL (
    SELECT tt.id, tt.staff_scope
    FROM public.hr_shift_timings tt
    WHERE tt.institution_id = p_institution_id
      AND tt.day_of_week    = v_dow
      AND tt.is_active
      AND tt.effective_from <= p_date
      AND (tt.effective_until IS NULL OR tt.effective_until > p_date)
      AND (
           (tt.staff_scope = 'category'     AND tt.employment_category_id = c.cat_id)
        OR (tt.staff_scope = 'teaching'     AND c.cat_is_teaching)
        OR (tt.staff_scope = 'non_teaching' AND NOT c.cat_is_teaching)
      )
    ORDER BY CASE tt.staff_scope WHEN 'category' THEN 0 ELSE 1 END,
             tt.effective_from DESC
    LIMIT 1
  ) t ON true
  ORDER BY c.cat_staff_count DESC, c.cat_name;
END;
$$;

COMMENT ON FUNCTION public.fn_shift_timing_coverage(uuid, date) IS
  'Per-employment-category shift timing coverage for an institution on a date. NULL resolved_timing_id = staff with no timing. Self-authorizing.';

REVOKE ALL ON FUNCTION public.fn_shift_timing_coverage(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_shift_timing_coverage(uuid, date) TO authenticated;
