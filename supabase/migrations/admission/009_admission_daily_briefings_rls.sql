-- ============================================================================
-- DEPRECATED 2026-04-21: Superseded by canonical adm_briefings_* policies
-- ----------------------------------------------------------------------------
-- The three policies below (admission_daily_briefings_select/insert/update)
-- used raw profiles subqueries and lack is_super_admin() / user_has_permission()
-- wrappers.  They have been replaced in prod by:
--
--   adm_briefings_select / adm_briefings_insert /
--   adm_briefings_update / adm_briefings_delete
--
-- defined in supabase/setup/03_policies.sql.
--
-- DO NOT re-apply this file.  If the target DB already has these policies
-- from the original run (2026-02-27), DROP them and let 03_policies.sql
-- create the canonical ones instead.
-- ============================================================================

DO $$ BEGIN
  RAISE NOTICE 'RETIRED — 009_admission_daily_briefings_rls.sql must not be applied. See supabase/setup/03_policies.sql for canonical adm_briefings_* policies.';
END $$;

-- DEPRECATED 2026-04-21: superseded by adm_briefings_select in setup/03_policies.sql
-- CREATE POLICY "admission_daily_briefings_select"
--   ON public.admission_daily_briefings FOR SELECT
--   TO authenticated
--   USING (
--     institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
--     OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
--   );

-- DEPRECATED 2026-04-21: superseded by adm_briefings_insert in setup/03_policies.sql
-- CREATE POLICY "admission_daily_briefings_insert"
--   ON public.admission_daily_briefings FOR INSERT
--   TO authenticated
--   WITH CHECK (
--     institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
--     OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
--   );

-- DEPRECATED 2026-04-21: superseded by adm_briefings_update in setup/03_policies.sql
-- CREATE POLICY "admission_daily_briefings_update"
--   ON public.admission_daily_briefings FOR UPDATE
--   TO authenticated
--   USING (
--     institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
--     OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
--   );
