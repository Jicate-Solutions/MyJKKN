-- ============================================================================
-- ID Card Bridge Heartbeat (Phase 2) — id_card_agent_status
-- ============================================================================
-- Created: 2026-07-24. NOT applied anywhere by this PR — the orchestrator
-- applies it with a BEGIN…ROLLBACK rehearsal first.
--
-- Single-row table (id = 1) recording the last time the on-prem ID-card print
-- bridge polled GET /api/id-cards/jobs with a valid agent token. The print
-- queue UI reads last_poll_at to show a "Print bridge online / silent" chip so
-- the office knows the bridge is alive without walking to the printer.
--
-- Writes: service-role only (the jobs route updates it fire-and-forget on
-- every authenticated agent poll; the route swallows every error, so deploy
-- order between app code and this migration never matters).
-- Reads: queue viewers (id_cards.jobs.view) + admins — mirrors the
-- id_card_print_jobs_admin_view policy so exactly the people who can see the
-- queue can see the bridge status.
--
-- TIER-1 ADDITIVE / IDEMPOTENT / DROPS-NOTHING. No functions in this migration.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.id_card_agent_status (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_poll_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.id_card_agent_status IS
  'Singleton heartbeat (id=1): last time the on-prem ID-card print bridge polled GET /api/id-cards/jobs. Updated via the service-role client; read by the print-queue UI bridge-status chip.';

ALTER TABLE public.id_card_agent_status ENABLE ROW LEVEL SECURITY;

-- Queue viewers + admins may read the heartbeat.
DROP POLICY IF EXISTS "id_card_agent_status_view" ON public.id_card_agent_status;
CREATE POLICY "id_card_agent_status_view"
  ON public.id_card_agent_status FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('id_cards.jobs.view')
  );

-- Service role (the jobs route heartbeat writer) — full access.
DROP POLICY IF EXISTS "id_card_agent_status_service_role_all" ON public.id_card_agent_status;
CREATE POLICY "id_card_agent_status_service_role_all"
  ON public.id_card_agent_status FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Seed the singleton row so the route's UPDATE … WHERE id = 1 always has a target.
INSERT INTO public.id_card_agent_status (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
