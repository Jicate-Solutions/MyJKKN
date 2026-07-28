-- Migration: fn_pde_due_soon_reminders — recipients for the "due tomorrow" nudge.
--
-- User decision 2026-07-23: add a reminder the day before a case deadline. This
-- function returns one row per assigned learner who should get that nudge:
--   • their section has a case-assignment whose due_at falls on p_due_date (IST),
--   • they are enrolled in the case's course,
--   • the case is still published + active + a clinical case, and
--   • they have NOT already completed it (no pde_submissions row).
--
-- Works for both open (nudged) and class_only (locked) assignments — the reminder
-- follows the assignment's due_at, not the visibility mode. IST date boundary:
-- due_at is stored as end-of-day IST (see the assign form), so
-- (due_at AT TIME ZONE 'Asia/Kolkata')::date is the calendar day it is due.
--
-- Cron-only: called by /api/cron/pde-case-due-soon via the service role. Granted
-- to service_role ONLY (a standard authenticated grant here would be a cross-tenant
-- reader); anon/PUBLIC/authenticated EXECUTE explicitly revoked.
--
-- Date: 2026-07-23

CREATE OR REPLACE FUNCTION public.fn_pde_due_soon_reminders(p_due_date date)
RETURNS TABLE(assessment_id uuid, case_title text, user_id uuid, due_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    a.id       AS assessment_id,
    a.title    AS case_title,
    pr.id      AS user_id,
    asg.due_at AS due_at
  FROM pde_case_assignments asg
  JOIN pde_assessments a  ON a.id = asg.assessment_id
  JOIN learners_profiles lp ON lp.section_id = asg.section_id
  JOIN profiles pr        ON pr.learner_id = lp.id
  JOIN vac_enrollments ve ON ve.user_id = pr.id AND ve.course_id = a.course_id
  WHERE asg.due_at IS NOT NULL
    AND (asg.due_at AT TIME ZONE 'Asia/Kolkata')::date = p_due_date
    AND a.status = 'published'
    AND a.is_active
    AND a.assessment_type = 'clinical_case'
    AND NOT EXISTS (
      SELECT 1 FROM pde_submissions s
      WHERE s.assessment_id = a.id AND s.learner_id = pr.id
    );
$$;

REVOKE ALL    ON FUNCTION public.fn_pde_due_soon_reminders(date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_pde_due_soon_reminders(date) TO service_role;
