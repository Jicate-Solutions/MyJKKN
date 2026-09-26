-- FIXTURE for __tests__/ci/check-institution-param-guard.test.ts — NOT a migration.
-- SECURITY DEFINER and unguarded, but it takes no institution id from its caller
-- (institution_id appears only as a RETURNS TABLE column and inside the body).
-- Not this gate's business; the gate MUST ignore it.
CREATE OR REPLACE FUNCTION public.fn_probe_my_department_count(p_department_id uuid)
RETURNS TABLE (institution_id uuid, learner_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lp.institution_id, count(*)::integer
    FROM learners_profiles lp
   WHERE lp.department_id = p_department_id
   GROUP BY lp.institution_id;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_probe_my_department_count(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_probe_my_department_count(uuid) TO authenticated;
