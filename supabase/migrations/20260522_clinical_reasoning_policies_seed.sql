-- ============================================================================
-- Migration: 20260522_clinical_reasoning_policies_seed
-- AICBL → PDE Clinical Reasoning sprint, Agent A — Step A7
-- ============================================================================
-- Seeds 8 platform_policies rows for clinical_reasoning with full typed-widget
-- metadata (ui_widget, ui_options, ui_consequence, ui_cascade, ui_category)
-- per Director directive: "every policy decision a row, Director's view with
-- English consequences + visual cascade, zero deploys to tweak."
--
-- Idempotent via DELETE-then-INSERT (clean namespace).
-- ============================================================================

DELETE FROM platform_policies
WHERE policy_key LIKE 'clinical_reasoning.%' AND scope_type = 'global';

INSERT INTO platform_policies (
  policy_key, scope_type, scope_id, value, data_type, description,
  ui_widget, ui_options, ui_consequence, ui_cascade, ui_category, is_system, is_active
)
VALUES
(
  'clinical_reasoning.lifetime_attempts_per_case',
  'global', NULL::uuid,
  '5'::jsonb, 'number',
  'Lifetime cap on case attempts per student per case',
  'number', NULL::jsonb,
  'Students get N attempts per case. After that, they must request a faculty reset.',
  '[{"effect":"Higher cap = more learning iterations but higher AI cost","severity":"medium"},{"effect":"Cap of 0 disables the feature entirely","severity":"high"}]'::jsonb,
  'Caps & Limits', true, true
),
(
  'clinical_reasoning.evidence_threshold_pct',
  'global', NULL::uuid,
  '60'::jsonb, 'number',
  'Minimum score to auto-create DCI Criterion 2.3 accreditation evidence',
  'number', NULL::jsonb,
  'Attempts scoring at or above N% auto-generate DCI 2.3 evidence rows in quality_evidence_mappings.',
  '[{"effect":"Lower threshold = more evidence rows, possibly lower quality","severity":"high"},{"effect":"Higher threshold = fewer rows, stronger signal","severity":"medium"}]'::jsonb,
  'Accreditation', true, true
),
(
  'clinical_reasoning.ai.provider',
  'global', NULL::uuid,
  '"google"'::jsonb, 'enum',
  'AI provider for Socratic feedback',
  'dropdown',
  '[{"value":"openai","label":"OpenAI"},{"value":"anthropic","label":"Anthropic"},{"value":"google","label":"Google Gemini"}]'::jsonb,
  'All AI Socratic feedback routes through this provider.',
  '[{"effect":"Provider change affects latency, cost, and response tone","severity":"high"},{"effect":"Provider must have valid API key set in env","severity":"high"}]'::jsonb,
  'AI Provider', true, true
),
(
  'clinical_reasoning.ai.model',
  'global', NULL::uuid,
  '"gemini-2.5-pro"'::jsonb, 'enum',
  'AI model for Socratic feedback (must be compatible with selected provider)',
  'dropdown',
  '[{"value":"gemini-2.5-flash-lite","label":"Gemini 2.5 Flash Lite (cheapest)"},{"value":"gemini-2.5-flash","label":"Gemini 2.5 Flash"},{"value":"gemini-2.5-pro","label":"Gemini 2.5 Pro (default)"},{"value":"gpt-4o-mini","label":"GPT-4o mini"},{"value":"gpt-4o","label":"GPT-4o"},{"value":"claude-haiku-4-5","label":"Claude Haiku 4.5"},{"value":"claude-sonnet-4-5","label":"Claude Sonnet 4.5"}]'::jsonb,
  'Determines latency, cost, and reasoning quality of AI tutor responses.',
  '[{"effect":"Higher-tier models cost more but reason better","severity":"medium"},{"effect":"Model must match selected provider","severity":"high"}]'::jsonb,
  'AI Provider', true, true
),
(
  'clinical_reasoning.ai.max_response_sentences',
  'global', NULL::uuid,
  '4'::jsonb, 'number',
  'Maximum sentences in an AI Socratic response',
  'number', NULL::jsonb,
  'AI feedback capped at N sentences to keep responses focused and readable.',
  '[{"effect":"Too short = unhelpful; too long = student tunes out","severity":"low"}]'::jsonb,
  'AI Behavior', true, true
),
(
  'clinical_reasoning.ai.system_prompt_template',
  'global', NULL::uuid,
  to_jsonb(E'You are an AI clinical reasoning tutor for dental undergraduate students learning Oral Medicine through Case-Based Learning, grounded in Harvard Case-Based Collaborative Learning (CBCL) pedagogy.\n\nCASE CONTEXT:\n{case_context}\n\nCURRENT QUESTION (Q{q_number}):\n{question}\n\nGROUND TRUTH (DO NOT REVEAL DIRECTLY):\n{ground_truth}\n\nKEY CONCEPTS:\n{key_concepts}\n\nSTUDENT ANSWER:\n{student_answer}\n\nRULES:\n- NEVER state the correct answer directly.\n- If the student got it right with sound reasoning: affirm what was correct, ask one Socratic follow-up that deepens understanding.\n- If partially right: identify the strong part, ask a question that surfaces the gap.\n- If wrong: do not say "wrong". Ask a question that surfaces the contradiction in their reasoning, hinting toward an observation they may have missed.\n- Tone: warm, encouraging, like a senior resident teaching a junior. Never lecture.\n- Length: max {max_sentences} sentences.\n\nRESPOND with your Socratic feedback now.'::text),
  'string',
  'Socratic feedback prompt template. Placeholders: {case_context} {q_number} {question} {ground_truth} {key_concepts} {student_answer} {max_sentences}',
  'textarea', NULL::jsonb,
  'Determines voice + pedagogy of the AI tutor.',
  '[{"effect":"Template change affects feel-of-tutor across ALL clinical cases","severity":"high"},{"effect":"Removing placeholders breaks the feedback service","severity":"high"}]'::jsonb,
  'AI Behavior', true, true
),
(
  'clinical_reasoning.scoring.passing_threshold_pct',
  'global', NULL::uuid,
  '60'::jsonb, 'number',
  'Score required to mark pde_learner_capabilities.status = demonstrated',
  'number', NULL::jsonb,
  'Attempts at or above N% mark the clinical_reasoning capability as demonstrated for the learner.',
  '[{"effect":"Lower = more learners pass, less rigor","severity":"high"},{"effect":"This is independent of accreditation evidence threshold (see evidence_threshold_pct)","severity":"low"}]'::jsonb,
  'Scoring', true, true
),
(
  'clinical_reasoning.faculty.cap_reset_default_count',
  'global', NULL::uuid,
  '3'::jsonb, 'number',
  'Default additional attempts when faculty resets a student cap',
  'number', NULL::jsonb,
  'When faculty clicks "Grant more attempts" on a capped student, this number prefills (faculty can adjust per reset).',
  '[]'::jsonb,
  'Faculty Workflow', true, true
);
