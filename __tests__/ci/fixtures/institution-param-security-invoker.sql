-- FIXTURE for __tests__/ci/check-institution-param-guard.test.ts — NOT a migration.
-- The unguarded body, but SECURITY INVOKER: it runs as the caller, so the
-- caller's own row-level security still decides which colleges they see and a
-- caller-supplied id cannot widen it. The gate MUST ignore it.
CREATE OR REPLACE FUNCTION public.fn_probe_learner_count(p_institution_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM learners_profiles
   WHERE institution_id = COALESCE(p_institution_id, public.get_current_user_institution_id());
$$;
GRANT EXECUTE ON FUNCTION public.fn_probe_learner_count(uuid) TO authenticated;
