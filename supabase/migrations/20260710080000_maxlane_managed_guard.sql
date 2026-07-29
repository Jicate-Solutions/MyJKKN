-- =====================================================================
-- Max-lane managed guard — SDK review follow-up for #1925
-- Migration: 2026-07-10
-- =====================================================================
-- The weld's seed migration (20260709223000) uses ON CONFLICT DO NOTHING, so
-- a maxlane:* row that somehow pre-existed with managed=true would survive a
-- replay — and the cloud dispatcher (fn_ai_routine_claim_due filters
-- managed=true) would then claim a LOCAL job it cannot run. This guard makes
-- the invariant explicit and self-healing on every replay: maxlane:* rows are
-- NEVER dispatcher-managed. Idempotent; currently a no-op in production
-- (all maxlane:* rows are already managed=false).
UPDATE public.ai_routine_schedules
   SET managed = false, updated_at = now()
 WHERE routine_id LIKE 'maxlane:%'
   AND managed = true;
