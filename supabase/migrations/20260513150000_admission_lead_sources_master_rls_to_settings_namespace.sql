-- ============================================================
-- Migrate admission_lead_sources_master RLS from the misleading
-- admission.counselors.team.* namespace into admission.settings.sources.*
-- ============================================================
-- Context (2026-05-13):
--   The Lead Sources master page (/admission/settings/sources) had a
--   three-layer permission tangle identical to the form builder bug
--   shipped earlier today (commit c3dd6ddca):
--
--     • Sidebar gate (MENU_PERMISSIONS): admission.settings.sources.view
--     • Page guard:                      admission.settings.view
--     • Front-end "New Source" button:   admission.settings.sources.manage
--     • RLS SELECT:  admission.counselors.team.view OR admission.leads.view
--     • RLS MODIFY:  admission.counselors.team.manage  ← does not match anything
--
--   Roles like SEO Specialist with admission.settings.sources.manage
--   saw the "New Source" button render, clicked it, and the INSERT
--   failed silently at RLS — because the only roles with the dead
--   admission.counselors.team.manage key were Admission Officer
--   (which incidentally also has settings.sources.* and was therefore
--   not blocked).
--
--   This migration brings RLS into alignment with the catalogue and
--   the UI. The admission.leads.view OR-branch is preserved on
--   SELECT only, so counselor roles that need to read source labels
--   when displaying leads keep that ability without needing the
--   settings.sources.view key explicitly.
--
--   Zero blast radius: per 2026-05-13 audit, every role that holds
--   admission.counselors.team.manage also holds
--   admission.settings.sources.manage. Six other roles (admission_staff,
--   ceo, coo, executive_admin_officer, health_counselor, seo) hold
--   the new keys but not the old — they are the bug's victims and
--   will GAIN proper access from this migration.
-- ============================================================

DROP POLICY IF EXISTS lead_sources_master_select ON public.admission_lead_sources_master;
DROP POLICY IF EXISTS lead_sources_master_modify ON public.admission_lead_sources_master;

CREATE POLICY lead_sources_master_select
  ON public.admission_lead_sources_master
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.settings.sources.view')
    OR user_has_permission('admission.leads.view')
  );

CREATE POLICY lead_sources_master_modify
  ON public.admission_lead_sources_master
  FOR ALL
  USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.settings.sources.manage')
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.settings.sources.manage')
  );

DO $$
BEGIN
  RAISE NOTICE 'admission_lead_sources_master now gated by admission.settings.sources.{view,manage}; admission.leads.view kept as SELECT fallback for counselors.';
END $$;
