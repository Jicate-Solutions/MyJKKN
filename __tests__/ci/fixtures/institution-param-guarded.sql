-- FIXTURE for __tests__/ci/check-institution-param-guard.test.ts — NOT a migration.
-- The same lookup, guarded the way PR #3983 guards the ai_rpc_* readers: a named
-- institution is honoured only when role_has_institution_access() admits it, and
-- is otherwise refused out loud. The gate MUST pass it.
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
  IF p_institution_id IS NULL THEN
    v_inst_id := v_profile.institution_id;
  ELSIF public.role_has_institution_access(p_institution_id) THEN
    v_inst_id := p_institution_id;
  ELSE
    RAISE EXCEPTION 'You do not have access to that institution' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM learners_profiles WHERE institution_id = v_inst_id;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_probe_learner_count(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_probe_learner_count(uuid) TO authenticated;
