-- ============================================================================
-- 20260714093000_ai_job_types_absorb_model_config.sql
-- ----------------------------------------------------------------------------
-- FULL CONFIG MERGE (P0) — Phase 1 of N.
-- The ai_job_types registry (#1998) ABSORBS ai_model_config's model-governance
-- columns so every AI feature lives under ONE config system, surfaced on the
-- /admin/ai-models page.
--
-- Phase 1 is PURELY ADDITIVE: add columns, register the model_config features
-- that are missing from the registry (as config carriers), and backfill the
-- model selection across. NOTHING reads the new columns yet — that read-flip is
-- the follow-on CODE PR — so applying this migration changes ZERO runtime
-- behavior. ai_model_config is deliberately KEPT as the fallback source until
-- the code has baked.
--
-- KEY SEMANTIC (do not conflate): on ai_job_types, `enabled` is the
-- GENERIC-DRAIN-runnable flag (fn_ai_enqueue requires enabled=true; ai_jobs.job_type
-- FKs here). The model RESOLVER must NOT key on `enabled` — it keys on
-- `model_id IS NOT NULL`. That is why the 15 config carriers below can be
-- enabled=false (they run via their own routes/crons, not the generic drain)
-- while still carrying a live model that the resolver honors.
--
-- Ref: continuation brief 2026-07-14; memory project_ai_features_run_on_max.md,
--      project_ai_jobs_registry_lane.md; migration 20260713000100 (RPC pattern).
-- ============================================================================

-- ── 1. ADDITIVE: model-governance columns on the registry ───────────────────
ALTER TABLE public.ai_job_types
  ADD COLUMN IF NOT EXISTS provider              text,
  ADD COLUMN IF NOT EXISTS model_id              text,
  ADD COLUMN IF NOT EXISTS fallback_provider     text,
  ADD COLUMN IF NOT EXISTS fallback_model_id     text,
  ADD COLUMN IF NOT EXISTS monthly_spend_cap_inr numeric;

COMMENT ON COLUMN public.ai_job_types.provider IS
  'Model-governance (absorbed from ai_model_config): AI provider — anthropic/openai/google/groq. NULL = no model config here → resolver falls back to ai_model_config then a hardcoded default. Resolution keys on model_id presence, NOT on enabled.';
COMMENT ON COLUMN public.ai_job_types.model_id IS
  'Model-governance: provider model id sent to the API.';
COMMENT ON COLUMN public.ai_job_types.fallback_provider IS
  'Model-governance: fallback provider when primary is unavailable.';
COMMENT ON COLUMN public.ai_job_types.fallback_model_id IS
  'Model-governance: fallback model id.';
COMMENT ON COLUMN public.ai_job_types.monthly_spend_cap_inr IS
  'Model-governance: MTD INR spend cap. Over cap an anthropic feature degrades to the cheap chat model (see fn_ai_feature_mtd_spend + ai-model-config-service). NULL/0 = no cap.';

-- ── 2. REGISTER model_config features missing from the registry ─────────────
-- CONFIG CARRIERS: these features run via their own API routes / cron jobs, NOT
-- the generic Windows drain, so enabled=false (drain off) is correct and safe;
-- prompt_template stays NULL. lane mirrors reality — voice transcription and
-- procurement PDF extraction are api-lane (cannot run on the Max plan);
-- everything else is max-lane. rcltp is dormant. schedulable is descriptive
-- metadata for the cron-driven ones. ON CONFLICT DO NOTHING keeps this
-- idempotent and never clobbers an existing row.
INSERT INTO public.ai_job_types
  (job_type, title, description, lane, interactive, allow_rule, enabled, schedulable)
VALUES
  ('scf.generate_suggestions',         'SCF · Generate Suggestions',         'Config carrier — runs via cron route',              'max', false, 'seat_owner', false, true),
  ('scf.learner_notes',                'SCF · Learner Notes',                'Config carrier — runs via cron route',              'max', false, 'seat_owner', false, true),
  ('session_feedback.escalation',      'Session Feedback · Escalation',      'Config carrier — runs via cron route',              'max', false, 'seat_owner', false, true),
  ('induction.generate_playbook',      'Induction · Generate Playbook',      'Config carrier — runs via cron route',              'max', false, 'seat_owner', false, true),
  ('induction.session_effectiveness',  'Induction · Session Effectiveness',  'Config carrier — runs via cron route',              'max', false, 'seat_owner', false, true),
  ('curriculum.lesson_spine_generate', 'Curriculum · Lesson Spine Generate', 'Config carrier — drafts-gated route',               'max', false, 'seat_owner', false, false),
  ('feedback.classify',                'Feedback · Classify',                'Config carrier — runs via route',                   'max', false, 'seat_owner', false, false),
  ('admission.ai_insights',            'Admission · AI Insights',            'Config carrier — runs via route',                   'max', false, 'seat_owner', false, false),
  ('admission.briefing',               'Admission · Daily Briefing',         'Config carrier — runs via cron route',              'max', false, 'seat_owner', false, true),
  ('voice_memo.sentiment',             'Voice Memo · Sentiment',             'Config carrier — runs via cron route',              'max', false, 'seat_owner', false, true),
  ('voice_memo.transcribe',            'Voice Memo · Transcribe',            'Config carrier — audio-only, api lane (not Max)',   'api', false, 'seat_owner', false, true),
  ('procurement.quotation_extract',    'Procurement · Quotation Extract',    'Config carrier — PDF extract, api lane',            'api', false, 'seat_owner', false, false),
  ('procurement.invoice_extract',      'Procurement · Invoice Extract',      'Config carrier — PDF extract, api lane',            'api', false, 'seat_owner', false, false),
  ('ai_query.natural_language',        'AI Query · Natural Language',        'Config carrier — model governor for AI Query chat', 'max', false, 'seat_owner', false, false),
  ('rcltp.question_generation',        'RCLTP · Question Generation',        'Config carrier — dormant (EKSAQ-gated)',            'max', false, 'seat_owner', false, false)
ON CONFLICT (job_type) DO NOTHING;

-- ── 3. BACKFILL model governance from ai_model_config into the registry ─────
-- Matches on feature_key = job_type. demo.ping and ai_query.chat have no
-- model_config row, so they are correctly left with NULL model columns.
UPDATE public.ai_job_types t
SET provider              = c.provider,
    model_id              = c.model_id,
    fallback_provider     = c.fallback_provider,
    fallback_model_id     = c.fallback_model_id,
    monthly_spend_cap_inr = c.monthly_spend_cap_inr,
    updated_at            = now()
FROM public.ai_model_config c
WHERE c.feature_key = t.job_type
  AND c.is_active = true;
