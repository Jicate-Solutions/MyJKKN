-- ============================================================================
-- voice_memo.transcribe — arm the OpenAI fallback for the exhausted Groq key
-- ============================================================================
-- Created: 2026-07-30. Applied by the orchestrator with a BEGIN…ROLLBACK
-- rehearsal — NOT auto-applied by any deploy.
--
-- WHY. Counsellor voice memos are transcribed by Groq whisper-large-v3. The Groq
-- ORG key is shared with traffic OUTSIDE MyJKKN (inside MyJKKN, this feature is
-- the ONLY groq consumer), so its daily audio budget is exhausted by others:
-- over the 14 days to 2026-07-30 there were ZERO successful transcriptions on
-- 12 of 13 days, ~140 failures/day, and 205 literal
-- `429 Rate limit reached for model whisper-large-v3` in the last 3 days alone.
-- 104 memos sit parked with memo_transcript IS NULL. Sentiment already runs ₹0
-- on the Max lane and is healthy — transcription is the bottleneck, and it
-- CANNOT move to Claude (Whisper is a speech model; Claude cannot transcribe).
--
-- WHY A FALLBACK RATHER THAN A HARD SWITCH TO OPENAI. OpenAI whisper-1 is
-- materially pricier per memo than Groq. A hard switch pays that premium on
-- EVERY memo forever; a fallback pays it ONLY while Groq is rate-limited, and
-- returns to the cheap primary the moment its quota frees. The
-- fallback_provider / fallback_model_id columns have existed on both config
-- tables since the 20260512 substrate and are editable in /admin/ai-models —
-- they were simply never honoured by any runtime consumer. The companion code
-- change (lib/services/platform/ai-model-config-service.ts) makes them real.
--
-- WHY openai / whisper-1 SPECIFICALLY — not a guess:
--   • It is in the pricing registry (lib/services/platform/ai-providers.ts),
--     so estimateTranscriptionCostInr can price it and the ledger stays honest.
--   • transcribeViaOpenAI already exists in ai-clients/transcription.ts.
--   • OPENAI_API_KEY is present in Vercel Production (added ~82 days ago).
--   • It is PROVEN for this exact feature: 39,717 successful transcriptions
--     historically (feature_key='voice_memo.transcribe'), last used 2026-07-04.
--
-- ORDERING. Apply this only TOGETHER WITH (or after) the code change that
-- honours the columns. Applied alone it is inert — nothing reads the pair —
-- so it is safe in either order, but it does nothing until the code ships.
--
-- WHICH ROW ACTUALLY DECIDES. getModelForFeature prefers the ai_job_types row
-- when it carries BOTH provider AND model_id, else falls back to
-- ai_model_config. voice_memo.transcribe carries both on ai_job_types, so THAT
-- row is authoritative. ai_model_config is updated too so the two cannot drift
-- and so a future resolution-path change cannot silently disarm the fallback.
--
-- ADDITIVE / IDEMPOTENT. Sets only the fallback pair; the PRIMARY provider and
-- model are deliberately left untouched (Groq stays first choice).
-- ============================================================================

BEGIN;

-- Authoritative row (ai_job_types wins resolution for this feature).
UPDATE public.ai_job_types
   SET fallback_provider = 'openai',
       fallback_model_id = 'whisper-1',
       updated_at        = now()
 WHERE job_type = 'voice_memo.transcribe';

-- Legacy/back-stop row — kept in step so the pair survives a resolution change.
UPDATE public.ai_model_config
   SET fallback_provider = 'openai',
       fallback_model_id = 'whisper-1',
       updated_at        = now()
 WHERE feature_key = 'voice_memo.transcribe';

NOTIFY pgrst, 'reload schema';

COMMIT;
