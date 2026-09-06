-- =============================================================================
-- 20260520_pde_demonstrations_course_linkage.sql
-- PDE Tier 4 — T4.2: course + lesson linkage substrate.
-- =============================================================================
--
-- Adds two nullable FK columns to pde_demonstrations so demonstrations can be
-- optionally tied to an academic course (public.courses) and/or a specific
-- lesson (public.vac_lessons — the canonical lessons table in this codebase).
--
-- Why nullable + ON DELETE SET NULL
-- ---------------------------------
-- Many demonstrations (bridged legacy artifacts, free-form learner submissions,
-- bridge-imports) won't have a course association. Nullable preserves the
-- substrate; ON DELETE SET NULL ensures a course/lesson deletion never
-- cascades into demo loss.
--
-- FK targets verified via information_schema at apply-time
-- -------------------------------------------------------
--   * courses(id)      — uuid PK (canonical academic courses table)
--   * vac_lessons(id)  — uuid PK (the only lessons-shaped table in public)
--
-- Idempotent: every ADD COLUMN uses IF NOT EXISTS; each constraint is wrapped
-- in a pg_constraint existence guard. No INSERT smoke tests (per the
-- feedback_smoke_test_must_include_all_not_null_columns lock).
-- =============================================================================

ALTER TABLE public.pde_demonstrations
  ADD COLUMN IF NOT EXISTS course_id uuid;

ALTER TABLE public.pde_demonstrations
  ADD COLUMN IF NOT EXISTS lesson_id uuid;

-- FK to courses(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pde_demonstrations_course_id_fkey'
      AND conrelid = 'public.pde_demonstrations'::regclass
  ) THEN
    ALTER TABLE public.pde_demonstrations
      ADD CONSTRAINT pde_demonstrations_course_id_fkey
      FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- FK to vac_lessons(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pde_demonstrations_lesson_id_fkey'
      AND conrelid = 'public.pde_demonstrations'::regclass
  ) THEN
    ALTER TABLE public.pde_demonstrations
      ADD CONSTRAINT pde_demonstrations_lesson_id_fkey
      FOREIGN KEY (lesson_id) REFERENCES public.vac_lessons(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Partial indexes: only non-NULL rows go in the index (most demos won't have
-- a course/lesson, so the index stays compact).
CREATE INDEX IF NOT EXISTS idx_pde_demonstrations_course_id
  ON public.pde_demonstrations(course_id)
  WHERE course_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pde_demonstrations_lesson_id
  ON public.pde_demonstrations(lesson_id)
  WHERE lesson_id IS NOT NULL;

COMMENT ON COLUMN public.pde_demonstrations.course_id IS
  'Optional FK to public.courses. Nullable — many demos have no course association. Set NULL on course delete (substrate preserved).';

COMMENT ON COLUMN public.pde_demonstrations.lesson_id IS
  'Optional FK to public.vac_lessons. Nullable — finer-grained linkage than course_id; set NULL on lesson delete.';
