-- =============================================================================
-- InstaSolver desk — sidebar permission keys  (2026-10-01)
--
-- The desk's sidebar mirrors the standalone app's menu (Dashboard, Report an
-- issue, Request an item, Issues, Requirements, Triage queue, My work,
-- Workload, Analytics, Maintenance teams, Administration). MyJKKN's sidebar
-- filters by permission key, so the role-specific rows need their own keys:
--
--   instasolver.triage    → cao              (Triage queue, Workload, Teams, Administration)
--   instasolver.analytics → principal, cao   (Analytics)
--   instasolver.work      → every role except learners, parents and guests (My work)
--
-- These keys are a USABILITY layer only. Who may actually triage, work a job or
-- read analytics is decided by instasolver_is_manager / team membership /
-- instasolver_principal_institutions and RLS (migrations 20270510090000-0200).
-- "My work" goes to every team-member role because maintenance is team
-- membership, not a role: a person who is on no team sees the screen explain
-- that the CAO adds people to teams. Super Admin bypasses keys in the sidebar.
--
-- Same shape as 20261212120000: flat dotted keys, compared as jsonb 'true'.
-- =============================================================================

UPDATE public.custom_roles
SET permissions = jsonb_set(COALESCE(permissions, '{}'::jsonb), '{instasolver.triage}', 'true'::jsonb, true),
    updated_at  = now()
WHERE role_key = 'cao'
  AND (permissions -> 'instasolver.triage') IS DISTINCT FROM 'true'::jsonb;

UPDATE public.custom_roles
SET permissions = jsonb_set(COALESCE(permissions, '{}'::jsonb), '{instasolver.analytics}', 'true'::jsonb, true),
    updated_at  = now()
WHERE role_key IN ('principal', 'cao')
  AND (permissions -> 'instasolver.analytics') IS DISTINCT FROM 'true'::jsonb;

UPDATE public.custom_roles
SET permissions = jsonb_set(COALESCE(permissions, '{}'::jsonb), '{instasolver.work}', 'true'::jsonb, true),
    updated_at  = now()
WHERE role_key NOT IN ('student', 'parent', 'guest', 'external_auditor_timeboxed')
  AND (permissions -> 'instasolver.work') IS DISTINCT FROM 'true'::jsonb;

DO $$
DECLARE
  v_triage INT;
  v_analytics INT;
BEGIN
  SELECT count(*) INTO v_triage FROM public.custom_roles
   WHERE role_key = 'cao' AND (permissions -> 'instasolver.triage') = 'true'::jsonb;
  SELECT count(*) INTO v_analytics FROM public.custom_roles
   WHERE role_key IN ('principal', 'cao') AND (permissions -> 'instasolver.analytics') = 'true'::jsonb;
  IF v_triage < 1 OR v_analytics < 2 THEN
    RAISE EXCEPTION 'InstaSolver desk keys incomplete: triage on % cao role(s), analytics on % of principal/cao',
      v_triage, v_analytics;
  END IF;
END $$;
