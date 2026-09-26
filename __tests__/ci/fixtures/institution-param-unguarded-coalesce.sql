-- FIXTURE for __tests__/ci/check-institution-param-guard.test.ts — NOT a migration.
-- The leak shape, reduced: a caller-supplied institution id, COALESCEd with the
-- caller's own, and a WHERE whose only other branch is the super-admin flag.
-- Correctly locked from anon and granted to authenticated — the anon gate passes
-- it. This gate MUST fail it.
CREATE OR REPLACE FUNCTION public.fn_probe_learner_count(p_institution_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_profile RECORD; v_inst_id uuid; v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  SELECT institution_id, is_super_admin INTO v_profile FROM profiles WHERE id = auth.uid();
  v_inst_id := COALESCE(p_institution_id, v_profile.institution_id);
  SELECT count(*) INTO v_count FROM learners_profiles
   WHERE (v_profile.is_super_admin = TRUE OR institution_id = v_inst_id);
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_probe_learner_count(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_probe_learner_count(uuid) TO authenticated;
