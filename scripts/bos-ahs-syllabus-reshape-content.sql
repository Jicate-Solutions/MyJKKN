-- ============================================================================
-- BoS AHS — reshape bos_course_syllabi.ahs_content to the app contract.
-- ✔ RUN AGAINST THE **MyJKKN** DATABASE.
--
-- The initial seed stored each paper's fields at the ROOT of ahs_content:
--     { paper_no, title, mode, topics, units, reference_books, ... }
-- But the app's BosAhsContent type (types/bos.ts) + AhsContentCard editor read:
--     { intro?, academic_year?, subjects: [ { subject_no, title, lecture_hours,
--                                             mode, topics, units, reference_books } ] }
-- This wraps the single root paper as one subject so the /bos/syllabus form
-- renders + edits it. Idempotent: guarded on the presence of root `paper_no`,
-- so re-running after the reshape is a no-op.
-- ============================================================================

BEGIN;

UPDATE public.bos_course_syllabi
SET ahs_content = jsonb_strip_nulls(jsonb_build_object(
      'academic_year', academic_year,
      'intro',         ahs_content->>'notes',
      'subjects', jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'subject_no',        ahs_content->>'paper_no',
          'title',             ahs_content->>'title',
          'lecture_hours',     ahs_content->'lecture_hours',
          'mode',              COALESCE(ahs_content->>'mode', 'flat'),
          'topics',            COALESCE(ahs_content->'topics', '[]'::jsonb),
          'units',             COALESCE(ahs_content->'units', '[]'::jsonb),
          'reference_books',   COALESCE(ahs_content->'reference_books', '[]'::jsonb),
          'mark_distribution', ahs_content->'mark_distribution',
          'notes',             ahs_content->>'notes'
        ))
      )
    ))
WHERE academic_model = 'mgr_ahs'
  AND ahs_content ? 'paper_no';   -- only the un-reshaped root-paper rows

-- Verify: expect 74 rows each with a one-element subjects[] and no root paper_no.
-- SELECT count(*) FILTER (WHERE ahs_content ? 'subjects')  AS wrapped,
--        count(*) FILTER (WHERE ahs_content ? 'paper_no')  AS still_root
-- FROM bos_course_syllabi WHERE academic_model='mgr_ahs';

COMMIT;
