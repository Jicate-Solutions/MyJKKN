-- ============================================================================
-- AI Pulse — live polls (Champion issues, learners respond)  (2026-06-17)
--
-- WHY THIS MIGRATION EXISTS
--   The live-session 4-AND engagement gate requires polls_responded ≥ min(3,
--   polls_issued). Until now the polls feature had a learner-display panel
--   (polls-panel.tsx) and a best-effort read in live-session-service ("table
--   may not exist"), but NO storage and NO authoring surface — so polls_issued
--   was always 0 and the polls gate auto-passed by construction. This adds:
--     1. ai_pulse_polls          — one row per Champion-issued poll
--     2. ai_pulse_poll_responses — one row per learner answer (audit + count)
--
-- DIRECTOR DECISIONS (2026-06-17)
--   - Gate threshold: polls_responded ≥ min(3, polls_issued). min(3,0)=0 ⇒ a
--     0-poll cycle still auto-passes (same outcome as the old branch, now
--     derived from the rule).
--   - Poll authoring is Champion + Co-Champion ONLY (both hold the
--     `ai_pulse_champion` role). Admins are NOT given the authoring control;
--     is_super_admin/is_admin keep the RLS bypass for support/debugging only.
--
-- COLUMN NAME NOTE
--   The cycle FK column is `cycle_id` (NOT `event_id`) because the existing
--   learner read in live-session-service.getLiveSession already queries
--   `.eq('cycle_id', cycleId)` / `select('id, cycle_id, ...')`. It references
--   startup_events(id) — an AI Pulse cycle is a startup_events row.
--
-- RLS follows the project's standardized pattern (is_super_admin/is_admin
-- bypass + user_has_permission / role check). House style: see
--   20260616120000_ai_pulse_interventions.sql (REVOKE/GRANT + NOTIFY)
--   20260611_ai_pulse_live_attendance_and_champion.sql (champion role).
-- Champion-resolution EXISTS subquery mirrors rotation-service.escalateAbsence
-- (custom_roles.role_key='ai_pulse_champion' → user_roles).
--
-- SAFETY: additive only — two new tables. Touches no existing table.
-- NOT applied to prod by this PR — supervisor applies before deploy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Polls — one row per Champion-issued poll
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_pulse_polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        UUID NOT NULL REFERENCES public.startup_events(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  options         JSONB NOT NULL,  -- array of { id: text, label: text }
  is_open         BOOLEAN NOT NULL DEFAULT true,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  created_by      UUID,
  institution_id  UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The hot path is "all polls for this cycle, ordered by issued_at" (gate count
-- + the learner panel + the Champion's live list).
CREATE INDEX IF NOT EXISTS ai_pulse_polls_cycle_issued_idx
  ON public.ai_pulse_polls (cycle_id, issued_at);

ALTER TABLE public.ai_pulse_polls ENABLE ROW LEVEL SECURITY;

-- SELECT: any learner who can view the live session (aiPulse:view.self) sees
-- the cycle's polls; admins bypass.
DROP POLICY IF EXISTS "ai_pulse_polls_select" ON public.ai_pulse_polls;
CREATE POLICY "ai_pulse_polls_select" ON public.ai_pulse_polls
  FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('aiPulse:view.self')
  );

-- INSERT: Champion + Co-Champion only (ai_pulse_champion role); admin bypass.
DROP POLICY IF EXISTS "ai_pulse_polls_insert" ON public.ai_pulse_polls;
CREATE POLICY "ai_pulse_polls_insert" ON public.ai_pulse_polls
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key = 'ai_pulse_champion'
        AND cr.is_active = true
    )
  );

-- UPDATE: same Champion + Co-Champion gate (used to close a poll).
DROP POLICY IF EXISTS "ai_pulse_polls_update" ON public.ai_pulse_polls;
CREATE POLICY "ai_pulse_polls_update" ON public.ai_pulse_polls
  FOR UPDATE
  USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key = 'ai_pulse_champion'
        AND cr.is_active = true
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Poll responses — one row per (poll, learner)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_pulse_poll_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id       UUID NOT NULL REFERENCES public.ai_pulse_polls(id) ON DELETE CASCADE,
  profile_id    UUID NOT NULL,
  option_id     TEXT NOT NULL,
  responded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_pulse_poll_responses_unique UNIQUE (poll_id, profile_id)
);

-- Distinct-poll count per learner per cycle joins responses → polls on poll_id.
CREATE INDEX IF NOT EXISTS ai_pulse_poll_responses_profile_idx
  ON public.ai_pulse_poll_responses (profile_id);
CREATE INDEX IF NOT EXISTS ai_pulse_poll_responses_poll_idx
  ON public.ai_pulse_poll_responses (poll_id);

ALTER TABLE public.ai_pulse_poll_responses ENABLE ROW LEVEL SECURITY;

-- SELECT: a learner sees own responses; Champion/Co-Champion + admins see all
-- (the Champion's live list shows response counts).
DROP POLICY IF EXISTS "ai_pulse_poll_responses_select" ON public.ai_pulse_poll_responses;
CREATE POLICY "ai_pulse_poll_responses_select" ON public.ai_pulse_poll_responses
  FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key = 'ai_pulse_champion'
        AND cr.is_active = true
    )
  );

-- INSERT: a learner records ONLY their own response (profile_id == auth.uid()).
-- profiles.id == auth.users.id, so this scopes the write to the caller.
DROP POLICY IF EXISTS "ai_pulse_poll_responses_insert" ON public.ai_pulse_poll_responses;
CREATE POLICY "ai_pulse_poll_responses_insert" ON public.ai_pulse_poll_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 3. Grants — lock anon/PUBLIC, grant the authenticated reads/writes the
--    policies above gate. (CLAUDE.md mandate: explicit anon revoke.)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.ai_pulse_polls FROM anon, PUBLIC;
REVOKE ALL ON public.ai_pulse_poll_responses FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.ai_pulse_polls TO authenticated;
GRANT SELECT, INSERT ON public.ai_pulse_poll_responses TO authenticated;

-- Keep PostgREST's schema cache in sync after DDL.
NOTIFY pgrst, 'reload schema';
