-- ============================================================================
-- CDC CLUBS — INITIATIVE TRACKER (BUG-004299)
-- ----------------------------------------------------------------------------
-- Date:   2026-07-01
-- Reason: A CDC club (public.cdc_clubs) currently tracks only its identity and
--         membership. CDC needs to track the INITIATIVES each club runs
--         (events, drives, projects) — many initiatives per club — with a
--         lifecycle status (planned → wip → launched), an optional start date
--         and free-form notes. This adds a child table: one row per initiative,
--         cascade-deleted with its parent club.
-- Scope:  DB-only. New table + RLS mirroring cdc_clubs
--         (read: any authenticated user; write: is_cdc_staff() AND institution
--         scope). No new RPC / no new SECURITY DEFINER function — reuses the
--         already-live helpers is_cdc_staff() + role_has_institution_access().
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP/CREATE POLICY.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cdc_club_initiatives (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        uuid NOT NULL REFERENCES public.cdc_clubs(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES public.institutions(id),
  title          text NOT NULL,
  status         text NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned', 'wip', 'launched')),
  start_date     date,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.cdc_club_initiatives
  IS 'BUG-004299: initiatives run by a CDC club. Many initiatives per club, each with a planned/wip/launched status.';

CREATE INDEX IF NOT EXISTS idx_cdc_club_initiatives_club
  ON public.cdc_club_initiatives(club_id);

ALTER TABLE public.cdc_club_initiatives ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (mirrors cdc_clubs read).
DROP POLICY IF EXISTS cdc_club_initiatives_read ON public.cdc_club_initiatives;
CREATE POLICY cdc_club_initiatives_read ON public.cdc_club_initiatives
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Write: CDC staff, institution-scoped (mirrors cdc_clubs_write — multi-role +
-- institution aware via role_has_institution_access; NULL institution_id ->
-- system-wide/true, matching the rest of the CDC surface).
DROP POLICY IF EXISTS cdc_club_initiatives_write ON public.cdc_club_initiatives;
CREATE POLICY cdc_club_initiatives_write ON public.cdc_club_initiatives
  FOR ALL
  USING      (is_cdc_staff() AND role_has_institution_access(institution_id))
  WITH CHECK (is_cdc_staff() AND role_has_institution_access(institution_id));

NOTIFY pgrst, 'reload schema';
