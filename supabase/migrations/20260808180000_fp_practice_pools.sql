-- =============================================================================
-- Foundation — give a learner something to answer.
-- =============================================================================
-- 2026-07-31
--
-- WHY THIS EXISTS
-- fn_fp_record_attempt refuses to record anything unless the assessment it is
-- handed already exists:
--
--     IF NOT EXISTS (SELECT 1 FROM fp_assessments WHERE id = p_assessment_id)
--       THEN RAISE EXCEPTION 'assessment % not found'
--
-- Until now the only two fp_assessments rows in production were the July [PILOT]
-- NEET fixtures. The 116 authored Class-6 science questions belonged to no
-- assessment at all, so there was nothing a learner could have answered even if
-- a screen had existed. This migration closes that gap.
--
-- WHAT A "POOL" IS
-- One standing row per exam definition, kind='practice', cohort_id NULL, marked
-- with config->>'pool'. It is a container a practice run is recorded against,
-- NOT a fixed paper: no fp_assessment_items rows are created, because the set of
-- questions served differs every run. What was actually answered is recorded
-- exactly, per question, in fp_responses.
--
-- Chose a standing pool over minting an fp_assessments row per practice run
-- because the per-run alternative writes an assessment row for every learner ×
-- every session forever, to record something fp_responses already records. The
-- attempt row carries the timestamp and the score; the pool carries the identity
-- of what was practised.
--
-- Deliberately created for EVERY exam definition, not only the two with content
-- today. A pool with no active questions is inert — the practice route filters
-- on fp_items.is_active, so an empty exam simply offers nothing. This means
-- switching a batch of questions on is the ONLY remaining step to make them
-- answerable; no further migration or deploy is needed.
--
-- SAFETY
-- No new table, no new function, no grant change. Two idempotent inserts.
-- Re-running is a no-op. Nothing here activates any question: all 116 Class-6
-- items remain is_active = false and stay invisible to learners until the
-- sample review passes and somebody switches them on deliberately.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. One practice pool per exam definition.
-- ---------------------------------------------------------------------------
INSERT INTO fp_assessments (exam_definition_id, title, kind, config, is_active)
SELECT
  ed.id,
  'Practice — ' || ed.display_name,
  'practice',
  jsonb_build_object(
    'pool', true,
    'note', 'Standing practice pool. Questions are drawn per run; see fp_responses for what was answered.'
  ),
  true
FROM exam_definitions ed
WHERE NOT EXISTS (
  SELECT 1
  FROM fp_assessments a
  WHERE a.exam_definition_id = ed.id
    AND a.cohort_id IS NULL
    AND COALESCE((a.config ->> 'pool')::boolean, false) IS TRUE
);

-- ---------------------------------------------------------------------------
-- 2. How many questions one practice run serves.
-- ---------------------------------------------------------------------------
-- A config row rather than a constant, for the same reason the flag threshold
-- is one: the right number is discovered by watching learners use it, and
-- changing it must be a one-row UPDATE rather than a migration and a deploy.
-- Read server-side via fn_get_policy_int('foundation.practice.question_count', 10).
INSERT INTO platform_policies (
  policy_key, scope_type, scope_id, value, description,
  data_type, is_system, is_active, classification, publication_state
)
SELECT
  'foundation.practice.question_count',
  'global',
  NULL,
  to_jsonb(10),
  'How many questions one Foundation practice run serves. Drawn at random from the active questions of the chosen exam. Lower is friendlier for a young learner; higher gives mastery scoring more to work with. Default 10.',
  'number',
  false,
  true,
  -- platform_policies_classification_check allows only 'operational' | 'major'.
  -- Operational: tuning how many questions a run serves is a day-to-day call,
  -- not a governance decision the way the suppression threshold is.
  'operational',
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
  WHERE policy_key = 'foundation.practice.question_count'
    AND scope_type = 'global'
    AND scope_id IS NULL
);
