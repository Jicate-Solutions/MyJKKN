-- ============================================================================
-- ai-rpc-scope-guards-rehearsal.sql
--
-- NOT RUN against production by the lane that wrote it. It ROLLS BACK.
--
-- Proves, for 20270307090000_ai_rpc_scope_parameter_guards.sql, WITHOUT
-- persisting anything, that:
--   * a signed-in NON-super caller who HOLDS the tool's permission key and names
--     ANOTHER college's institution id is REFUSED by the INSTITUTION guard
--     (success:false, FORBIDDEN_INSTITUTION) and handed NO data — never answered
--     with their own college's figures under the other college's name. The
--     permission gate's FORBIDDEN is never accepted here: it returns before the
--     institution guard runs, so accepting it would let the check pass without
--     testing that guard;
--   * the same caller still gets their own college for their own id and for NULL;
--   * a caller WITHOUT the tool's permission key (typically a learner) is refused
--     outright, even for their own college (referrer names and phones included);
--   * a super admin's institution id NARROWS (that college only), and NULL still
--     means every college;
--   * a legitimate user_institution_access grant is still honoured;
--   * a non-super caller with no institution who names none is refused
--     explicitly (NO_INSTITUTION, or FORBIDDEN without the key), not handed a
--     silent zero.
-- It also reads, live, WHO THE NEW PERMISSION GATE TURNS AWAY (the `impact`
-- block): ai_query.view holders without learners.view / without
-- learners.admissions.dashboard. That gate is a NEW restriction (see the
-- migration header), so read `impact` before applying.
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
--      "verdict": "INCOMPLETE" means nothing failed but a required check could
--      not run (no suitable account — listed in "not_run"). INCOMPLETE is NOT a
--      pass: the guard it names was never exercised.
--
-- HOW TO RUN OFF PRODUCTION: see ai-rpc-scope-guards-stub-schema.sql. Against
-- the stub, apply ai-rpc-scope-guards-pre-fix.sql (the leaky bodies, verbatim
-- from the repo) first and the verdict is FAIL — that is the control proving
-- the checks can fail. Apply the migration over it and the verdict is PASS.
--
-- WHO IT ACTS AS. It picks real accounts by rule, never by name:
--   low      — not super, not an admin role, has an institution, holds no
--              institution_scope='all' role (user_roles or legacy profiles.role)
--              and no active user_institution_access grant, and whose roles
--              REQUIRE-grant learners.view. Runs checks 1-2 (students_summary,
--              students_by_department), 5 and 6. None found -> 1-2 NOT RUN.
--   low_ad   — the same own-scope rules, but REQUIRED to hold
--              learners.admissions.dashboard. Runs checks 3-4 (admission_analytics,
--              admission_referrers — the one that returns referrer names and
--              phones). That key sits mostly on scope-'all' roles, which the own-
--              scope rule excludes, so on production this account may not exist:
--              then 3-4 are NOT RUN and the verdict is INCOMPLETE, never PASS.
--              Each account's key is re-measured AS that account
--              (user_has_permission); a picked account that does not resolve its
--              key is a FAILURE, never a silently weaker check.
--   other    — an active institution with learners that is NOT low's or low_ad's
--              college or its counselling-code sibling, preferring one with
--              referrers. `fixture.non_vacuous` (other differs from own and from
--              all, and has referrers) FEEDS THE VERDICT: false is a failure.
--   noperm   — (optional) not super, not an admin role, has an institution, and no
--              role grants learners.view or learners.admissions.dashboard (on
--              production, a learner): proves the database refuses them even for
--              their OWN college — the direct /rest/v1/rpc door.
--   super    — a super admin.
--   granted  — (optional) a non-super with an active grant to another college:
--              proves the guard does not lock out legitimate cross-college access.
--   noinst   — (optional) a non-super, non-admin profile with NO institution and
--              no scope-all role: proves ai_get_accessible_institutions no longer
--              hands such a caller every college, and that a reader called with
--              no institution refuses them explicitly instead of returning zero.
-- Identity is set exactly as PostgREST sets it (request.jwt.claims + role
-- authenticated), so the GRANTs are exercised too. Every figure that needs a
-- table read is taken as the OWNER before the role switch, so RLS cannot make a
-- check pass vacuously.
--
-- WHAT IT READS. Counts and ids, plus the JSON the functions return (which for
-- ai_rpc_admission_referrers includes referrer names and phone numbers). The
-- report carries only counts, ids, codes and booleans — no names.
-- ============================================================================

BEGIN;

-- ── (1) paste 20270307090000_ai_rpc_scope_parameter_guards.sql here if it is
--        not applied yet ─────────────────────────────────────────────────────

-- ── (2) the rehearsal ───────────────────────────────────────────────────────
DO $rehearsal$
DECLARE
  v_low uuid; v_low_inst uuid; v_lowad uuid; v_lowad_inst uuid; v_other uuid; v_super uuid;
  v_granted uuid; v_granted_inst uuid; v_noinst uuid; v_noperm uuid; v_noperm_inst uuid;
  -- ground truth, read as the owner
  gt_own int; gt_other int; gt_all int; gt_own_depts int; gt_other_depts int; gt_all_depts int;
  gt_other_ref_groups int; gt_all_ref_groups int; gt_granted int; v_noinst_expected uuid[];
  gt_lowad_own_ref_groups int; v_lead uuid; v_lead_inst uuid;
  v_other_years uuid[];
  -- measured as the caller
  v_low_lv boolean; v_low_ad boolean; v_noperm_lv boolean; v_noperm_ad boolean; v_granted_lv boolean;
  v_code text;
  a jsonb; b jsonb; c jsonb;
  v_arr uuid[];
  checks jsonb := '{}'::jsonb;
  not_run jsonb := '[]'::jsonb;
  impact jsonb;
  failures jsonb := '[]'::jsonb;
  fixture jsonb;
  ok boolean;
BEGIN
  -- ---------- pick the accounts ----------
  -- low: own-scope, REQUIRED to hold learners.view (checks 1-2, 5, 6)
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
    AND EXISTS (SELECT 1 FROM custom_roles cr
                WHERE (cr.id IN (SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = p.id) OR cr.role_key = p.role)
                  AND cr.permissions->>'learners.view' = 'true')
    AND COALESCE((to_jsonb(p)->>'is_active')::boolean, true)
    AND NOT COALESCE((to_jsonb(p)->>'is_login_disabled')::boolean, false)
  ORDER BY p.id
  LIMIT 1;

  -- low_ad: own-scope, REQUIRED to hold learners.admissions.dashboard (checks 3-4).
  -- A separate pick, so checks 3-4 can never fall back to the permission refusal.
  SELECT p.id, p.institution_id INTO v_lowad, v_lowad_inst
  FROM profiles p
  WHERE COALESCE(p.is_super_admin, false) = false
    AND p.institution_id IS NOT NULL
    AND COALESCE(p.role, '') NOT IN ('admin', 'super_admin', 'administrator')
    AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
                    WHERE ur.user_id = p.id AND cr.institution_scope = 'all')
    AND NOT EXISTS (SELECT 1 FROM custom_roles cr WHERE cr.role_key = p.role AND cr.institution_scope = 'all')
    AND NOT EXISTS (SELECT 1 FROM user_institution_access uia WHERE uia.user_id = p.id AND uia.is_active = true)
    AND EXISTS (SELECT 1 FROM learners_profiles lp WHERE lp.institution_id = p.institution_id)
    AND EXISTS (SELECT 1 FROM custom_roles cr
                WHERE (cr.id IN (SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = p.id) OR cr.role_key = p.role)
                  AND cr.permissions->>'learners.admissions.dashboard' = 'true')
    AND COALESCE((to_jsonb(p)->>'is_active')::boolean, true)
    AND NOT COALESCE((to_jsonb(p)->>'is_login_disabled')::boolean, false)
  ORDER BY (SELECT count(*) FROM learners_profiles lp
             WHERE lp.institution_id = p.institution_id AND lp.reference_type IS NOT NULL AND lp.reference_name IS NOT NULL) DESC,
           p.id
  LIMIT 1;

  IF v_low IS NULL AND v_lowad IS NULL THEN
    RAISE EXCEPTION 'REPORT %', jsonb_build_object('verdict', 'NOT RUN',
      'why', 'no own-scope non-super single-institution profile holding learners.view or learners.admissions.dashboard');
  END IF;
  -- the account that runs the permission-free checks 5-6
  v_lead := COALESCE(v_low, v_lowad);
  v_lead_inst := COALESCE(v_low_inst, v_lowad_inst);

  SELECT i.id INTO v_other
  FROM institutions i
  WHERE i.is_active = true
    AND i.id IS DISTINCT FROM v_low_inst
    AND i.id IS DISTINCT FROM v_lowad_inst
    AND NOT EXISTS (SELECT 1 FROM institutions own
                    WHERE own.id IN (v_low_inst, v_lowad_inst)
                      AND own.counselling_code IS NOT NULL AND btrim(own.counselling_code) <> ''
                      AND own.counselling_code = i.counselling_code)
    AND EXISTS (SELECT 1 FROM learners_profiles lp WHERE lp.institution_id = i.id)
  ORDER BY (SELECT count(*) FROM learners_profiles lp
             WHERE lp.institution_id = i.id AND lp.reference_type IS NOT NULL AND lp.reference_name IS NOT NULL) DESC,
           (SELECT count(*) FROM learners_profiles lp WHERE lp.institution_id = i.id) DESC,
           i.id
  LIMIT 1;

  SELECT p.id, p.institution_id INTO v_noperm, v_noperm_inst
  FROM profiles p
  WHERE COALESCE(p.is_super_admin, false) = false
    AND p.institution_id IS NOT NULL
    AND COALESCE(p.role, '') NOT IN ('admin', 'super_admin', 'administrator')
    AND NOT EXISTS (SELECT 1 FROM custom_roles cr
                    WHERE (cr.id IN (SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = p.id) OR cr.role_key = p.role)
                      AND (cr.permissions->>'learners.view' = 'true'
                           OR cr.permissions->>'learners.admissions.dashboard' = 'true'))
    AND EXISTS (SELECT 1 FROM learners_profiles lp
                WHERE lp.institution_id = p.institution_id AND lp.reference_type IS NOT NULL AND lp.reference_name IS NOT NULL)
  ORDER BY p.id
  LIMIT 1;

  SELECT p.id INTO v_super
  FROM profiles p WHERE p.is_super_admin = true ORDER BY p.id LIMIT 1;

  SELECT uia.user_id, uia.institution_id INTO v_granted, v_granted_inst
  FROM user_institution_access uia JOIN profiles p ON p.id = uia.user_id
  WHERE uia.is_active = true AND COALESCE(p.is_super_admin, false) = false
    AND p.institution_id IS NOT NULL AND uia.institution_id <> p.institution_id
    AND COALESCE(p.role, '') NOT IN ('admin', 'super_admin', 'administrator')
    AND EXISTS (SELECT 1 FROM learners_profiles lp WHERE lp.institution_id = uia.institution_id)
  ORDER BY (EXISTS (SELECT 1 FROM custom_roles cr
                    WHERE (cr.id IN (SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = p.id) OR cr.role_key = p.role)
                      AND cr.permissions->>'learners.view' = 'true')) DESC,
           uia.user_id, uia.institution_id
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

  -- ---------- ground truth (as the owner, before any role switch) ----------
  SELECT count(*) INTO gt_own   FROM learners_profiles WHERE institution_id = v_lead_inst;
  SELECT count(*) INTO gt_other FROM learners_profiles WHERE institution_id = v_other;
  SELECT count(*) INTO gt_all   FROM learners_profiles;
  SELECT count(*) INTO gt_own_depts   FROM departments WHERE institution_id = v_low_inst;
  SELECT count(*) INTO gt_lowad_own_ref_groups FROM (
    SELECT 1 FROM learners_profiles
    WHERE institution_id = v_lowad_inst AND reference_type IS NOT NULL AND reference_name IS NOT NULL
    GROUP BY reference_type, reference_name, reference_contact) g;
  SELECT count(*) INTO gt_other_depts FROM departments WHERE institution_id = v_other;
  SELECT count(*) INTO gt_all_depts   FROM departments;
  -- referrer rows the function returns = one per (type, name, contact) group
  SELECT count(*) INTO gt_other_ref_groups FROM (
    SELECT 1 FROM learners_profiles
    WHERE institution_id = v_other AND reference_type IS NOT NULL AND reference_name IS NOT NULL
    GROUP BY reference_type, reference_name, reference_contact) g;
  SELECT count(*) INTO gt_all_ref_groups FROM (
    SELECT 1 FROM learners_profiles
    WHERE reference_type IS NOT NULL AND reference_name IS NOT NULL
    GROUP BY reference_type, reference_name, reference_contact) g;
  -- read HERE, as the owner: under SET LOCAL ROLE authenticated, RLS on
  -- academic_years could hide every row and let check 5 pass vacuously.
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_other_years FROM academic_years WHERE institution_id = v_other;
  IF v_granted IS NOT NULL THEN
    SELECT count(*) INTO gt_granted FROM learners_profiles WHERE institution_id = v_granted_inst;
  END IF;
  IF v_noinst IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT uia.institution_id ORDER BY uia.institution_id), ARRAY[]::uuid[]) INTO v_noinst_expected
    FROM user_institution_access uia JOIN institutions i ON i.id = uia.institution_id
    WHERE uia.user_id = v_noinst AND uia.is_active = true AND i.is_active = true;
  END IF;

  -- ---------- impact of the NEW permission gate (read live, as the owner) ----------
  -- Custom-role grants only (user_roles + legacy profiles.role), the same two paths
  -- user_has_permission() reads; a Director handover can add a key this cannot see,
  -- so the people counts are an upper bound. Super admins and legacy admin roles
  -- pass the gate and are left out.
  WITH holders AS (
    SELECT ur.user_id AS id, cr.permissions FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
    UNION ALL
    SELECT p.id, cr.permissions FROM profiles p JOIN custom_roles cr ON cr.role_key = p.role
  ), per AS (
    SELECT h.id,
           bool_or(COALESCE(h.permissions->>'ai_query.view' = 'true', false)) AS aq,
           bool_or(COALESCE(h.permissions->>'learners.view' = 'true', false)) AS lv,
           bool_or(COALESCE(h.permissions->>'learners.admissions.dashboard' = 'true', false)) AS ad
    FROM holders h GROUP BY h.id
  )
  SELECT jsonb_build_object(
    'people_ai_query_view', count(*) FILTER (WHERE per.aq),
    'people_lose_students_summary_and_by_department', count(*) FILTER (WHERE per.aq AND NOT per.lv),
    'people_lose_admission_analytics_and_referrers', count(*) FILTER (WHERE per.aq AND NOT per.ad))
  INTO impact
  FROM per JOIN profiles p ON p.id = per.id
  WHERE COALESCE(p.is_super_admin, false) = false
    AND COALESCE(p.role, '') NOT IN ('admin', 'super_admin', 'administrator')
    AND COALESCE((to_jsonb(p)->>'is_active')::boolean, true)
    AND NOT COALESCE((to_jsonb(p)->>'is_login_disabled')::boolean, false);
  impact := impact || jsonb_build_object(
    'roles_ai_query_view_without_learners_view',
      (SELECT COALESCE(jsonb_agg(cr.role_key ORDER BY cr.role_key), '[]'::jsonb) FROM custom_roles cr
        WHERE cr.permissions->>'ai_query.view' = 'true'
          AND COALESCE(cr.permissions->>'learners.view', 'false') <> 'true'),
    'roles_ai_query_view_without_admissions_dashboard',
      (SELECT COALESCE(jsonb_agg(cr.role_key ORDER BY cr.role_key), '[]'::jsonb) FROM custom_roles cr
        WHERE cr.permissions->>'ai_query.view' = 'true'
          AND COALESCE(cr.permissions->>'learners.admissions.dashboard', 'false') <> 'true'),
    'note', 'custom-role grants only; handovers not counted; super admins and legacy admin roles excluded (they pass the gate)');

  -- ================= as LOW (holds learners.view) =================
  IF v_low IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_low, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_low::text, true);
    SET LOCAL ROLE authenticated;

    v_low_lv := public.user_has_permission('learners.view');
    IF NOT v_low_lv THEN
      failures := failures || '"fixture: the picked low account does not resolve learners.view, so checks 1-2 could only meet the permission refusal"'::jsonb;
    END IF;

    -- 1. ai_rpc_students_summary — foreign id refused BY THE INSTITUTION GUARD, own id / NULL = own college
    a := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => v_other);
    ok := (a->>'success') = 'false' AND a->'error'->>'code' = 'FORBIDDEN_INSTITUTION' AND a->'data' IS NULL;
    checks := checks || jsonb_build_object('students_summary_low_other_refused',
      jsonb_build_object('pass', ok, 'success', a->>'success', 'code', a->'error'->>'code', 'expected_code', 'FORBIDDEN_INSTITUTION'));
    IF NOT ok THEN failures := failures || '"students_summary: low caller naming another college was not refused by the institution guard"'::jsonb; END IF;
    b := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => v_low_inst);
    c := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => NULL);
    ok := (b->'data'->>'total_learners')::int = gt_own AND (c->'data'->>'total_learners')::int = gt_own;
    checks := checks || jsonb_build_object('students_summary_low_own_and_null',
      jsonb_build_object('pass', COALESCE(ok, false), 'own_id', b->'data'->>'total_learners', 'null_id', c->'data'->>'total_learners', 'own', gt_own));
    IF NOT COALESCE(ok, false) THEN failures := failures || '"students_summary: low caller did not get exactly own college for own id / NULL"'::jsonb; END IF;

    -- 2. ai_rpc_students_by_department
    a := public.ai_rpc_students_by_department(p_user_id => NULL, p_institution_id => v_other);
    ok := (a->>'success') = 'false' AND a->'error'->>'code' = 'FORBIDDEN_INSTITUTION' AND a->'data' IS NULL;
    checks := checks || jsonb_build_object('students_by_department_low_other_refused',
      jsonb_build_object('pass', ok, 'success', a->>'success', 'code', a->'error'->>'code', 'expected_code', 'FORBIDDEN_INSTITUTION'));
    IF NOT ok THEN failures := failures || '"students_by_department: low caller naming another college was not refused by the institution guard"'::jsonb; END IF;
    b := public.ai_rpc_students_by_department(p_user_id => NULL, p_institution_id => v_low_inst);
    ok := jsonb_array_length(COALESCE(b->'data', '[]')) = gt_own_depts;
    checks := checks || jsonb_build_object('students_by_department_low_own',
      jsonb_build_object('pass', ok, 'rows', jsonb_array_length(COALESCE(b->'data', '[]')), 'own_depts', gt_own_depts));
    IF NOT ok THEN failures := failures || '"students_by_department: low caller did not get exactly own departments"'::jsonb; END IF;

    RESET ROLE;
  ELSE
    not_run := not_run || '"checks 1-2 (students_summary, students_by_department institution guard): no own-scope account holding learners.view"'::jsonb;
  END IF;

  -- ================= as LOW_AD (holds learners.admissions.dashboard) =================
  IF v_lowad IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_lowad, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_lowad::text, true);
    SET LOCAL ROLE authenticated;

    v_low_ad := public.user_has_permission('learners.admissions.dashboard');
    IF NOT v_low_ad THEN
      failures := failures || '"fixture: the picked low_ad account does not resolve learners.admissions.dashboard, so checks 3-4 could only meet the permission refusal"'::jsonb;
    END IF;

    -- 3. ai_rpc_admission_analytics — the refusal precedes the query, so this can no
    --    longer hide behind the function's own nested-aggregate error
    BEGIN
      a := public.ai_rpc_admission_analytics(p_user_id => NULL, p_institution_id => v_other);
      ok := (a->>'success') = 'false' AND a->'error'->>'code' = 'FORBIDDEN_INSTITUTION' AND a->'data' IS NULL;
      checks := checks || jsonb_build_object('admission_analytics_low_other_refused',
        jsonb_build_object('pass', ok, 'success', a->>'success', 'code', a->'error'->>'code', 'expected_code', 'FORBIDDEN_INSTITUTION'));
    EXCEPTION WHEN OTHERS THEN
      ok := false;
      checks := checks || jsonb_build_object('admission_analytics_low_other_refused',
        jsonb_build_object('pass', false, 'raises', SQLERRM, 'note', 'reached the query: the refusal did not run first'));
    END;
    IF NOT ok THEN failures := failures || '"admission_analytics: low_ad caller naming another college was not refused by the institution guard"'::jsonb; END IF;

    -- 4. ai_rpc_admission_referrers — the referrer names-and-phones reader
    a := public.ai_rpc_admission_referrers(p_user_id => NULL, p_institution_id => v_other, p_top_n => 100000);
    ok := (a->>'success') = 'false' AND a->'error'->>'code' = 'FORBIDDEN_INSTITUTION' AND a->'data' IS NULL;
    checks := checks || jsonb_build_object('admission_referrers_low_other_refused',
      jsonb_build_object('pass', ok, 'success', a->>'success', 'code', a->'error'->>'code', 'expected_code', 'FORBIDDEN_INSTITUTION',
                         'other_has_referrers', gt_other_ref_groups > 0));
    IF NOT ok THEN failures := failures || '"admission_referrers: low_ad caller naming another college was not refused by the institution guard"'::jsonb; END IF;
    b := public.ai_rpc_admission_referrers(p_user_id => NULL, p_institution_id => NULL, p_top_n => 100000);
    ok := (b->>'success') = 'true' AND jsonb_array_length(COALESCE(b->'data', '[]')) = gt_lowad_own_ref_groups;
    checks := checks || jsonb_build_object('admission_referrers_low_null_is_own',
      jsonb_build_object('pass', ok, 'rows', jsonb_array_length(COALESCE(b->'data', '[]')), 'own', gt_lowad_own_ref_groups));
    IF NOT ok THEN failures := failures || '"admission_referrers: low_ad caller with NULL did not get exactly own college''s referrers"'::jsonb; END IF;

    RESET ROLE;
  ELSE
    not_run := not_run || '"checks 3-4 (admission_analytics, admission_referrers institution guard): no own-scope account holding learners.admissions.dashboard"'::jsonb;
  END IF;

  -- ================= as LEAD (low, else low_ad): permission-free checks =================
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_lead, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_lead::text, true);
  SET LOCAL ROLE authenticated;

  -- 5. ai_rpc_academic_context — refused before it reaches its broken SELECT
  BEGIN
    a := public.ai_rpc_academic_context(p_institution_id => v_other);
    ok := (a->>'success') = 'false' AND a->'error'->>'code' = 'FORBIDDEN_INSTITUTION'
          AND NOT (COALESCE(a->>'academic_year_id', '') <> '' AND (a->>'academic_year_id')::uuid = ANY (v_other_years));
    checks := checks || jsonb_build_object('academic_context_low_other_refused',
      jsonb_build_object('pass', ok, 'code', a->'error'->>'code', 'other_years', cardinality(v_other_years)));
  EXCEPTION WHEN OTHERS THEN
    ok := false;
    checks := checks || jsonb_build_object('academic_context_low_other_refused',
      jsonb_build_object('pass', false, 'raises', SQLERRM, 'note', 'reached the SELECT: the refusal did not run first'));
  END;
  IF NOT ok THEN failures := failures || '"academic_context: low caller naming another college was not refused explicitly"'::jsonb; END IF;

  -- 6. ai_get_accessible_institutions for a caller with an institution: unchanged, own only
  v_arr := public.ai_get_accessible_institutions(NULL);
  ok := v_arr = ARRAY[v_lead_inst];
  checks := checks || jsonb_build_object('accessible_institutions_low_own_only', jsonb_build_object('pass', ok, 'n', cardinality(v_arr)));
  IF NOT ok THEN failures := failures || '"ai_get_accessible_institutions: low caller did not get exactly own"'::jsonb; END IF;

  RESET ROLE;

  -- ================= as NOPERM (no permission key: refused even for own college) =================
  IF v_noperm IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_noperm, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_noperm::text, true);
    SET LOCAL ROLE authenticated;
    v_noperm_lv := public.user_has_permission('learners.view');
    v_noperm_ad := public.user_has_permission('learners.admissions.dashboard');
    IF v_noperm_lv OR v_noperm_ad THEN
      checks := checks || jsonb_build_object('noperm', jsonb_build_object('pass', true,
        'skipped', 'the picked account resolves a permission through a path the picker cannot see (e.g. a handover)'));
    ELSE
      a := public.ai_rpc_admission_referrers(p_user_id => NULL, p_institution_id => NULL, p_top_n => 100000);
      b := public.ai_rpc_admission_referrers(p_user_id => NULL, p_institution_id => v_noperm_inst, p_top_n => 100000);
      c := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => NULL);
      ok := a->'error'->>'code' = 'FORBIDDEN' AND a->'data' IS NULL
        AND b->'error'->>'code' = 'FORBIDDEN' AND b->'data' IS NULL
        AND c->'error'->>'code' = 'FORBIDDEN' AND c->'data' IS NULL;
      BEGIN
        a := public.ai_rpc_admission_analytics(p_user_id => NULL, p_institution_id => NULL);
        ok := ok AND a->'error'->>'code' = 'FORBIDDEN' AND a->'data' IS NULL;
      EXCEPTION WHEN OTHERS THEN
        ok := false;
      END;
      a := public.ai_rpc_students_by_department(p_user_id => NULL, p_institution_id => NULL);
      ok := ok AND a->'error'->>'code' = 'FORBIDDEN' AND a->'data' IS NULL;
      checks := checks || jsonb_build_object('noperm_refused_even_for_own_college', jsonb_build_object('pass', ok));
      IF NOT ok THEN failures := failures || '"a caller without the permission key read learner or referrer data of their own college"'::jsonb; END IF;
    END IF;
    RESET ROLE;
  ELSE
    checks := checks || jsonb_build_object('noperm', jsonb_build_object('pass', true, 'skipped', 'no permission-less profile at a college with referrers'));
  END IF;

  -- ================= as SUPER (an institution id narrows; NULL = all) =================
  IF v_super IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_super, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_super::text, true);
    SET LOCAL ROLE authenticated;

    a := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => v_other);
    c := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => NULL);
    ok := (a->'data'->>'total_learners')::int = gt_other AND (c->'data'->>'total_learners')::int = gt_all;
    checks := checks || jsonb_build_object('students_summary_super_narrows',
      jsonb_build_object('pass', ok, 'named', a->'data'->>'total_learners', 'other', gt_other,
                         'null', c->'data'->>'total_learners', 'all', gt_all));
    IF NOT ok THEN failures := failures || '"students_summary: super admin''s institution id did not narrow (or NULL lost reach)"'::jsonb; END IF;

    a := public.ai_rpc_students_by_department(p_user_id => NULL, p_institution_id => v_other);
    c := public.ai_rpc_students_by_department(p_user_id => NULL, p_institution_id => NULL);
    ok := jsonb_array_length(COALESCE(a->'data', '[]')) = gt_other_depts
      AND jsonb_array_length(COALESCE(c->'data', '[]')) = gt_all_depts;
    checks := checks || jsonb_build_object('students_by_department_super_narrows',
      jsonb_build_object('pass', ok, 'named', jsonb_array_length(COALESCE(a->'data', '[]')), 'other', gt_other_depts,
                         'null', jsonb_array_length(COALESCE(c->'data', '[]')), 'all', gt_all_depts));
    IF NOT ok THEN failures := failures || '"students_by_department: super admin''s institution id did not narrow (or NULL lost reach)"'::jsonb; END IF;

    a := public.ai_rpc_admission_referrers(p_user_id => NULL, p_institution_id => v_other, p_top_n => 100000);
    c := public.ai_rpc_admission_referrers(p_user_id => NULL, p_institution_id => NULL, p_top_n => 100000);
    ok := jsonb_array_length(COALESCE(a->'data', '[]')) = gt_other_ref_groups
      AND jsonb_array_length(COALESCE(c->'data', '[]')) = gt_all_ref_groups;
    checks := checks || jsonb_build_object('admission_referrers_super_narrows',
      jsonb_build_object('pass', ok, 'named', jsonb_array_length(COALESCE(a->'data', '[]')), 'other', gt_other_ref_groups,
                         'null', jsonb_array_length(COALESCE(c->'data', '[]')), 'all', gt_all_ref_groups));
    IF NOT ok THEN failures := failures || '"admission_referrers: super admin''s institution id did not narrow (or NULL lost reach)"'::jsonb; END IF;

    RESET ROLE;
  ELSE
    checks := checks || jsonb_build_object('super', jsonb_build_object('pass', true, 'skipped', 'no super admin profile'));
  END IF;

  -- ================= as GRANTED (legitimate cross-college access still works) =================
  IF v_granted IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_granted, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_granted::text, true);
    SET LOCAL ROLE authenticated;
    v_granted_lv := public.user_has_permission('learners.view');
    IF v_granted_lv THEN
      a := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => v_granted_inst);
      ok := (a->'data'->>'total_learners')::int = gt_granted;
      checks := checks || jsonb_build_object('students_summary_granted_honoured',
        jsonb_build_object('pass', ok, 'got', a->'data'->>'total_learners', 'granted_inst_learners', gt_granted));
      IF NOT ok THEN failures := failures || '"students_summary: a user_institution_access grant was not honoured"'::jsonb; END IF;
    ELSE
      checks := checks || jsonb_build_object('granted', jsonb_build_object('pass', true, 'skipped', 'the granted account lacks learners.view'));
    END IF;
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
    -- a no-institution caller naming no institution is refused explicitly, not handed a silent zero
    a := public.ai_rpc_students_summary(p_user_id => NULL, p_institution_id => NULL);
    b := public.ai_rpc_admission_referrers(p_user_id => NULL, p_institution_id => NULL, p_top_n => 100000);
    ok := (a->>'success') = 'false' AND a->'error'->>'code' IN ('NO_INSTITUTION', 'FORBIDDEN') AND a->'data' IS NULL
      AND (b->>'success') = 'false' AND b->'error'->>'code' IN ('NO_INSTITUTION', 'FORBIDDEN') AND b->'data' IS NULL;
    checks := checks || jsonb_build_object('noinst_null_refused_explicitly',
      jsonb_build_object('pass', COALESCE(ok, false), 'summary_code', a->'error'->>'code', 'referrers_code', b->'error'->>'code'));
    IF NOT COALESCE(ok, false) THEN failures := failures || '"a no-institution caller naming no institution got a silent answer instead of an explicit refusal"'::jsonb; END IF;
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

  fixture := jsonb_build_object(
    'low_institution', v_low_inst, 'low_ad_institution', v_lowad_inst, 'other_institution', v_other,
    'low_found', v_low IS NOT NULL, 'low_ad_found', v_lowad IS NOT NULL,
    'low_has_learners_view', v_low_lv, 'low_ad_has_admissions_dashboard', v_low_ad,
    'super_found', v_super IS NOT NULL, 'granted_found', v_granted IS NOT NULL,
    'noinst_found', v_noinst IS NOT NULL, 'noperm_found', v_noperm IS NOT NULL,
    'learners_own', gt_own, 'learners_other', gt_other, 'learners_all', gt_all,
    'departments_own', gt_own_depts, 'departments_other', gt_other_depts, 'departments_all', gt_all_depts,
    'referrer_groups_other', gt_other_ref_groups, 'referrer_groups_all', gt_all_ref_groups,
    'referrer_groups_low_ad_own', gt_lowad_own_ref_groups,
    -- "narrowed" is indistinguishable from "ignored" unless one college differs from all of them,
    -- and a referrer refusal proves nothing about leaking referrers if the other college has none
    'non_vacuous', COALESCE(gt_own <> gt_other AND gt_other <> gt_all AND gt_other_ref_groups <> gt_all_ref_groups
                            AND gt_other_ref_groups > 0, false));
  IF v_other IS NULL THEN
    failures := failures || '"fixture: no other college with learners outside the picked accounts'' own colleges and siblings"'::jsonb;
  END IF;
  IF NOT (fixture->>'non_vacuous')::boolean THEN
    failures := failures || '"fixture: non_vacuous is false — own / other / all counts coincide or the other college has no referrers, so narrowing and refusal cannot be told apart from pinning"'::jsonb;
  END IF;

  RAISE EXCEPTION 'REPORT %', jsonb_build_object(
    'verdict', CASE WHEN jsonb_array_length(failures) > 0 THEN 'FAIL'
                    WHEN jsonb_array_length(not_run) > 0 THEN 'INCOMPLETE'
                    ELSE 'PASS' END,
    'failures', failures, 'not_run', not_run, 'fixture', fixture, 'impact', impact, 'checks', checks);
END
$rehearsal$;

ROLLBACK;
