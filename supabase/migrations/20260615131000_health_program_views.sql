-- ============================================================================
-- Migration: 20260615131000_health_program_views
-- Health — Wellness Programs feature (PR4 of 4): public no-login view tracking
-- Spec: specs/health-wellness-programs-2026-06-15.md
-- ============================================================================
-- A patient / visitor scans a QR → lands on /p/<public_token> (NO login, NO
-- health-consent gate) and watches the day's awareness content. Every page
-- view is logged here as an anonymous FACT (no personal data, no profiles link).
--
-- Writes happen ONLY via the service-role public track API
-- (app/api/public/health-programs/[token]/track), never directly from anon —
-- so anon is explicitly stripped of ALL grants on this table.
--
-- TIER: additive (new table + seed UPDATE). Idempotent. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: health_program_views  (anonymous public view facts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_program_views (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id   UUID REFERENCES public.health_programs(id)      ON DELETE CASCADE,
  day_id       UUID REFERENCES public.health_program_days(id)  ON DELETE CASCADE,
  public_token TEXT,
  ip_hash      TEXT,           -- salted hash of client IP (never the raw IP)
  user_agent   TEXT,
  device_type  TEXT,           -- 'mobile' | 'tablet' | 'desktop'
  viewed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_program_views_program
  ON public.health_program_views (program_id);
CREATE INDEX IF NOT EXISTS idx_health_program_views_token
  ON public.health_program_views (public_token);

-- ----------------------------------------------------------------------------
-- 2. RLS — table holds anonymous facts; writes are service-role only.
--    No SELECT/INSERT/UPDATE/DELETE policies are defined, so with RLS enabled
--    no client role can touch rows; the service-role key bypasses RLS for the
--    track API insert. anon is stripped of every grant for defense-in-depth.
-- ----------------------------------------------------------------------------
ALTER TABLE public.health_program_views ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.health_program_views FROM anon;

-- ----------------------------------------------------------------------------
-- 3. SEED — give MindSmile a stable public token so /p/mindsmile-2026 works.
--    Only sets it when not already set (idempotent, never clobbers a real one).
-- ----------------------------------------------------------------------------
UPDATE public.health_programs
   SET public_token = 'mindsmile-2026'
 WHERE slug = 'mindsmile-yoga-awareness-week-2026'
   AND public_token IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Reload PostgREST schema cache so the new table is visible to REST.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
