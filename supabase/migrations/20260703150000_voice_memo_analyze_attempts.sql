-- ============================================================================
-- Voice memo pipeline: per-row retry budget (poison-pill guard)
-- Created: 2026-07-03
--
-- Bug receipt: the analyze-voice-memos cron re-sweeps 'failed' rows forever
-- with no attempt cap. ~20 rows with silent audio (<5-char transcripts),
-- sorted oldest-first, filled the entire 20-row batch every 5 minutes:
--   * 162,037 failed transcription calls (2026-05-25 → 2026-07-03)
--   * 2,454 'pending' memos starved with ZERO progress — even while the
--     provider was healthy (2026-05-29 → 06-04: ~4,700 successful calls/day
--     against only 17 distinct rows, all re-marked failed by the empty-
--     transcript guard and re-picked next run)
--   * enough junk volume to exhaust the Groq free tier (38,550 fails) and
--     then the OpenAI account quota (429 insufficient_quota since 06-05)
--
-- The cron now (a) skips rows whose budget is exhausted and (b) does not
-- consume budget on provider-wide 429/5xx failures, so the backlog still
-- auto-recovers when the provider account is healthy again.
--
-- Additive, metadata-only (PG11+ fast default) — safe on the live table.
-- ============================================================================

ALTER TABLE public.admission_call_logs
  ADD COLUMN IF NOT EXISTS memo_analyze_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.admission_call_logs.memo_analyze_attempts IS
  'Voice-memo analysis attempts consumed by row-specific failures (empty transcript, invalid/oversized file, storage miss). Provider-wide 429/5xx failures do not count. The analyze-voice-memos cron skips rows at >= 5 so poison rows cannot starve the batch; rows stay visible as failed in the monitor.';
