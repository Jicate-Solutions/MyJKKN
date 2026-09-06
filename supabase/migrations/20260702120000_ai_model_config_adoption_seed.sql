-- ============================================================================
-- 20260702120000_ai_model_config_adoption_seed.sql
-- AI Model Config Adoption — seed rows for the 16 hardcoded Claude features
-- (2026-07-02, PR 1/5 of the adoption program).
--
-- CUTOVER INVARIANT (non-negotiable): every row below is seeded to the model
-- the code HARDCODES TODAY (verified per-file against jicate/main 2026-07-02).
-- Applying this migration changes ZERO runtime behavior — the call sites still
-- hardcode their models until PR 2-4 wire them through
-- lib/services/platform/ai-clients/chat.ts, and even then each resolves to the
-- exact same model id it used before. Model changes happen afterwards,
-- deliberately, from /admin/ai-models.
--
-- Special case: rcltp.question_generation — the route
-- (app/api/rcltp/questions/generate/route.ts) is an EKSAQ-gated scaffold that
-- wires an Anthropic client but returns 501 before any AI call; it has NO
-- hardcoded model. Seeded to the platform workhorse claude-sonnet-4-6 as a
-- forward-default (cannot change behavior — no call exists yet).
--
-- Drift fix: admission.ai_insights was seeded 2026-05-12 to openai/gpt-4o-mini
-- (aspirational, never adopted) but the live code
-- (app/api/admission/insights/generate/route.ts) hardcodes
-- anthropic/claude-sonnet-4-5. The guarded UPDATE below corrects the row to
-- match live code so PR 4 can wire it without silently downgrading the model.
-- The WHERE clause pins the exact drifted values so a deliberate UI change made
-- after this migration was written can never be clobbered.
--
-- No DDL. No new functions/RPCs. Idempotent (ON CONFLICT DO NOTHING; the
-- UPDATE no-ops once applied).
-- ============================================================================

INSERT INTO ai_model_config (feature_key, display_name, description, category, provider, model_id) VALUES
  ('scf.generate_suggestions',
   'SCF Suggestion Generation',
   'Weekly cron: generate improvement suggestions from Student Consultative Forum feedback.',
   'scf',
   'anthropic',
   'claude-sonnet-4-6'),
  ('scf.learner_notes',
   'SCF Learner Notes',
   'Cron: synthesize per-learner notes from SCF discussion outcomes.',
   'scf',
   'anthropic',
   'claude-sonnet-4-6'),
  ('session_feedback.escalation',
   'Session Feedback Escalation',
   'Cron: detect and escalate concerning session feedback patterns to coordinators.',
   'session_feedback',
   'anthropic',
   'claude-sonnet-4-6'),
  ('session_feedback.suggest_improvement',
   'Session Feedback Improvement Suggestions',
   'Interactive: suggest teaching improvements from a session''s feedback for the facilitator.',
   'session_feedback',
   'anthropic',
   'claude-sonnet-4-6'),
  ('feedback.classify',
   'Feedback Classification',
   'Classify feedback events → {sentiment, intent, topic} (used by the feedback-classify cron).',
   'feedback',
   'anthropic',
   'claude-sonnet-4-6'),
  ('induction.generate_playbook',
   'Induction Playbook Generation',
   'Cron: generate session playbooks for the Fresher Induction program.',
   'induction',
   'anthropic',
   'claude-sonnet-4-6'),
  ('induction.session_effectiveness',
   'Induction Session Effectiveness',
   'Cron: analyze induction session effectiveness from attendance + feedback signals.',
   'induction',
   'anthropic',
   'claude-sonnet-4-6'),
  ('cdc.career_guidance',
   'CDC Career Guidance',
   'Interactive: AI career guidance responses for learners via the CDC module.',
   'cdc',
   'anthropic',
   'claude-sonnet-4-6'),
  ('ai_query.natural_language',
   'AI Query (Natural Language)',
   'Interactive: natural-language questions over platform data (tool-use loop).',
   'ai_query',
   'anthropic',
   'claude-sonnet-4-20250514'),
  ('work_pulse.analyze',
   'Work Pulse Analysis',
   'Interactive: analyze work-pulse entries into structured insight items.',
   'work_pulse',
   'anthropic',
   'claude-sonnet-4-20250514'),
  ('work_pulse.translate',
   'Work Pulse Translation',
   'Interactive: translate work-pulse entries (Tamil/English).',
   'work_pulse',
   'anthropic',
   'claude-haiku-4-5-20251001'),
  ('attention_bar.assistant',
   'Attention Bar Assistant',
   'Layer-4 assistant behind the attention bar (lib/attention-bar, LAYER_4_MODEL).',
   'attention_bar',
   'anthropic',
   'claude-haiku-4-5-20251001'),
  ('rcltp.question_generation',
   'RCLTP Question Generation',
   'Generate Part B comprehension questions from a passage (EKSAQ-gated scaffold; no live AI call yet — forward-default model).',
   'rcltp',
   'anthropic',
   'claude-sonnet-4-6'),
  ('admission.ai_service',
   'Admission AI Service',
   'Admission lead analysis via admission-ai-service.ts.',
   'admission',
   'anthropic',
   'claude-sonnet-4-5'),
  ('admission.agentic_query',
   'Admission Agentic Query',
   'Agentic tool-use query loop over admission data (agentic-query-service.ts).',
   'admission',
   'anthropic',
   'claude-3-5-haiku-20241022'),
  ('admission.ai_response',
   'Admission AI Response',
   'AI-drafted responses to admission enquiries (ai-response-service.ts).',
   'admission',
   'anthropic',
   'claude-3-5-haiku-20241022')
ON CONFLICT (feature_key) DO NOTHING;

-- Drift fix (guarded): align admission.ai_insights row with live code.
-- Only fires while the row still holds the original aspirational seed values —
-- a deliberate post-seed UI change leaves the WHERE unmatched (0 rows, no-op).
UPDATE public.ai_model_config
SET provider = 'anthropic',
    model_id = 'claude-sonnet-4-5',
    updated_at = now()
WHERE feature_key = 'admission.ai_insights'
  AND provider = 'openai'
  AND model_id = 'gpt-4o-mini';
