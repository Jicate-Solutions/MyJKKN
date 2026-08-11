-- ============================================================================
-- BoS AHS (Allied Health Sciences) — extend bos_course_syllabi for the
-- Dr. M.G.R. Medical University year/paper model.
--
-- Additive + backward-compatible: academic_model DEFAULTs 'anna_univ', so every
-- existing row keeps its current semantics and the existing CO-PO / Bloom / Fink
-- JSONB columns are untouched. AHS rows set academic_model = 'mgr_ahs' and carry
-- their content in the new JSONB columns instead.
--
-- Spec: docs/plans/2026-07-24-bos-ahs-course-syllabus-design.md §5.3
-- Consumed by: scripts/bos-ahs-syllabus-seed.sql (74 AHS papers).
-- ============================================================================

ALTER TABLE public.bos_course_syllabi
  ADD COLUMN IF NOT EXISTS academic_model      text NOT NULL DEFAULT 'anna_univ'
      CHECK (academic_model IN ('anna_univ', 'mgr_ahs')),
  ADD COLUMN IF NOT EXISTS academic_year       smallint,
  ADD COLUMN IF NOT EXISTS ahs_content          jsonb,   -- year→paper→topics/units tree + reference_books (+mark_distribution/lecture_hours)
  ADD COLUMN IF NOT EXISTS exam_scheme          jsonb,   -- per-paper marks matrix + question-paper pattern + internal-paper flag
  ADD COLUMN IF NOT EXISTS internship_postings  jsonb;   -- duration-based rotation postings

COMMENT ON COLUMN public.bos_course_syllabi.academic_model IS
  'Discriminator: anna_univ (semester / CO-PO / Bloom-Fink) vs mgr_ahs (year / paper / exam-scheme). Default anna_univ.';
COMMENT ON COLUMN public.bos_course_syllabi.academic_year IS
  'AHS (mgr_ahs) academic year 1|2|3. NULL for anna_univ rows.';
COMMENT ON COLUMN public.bos_course_syllabi.ahs_content IS
  'AHS content tree: {paper_no, title, mode:flat|units, topics[], units[], reference_books[], mark_distribution?, lecture_hours?, notes?}.';
COMMENT ON COLUMN public.bos_course_syllabi.exam_scheme IS
  'AHS examination scheme: {components[]{name,max,min}, question_pattern{...}, is_internal_paper, mark_distribution?}.';
COMMENT ON COLUMN public.bos_course_syllabi.internship_postings IS
  'AHS internship: {total_duration, postings[]{area,duration}, notes}.';

-- Optional: index AHS rows for the /bos/syllabus list filter (partial — small subset).
CREATE INDEX IF NOT EXISTS idx_bos_course_syllabi_academic_model
  ON public.bos_course_syllabi (academic_model)
  WHERE academic_model <> 'anna_univ';
