-- ============================================================================
-- AI Pulse — restore readability of domain starter events
-- Created: 2026-07-31
-- ============================================================================
-- WHY
--   `ai_pulse_domain_starter_events` shipped (20260719110000) with
--   `ENABLE ROW LEVEL SECURITY` and ZERO policies, and no policy was ever added.
--   In PostgreSQL that is deny-all: with no policy to evaluate, every row is
--   withheld from every role without BYPASSRLS — including super admins, because
--   `is_super_admin()` only ever runs *inside* a policy and there is no policy
--   for it to run in.
--
--   The read does not fail loudly. PostgREST returns an empty set with a count
--   of 0 and NO error, so a caller that trusts the count prints a hard "0".
--   Verified against production on 2026-07-31 by impersonating real roles, for
--   learner 36513b2f-a6ec-4ecc-b6e8-90d8f72de1b6 whose true starter count is 2:
--
--       role           attended   starters   builds
--       service role      2          2          1     <- ground truth
--       super admin       2          0 (!)      1
--       hod               2          0 (!)      0
--
--   The learner profile's "AI agency" card therefore told its reader that a
--   learner had taken no action when they had taken two.
--
-- WHAT
--   Adds the SELECT policy this table should have shipped with, following the
--   canonical pattern in CLAUDE.md, and closes the `anon` default grant.
--
-- WRITES ARE UNAFFECTED
--   Rows are inserted by SECURITY DEFINER functions (see 20260719110000 and
--   20260720073000), not by an authenticated client, so a SELECT-only policy
--   cannot disturb ingestion.
--
-- NO institution_id ON THIS TABLE
--   Columns are (id, starter_id, profile_id, action, created_at, note) — there
--   is no institution_id to scope on, so this follows the documented pattern for
--   institution-less tables: permission check only, no
--   `role_has_institution_access(...)` clause. Do not invent the column here.
--   The sibling `ai_pulse_live_attendance` DOES carry institution_id and is
--   scoped by it, so a permitted staff member sees starter events beyond their
--   own institution while attendance stays scoped. Closing that asymmetry needs
--   a denormalised institution_id column plus a backfill and writer changes —
--   deliberately out of scope for this defect fix, and called out for follow-up.
--
-- Every guard is COALESCE-wrapped: these are SECURITY DEFINER helpers that can
-- return NULL, and NULL in a USING clause is not TRUE, so an un-wrapped guard
-- silently falls through instead of granting.
-- ============================================================================

DROP POLICY IF EXISTS "ai_pulse_domain_starter_events_select"
  ON public.ai_pulse_domain_starter_events;

CREATE POLICY "ai_pulse_domain_starter_events_select"
ON public.ai_pulse_domain_starter_events
FOR SELECT
TO authenticated
USING (
  COALESCE(is_super_admin(), false)
  OR COALESCE(is_admin(), false)
  -- The learner reading their own trail.
  OR profile_id = auth.uid()
  -- Staff carrying department-level AI Pulse oversight. A HOD holds
  -- `aiPulse:dept.heatmap` in production, which is what makes the funnel
  -- readable for the staff member who actually needs it.
  OR COALESCE(user_has_permission('aiPulse:dept.heatmap'), false)
  OR COALESCE(user_has_permission('aiPulse:anomaly.review'), false)
);

-- Supabase's `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon` had left
-- anon holding SELECT/INSERT/UPDATE/DELETE/TRUNCATE on this table. Until now
-- RLS-with-no-policy masked that; the moment a SELECT policy exists the grant is
-- one mis-scoped policy away from being live. Revoke it explicitly.
REVOKE ALL ON public.ai_pulse_domain_starter_events FROM anon;

-- The same latent default grant sits on the sibling build table. It is not part
-- of this defect (it already has a policy, and that policy is `TO authenticated`
-- so anon is refused today), but the grant is real and this is the audit-trail
-- signal that anon access is not wanted here either.
REVOKE ALL ON public.ai_pulse_prompt_builds FROM anon;
