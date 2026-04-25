-- Migration: 2026-04-24
-- Compatibility shim: restores the 2-arg get_seat_analytics(uuid, uuid) signature
-- that the old (pre-PR #456) frontend calls with {p_institution_id, p_academic_year_id}.
-- Accepts p_academic_year_id for backward compat but ignores it.
-- Maps admission_year columns back to academic_year column names so old components work.
-- TODO: drop this function after PR #456 is merged and the new frontend is deployed.

CREATE OR REPLACE FUNCTION public.get_seat_analytics(
  p_institution_id   uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL
)
RETURNS TABLE (
  institution_id     uuid,
  institution_name   text,
  degree_id          uuid,
  degree_name        text,
  department_id      uuid,
  department_name    text,
  program_id         uuid,
  program_name       text,
  academic_year_id   uuid,
  academic_year_name text,
  total_seats        integer,
  filled_seats       bigint,
  balance_seats      integer,
  fill_percentage    numeric,
  last_filled_at     timestamptz
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
    ay.id                   AS academic_year_id,
    ay.admission_year_name  AS academic_year_name,
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
    ON (
      lp.admission_year_id = ay.id
      OR (
        lp.admission_year_id IS NULL
        AND lp.program_id     = ay.program_id
        AND lp.institution_id = ay.institution_id
        AND lp.admission_year = ay.program_start_year
      )
    )
    AND lp.lifecycle_status IN ('admitted', 'active', 'graduated')
  WHERE ay.is_active = true
    AND (p_institution_id IS NULL OR ay.institution_id = p_institution_id)
  GROUP BY
    i.id, i.name,
    d.id, d.degree_name,
    dept.id, dept.department_name,
    p.id, p.program_name,
    ay.id, ay.admission_year_name, ay.sanctioned_intake
  ORDER BY i.name, d.degree_name, dept.department_name, p.program_name, ay.program_start_year DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_seat_analytics(uuid, uuid) TO authenticated;
