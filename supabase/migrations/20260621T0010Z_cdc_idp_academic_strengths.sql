-- 2026-06-21 — BUG-004061: Add "My Academic Strengths" question to the CDC IDP create form.
--
-- Adds a free-text narrative column to cdc_idp_responses. This is DISTINCT from
-- skills_self_attribution: that column is a text[] tag array of self-rated skills,
-- whereas academic_strengths holds a written paragraph answering the question
-- "In your own words, what are your academic strengths?".
--
-- Nullable so existing rows (and Google-Form-imported responses) remain valid.
-- Idempotent: safe to re-run.

ALTER TABLE public.cdc_idp_responses
  ADD COLUMN IF NOT EXISTS academic_strengths text;

COMMENT ON COLUMN public.cdc_idp_responses.academic_strengths IS
  'BUG-004061: Free-text "My Academic Strengths" narrative answered by the learner. Distinct from skills_self_attribution (text[] tag array of self-rated skills). Nullable.';
