-- Online payment year order: is this academic year AFTER the institution's current AY?
--
-- Learners (My Bills) and parents (Parent Portal) must clear every past + current
-- academic-year due before a FUTURE-year bill can be paid online — a learner was
-- paying 2027-28 tuition online while 2026-27 dues were still open. The lock is
-- enforced in the payment routes (lib/utils/billing/academic-year-payment-order.ts);
-- this function is the one place the "future year" boundary is decided.
--
-- "Current AY" = latest ACTIVE academic year of the year's institution with
-- start_date <= as-of date — the same rule as fn_learner_bill_year_visible and the
-- billing coverage audit.
--
-- Returns false (never locks) for a NULL id, a dangling id, or an institution with
-- no resolvable current AY — today's behaviour in each case.
--
-- SECURITY DEFINER is required: the student policies on academic_years expose only
-- the years on the learner's own bills, so a learner session cannot see the
-- institution's current AY. The function takes no caller identity and returns only
-- a boolean about the given year.

CREATE OR REPLACE FUNCTION public.fn_academic_year_is_future(
  p_academic_year_id uuid,
  p_as_of date DEFAULT current_date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH by AS (
    SELECT institution_id, start_date
    FROM public.academic_years
    WHERE id = p_academic_year_id
  ),
  cur AS (
    SELECT max(a.start_date) AS start_date
    FROM public.academic_years a, by
    WHERE a.institution_id = by.institution_id
      AND a.is_active
      AND a.start_date <= p_as_of
  )
  SELECT coalesce((SELECT by.start_date > cur.start_date FROM by, cur), false);
$$;

REVOKE ALL ON FUNCTION public.fn_academic_year_is_future(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_academic_year_is_future(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_academic_year_is_future(uuid, date) TO authenticated, service_role;
