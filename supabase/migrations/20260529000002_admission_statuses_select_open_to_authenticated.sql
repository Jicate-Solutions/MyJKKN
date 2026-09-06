-- File: supabase/migrations/20260529000002_admission_statuses_select_open_to_authenticated.sql
-- admission_statuses is global reference/lookup data (funnel-stage labels, colors,
-- sort order, terminal flag). The original SELECT policy gated reads behind the
-- settings-admin permission (admission.settings.statuses.view/manage), so any
-- operator who works leads/learners but isn't a settings admin (counselors,
-- faculty, HOD, principal, registrar, office staff, billing/learner staff) saw
-- ZERO rows: the lead-detail "Move to:" dropdown rendered empty and
-- LifecycleStatusBadge fell back to raw status codes across the learners/billing
-- modules. Reads of a non-sensitive lookup table should not require the same
-- permission as editing it. Open SELECT to any authenticated user (the codebase
-- convention for lookup tables, e.g. service_types); INSERT/UPDATE/DELETE stay
-- admin-gated.
BEGIN;

DROP POLICY IF EXISTS admission_statuses_select ON public.admission_statuses;

CREATE POLICY admission_statuses_select
  ON public.admission_statuses FOR SELECT
  USING (auth.uid() IS NOT NULL);

COMMIT;
