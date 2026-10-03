-- Updated: 2026-10-01 - Recover the learner session scores that were thrown away.
--
-- WHAT WAS WRONG, measured on production 2026-10-01.
--
-- session_feedback.understood is a SMALLINT 1..5 (the class poll seeds it as
-- `kind: 'scale'`, options 1,2,3,4,5, labels ARE the numbers). The adapter that
-- copies it into the feedback spine wrote:
--
--     rating: r.understood === true ? 1 : r.understood === false ? 0 : null
--
-- A number is never strictly true or false in JavaScript, so EVERY score became
-- NULL. Zero of 67,190 ingested session rows carries a rating. The scores were
-- preserved only incidentally, inside raw->>'understood'.
--
--   score 5 : 16,424      score 2 :   329
--   score 4 : 35,213      score 1 :   205
--   score 3 :  9,159
--
-- 534 learners said they did NOT understand (1 or 2). Those are the ones the
-- teaching loop most needed to see, and no screen could.
--
-- Separately, the adapter reads the newest 1,000 source rows per run with no
-- "not yet ingested" filter, so 148,748 of 215,938 source rows were NEVER
-- ingested at all (the oldest missing is 6 July). The view below closes that by
-- doing the anti-join in the database, which PostgREST cannot express.
--
-- NOTHING here is destructive: one UPDATE that fills a column that is NULL on
-- every affected row, one INSERT guarded by the existing (source, source_ref)
-- unique key, and one new read-only view.
--
-- EXPECTED AFTER APPLYING: feedback_events grows by ~148,748 and the count of
-- rows with ai_processed_at IS NULL rises to roughly 210,000. That is BY DESIGN
-- and is not a backlog: those rows have no free text, and the AI classifier
-- filters `content IS NOT NULL` on purpose. Judge the classifier by the rows
-- that HAVE text, never by this total.

-- ---------------------------------------------------------------------------
-- 1. The pending-ingest view. Lets the adapter ask for source rows that are not
--    in the spine yet, oldest first, instead of re-reading the newest 1,000 for
--    ever. security_invoker keeps the caller's own permissions in force.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_session_feedback_pending_ingest
WITH (security_invoker = on) AS
SELECT sf.id,
       sf.institution_id,
       sf.student_id,
       sf.timetable_id,
       sf.course_code,
       sf.course_name,
       sf.faculty_email,
       sf.attendance_date,
       sf.understood,
       sf.checklist,
       sf.free_text,
       sf.created_at
  FROM public.session_feedback sf
 WHERE NOT EXISTS (
         SELECT 1
           FROM public.feedback_events fe
          WHERE fe.source = 'session_feedback'
            AND fe.source_ref = sf.id::text
       );

COMMENT ON VIEW public.v_session_feedback_pending_ingest IS
  'Session-feedback rows not yet copied into feedback_events. Exists because PostgREST cannot express the anti-join, and without it the adapter re-read the newest 1,000 rows every run and never reached the other 148,748 (measured 2026-10-01). Read-only; security_invoker keeps the caller''s own row permissions.';

REVOKE ALL ON public.v_session_feedback_pending_ingest FROM anon, PUBLIC;
GRANT SELECT ON public.v_session_feedback_pending_ingest TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Recover the discarded scores for rows already in the spine.
--    Touches only rows whose rating is NULL, so it cannot overwrite a real
--    value and is safe to re-run.
-- ---------------------------------------------------------------------------
UPDATE public.feedback_events
   SET rating = (raw->>'understood')::numeric,
       updated_at = now()
 WHERE source = 'session_feedback'
   AND rating IS NULL
   AND jsonb_typeof(raw->'understood') = 'number';

-- ---------------------------------------------------------------------------
-- 3. Ingest the source rows that were never copied across. Column-for-column
--    the same mapping the adapter uses, with the score mapped correctly.
--    ON CONFLICT DO NOTHING leans on feedback_events_source_ref_key, so this
--    is idempotent.
-- ---------------------------------------------------------------------------
INSERT INTO public.feedback_events
  (source, source_ref, institution_id, actor_type, actor_ref,
   target_type, target_ref, event_type, content, rating, raw, occurred_at)
SELECT 'session_feedback',
       sf.id::text,
       sf.institution_id,
       'learner',
       sf.student_id::text,
       'session',
       COALESCE(sf.timetable_id::text, sf.course_code),
       'rating',
       NULLIF(btrim(COALESCE(sf.free_text, '')), ''),
       sf.understood::numeric,
       jsonb_build_object(
         'course_code',     sf.course_code,
         'course_name',     sf.course_name,
         'faculty_email',   sf.faculty_email,
         'attendance_date', sf.attendance_date,
         'understood',      sf.understood,
         'checklist',       sf.checklist
       ),
       sf.created_at
  FROM public.session_feedback sf
 WHERE NOT EXISTS (
         SELECT 1
           FROM public.feedback_events fe
          WHERE fe.source = 'session_feedback'
            AND fe.source_ref = sf.id::text
       )
ON CONFLICT (source, source_ref) DO NOTHING;
