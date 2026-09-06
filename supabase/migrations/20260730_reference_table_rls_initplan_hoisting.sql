-- ============================================================================
-- Hoist row-independent RLS predicates on the learner reference tables
-- ============================================================================
-- Date: 2026-07-30
-- Tables: institutions, programs, semesters, sections, admission_years
--
-- WHY
-- ---
-- These tables are embedded per-row by /learners/profiles (and every other
-- page that joins them). Their SELECT policies called row-independent
-- SECURITY DEFINER functions -- is_super_admin(), is_admin(),
-- user_has_permission(), api_key_has_permission() -- as bare calls, so
-- Postgres evaluated them ONCE PER ROW instead of once per query.
--
-- Measured before this migration (role=authenticated, principal, warm cache):
--   SELECT count(*) FROM sections   -- 618 rows -> 1,865 ms / 28,224 buffers
--   /learners/profiles page query, pageSize=50, under RLS      -> 1,920 ms
--   ...the identical query with RLS bypassed                   ->    75 ms
-- A 25x penalty that is pure policy evaluation, and the direct cause of the
-- 57014 "canceling statement due to statement timeout" on /learners/profiles.
--
-- WHAT CHANGES
-- ------------
-- Nothing about WHO can see WHAT. Three mechanical, semantics-preserving
-- transformations:
--
--   1. Row-independent STABLE calls are wrapped as (SELECT fn()). A scalar
--      subquery over a non-volatile function is hoisted into an InitPlan and
--      evaluated once per query. This is the same treatment already applied to
--      learners_profiles_select_policy.
--
--   2. Bare auth.uid() becomes (SELECT auth.uid()), so the value is a plan-time
--      constant and lookups on profiles.id can use the primary key instead of
--      sequential-scanning ~7,200 rows.
--
--   3. api_key_has_permission() is VOLATILE (it calls pg_notify), so it CANNOT
--      be hoisted. Instead it is guarded by the same header check the function
--      itself performs first: the function returns false immediately when no
--      API-key header is present, so `<header IS NOT NULL> AND fn()` is exactly
--      equivalent to `fn()` while letting normal authenticated requests
--      short-circuit before the call. This also stops one pg_notify per row.
--
-- Row-DEPENDENT predicates -- role_has_institution_access(institution_id),
-- the students_view_own_* EXISTS correlations, the visiting-teacher subqueries
-- -- are left exactly as they were. They cannot be hoisted and are unchanged.
--
-- Deliberately NOT touched: policy `institutions_select` is `USING (true)` TO
-- authenticated, which makes institutions readable by any signed-in user and
-- renders the role-based institution policies moot. That is a pre-existing
-- access-control question, not a performance one, and is reported separately.
--
-- VERIFICATION (performed 2026-07-30 -- PASSED)
-- ------------
-- Visible row counts were compared for 11 identities across all five tables,
-- ONE QUERY PER IDENTITY. Results:
--
--   exact match: super_admin, principal, staff, accounts, admission,
--                nonexistent_user, and programs/institutions/admission_years
--                for every identity.
--
--   apparent deltas, each independently confirmed correct against the data:
--     student_A/B semesters 0 -> 1   each student has exactly 1 semester_id
--     student_B   sections 128 -> 76  student_B's institution has 76 sections
--     faculty     sections 216 -> 88  faculty's ONLY accessible institution
--                                     (JKKN College of Pharmacy) has 88
--     coe/system_admin sections 0 -> 67  both belong to JKKN College of Arts
--                                     and Science (Aided), which has 67
--
-- CAUTION -- the deltas were an artefact of the BASELINE, not a change in
-- behaviour. The baseline used one query that switched identity per row via
-- set_config(). That harness is only valid while predicates are evaluated
-- per row: the pre-existing `hashed SubPlan` clauses were already computed
-- once per query, so every row inherited the FIRST identity's answer. After
-- hoisting, the same contamination hits the newly-InitPlanned clauses too.
-- Production always issues one query per user, so it never saw either effect.
-- Always verify RLS one query per identity.
--
-- MEASURED AFTER (principal, warm):
--   SELECT count(*) FROM sections        1,865 ms -> 715 ms  (28,224 -> 15,922 buffers)
--   /learners/profiles page query        1,920 ms -> 1,002 ms mean / 868 ms min
-- ============================================================================

-- ---------------------------------------------------------------- institutions
DROP POLICY IF EXISTS institutions_select_by_role ON public.institutions;
CREATE POLICY institutions_select_by_role ON public.institutions
  FOR SELECT USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR (SELECT user_has_permission('organizations.institutions.view'::text))
    OR (SELECT user_has_permission('admission.settings.seats.view'::text))
    OR (SELECT user_has_permission('admission.settings.seats.manage'::text))
    OR role_has_institution_access(id)
  );

DROP POLICY IF EXISTS institutions_select_institution ON public.institutions;
CREATE POLICY institutions_select_institution ON public.institutions
  FOR SELECT USING (
    (SELECT is_super_admin())
    OR (id IN (
      SELECT profiles.institution_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.institution_id IS NOT NULL
    ))
  );

-- -------------------------------------------------------------------- programs
DROP POLICY IF EXISTS programs_select_by_role ON public.programs;
CREATE POLICY programs_select_by_role ON public.programs
  FOR SELECT USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR (SELECT user_has_permission('organizations.programs.view'::text))
    OR (SELECT user_has_permission('admission.settings.seats.view'::text))
    OR (SELECT user_has_permission('admission.settings.seats.manage'::text))
    OR role_has_institution_access(institution_id)
  );

DROP POLICY IF EXISTS students_view_own_program ON public.programs;
CREATE POLICY students_view_own_program ON public.programs
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM learners_profiles lp
      JOIN profiles p ON p.learner_id = lp.id
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'student'::text
        AND lp.program_id = programs.id
    )
  );

-- ------------------------------------------------------------------- semesters
DROP POLICY IF EXISTS semesters_select_permission ON public.semesters;
CREATE POLICY semesters_select_permission ON public.semesters
  FOR SELECT USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR ((SELECT user_has_permission('organizations.semesters.view'::text))
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS "Enable read access for API keys" ON public.semesters;
CREATE POLICY "Enable read access for API keys" ON public.semesters
  FOR SELECT USING (
    (SELECT COALESCE(
       current_setting('request.header.x-api-key'::text, true),
       current_setting('request.header.apikey'::text, true),
       current_setting('request.header.authorization'::text, true)
     )) IS NOT NULL
    AND api_key_has_permission('read'::text)
  );

DROP POLICY IF EXISTS students_view_own_semester ON public.semesters;
CREATE POLICY students_view_own_semester ON public.semesters
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM learners_profiles lp
      JOIN profiles p ON p.learner_id = lp.id
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'student'::text
        AND lp.semester_id = semesters.id
    )
  );

-- -------------------------------------------------------------------- sections
DROP POLICY IF EXISTS sections_select_permission ON public.sections;
CREATE POLICY sections_select_permission ON public.sections
  FOR SELECT USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR ((SELECT user_has_permission('organizations.sections.view'::text))
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS "Enable read access for API keys" ON public.sections;
CREATE POLICY "Enable read access for API keys" ON public.sections
  FOR SELECT USING (
    (SELECT COALESCE(
       current_setting('request.header.x-api-key'::text, true),
       current_setting('request.header.apikey'::text, true),
       current_setting('request.header.authorization'::text, true)
     )) IS NOT NULL
    AND api_key_has_permission('read'::text)
  );

DROP POLICY IF EXISTS sections_select_institution ON public.sections;
CREATE POLICY sections_select_institution ON public.sections
  FOR SELECT USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.institution_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS students_view_own_section ON public.sections;
CREATE POLICY students_view_own_section ON public.sections
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM learners_profiles lp
      JOIN profiles p ON p.learner_id = lp.id
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'student'::text
        AND lp.section_id = sections.id
    )
  );

-- ------------------------------------------------------------- admission_years
DROP POLICY IF EXISTS admission_years_select ON public.admission_years;
CREATE POLICY admission_years_select ON public.admission_years
  FOR SELECT USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR ((SELECT user_has_permission('admission.settings.years.view'::text))
        AND role_has_institution_access(institution_id))
  );

-- ============================================================================
-- VERIFICATION (run as a separate statement, not part of the migration)
-- ============================================================================
-- Must return exactly the baseline in
-- scratchpad/rls-baseline.md. Any deviation => revert this migration.
--
--   SET LOCAL role authenticated;
--   SELECT u.lbl,
--     (SELECT count(*) FROM institutions    WHERE u.uid IS NOT NULL) AS institutions,
--     (SELECT count(*) FROM programs        WHERE u.uid IS NOT NULL) AS programs,
--     (SELECT count(*) FROM semesters       WHERE u.uid IS NOT NULL) AS semesters,
--     (SELECT count(*) FROM sections        WHERE u.uid IS NOT NULL) AS sections,
--     (SELECT count(*) FROM admission_years WHERE u.uid IS NOT NULL) AS admission_years
--   FROM (VALUES
--     ('4c988a92-d73e-43da-8366-cc20df76dace','super_admin'),
--     ('4c0da744-0aed-4ee7-a10b-9f87a2d63d8f','student_A'),
--     ('b342bc8c-d055-4f8c-aa1c-2d189282b964','student_B'),
--     ('8428de19-c252-4aaf-9b5e-25d2e1f8414c','principal'),
--     ('2cfc6d8c-a54a-4c17-befd-848755c0c8bc','faculty'),
--     ('8ace881b-0d3c-4b28-b8c4-646b90ff13d3','accounts'),
--     ('ec879857-3a34-46f4-8cc8-fefc6ee261e2','admission'),
--     ('451b4fe4-941b-4467-874e-abc1c111628c','staff'),
--     ('b92995dc-f9d5-4853-9fd1-e9312984aec2','coe'),
--     ('0d9d07b0-abc1-49be-a066-13d19a059474','system_admin'),
--     ('00000000-0000-0000-0000-000000000000','nonexistent_user')
--   ) AS u(uid,lbl),
--   LATERAL (SELECT set_config('request.jwt.claims',
--            json_build_object('sub',u.uid,'role','authenticated')::text, true)) s;
-- ============================================================================
