-- ============================================================================
-- ai-rpc-scope-guards-rehearsal.sql
--
-- NOT RUN against production by the lane that wrote it. It ROLLS BACK.
--
-- Proves, for 20270307090000_ai_rpc_scope_parameter_guards.sql, that a signed-in
-- NON-super caller who passes ANOTHER college's institution id is pinned to their
-- own college, and that a super admin still sees everything — WITHOUT persisting
-- anything.
--
-- HOW TO RUN ON PRODUCTION (one Management-API call, nothing survives):
--   1. If the migration is NOT yet applied, paste the whole migration file where
--      the marker below says so. It has no BEGIN/COMMIT of its own, so it is
--      applied inside this transaction and rolled back with it. If it IS
--      applied, leave the marker empty and the script measures what is LIVE.
--   2. Run the file. EXPECT IT TO FAIL with
--          REPORT {"verdict": "PASS", ...}
--      That failure IS the result: the report is thrown as an exception so the
--      transaction cannot commit. A clean success means the RAISE never ran.
--      "verdict": "FAIL" lists every check that did not hold in "failures".
--
-- HOW TO RUN OFF PRODUCTION: see ai-rpc-scope-guards-stub-schema.sql. Against
-- the stub, apply ai-rpc-scope-guards-pre-fix.sql (the leaky bodies, verbatim
-- from the repo) first and the verdict is FAIL — that is the control proving
-- the checks can fail. Apply the migration over it and the verdict is PASS.
--
-- WHO IT ACTS AS. It picks real accounts by rule, never by name:
--   low      — not super, not an admin role, has an institution, holds no
--              institution_scope='all' role (user_roles or legacy profiles.role)
--              and no active user_institution_access grant. (On production this
--              is often a learner account — the most likely attacker.)
--   other    — an active institution with learners that is NOT low's college or
--              its counselling-code sibling, preferring one with referrers.
--   super    — a super admin.
--   granted  — (optional) a non-super with an active grant to another college:
--              proves the guard does not lock out legitimate cross-college access.
--   noinst   — (optional) a non-super, non-admin profile with NO institution and
--              no scope-all role: proves ai_get_accessible_institutions no longer
--              hands such a caller every college.
-- Identity is set exactly as PostgREST sets it (request.jwt.claims + role
-- authenticated), so the GRANTs are exercised too.
--
-- WHAT IT READS. Counts and department ids, plus the JSON the functions return
-- (which for ai_rpc_admission_referrers includes referrer names and phone
-- numbers). The report carries only counts, ids and booleans — no names.
-- ============================================================================

BEGIN;

-- ── (1) paste 20270307090000_ai_rpc_scope_parameter_guards.sql here if it is
--        not applied yet ─────────────────────────────────────────────────────

-- ── (2) the rehearsal ───────────────────────────────────────────────────────
DO $rehearsal$
DECLARE
  v_low uuid; v_low_inst uuid; v_other uuid; v_super uuid; v_super_inst uuid;
  v_granted uuid; v_granted_inst uuid; v_noinst uuid;
  -- ground truth, read as the owner
  gt_own int; gt_other int; gt_all int; gt_own_depts int; gt_all_depts int;
  gt_other_referrers int; gt_granted int; v_noinst_expected uuid[];
  -- function results
  a jsonb; b jsonb; c jsonb; d jsonb; e jsonb; f jsonb;
  v_arr uuid[];
  checks jsonb := '{}'::jsonb;
  failures jsonb := '[]'::jsonb;
  fixture jsonb;
  ok boolean;
BEGIN
  -- ---------- pick the accounts ----------
  SELECT p.id, p.institution_id INTO v_low, v_low_inst
  FROM profiles p
  WHERE COALESCE(p.is_super_admin, false) = false
    AND p.institution_id IS NOT NULL
    AND COALESCE(p.role, '') NOT IN ('admin', 'super_admin', 'administrator')
    AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
                    WHERE ur.user_id = p.id AND cr.institution_scope = 'all')
    AND NOT EXISTS (SELECT 1 FROM custom_roles cr WHERE cr.role_key = p.role AND cr.institution_scope = 'all')
    AND NOT EXISTS (SELECT 1 FROM user_institution_access uia WHERE uia.user_id = p.id AND uia.is_active = true)
    AND EXISTS (SELECT 1 FROM learners_profiles lp WHERE lp.institution_id = p.institution_id)
    AND EXISTS (SELECT 1 FROM departments dd WHERE dd.institution_id = p.institution_id)
  ORDER BY p.id
  LIMIT 1;

  IF v_low IS NULL THEN
    RAISE EXCEPTION 'REPORT %', jsonb_build_object('verdict', 'NOT RUN', 'why', 'no eligible non-super single-institution profile');
  END IF;

  SELECT i.id INTO v_other
  FROM institutions i
  WHERE i.is_active = true
    AND i.id <> v_low_inst
    AND NOT EXISTS (SELECT 1 FROM institutions own
                    WHERE own.id = v_low_inst
                      AND own.counselling_code IS NOT NULL AND btrim(own.counselling_code) <> ''
                      AND own.counselling_code = i.counselling_code)
    AND EXISTS (SELECT 1 FROM learners_profiles lp WHERE lp.institution_id = i.id)
  ORDER BY (SELECT count(*) FROM learners_profiles lp
             WHERE lp.institution_id = i.id AND lp.reference_type IS NOT NULL AND lp.reference_name IS NOT NULL) DESC,
           (SELECT count(*) FROM learners_profiles lp WHERE lp.institution_id = i.id) DESC,
           i.id
  LIMIT 1;

  SELECT p.id, p.institution_id INTO v_super, v_super_inst
  FROM profiles p WHERE p.is_super_admin = true ORDER BY p.id LIMIT 1;

  SELECT uia.user_id, uia.institution_id INTO v_granted, v_granted_inst
  FROM user_institution_access uia JOIN profiles p ON p.id = uia.user_id
  WHERE uia.is_active = true AND COALESCE(p.is_super_admin, false) = false
    AND p.institution_id IS NOT NULL AND uia.institution_id <> p.institution_id
    AND COALESCE(p.role, '') NOT IN ('admin', 'super_admin', 'administrator')
    AND EXISTS (SELECT 1 FROM learners_profiles lp WHERE lp.institution_id = uia.institution_id)
  ORDER BY uia.user_id, uia.institution_id
  LIMIT 1;

  SELECT p.id INTO v_noinst
  FROM profiles p
  WHERE COALESCE(p.is_super_admin, false) = false
    AND p.institution_id IS NULL
    AND COALESCE(p.role, '') NOT IN ('admin', 'super_admin', 'administrator')
    AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
                    WHERE ur.user_id = p.id AND cr.institution_scope = 'all')
    AND NOT EXISTS (SELECT 1 FROM custom_roles cr WHERE cr.role_key = p.role AND cr.institution_scope = 'all')
  ORDER BY p.id
  LIMIT 1;

  -- ---------- ground truth (as the owner) ----------
  SELECT count(*) INTO gt_own   FROM learners_profiles WHERE institution_id = v_low_inst;
  SELECT count(*) INTO gt_other FROM learners_profiles WHERE institution_id = v_other;
  SELECT count(*) INTO gt_all   FROM learners_profiles;
  SELECT count(*) INTO gt_own_depts FROM departments WHERE institution_id = v_low_inst;
  SELECT count(*) INTO gt_all_depts FROM departments;
  SELECT count(*) INTO gt_other_referrers FROM learners_profiles
   WHERE institution_id = v_other AND reference_type IS NOT NULL AND reference_name IS NOT NULL;
  IF v_granted IS NOT NULL THEN
    SELECT count(*) INTO gt_granted FROM learners_profiles WHERE institution_id = v_granted_inst;
  END IF;
  IF v_noinst IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT uia.institution_id ORDER BY uia.institution_id), ARRAY[]::uuid[]) INTO v_noinst_expected
    FROM user_institution_access uia JOIN institutions i ON i.id = uia.institution_id
    WHERE uia.user_id = v_noinst AND uia.is_active = true AND i.is_active = true;
  END IF;

  fixture := jsonb_build_object(
    'low_institution', v_low_inst, 'other_institution', v_other, 'super_found', v_super IS NOT NULL,
    'granted_found', v_granted IS NOT NULL, 'noinst_found', v_noinst IS NOT NULL,
    'learners_own', gt_own, 'learners_other', gt_other, 'learners_all', gt_all,
    'departments_own', gt_own_depts, 'departments_all', gt_all_depts,
    'referrer_rows_other', gt_other_referrers,
    -- a check that the other college has DIFFERENT numbers, or "pinned" is indistinguishable from "leaked"
    'non_vacuous', gt_own <> gt_other);

  -- ================= as LOW =================
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_low, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_low::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. ai_rpc_students_summary
  a := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => v_other);
  b := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => v_low_inst);
  c := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => NULL);
  ok := (a->'data'->>'total_learners')::int = gt_own AND (c->'data'->>'total_learners')::int = gt_own
        AND a->'data' = b->'data';
  checks := checks || jsonb_build_object('students_summary_low_other_pinned',
    jsonb_build_object('pass', ok, 'got', a->'data'->>'total_learners', 'own', gt_own, 'other', gt_other));
  IF NOT ok THEN failures := failures || '"students_summary: low caller read another college"'::jsonb; END IF;

  -- 2. ai_rpc_students_by_department
  a := public.ai_rpc_students_by_department(p_user_id => NULL, p_institution_id => v_other);
  b := public.ai_rpc_students_by_department(p_user_id => NULL, p_institution_id => v_low_inst);
  ok := jsonb_array_length(COALESCE(a->'data', '[]')) = gt_own_depts AND a->'data' = b->'data';
  checks := checks || jsonb_build_object('students_by_department_low_other_pinned',
    jsonb_build_object('pass', ok, 'rows', jsonb_array_length(COALESCE(a->'data', '[]')), 'own_depts', gt_own_depts));
  IF NOT ok THEN failures := failures || '"students_by_department: low caller read another college"'::jsonb; END IF;

  -- 3. ai_rpc_admission_analytics (its monthly_trend nests aggregates; may raise on every call)
  BEGIN
    a := public.ai_rpc_admission_analytics(p_user_id => NULL, p_institution_id => v_other);
    ok := (a->'data'->>'total_enquiries')::int = gt_own;
    checks := checks || jsonb_build_object('admission_analytics_low_other_pinned',
      jsonb_build_object('pass', ok, 'got', a->'data'->>'total_enquiries', 'own', gt_own));
    IF NOT ok THEN failures := failures || '"admission_analytics: low caller read another college"'::jsonb; END IF;
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('admission_analytics_low_other_pinned',
      jsonb_build_object('pass', true, 'raises', SQLERRM, 'note', 'latent: the function errors before returning data'));
  END;

  -- 4. ai_rpc_admission_referrers
  a := public.ai_rpc_admission_referrers(p_user_id => NULL, p_institution_id => v_other, p_top_n => 1000);
  b := public.ai_rpc_admission_referrers(p_user_id => NULL, p_institution_id => v_low_inst, p_top_n => 1000);
  ok := a->'data' = b->'data';
  checks := checks || jsonb_build_object('admission_referrers_low_other_pinned',
    jsonb_build_object('pass', ok, 'rows', jsonb_array_length(COALESCE(a->'data', '[]')),
                       'non_vacuous', gt_other_referrers > 0));
  IF NOT ok THEN failures := failures || '"admission_referrers: low caller read another college''s referrers"'::jsonb; END IF;

  -- 5. ai_rpc_academic_context (reads academic_years.is_current, which does not exist; expected to raise)
  BEGIN
    a := public.ai_rpc_academic_context(p_institution_id => v_other);
    ok := a->>'academic_year_id' IS NULL
          OR (a->>'academic_year_id')::uuid NOT IN (SELECT id FROM academic_years WHERE institution_id = v_other);
    checks := checks || jsonb_build_object('academic_context_low_other_pinned', jsonb_build_object('pass', ok));
    IF NOT ok THEN failures := failures || '"academic_context: low caller read another college''s year"'::jsonb; END IF;
  EXCEPTION WHEN OTHERS THEN
    checks := checks || jsonb_build_object('academic_context_low_other_pinned',
      jsonb_build_object('pass', true, 'raises', SQLERRM, 'note', 'latent: the function errors before returning data'));
  END;

  -- 6. ai_get_accessible_institutions for a caller with an institution: unchanged, own only
  v_arr := public.ai_get_accessible_institutions(NULL);
  ok := v_arr = ARRAY[v_low_inst];
  checks := checks || jsonb_build_object('accessible_institutions_low_own_only', jsonb_build_object('pass', ok, 'n', cardinality(v_arr)));
  IF NOT ok THEN failures := failures || '"ai_get_accessible_institutions: low caller did not get exactly own"'::jsonb; END IF;

  RESET ROLE;

  -- ================= as SUPER =================
  IF v_super IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_super, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_super::text, true);
    SET LOCAL ROLE authenticated;

    a := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => v_other);
    c := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => NULL);
    -- unchanged behaviour: a super admin's institution filter was never applied, so both are ALL learners
    ok := (a->'data'->>'total_learners')::int = gt_all AND (c->'data'->>'total_learners')::int = gt_all;
    checks := checks || jsonb_build_object('students_summary_super_sees_all',
      jsonb_build_object('pass', ok, 'got', a->'data'->>'total_learners', 'all', gt_all));
    IF NOT ok THEN failures := failures || '"students_summary: super admin lost reach"'::jsonb; END IF;

    a := public.ai_rpc_students_by_department(p_user_id => NULL, p_institution_id => v_other);
    ok := jsonb_array_length(COALESCE(a->'data', '[]')) = gt_all_depts;
    checks := checks || jsonb_build_object('students_by_department_super_sees_all',
      jsonb_build_object('pass', ok, 'rows', jsonb_array_length(COALESCE(a->'data', '[]')), 'all', gt_all_depts));
    IF NOT ok THEN failures := failures || '"students_by_department: super admin lost reach"'::jsonb; END IF;

    a := public.ai_rpc_admission_referrers(p_user_id => NULL, p_institution_id => v_other, p_top_n => 100000);
    b := public.ai_rpc_admission_referrers(p_user_id => NULL, p_institution_id => NULL, p_top_n => 100000);
    ok := a->'data' = b->'data';
    checks := checks || jsonb_build_object('admission_referrers_super_unchanged',
      jsonb_build_object('pass', ok, 'rows', jsonb_array_length(COALESCE(a->'data', '[]'))));
    IF NOT ok THEN failures := failures || '"admission_referrers: super admin result changed with the institution id"'::jsonb; END IF;

    RESET ROLE;
  ELSE
    checks := checks || jsonb_build_object('super', jsonb_build_object('pass', true, 'skipped', 'no super admin profile'));
  END IF;

  -- ================= as GRANTED (legitimate cross-college access still works) =================
  IF v_granted IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_granted, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_granted::text, true);
    SET LOCAL ROLE authenticated;
    a := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => v_granted_inst);
    ok := (a->'data'->>'total_learners')::int = gt_granted;
    checks := checks || jsonb_build_object('students_summary_granted_honoured',
      jsonb_build_object('pass', ok, 'got', a->'data'->>'total_learners', 'granted_inst_learners', gt_granted));
    IF NOT ok THEN failures := failures || '"students_summary: a user_institution_access grant was not honoured"'::jsonb; END IF;
    RESET ROLE;
  ELSE
    checks := checks || jsonb_build_object('granted', jsonb_build_object('pass', true, 'skipped', 'no non-super profile with a cross-college grant'));
  END IF;

  -- ================= as NOINST (helper no longer hands out every college) =================
  IF v_noinst IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_noinst, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_noinst::text, true);
    SET LOCAL ROLE authenticated;
    SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[]) INTO v_arr
      FROM unnest(public.ai_get_accessible_institutions(NULL)) x;
    ok := v_arr = v_noinst_expected;
    checks := checks || jsonb_build_object('accessible_institutions_noinst_grants_only',
      jsonb_build_object('pass', ok, 'n', cardinality(v_arr), 'expected_n', cardinality(v_noinst_expected)));
    IF NOT ok THEN failures := failures || '"ai_get_accessible_institutions: a no-institution caller got colleges they were never granted"'::jsonb; END IF;
    RESET ROLE;
  ELSE
    checks := checks || jsonb_build_object('noinst', jsonb_build_object('pass', true, 'skipped', 'no non-admin profile without an institution'));
  END IF;

  -- ================= grants =================
  ok := NOT has_function_privilege('anon', 'public.ai_rpc_students_summary(uuid,uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.ai_rpc_students_by_department(uuid,uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.ai_rpc_admission_analytics(uuid,uuid,uuid,boolean)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.ai_rpc_admission_referrers(uuid,text,text,uuid,uuid,uuid,text,text,text,integer,boolean)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.ai_rpc_academic_context(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.ai_get_accessible_institutions(uuid)', 'EXECUTE');
  checks := checks || jsonb_build_object('anon_cannot_execute', jsonb_build_object('pass', ok));
  IF NOT ok THEN failures := failures || '"anon can EXECUTE one of the six functions"'::jsonb; END IF;

  RAISE EXCEPTION 'REPORT %', jsonb_build_object(
    'verdict', CASE WHEN jsonb_array_length(failures) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'failures', failures, 'fixture', fixture, 'checks', checks);
END
$rehearsal$;

ROLLBACK;
