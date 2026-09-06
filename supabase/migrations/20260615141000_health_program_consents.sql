-- ============================================================================
-- Migration: 20260615141000_health_program_consents
-- Health — Wellness Programs: LIGHT, program-specific consent
-- Spec: Director decision 2026-06-15 — "light program consent, then track"
-- ============================================================================
-- WHY:
--   The core /health module uses a HEAVY HealthConsentProvider (full health-data
--   consent for mood/sleep/profile/screening). Wellness PROGRAMS are awareness
--   campaigns — watching a video and reading content should be friction-free.
--   We only need a person's OK before we RECORD their day-by-day participation
--   (markWatched / submitQuiz / rateUsefulness), so we can show progress + streak.
--
--   This table holds that lightweight, per-program consent. It is SEPARATE from
--   health_consents (the heavy learner-level health-data consent) — giving program
--   consent does NOT grant the full health-data consent and vice-versa.
--
-- TIER: additive (new table + RLS only). Idempotent. Safe to re-apply.
--       DO NOT apply to prod from this session.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: health_program_consents  (one row per person per program)
--    Keyed on profiles.id (= auth.users.id) so BOTH students and staff consent.
--    learner_id denormalized for student-only joins (NULL for staff).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_program_consents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  program_id    UUID NOT NULL REFERENCES public.health_programs(id) ON DELETE CASCADE,
  learner_id    UUID,                                  -- NULL for staff
  consented_at  TIMESTAMPTZ DEFAULT now(),
  withdrawn_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, program_id)
);

CREATE INDEX IF NOT EXISTS idx_hpc_user
  ON public.health_program_consents (user_id);
CREATE INDEX IF NOT EXISTS idx_hpc_program
  ON public.health_program_consents (program_id);

-- ----------------------------------------------------------------------------
-- 2. RLS — own rows (read/write); managers + admins read all for reporting.
-- ----------------------------------------------------------------------------
ALTER TABLE public.health_program_consents ENABLE ROW LEVEL SECURITY;

-- defense-in-depth: strip Supabase's default anon grants (RLS already blocks)
REVOKE ALL ON public.health_program_consents FROM anon;

-- SELECT — own rows, or managers/admins for reporting
DROP POLICY IF EXISTS hpc_select ON public.health_program_consents;
CREATE POLICY hpc_select ON public.health_program_consents
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_super_admin() OR is_admin()
    OR user_has_permission('health.programs.manage')
  );

-- INSERT — only your own consent
DROP POLICY IF EXISTS hpc_insert ON public.health_program_consents;
CREATE POLICY hpc_insert ON public.health_program_consents
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- UPDATE — only your own consent (e.g. set withdrawn_at)
DROP POLICY IF EXISTS hpc_update ON public.health_program_consents;
CREATE POLICY hpc_update ON public.health_program_consents
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. Reload PostgREST schema cache so the new table is visible to REST.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
