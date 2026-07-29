-- =====================================================================
-- Max-only flag for batch AI routines — drop the API/cloud fallback
-- Migration: 2026-07-13
-- =====================================================================
-- Pins the batch AI routines to the Claude Max subscription lane by adding a
-- `max_only` flag to ai_routine_schedules and turning it on for every
-- maxlane:<id> batch row.
--
-- With max_only=true (AND the row enabled), shouldDeferToMaxLane('<routine-id>')
-- returns true UNCONDITIONALLY — heartbeat fresh or not — so the cloud cron
-- always steps aside and the routine runs ONLY on the Max lane (₹0 API). This
-- is the intentional way to drop the API fallback (mirrors the #1996 "Max is
-- the sole lane" posture). Batch routines are idempotent + re-runnable, so a
-- missed Max cycle is a skipped run, never lost or corrupted data.
--
-- Rows with max_only=false keep the existing heartbeat-gated BACKUP behaviour:
-- the cloud path stands down only while the runner pulse is fresh and reclaims
-- the work when it goes stale.
--
-- EXCLUSIONS:
--   • maxlane:voice-memo-sentiment — stays heartbeat-gated. Its transcription
--     modality (Groq Whisper on audio) cannot run on the seat, so the cloud
--     cron MUST remain a live backup. Voice is deliberately left as-is.
--   • maxlane:poller-heartbeat — liveness state, not a routine. Never a
--     deferral target; excluded so it is never pinned.
-- =====================================================================

-- 1) Column. DEFAULT false so every EXISTING routine keeps its current
--    heartbeat-gated behaviour until it is explicitly pinned below. Idempotent
--    (IF NOT EXISTS) so a re-apply is a no-op.
ALTER TABLE public.ai_routine_schedules
  ADD COLUMN IF NOT EXISTS max_only boolean NOT NULL DEFAULT false;

-- 2) Pin every Max-lane BATCH routine to max-only — the API fallback is dropped
--    for these. Excludes voice (modality can't ride the seat) and the poller
--    heartbeat (liveness state, not a routine). Idempotent: a re-run sets the
--    same values.
UPDATE public.ai_routine_schedules
   SET max_only = true
 WHERE routine_id LIKE 'maxlane:%'
   AND routine_id <> 'maxlane:voice-memo-sentiment'
   AND routine_id <> 'maxlane:poller-heartbeat';
