-- Migration: fn_pde_due_soon_reminders v2 — audience = "hasn't passed yet, tries left".
--
-- User decision 2026-07-24: the "due" reminder should reach anyone who has not
-- PASSED the case yet AND still has attempts remaining — not just learners who
-- never opened it. v1 excluded everyone with any submission; v2 excludes only
-- learners who have a PASSED submission, or who have used up their attempt cap.
--
-- The attempt cap is a global policy (fn_get_policy_clinical_reasoning has no
-- institution arg); the cron reads it and passes it as p_max_attempts. The
-- DEFAULT 5 keeps the previous 1-arg call site working through the deploy (the
-- old #2294 cron calls fn(date)); the new cron passes the real cap explicitly.
--
-- Signature change (new p_max_attempts arg) requires DROP + CREATE. Still
-- service_role-only; anon/PUBLIC/authenticated EXECUTE revoked.
--
-- Date: 2026-07-24

DROP FUNCTION IF EXISTS public.fn_pde_due_soon_reminders(date);

CREATE FUNCTION public.fn_pde_due_soon_reminders(p_due_date date, p_max_attempts int DEFAULT 5)
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
    -- Not passed yet: exclude only learners who already have a PASSED attempt.
    AND NOT EXISTS (
      SELECT 1 FROM pde_submissions sp
      WHERE sp.assessment_id = a.id AND sp.learner_id = pr.id AND sp.passed IS TRUE
    )
    -- Still has tries: exclude learners who have used their whole attempt cap
    -- (reminding them is pointless — they cannot start another attempt).
    AND (
      SELECT count(*) FROM pde_submissions sc
      WHERE sc.assessment_id = a.id AND sc.learner_id = pr.id
    ) < p_max_attempts;
$$;

REVOKE ALL    ON FUNCTION public.fn_pde_due_soon_reminders(date, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_pde_due_soon_reminders(date, int) TO service_role;
