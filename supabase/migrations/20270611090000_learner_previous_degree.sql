-- 20270611090000_learner_previous_degree.sql
-- Added: 2026-09-30 — postgraduate applicants get a real "previous degree" record.
--
-- WHY THIS EXISTS
-- ---------------
-- The Director could not decide a scholarship for an MDS applicant because the
-- profile showed almost nothing about their degree. For postgraduate applicants
-- the enquiry form had only two optional boxes, and it stored them INSIDE the
-- 12th-standard marks (twelfth_marks.course_name / twelfth_marks.percentage). So:
--   * university, year of passing, CGPA, and the entrance exam, score and rank
--     were never asked;
--   * 11 of 839 postgraduate learners had a degree named at all;
--   * when a counsellor filled the school-level boxes instead, the profile showed
--     the 12th-standard percentage labelled as the degree percentage.
--
-- DIRECTOR RULINGS (2026-09-30)
--   * Ask the full set: degree, college, university, year of passing, marks as a
--     percentage or CGPA, entrance exam, entrance score and rank (+ mark sheet and
--     scorecard uploads, built separately).
--   * Required for EVERY postgraduate record on save, old ones included — enforced
--     by the enquiry form, not by a database constraint, so a draft save, a status
--     change or a bulk import is never blocked.
--   * The profile shows a "Previous degree" section, and still shows 10th, 12th
--     and NEET marks underneath when they exist.
--
-- SHAPE
--   previous_degree jsonb, one object:
--     degree_name, university, year_of_passing, score_type ('percentage'|'cgpa'),
--     score, entrance_exam, entrance_score, entrance_rank
--   The college stays in last_school ("College Name & Place"), as today.
--
-- BACKFILL
--   The 11 postgraduate learners whose twelfth_marks.course_name is filled typed a
--   degree name and a degree percentage into the old boxes. Copy those two values
--   across. twelfth_marks is left exactly as it is. For every OTHER postgraduate
--   learner, twelfth_marks.percentage is a real 12th-standard figure and is NOT
--   copied: that mislabelling is the bug this file fixes.

ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS previous_degree jsonb;

COMMENT ON COLUMN public.learners_profiles.previous_degree IS
  'Postgraduate applicants only: the qualifying degree (Director ruling 2026-09-30). Keys: degree_name, university, year_of_passing, score_type (percentage|cgpa), score, entrance_exam, entrance_score, entrance_rank. The college is last_school. Required on save by the enquiry form for postgraduate programmes.';

UPDATE public.learners_profiles lp
   SET previous_degree = jsonb_strip_nulls(jsonb_build_object(
         'degree_name', btrim(lp.twelfth_marks->>'course_name'),
         'score',       NULLIF(btrim(lp.twelfth_marks->>'percentage'), ''),
         'score_type',  CASE WHEN NULLIF(btrim(lp.twelfth_marks->>'percentage'), '') IS NOT NULL
                             THEN 'percentage' END))
  FROM public.degrees d
 WHERE d.id = lp.degree_id
   AND d.degree_type::text = 'pg'
   AND lp.previous_degree IS NULL
   AND NULLIF(btrim(lp.twelfth_marks->>'course_name'), '') IS NOT NULL;
