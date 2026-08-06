-- Phase 0 of the Freshers-semester removal (2026-08-05).
-- Rollback snapshot taken BEFORE any reassignment. Captures every learner the
-- migration will touch: those sitting on a Freshers semester, plus those already
-- moved to a real semester by hand but still holding a stale Freshers section
-- (a semester-scoped WHERE would miss that second group entirely).
CREATE TABLE IF NOT EXISTS public.freshers_removal_backup_20260805 (
  learner_id       uuid PRIMARY KEY,
  first_name       text,
  last_name        text,
  lifecycle_status text,
  institution_id   uuid,
  program_id       uuid,
  old_semester_id  uuid,
  old_section_id   uuid,
  reason           text NOT NULL,
  captured_at      timestamptz NOT NULL DEFAULT now()
);

-- Contains learner PII: deny-all RLS (no policies) so only the service role reads it.
ALTER TABLE public.freshers_removal_backup_20260805 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.freshers_removal_backup_20260805 FROM anon, authenticated;

INSERT INTO public.freshers_removal_backup_20260805
  (learner_id, first_name, last_name, lifecycle_status, institution_id,
   program_id, old_semester_id, old_section_id, reason)
SELECT lp.id, lp.first_name, lp.last_name, lp.lifecycle_status::text,
       lp.institution_id, lp.program_id, lp.semester_id, lp.section_id,
       CASE WHEN fs.id IS NOT NULL THEN 'on_freshers_semester'
            ELSE 'stale_freshers_section' END
FROM learners_profiles lp
LEFT JOIN semesters fs ON fs.id = lp.semester_id AND fs.semester_order = 0
WHERE fs.id IS NOT NULL
   OR lp.section_id IN (
        SELECT se.id FROM sections se
        JOIN semesters s2 ON s2.id = se.semester_id AND s2.semester_order = 0)
ON CONFLICT (learner_id) DO NOTHING;

-- Full row copies of everything Phase 3 will delete, so the exact ids survive.
CREATE TABLE IF NOT EXISTS public.freshers_semesters_backup_20260805 AS
  SELECT * FROM public.semesters WHERE semester_order = 0;

CREATE TABLE IF NOT EXISTS public.freshers_sections_backup_20260805 AS
  SELECT se.* FROM public.sections se
  JOIN public.semesters s ON s.id = se.semester_id AND s.semester_order = 0;

ALTER TABLE public.freshers_semesters_backup_20260805 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freshers_sections_backup_20260805  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.freshers_semesters_backup_20260805 FROM anon, authenticated;
REVOKE ALL ON public.freshers_sections_backup_20260805  FROM anon, authenticated;
