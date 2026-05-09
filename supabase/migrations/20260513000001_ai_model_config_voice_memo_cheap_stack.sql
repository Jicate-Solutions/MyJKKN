-- ============================================================================
-- 20260513000001_ai_model_config_voice_memo_cheap_stack.sql
-- Switch voice_memo.* defaults from OpenAI to the cheap stack:
--   voice_memo.transcribe → groq / whisper-large-v3
--   voice_memo.sentiment  → google / gemini-2.5-flash-lite
--
-- WHY: At ~6,680 voice memos/month, OpenAI Whisper-1 + GPT-4o-mini costs
-- ~₹2,340/mo. Groq Whisper Large v3 (same Whisper model on LPU) is ~9×
-- cheaper, and Gemini 2.5 Flash Lite is ~4× cheaper than GPT-4o-mini for
-- the simple sentiment classification task. Net new cost: ~₹390/mo
-- (~83% saving).
--
-- Other features (admission.briefing, admission.ai_insights,
-- ai_pulse.anomaly_detection) keep OpenAI defaults — Director can swap
-- via /admin/ai-models UI later once measured.
--
-- TIER classification: TIER-1 (data-touching UPDATE on existing seed rows;
-- no schema change). Idempotent — safe to re-run.
-- ============================================================================

UPDATE ai_model_config
SET
  provider = 'groq',
  model_id = 'whisper-large-v3',
  change_reason = 'Default flip to cheap stack (Groq Whisper Large v3); ~9× cheaper than OpenAI Whisper-1 at same model quality for English audio.',
  updated_at = now()
WHERE feature_key = 'voice_memo.transcribe'
  AND provider = 'openai'
  AND model_id = 'whisper-1';

UPDATE ai_model_config
SET
  provider = 'google',
  model_id = 'gemini-2.5-flash-lite',
  change_reason = 'Default flip to cheap stack (Gemini 2.5 Flash Lite); ~4× cheaper than GPT-4o-mini for simple sentiment classification.',
  updated_at = now()
WHERE feature_key = 'voice_memo.sentiment'
  AND provider = 'openai'
  AND model_id = 'gpt-4o-mini';
