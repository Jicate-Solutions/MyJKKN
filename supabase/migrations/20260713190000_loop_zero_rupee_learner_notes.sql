-- ============================================================================
-- 20260713190000_loop_zero_rupee_learner_notes.sql
-- ----------------------------------------------------------------------------
-- ₹0 loop migration — generator 6: scf.learner_notes. SINGLE-SHOT loop
-- restructured into enqueue+collect on lane='jobs'. Depends on the foundation
-- (20260713140000).
--
-- ⚠️ STUDENT-FACING BOUNDARY (Director-LOCKED policy): learner notes are shown to
-- STUDENTS, which the personal Max seat must never power. Generation produces
-- DRAFTS (status='draft') that a super-admin approves before any student sees them
-- (the approval queue legitimizes it), so generation is staff-gated — but the flip
-- to 'jobs' is HELD for the Director's explicit call. THIS SWITCH IS SEEDED
-- 'direct' (INERT): the code path is built and ready, but the loop keeps running on
-- its existing lane until the Director sets the policy to 'jobs'.
--
-- Additive + idempotent. Validated rolled-back on prod before apply.
-- ============================================================================

INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, schedulable, enabled, input_schema, expected_seconds)
VALUES
  ('scf.learner_notes',
   'SCF — Struggling-learner support note (loop generator)',
   'Loop generator: drafts a short, warm, private support note for a learner on a downward understanding trend, persisted as a DRAFT (status=draft) awaiting super-admin approval before any student sees it. Migrated onto the #1998 Max lane behind loops.scf_learner_notes.generation_lane — SEEDED direct (inert) pending the Director''s call on the student-facing boundary.',
   '{{prompt}}', 'none', 'job.result', false, 'max', 'seat_owner', true, true,
   '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb, 25)
ON CONFLICT (job_type) DO NOTHING;

-- SEEDED 'direct' (INERT) — the ONLY loop not seeded 'jobs'. Flip to 'jobs' is a
-- Director decision (student-facing boundary). Until then the loop is unchanged.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, publication_state)
SELECT
  'loops.scf_learner_notes.generation_lane', 'global', NULL,
  '"direct"'::jsonb,
  'Generation lane for the struggling-learner support-note loop generator. SEEDED direct (inert) pending the Director''s call on the student-facing ToS boundary; set to ''jobs'' to run drafting on the #1998 ai_jobs Max lane (₹0). Notes are staff-approved drafts before any student sees them.',
  'string', true, true, 'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'loops.scf_learner_notes.generation_lane'
     AND scope_type = 'global' AND scope_id IS NULL
);
