-- Migration: 2026-05-17
-- Task E1 (feat/dynamic-admission-statuses): Replace the hardcoded
-- seat-filled literal list inside get_seat_analytics with a subquery
-- against admission_statuses, so future seat-filled flags are picked up
-- without an RPC rewrite.
--
-- OLD JOIN clause:
--   AND lp.lifecycle_status IN ('admitted', 'active', 'graduated', 'account')
--
-- NEW JOIN clause:
--   AND lp.lifecycle_status::text IN (
--     SELECT code FROM public.admission_statuses
--     WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
--   )
--
-- Behaviour change disclosure: in the current seed, only `'active'` is
-- flagged is_seat_filled=true. The dashboard "Seat Filled" count will
-- drop from the old IN-list aggregate (admitted+active+graduated+account)
-- to active-only. This is intentional and aligns with the fee-paid
-- threshold that gates the `active` status.
--
-- Signature (parameter list, parameter defaults, return columns) is
-- preserved verbatim; this is a body-only rewrite. role_has_institution_access(),
-- SECURITY DEFINER, search_path, and EXECUTE grant are preserved.

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
    AND lp.lifecycle_status::text IN (
      SELECT code FROM public.admission_statuses
      WHERE scope = 'learner' AND is_active = true AND is_seat_filled = true
    )
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
