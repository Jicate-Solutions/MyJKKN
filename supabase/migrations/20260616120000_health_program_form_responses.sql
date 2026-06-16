-- 20260616120000_health_program_form_responses.sql
-- Wellness Programs — form builder (2026-06-16).
--
-- The per-day "quiz" became a Google-Forms-style form: one form can mix GRADED
-- choice fields (correct answers → quiz_score percent) and UNGRADED fields
-- (short text / paragraph / rating scale → survey responses only).
--
-- quiz_score (percent of graded fields correct) is UNCHANGED — it is still the
-- single value fn_health_program_impact reads, so every existing impact metric
-- keeps working. This migration only ADDS a column to capture the raw per-field
-- answers (graded + ungraded) so survey responses aren't lost. The form SPEC
-- itself still lives in health_program_days.quiz (JSONB) — no column change there.
--
-- Additive + idempotent. RLS already governs health_program_participation
-- (own rows on write, managers read all); the new column inherits those policies,
-- so no policy or grant change is required. Updated: supabase/SQL_FILE_INDEX.md.

ALTER TABLE public.health_program_participation
  ADD COLUMN IF NOT EXISTS form_responses JSONB;

COMMENT ON COLUMN public.health_program_participation.form_responses IS
  'Per-field answers for the day form: { [field_id]: optionId | optionId[] | text | number }. Graded + ungraded. quiz_score still holds the graded percent.';

-- Make PostgREST aware of the new column immediately (raw DDL leaves the schema
-- cache stale otherwise).
NOTIFY pgrst, 'reload schema';
