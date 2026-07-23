-- 20260628160000_scf_honest_reciprocity_wire.sql
-- HONEST "you spoke, we acted" reciprocity wire for the learner's voice receipt.
--
-- WHY THIS EXISTS (the bug it fixes):
--   The prior fn_scf_my_impact derived an `improved` boolean from the CLASS
--   AVERAGE understanding rising in the next session (cohort mean lift), then the
--   student receipt rendered "Your feedback moved the needle." That attributes a
--   COHORT effect to ONE learner — an ecological fallacy a red-team correctly
--   flagged. A class average can rise for a hundred reasons unrelated to this
--   learner's flag, and is no evidence that anyone "acted" on their voice.
--
-- THE HONEST REPLACEMENT:
--   For each session the learner FLAGGED (their own understood <= 2), report
--   whether a DISCRETE, RECORDED downstream action exists that is traceable to
--   THEIR voice: an AI teaching suggestion that was ISSUED TO THE TEACHER and
--   whose generation window CONTAINS this very session — i.e. the learner's own
--   flag was part of the feedback signal that produced it. Strength tiers:
--     'verdict_worked'    — the teacher attested human_verdict='tried_helped'
--     'suggestion_issued' — a suggestion was issued to the teacher for this class
--     NULL                — nothing yet (receipt makes NO causal claim)
--   We NEVER read outcome_lift / outcome_avg_understood here: those are class
--   averages, and a cohort effect must never be shown as one learner's doing.
--
--   Result: every causal claim shown to a student traces to a real, recorded,
--   class-specific action — not a mean. Renders an honest no-claim participation
--   ledger until such an action exists.
--
-- SUBSTRATE: scf_ai_suggestions (20260625120000_scf_self_improving_loop.sql);
--            session_feedback (20260615233000_session_feedback_substrate.sql).
-- ANON LOCK: per CLAUDE.md "Lock new RPCs from anon" — REVOKE anon+PUBLIC, GRANT
--            authenticated (the fn returns only the caller's own ratings).

-- The return TABLE shape changes (improved/next_attendance_date -> action_*),
-- so the old function must be dropped before redefining (CREATE OR REPLACE
-- cannot alter the OUT column list).
DROP FUNCTION IF EXISTS public.fn_scf_my_impact(date, date);

CREATE OR REPLACE FUNCTION public.fn_scf_my_impact(p_from date, p_to date)
RETURNS TABLE(
  attendance_date date,
  course_code     text,
  course_name     text,
  my_understood   smallint,
  flagged         boolean,
  action_taken    boolean,      -- a real, recorded downstream action exists for THIS flagged class
  action_kind     text,         -- 'verdict_worked' | 'suggestion_issued' | NULL
  action_detail   text,         -- the concrete summary of what the teacher was advised to do
  action_date     date          -- when that suggestion was generated
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_my_impact: not authenticated';
  END IF;
  -- The learner identity on the feedback row is learners_profiles.id
  -- (resolved from profile_id = auth.uid()), exactly as fn_scf_submit_feedback writes it.
  SELECT lp.id INTO v_lp
  FROM public.learners_profiles lp
  WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;   -- caller is not a learner -> empty receipt

  RETURN QUERY
  WITH
  -- The learner's OWN feedback rows in the window (their participation ledger).
  mine AS (
    SELECT f.institution_id,
           f.attendance_date,
           f.course_code,
           f.course_name,
           lower(f.faculty_email) AS faculty,
           f.understood AS my_understood
    FROM public.session_feedback f
    WHERE f.student_id = v_lp
      AND f.attendance_date BETWEEN p_from AND p_to
  ),
  -- The ONE discrete, student-traceable downstream action per flagged class: an
  -- AI suggestion issued to THIS teacher whose generation window CONTAINS this
  -- session (so the learner's own flag was part of the signal). Strongest action
  -- wins (teacher attested 'helped' > merely issued), tie-broken by recency.
  -- Only the learner's OWN flagged sessions (my_understood <= 2) can earn this.
  acted AS (
    SELECT m.attendance_date,
           m.course_code,
           true AS action_taken,
           (array_agg(
              CASE WHEN s.human_verdict = 'tried_helped' THEN 'verdict_worked'
                   ELSE 'suggestion_issued' END
              ORDER BY (s.human_verdict = 'tried_helped') DESC NULLS LAST, s.generated_at DESC
            ))[1] AS action_kind,
           (array_agg(
              NULLIF(btrim(s.suggestion->>'summary'), '')
              ORDER BY (s.human_verdict = 'tried_helped') DESC NULLS LAST, s.generated_at DESC
            ))[1] AS action_detail,
           (array_agg(
              s.generated_at::date
              ORDER BY (s.human_verdict = 'tried_helped') DESC NULLS LAST, s.generated_at DESC
            ))[1] AS action_date
    FROM mine m
    JOIN public.scf_ai_suggestions s
      ON  s.institution_id          = m.institution_id
      AND s.course_code             = m.course_code
      AND lower(s.faculty_email)    = m.faculty
      AND m.attendance_date BETWEEN s.window_from AND s.window_to
    WHERE m.my_understood <= 2
    GROUP BY m.attendance_date, m.course_code
  )
  SELECT m.attendance_date,
         m.course_code,
         m.course_name,
         m.my_understood,
         (m.my_understood <= 2)            AS flagged,
         COALESCE(a.action_taken, false)   AS action_taken,
         a.action_kind,
         a.action_detail,
         a.action_date
  FROM mine m
  LEFT JOIN acted a
    ON  a.attendance_date  = m.attendance_date
    AND a.course_code IS NOT DISTINCT FROM m.course_code
  ORDER BY m.attendance_date DESC;
END;
$function$;

COMMENT ON FUNCTION public.fn_scf_my_impact(date, date) IS
  'Learner private "your voice this term" receipt. One row per session the learner gave feedback on (their own rating + flagged). For flagged sessions, action_taken/action_kind/action_detail report a DISCRETE recorded faculty action (an scf_ai_suggestions row whose window contains the flagged session) traceable to the learner''s own voice — NEVER a class-average lift. Replaces the prior cohort-mean `improved` boolean (which falsely attributed a cohort effect to one learner). Anon-locked.';

REVOKE EXECUTE ON FUNCTION public.fn_scf_my_impact(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_my_impact(date, date) TO authenticated;

-- Refresh PostgREST's schema cache so the changed RPC is callable immediately.
NOTIFY pgrst, 'reload schema';
