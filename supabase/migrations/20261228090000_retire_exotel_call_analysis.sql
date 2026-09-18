-- Retire the Exotel "analyse every answered call" pipeline (BUG-006180,
-- Sentry JAVASCRIPT-NEXTJS-3P). Director ruling 2026-09-18 23:41, by tap:
-- "Switch it off" and mark the stuck records "not analysed".
--
-- The pipeline was rejected on 2026-05-09 (the counselor voice memo replaced
-- it) but was never switched off: institution_call_settings.auto_transcribe_enabled
-- stayed true and defaulted to true, so every answered call with a recording
-- was still submitted to ExoVoiceAnalyze. Exotel refused every one (HTTP 401).
-- Production, 18 Sep 2026: 4,660 admission_call_intelligence rows, all
-- 'submitted', none with an analyze_job_id — it never succeeded once.
--
-- Idempotent: every statement is safe to run twice.

-- 1. Switch it off everywhere, and for any settings row created later.
UPDATE public.institution_call_settings
   SET auto_transcribe_enabled = false
 WHERE auto_transcribe_enabled IS DISTINCT FROM false;

ALTER TABLE public.institution_call_settings
  ALTER COLUMN auto_transcribe_enabled SET DEFAULT false;

-- 2. The stuck records: Exotel never accepted them (no job id), so nothing is
--    in flight. 'failed' is the existing status the call page shows as
--    "not analysed"; rows Exotel DID accept (a job id) are left alone.
UPDATE public.admission_call_intelligence
   SET analyze_status = 'failed',
       updated_at     = now()
 WHERE analyze_status IN ('pending', 'submitted')
   AND analyze_job_id IS NULL;
