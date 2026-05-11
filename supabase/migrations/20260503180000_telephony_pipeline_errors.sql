-- ============================================================================
-- Migration: 20260503180000_telephony_pipeline_errors
-- Pipeline error capture substrate (M-7)
-- ============================================================================
-- Persistent durable record of every error swallowed by the telephony pipeline
-- (webhook handlers, ExoVoiceAnalyze submission, cron sync, intelligence
-- callback, heartbeat). Today these errors live only in console.error → Vercel
-- log retention (~24h). The 27-day silent-failure history captured in
-- .claude/research/probe-pipeline-2026-05-03.md (zero transcripts ever
-- delivered, every analyzeCall returning 400) would have been visible on day 1
-- if rows had been written here.
--
-- Companion to lib/services/telephony/error-capture.ts (server-only helper)
-- which dual-writes (a) Sentry.captureException for alert routing + (b) INSERT
-- into this table for durable timeline + Director-readable triage UI.
--
-- DESIGN NOTES:
-- - `surface` is a CHECK-constrained whitelist so future analytics can group
--   errors by pipeline phase without schema drift.
-- - call_sid is nullable + INDEXed (partial) — many error sites have no call
--   context (e.g. cron health-event errors).
-- - call_log_id is FK with ON DELETE CASCADE — error rows die with their
--   parent call_log to preserve referential integrity. (For very long-lived
--   audit, swap to ON DELETE SET NULL — reconsider when call_log retention
--   policy lands.)
-- - context JSONB carries unstructured payload (request_id, exotel_code,
--   stack snippet). Schema-on-read; do NOT add typed columns until a
--   recurring extraction pattern emerges.
-- - RLS: super_admin / admin read; service_role insert; no other writes.
--   Director's standing rule (2026-04-29): policy/error data is config-row,
--   not deploy-gated.
--
-- IDEMPOTENT: re-applying is safe (IF NOT EXISTS guards on table + indexes).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pipeline_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surface TEXT NOT NULL CHECK (surface IN (
    'webhook',
    'pipeline',
    'cron',
    'intelligence_callback',
    'heartbeat'
  )),
  call_sid TEXT,
  call_log_id UUID REFERENCES public.admission_call_logs(id) ON DELETE CASCADE,
  institution_id UUID,
  error_class TEXT NOT NULL,
  error_message TEXT NOT NULL,
  context JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_errors_recent
  ON public.pipeline_errors (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_errors_call
  ON public.pipeline_errors (call_sid)
  WHERE call_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_errors_surface
  ON public.pipeline_errors (surface, occurred_at DESC);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.pipeline_errors ENABLE ROW LEVEL SECURITY;

-- service_role: full access (the error-capture helper writes via the service
-- role client; cron + webhooks share this surface).
DROP POLICY IF EXISTS "service_role_all_pipeline_errors" ON public.pipeline_errors;
CREATE POLICY "service_role_all_pipeline_errors" ON public.pipeline_errors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- super_admin / admin: read for triage UI. No mutation outside service_role.
DROP POLICY IF EXISTS "admin_read_pipeline_errors" ON public.pipeline_errors;
CREATE POLICY "admin_read_pipeline_errors" ON public.pipeline_errors
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin());

-- Block everything else — no anon read, no authenticated write.
-- (Default is deny-on-RLS-enabled; this comment exists for explicit intent.)

-- ============================================================================
-- Grants (RLS-gated; permissive at table level)
-- ============================================================================
GRANT SELECT ON public.pipeline_errors TO authenticated;
GRANT ALL ON public.pipeline_errors TO service_role;

COMMENT ON TABLE public.pipeline_errors IS
  'Durable error log for telephony pipeline (webhook/pipeline/cron/intelligence_callback/heartbeat). Companion to lib/services/telephony/error-capture.ts. RLS: super_admin/admin read; service_role insert.';

COMMENT ON COLUMN public.pipeline_errors.context IS
  'Unstructured JSONB — request_id, exotel_code, stack snippet, etc. Schema-on-read.';
