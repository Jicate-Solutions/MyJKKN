-- ============================================================================
-- 20260722000500 — Stop a failing score being hidden behind inactivity
-- ============================================================================
-- `pde_at_risk_learners` classifies a learner with a single CASE:
--
--     days_inactive > 7            -> 'critical'
--     days_inactive > 3            -> 'warning'
--     avg(assessment_avg_score)<50 -> 'struggling'
--     else                         -> 'on_track'
--
-- Because a CASE returns exactly one branch, INACTIVITY MASKS A FAILING SCORE.
-- A learner who has not logged in for five days AND is averaging 20% is
-- labelled 'warning' — indistinguishable from a five-day-absent learner who is
-- averaging 90%. The struggling count therefore undercounts, and triage sorts
-- by absence rather than by who is actually failing.
--
-- (Worth recording, because the change was requested on a different premise: an
-- ACTIVE learner scoring 20% *is* already flagged 'struggling' today. Verified
-- empirically against the live CASE before writing this. The real defect is the
-- masking above, not the active-low-scorer case.)
--
-- FIX: leave `risk_level` exactly as it is — it is read by the admin page, the
-- new at-risk cron and the history rollup, and silently redefining it would
-- change flag history semantics mid-flight. Instead append two independent
-- signals that no branch can hide:
--
--   is_low_scoring         — averaging below the pass mark, regardless of band
--   has_assessment_scores  — whether there is any score evidence at all
--
-- The second exists because `NULL < 50` is NULL, so a learner with no completed
-- assessments falls through to 'on_track'. That is arguably right (absence of
-- evidence is not evidence of failure) but it is currently indistinguishable
-- from a genuinely healthy learner, so the surface can now tell them apart.
--
-- CREATE OR REPLACE VIEW requires the existing columns to keep their names,
-- types and order — both new columns are appended at the end, so every current
-- consumer is unaffected.
--
-- Director decision 2026-07-21: a struggling learner must not be invisible.
-- ============================================================================

CREATE OR REPLACE VIEW public.pde_at_risk_learners AS
SELECT
  e.learner_id,
  e.course_id,
  p.full_name,
  p.email,
  max(e.date) AS last_active_date,
  CURRENT_DATE - max(e.date) AS days_inactive,
  avg(e.assessment_avg_score) AS avg_score,
  sum(e.time_spent_minutes) AS total_time,
  sum(e.lessons_completed) AS total_lessons_completed,
  CASE
    WHEN (CURRENT_DATE - max(e.date)) > 7 THEN 'critical'::text
    WHEN (CURRENT_DATE - max(e.date)) > 3 THEN 'warning'::text
    WHEN avg(e.assessment_avg_score) < 50::numeric THEN 'struggling'::text
    ELSE 'on_track'::text
  END AS risk_level,
  -- Unmaskable: true whenever the learner is averaging below the pass mark,
  -- whatever band the CASE above assigned. COALESCE to false so a learner with
  -- no scores reads as "not known to be failing" rather than NULL.
  COALESCE(avg(e.assessment_avg_score) < 50::numeric, false) AS is_low_scoring,
  -- Distinguishes "healthy" from "no evidence either way".
  (count(e.assessment_avg_score) > 0) AS has_assessment_scores
FROM pde_engagement_daily e
LEFT JOIN profiles p ON e.learner_id = p.id
GROUP BY e.learner_id, e.course_id, p.full_name, p.email;

COMMENT ON VIEW public.pde_at_risk_learners IS
  'Live at-risk computation. risk_level is a single-branch CASE where inactivity outranks score; is_low_scoring exposes a failing average that the CASE would otherwise mask, and has_assessment_scores separates a healthy learner from one with no score evidence yet.';

NOTIFY pgrst, 'reload schema';
