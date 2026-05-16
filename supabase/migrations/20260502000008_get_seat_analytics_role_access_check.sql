-- Migration: 2026-05-02
-- Phase C-4: Add role_has_institution_access(id) filter to get_seat_analytics.
-- Without this, the Summary tab returned counts from institutions the caller's
-- role does not have access to. Sibling RPCs (fn_seat_analytics_daily_pivot,
-- fn_geography_analytics, fn_institution_comparison, ...) all carry this filter
-- already; this brings get_seat_analytics in line.
--
-- Effect: super-admins see no change. Scoped users (single-institution roles,
-- counsellors, etc.) get correct, lower counts that match the Daily Pivot tab.

DROP FUNCTION IF EXISTS public.get_seat_analytics(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_seat_analytics(
  p_institution_id     uuid    DEFAULT NULL,
  p_program_start_year integer DEFAULT NULL
)
RETURNS TABLE (
  institution_id      uuid,
  institution_name    text,
  degree_id           uuid,
  degree_name         text,
  department_id       uuid,
  department_name     text,
  program_id          uuid,
  program_name        text,
  admission_year_id   uuid,
  admission_year_name text,
  program_start_year  integer,
  program_end_year    integer,
  total_seats         integer,
  filled_seats        bigint,
  balance_seats       integer,
  fill_percentage     numeric,
  last_filled_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.name,
    d.id,
    d.degree_name,
    dept.id,
    dept.department_name,
    p.id,
    p.program_name,
    ay.id,
    ay.admission_year_name,
    ay.program_start_year,
    ay.program_end_year,
    ay.sanctioned_intake::integer                               AS total_seats,
    COUNT(lp.id)                                                AS filled_seats,
    GREATEST(0, ay.sanctioned_intake - COUNT(lp.id)::integer)   AS balance_seats,
    CASE
      WHEN ay.sanctioned_intake > 0
        THEN ROUND(COUNT(lp.id)::numeric / ay.sanctioned_intake * 100, 1)
      ELSE 0
    END                                                         AS fill_percentage,
    MAX(lp.activated_at)                                        AS last_filled_at
  FROM admission_years ay
  JOIN programs p       ON p.id    = ay.program_id
  JOIN departments dept ON dept.id = p.department_id
  JOIN degrees d        ON d.id    = p.degree_id
  JOIN institutions i   ON i.id    = ay.institution_id
  LEFT JOIN learners_profiles lp
    ON  lp.admission_year_id = ay.id
    AND lp.lifecycle_status IN ('admitted', 'active', 'graduated', 'account')
  WHERE
    (
      (p_program_start_year IS NULL     AND ay.is_active = true)
      OR (p_program_start_year IS NOT NULL AND ay.program_start_year = p_program_start_year)
    )
    AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
    AND role_has_institution_access(ay.institution_id)
  GROUP BY
    i.id, i.name,
    d.id, d.degree_name,
    dept.id, dept.department_name,
    p.id, p.program_name,
    ay.id, ay.admission_year_name, ay.program_start_year, ay.program_end_year, ay.sanctioned_intake
  ORDER BY i.name, d.degree_name, dept.department_name, p.program_name, ay.program_start_year DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_seat_analytics(uuid, integer) TO authenticated;
