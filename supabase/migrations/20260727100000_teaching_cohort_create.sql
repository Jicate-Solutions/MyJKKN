-- ============================================================================
-- Onboard a new department entirely from the UI — no SQL, no engineer
-- ============================================================================
-- Date: 2026-07-27
-- Director ask: "can this all be configured in the UI itself?"
--
-- Today /admin/teaching-cohorts can EDIT four fields of an existing cohort but
-- cannot CREATE one — the service has only list + update, and the table carries
-- ZERO insert/update policies (all writes go through super-admin-gated SECDEF
-- functions). So adding a department still needed a hand-written INSERT.
--
-- PROVEN 2026-07-27 (on prod, rolled back): adding a department is only 3 rows.
-- Two roles + one cohort row, then fn_teaching_cohort_sync granted 94 ECE
-- learners and 8 Senior Learners with NO code change, MBA untouched (44/6).
-- The data model was already generic; only the create path was missing.
--
-- THE TRAP THIS EXISTS TO PREVENT (real production data):
--   Two programmes are named "B.E. Electronics and Communication Engineering":
--     894b702c-… → dept Electronics and Communication Engineering → 152 learners ✅
--     a8816345-… → dept Science and Humanities (orphaned)         →   0 learners ❌
--   From a plain dropdown they are indistinguishable. Pointing a cohort at the
--   orphan grants access to nobody; the sync's zero-match guard refuses, but the
--   operator only discovers it then. So the option readers below return LEARNER
--   COUNTS AND SEMESTER DISTRIBUTIONS — making the empty duplicate visibly wrong
--   before anything is saved. That is the entire point of this migration.
--
-- NOT TOUCHED: fn_teaching_cohort_sync (14,680 chars, governs role access for 44
-- learners + 6 Senior Learners, hardened and no-op verified 2026-07-26). A
-- CREATE OR REPLACE is a blind full-body swap — that is how the include_financial
-- money gate was once silently lost. The preview below MIRRORS its predicate; it
-- never re-issues it.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Programme options — with the counts that expose an orphaned duplicate
-- ---------------------------------------------------------------------------
-- Programmes with ZERO active learners are deliberately INCLUDED (returning 0)
-- rather than filtered out. Hiding them is what makes the trap dangerous: the
-- operator would wonder why the programme they expected is missing and pick the
-- other one blind. Shown with a 0, the orphan is self-evidently wrong.
CREATE OR REPLACE FUNCTION public.fn_teaching_cohort_programme_options()
RETURNS TABLE (
  program_id           uuid,
  program_name         text,
  department_id        uuid,
  department_name      text,
  institution_name     text,
  active_learner_count bigint,
  semester_breakdown   jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'not authorized: reading programme enrolment counts requires a super administrator'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH matched AS (
    -- Same predicate shape as fn_teaching_cohort_sync so the numbers agree with
    -- what a sync would actually grant.
    SELECT lp.program_id AS pid, s.semester_order AS ord
    FROM public.learners_profiles lp
    JOIN public.semesters      s  ON s.id  = lp.semester_id
    JOIN public.academic_years ay ON ay.id = lp.academic_year_id
    JOIN public.profiles       p  ON p.learner_id = lp.id
    WHERE ay.is_active
      AND lp.lifecycle_status = 'active'
  ),
  per_prog AS (
    SELECT pid, count(*) AS total FROM matched GROUP BY pid
  ),
  per_sem AS (
    SELECT pid, jsonb_agg(jsonb_build_object('semester_order', ord, 'learners', n)
                          ORDER BY ord) AS breakdown
    FROM (SELECT pid, ord, count(*) AS n FROM matched GROUP BY pid, ord) x
    GROUP BY pid
  )
  SELECT pr.id,
         pr.program_name::text,
         pr.department_id,
         d.department_name::text,
         i.name::text,
         COALESCE(pp.total, 0)::bigint,
         COALESCE(ps.breakdown, '[]'::jsonb)
  FROM public.programs pr
  LEFT JOIN public.departments   d  ON d.id = pr.department_id
  LEFT JOIN public.institutions  i  ON i.id = pr.institution_id
  LEFT JOIN per_prog pp ON pp.pid = pr.id
  LEFT JOIN per_sem  ps ON ps.pid = pr.id
  ORDER BY COALESCE(pp.total, 0) DESC, pr.program_name;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_programme_options() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_programme_options() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Department options — staff who would become Senior Learners
-- ---------------------------------------------------------------------------
-- Counts only staff WITH a profile_id: the faculty sync joins staff→profiles, so
-- a staff row without one can never receive the role. Showing the raw staff
-- count would overstate what activation actually does.
CREATE OR REPLACE FUNCTION public.fn_teaching_cohort_department_options()
RETURNS TABLE (
  department_id      uuid,
  department_name    text,
  institution_name   text,
  active_staff_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'not authorized: reading department staffing requires a super administrator'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.id,
         d.department_name::text,
         i.name::text,
         COALESCE((SELECT count(*) FROM public.staff st
                    WHERE st.department_id = d.id
                      AND st.is_active
                      AND st.profile_id IS NOT NULL), 0)::bigint
  FROM public.departments d
  LEFT JOIN public.institutions i ON i.id = d.institution_id
  ORDER BY d.department_name;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_department_options() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_department_options() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Live match preview — "this would grant N learners and M Senior Learners"
-- ---------------------------------------------------------------------------
-- MUST agree with fn_teaching_cohort_sync clause for clause. A preview that
-- disagrees with the thing it predicts is worse than no preview: it manufactures
-- false confidence at the exact moment of decision. Verified against the measured
-- figure — programme 894b702c… with {5,7} returns 94.
CREATE OR REPLACE FUNCTION public.fn_teaching_cohort_match_preview(
  p_program_id      uuid,
  p_semester_orders integer[],
  p_department_id   uuid DEFAULT NULL
)
RETURNS TABLE (learner_count bigint, senior_learner_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'not authorized: previewing a cohort match requires a super administrator'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((
      SELECT count(DISTINCT p.id)
      FROM public.learners_profiles lp
      JOIN public.semesters      s  ON s.id  = lp.semester_id
      JOIN public.academic_years ay ON ay.id = lp.academic_year_id
      JOIN public.profiles       p  ON p.learner_id = lp.id
      WHERE lp.program_id = p_program_id
        AND s.semester_order = ANY (COALESCE(p_semester_orders, '{}'::int[]))
        AND ay.is_active
        AND lp.lifecycle_status = 'active'
    ), 0)::bigint,
    COALESCE((
      SELECT count(DISTINCT st.profile_id)
      FROM public.staff st
      WHERE p_department_id IS NOT NULL
        AND st.department_id = p_department_id
        AND st.is_active
        AND st.profile_id IS NOT NULL
    ), 0)::bigint;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_match_preview(uuid, integer[], uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_match_preview(uuid, integer[], uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Create a cohort — ALWAYS inactive, super administrator only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_teaching_cohort_create(
  p_cohort_key        text,
  p_display_name      text,
  p_program_id        uuid,
  p_department_id     uuid,
  p_semester_orders   integer[],
  p_learner_role_key  text,
  p_faculty_role_key  text DEFAULT NULL,
  p_faculty_source    text DEFAULT 'department_membership',
  p_contribution_mode text DEFAULT 'analyse'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id       uuid;
  v_clash    text;
  v_bad_perm text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Same gate as fn_teaching_cohort_update, for the same reason: creating a
  -- cohort is the first half of bulk-granting roles. NOT improvement.board.manage
  -- and NOT is_admin() (the hardcoded legacy-role bypass).
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'not authorized: creating a teaching cohort requires a super administrator. A cohort bulk-grants its learner and Senior Learner roles once activated, so improvement.board.manage is intentionally not sufficient.'
      USING ERRCODE = '42501';
  END IF;

  -- ---- shape validation, each message naming the fix ----------------------
  IF p_cohort_key IS NULL OR btrim(p_cohort_key) = '' THEN
    RAISE EXCEPTION 'cohort_key is required (a short permanent identifier, e.g. ece_resident)' USING ERRCODE = '22023';
  END IF;
  IF p_cohort_key !~ '^[a-z][a-z0-9_]{1,48}$' THEN
    RAISE EXCEPTION 'cohort_key % must be lower-case letters, digits and underscores, starting with a letter', p_cohort_key USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.teaching_enterprise_cohorts WHERE cohort_key = p_cohort_key) THEN
    RAISE EXCEPTION 'a teaching cohort with cohort_key % already exists — cohort_key is permanent; edit that row instead', p_cohort_key USING ERRCODE = '23505';
  END IF;
  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name is required (it drives every label a participant sees)' USING ERRCODE = '22023';
  END IF;
  IF p_program_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.programs WHERE id = p_program_id) THEN
    RAISE EXCEPTION 'program_id % does not exist', p_program_id USING ERRCODE = '22023';
  END IF;
  IF p_department_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.departments WHERE id = p_department_id) THEN
    RAISE EXCEPTION 'department_id % does not exist', p_department_id USING ERRCODE = '22023';
  END IF;
  IF p_semester_orders IS NULL OR cardinality(p_semester_orders) = 0 THEN
    RAISE EXCEPTION 'semester_orders is required — which semester numbers qualify a learner (e.g. {5,7})' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_semester_orders) AS x WHERE x IS NULL OR x <= 0) THEN
    RAISE EXCEPTION 'semester_orders must contain only positive integers' USING ERRCODE = '22023';
  END IF;
  IF p_contribution_mode NOT IN ('analyse', 'build') THEN
    RAISE EXCEPTION 'contribution_mode must be analyse or build (got %)', p_contribution_mode USING ERRCODE = '22023';
  END IF;
  IF p_faculty_source NOT IN ('department_membership', 'none') THEN
    RAISE EXCEPTION 'faculty_source must be department_membership or none (got %)', p_faculty_source USING ERRCODE = '22023';
  END IF;
  IF p_faculty_source = 'department_membership' AND p_faculty_role_key IS NULL THEN
    RAISE EXCEPTION 'faculty_source=department_membership needs a faculty_role_key (or set faculty_source=none)' USING ERRCODE = '22023';
  END IF;

  -- ---- the roles must exist and be active --------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = p_learner_role_key AND is_active) THEN
    RAISE EXCEPTION 'learner_role_key % is not an active role — create it in Role Management first (clone an existing resident role)', p_learner_role_key USING ERRCODE = '22023';
  END IF;
  IF p_faculty_role_key IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE role_key = p_faculty_role_key AND is_active) THEN
    RAISE EXCEPTION 'faculty_role_key % is not an active role — create it in Role Management first', p_faculty_role_key USING ERRCODE = '22023';
  END IF;

  -- ---- 🔒 no cohort role may carry improvement.board.manage ---------------
  -- That permission bypasses the role gate, the posting gate AND the financial
  -- gate in fn_mba_analyst_views. A faculty role is populated by BULK DEPARTMENT
  -- SYNC, so activating such a cohort would mass-grant cross-department money
  -- analytics in one click. Enforced at the seed in 20260727020000 and again here
  -- at creation. Read the FLAT key: custom_roles.permissions stores keys both
  -- flat and nested, and flat is what permission checks read first.
  SELECT string_agg(role_key, ', ' ORDER BY role_key) INTO v_bad_perm
  FROM public.custom_roles
  WHERE role_key IN (p_learner_role_key, p_faculty_role_key)
    AND COALESCE((permissions->>'improvement.board.manage')::boolean, false);

  IF v_bad_perm IS NOT NULL THEN
    RAISE EXCEPTION 'role(s) % grant improvement.board.manage, which confers the cross-department analytics and financial-view bypass. A cohort role is populated by bulk department sync and must never hold it. Remove that permission from the role, then grant it to an INDIVIDUAL Senior Learner via Role Management if review duty is genuinely required.', v_bad_perm
      USING ERRCODE = '42501';
  END IF;

  -- ---- role keys must not collide with another ACTIVE cohort --------------
  -- Partial unique indexes on learner_role_key/faculty_role_key WHERE is_active
  -- would otherwise raise 23505 later, at ACTIVATION — long after this form, when
  -- the cause is no longer obvious. Fail here, with the reason.
  SELECT string_agg(cohort_key, ', ' ORDER BY cohort_key) INTO v_clash
  FROM public.teaching_enterprise_cohorts
  WHERE is_active
    AND (learner_role_key = p_learner_role_key
         OR (p_faculty_role_key IS NOT NULL AND faculty_role_key = p_faculty_role_key));

  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'active cohort(s) % already use one of those role keys. Two active cohorts sharing a role key make the nightly sync strip each other''s members, so it is blocked. Use distinct roles, or deactivate the other cohort first.', v_clash
      USING ERRCODE = '23505';
  END IF;

  -- ---- create, ALWAYS INACTIVE -------------------------------------------
  -- No is_active parameter exists by design. Activation is a separate deliberate
  -- act via fn_teaching_cohort_update, after the operator has checked the counts.
  INSERT INTO public.teaching_enterprise_cohorts
    (cohort_key, display_name, program_id, department_id, semester_orders,
     learner_role_key, faculty_role_key, faculty_source, contribution_mode, is_active)
  VALUES
    (btrim(p_cohort_key), btrim(p_display_name), p_program_id, p_department_id, p_semester_orders,
     p_learner_role_key, p_faculty_role_key, p_faculty_source, p_contribution_mode, false)
  RETURNING id INTO v_id;

  RETURN v_id;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_create(text, text, uuid, uuid, integer[], text, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_create(text, text, uuid, uuid, integer[], text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.fn_teaching_cohort_create(text, text, uuid, uuid, integer[], text, text, text, text) IS
  'Creates a teaching-enterprise cohort, ALWAYS inactive. Super administrator only. '
  'Refuses any role holding improvement.board.manage, and any role key already used '
  'by an active cohort. Activation is a separate step via fn_teaching_cohort_update.';

COMMIT;
