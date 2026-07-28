-- 20260801110000_curriculum_lesson_taxonomy_columns.sql
-- Taxonomy-aware lesson spine (P0, 2026-07-24). The lesson-spine generator was
-- Fink-primary for EVERY course, which contradicts each course's BoS-fixed taxonomy
-- (bos_regulation_taxonomies.taxonomy_type, joined via bos_course_syllabi.regulation_id).
-- Add a taxonomy discriminator + a Bloom-primary level ALONGSIDE the existing
-- primary_fink_dimension, so a lesson can be Fink-primary ('finks' regulations) OR
-- Bloom-primary ('blooms' regulations). Fink stays a HYBRID with Bloom — this is NOT a
-- Fink replacement; per-outcome fink_dimension + bloom_level are unchanged.
--
-- No data migration of the existing rows: legacy lessons keep primary_fink_dimension and
-- read as 'finks' by default (NULL primary_taxonomy => finks in the review UI). The
-- Arts-only Bloom backfill regenerates the mistagged Arts 'blooms' courses separately.

ALTER TABLE public.curriculum_lesson
  ADD COLUMN IF NOT EXISTS primary_taxonomy   text,
  ADD COLUMN IF NOT EXISTS primary_bloom_level text;

COMMENT ON COLUMN public.curriculum_lesson.primary_taxonomy IS
  'BoS-fixed taxonomy this lesson''s PRIMARY tag follows: ''finks'' (primary_fink_dimension set) or ''blooms'' (primary_bloom_level set). NULL = legacy/implicit finks.';
COMMENT ON COLUMN public.curriculum_lesson.primary_bloom_level IS
  'Bloom cognitive level (K1-K6) this lesson primarily targets, when primary_taxonomy=''blooms''. NULL for Fink-primary lessons.';

-- The discriminator is code-controlled (set from bos_regulation_taxonomies.taxonomy_type),
-- so a tight CHECK is safe. The Bloom level comes from the model — kept loose (app-side
-- normalized) so an unexpected label can never reject an otherwise-valid spine write.
ALTER TABLE public.curriculum_lesson
  DROP CONSTRAINT IF EXISTS chk_curriculum_lesson_primary_taxonomy;
ALTER TABLE public.curriculum_lesson
  ADD CONSTRAINT chk_curriculum_lesson_primary_taxonomy
  CHECK (primary_taxonomy IS NULL OR primary_taxonomy IN ('finks','blooms'));
