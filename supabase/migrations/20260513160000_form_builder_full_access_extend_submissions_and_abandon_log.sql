-- ============================================================
-- Complete "full access" to the form builder for marketing-facing
-- roles like SEO Specialist by extending the SELECT gates on
-- admission_form_submissions and admission_form_abandon_log.
-- ============================================================
-- Context (2026-05-13):
--   Commit c3dd6ddca earlier today migrated admission_forms RLS to
--   admission.settings.forms.{view,manage}, letting SEO Specialist
--   build forms end-to-end. But the form analytics dashboard at
--   /admission/settings/forms/[id]/analytics queries two further
--   tables that were left gated by other namespaces:
--
--     • admission_form_submissions — gated by
--       admission.applications.view (counselor lead-pipeline key).
--       Result: form-builder roles saw zero submissions, blank
--       drop-off charts, and zero submission timelines on the
--       analytics page.
--
--     • admission_form_abandon_log — hardcoded
--       `profiles.role IN ('super_admin','admin','admission_counselor')`
--       SELECT gate. Anti-pattern per project memory ("Never hardcode
--       role names in SQL — Role Management is single source of
--       truth"). Result: form-builder roles couldn't see abandonment
--       data even if granted form-builder access.
--
--   This migration extends both SELECT policies to also accept
--   admission.settings.forms.view as an OR-branch, preserving
--   counselor access via the existing admission.applications.view
--   path and bringing the abandon log onto the proper permission
--   system in the same pass.
--
--   Write policies on both tables are left alone:
--     • admission_form_submissions write — handled by the public
--       form-submit Edge Function with service_role; no
--       authenticated-user INSERT path exists.
--     • admission_form_abandon_log INSERT/UPDATE — already locked
--       to super_admin (these rows are written by the form's
--       public-facing analytics ping, also via service_role).
--
--   Privacy disclosure (acknowledged in design discussion):
--     Granting form-builder roles SELECT on admission_form_submissions
--     means those roles can run raw Supabase queries against PII
--     (lead names, phones, emails). The analytics UI displays
--     aggregates only, but the data layer is open. This trade-off
--     was explicitly chosen to enable marketing-conversion analysis
--     by SEO Specialist (the target role).
-- ============================================================

-- ── 1. admission_form_submissions ───────────────────────────
DROP POLICY IF EXISTS adm_form_subs_select ON public.admission_form_submissions;

CREATE POLICY adm_form_subs_select
  ON public.admission_form_submissions
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      (
        user_has_permission('admission.applications.view')
        OR user_has_permission('admission.settings.forms.view')
      )
      AND role_has_institution_access(institution_id)
    )
  );

-- ── 2. admission_form_abandon_log ───────────────────────────
-- Replace the hardcoded profiles.role IN (...) check with proper
-- permission keys. Preserves access for the three roles the old
-- list named: super_admin (covered by is_super_admin()), admin
-- (covered by is_admin()), admission_counselor (covered by
-- admission.applications.view, which the counselor role holds).
-- Adds: any role with admission.settings.forms.view (SEO et al).
DROP POLICY IF EXISTS admission_form_abandon_log_select ON public.admission_form_abandon_log;

CREATE POLICY admission_form_abandon_log_select
  ON public.admission_form_abandon_log
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.applications.view')
    OR user_has_permission('admission.settings.forms.view')
  );

DO $$
BEGIN
  RAISE NOTICE 'admission_form_submissions + admission_form_abandon_log SELECT now reachable by admission.settings.forms.view holders.';
END $$;
