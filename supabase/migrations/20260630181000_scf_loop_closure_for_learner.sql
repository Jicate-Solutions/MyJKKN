-- 20260630181000_scf_loop_closure_for_learner.sql
-- SCF self-improving loop · LEARNER LANE · #3b "visibly close the loop to the learner".
--
-- Surfaces, to the learner, the SPECIFIC change THEIR OWN feedback caused — and the win:
--   their input theme  →  the facilitator's change  →  THEIR understanding rose.
--
-- HONESTY CONTRACT (load-bearing):
--   • The "understanding rose" headline is computed from the LEARNER'S OWN later
--     session_feedback rows (a subsequent same-course session after the change), never
--     from a cohort/class mean. my_prior_understood and my_next_understood are this one
--     learner's own 1..5 ratings.
--   • cohort_lift (scf_ai_suggestions.outcome_lift) IS a class-wide mean. It is returned
--     ONLY so the UI can show an explicitly-labelled "across the class" corroboration line.
--     It must NEVER be rendered as the individual learner's number. (Brief: "NEVER present
--     a cohort/class mean as the individual's value.")
--   • A row is returned only when a REAL downstream action exists (a scf_ai_suggestions row
--     whose generation window contains the flagged session, same institution+course+faculty).
--     No suggestion => no row => no fabricated loop-closure.
--
-- Identity chain (mirrors fn_scf_my_impact / fn_scf_carryforward_for_learner):
--   auth.uid() == profiles.id == learners_profiles.profile_id ; session_feedback.student_id
--   == learners_profiles.id. The fn resolves v_lp from auth.uid() and filters every read to it.

CREATE OR REPLACE FUNCTION public.fn_scf_loop_closure_for_learner(
  p_from date,
  p_to   date
)
RETURNS TABLE(
  attendance_date       date,        -- the flagged class (the learner's input)
  course_code           text,
  course_name           text,
  my_prior_understood   smallint,    -- THIS learner's own rating in the flagged class (1..2)
  input_theme           text[],      -- active checklist item_keys the learner left false (their "what was wrong")
  the_change            text,        -- suggestion->>'summary' — what the facilitator was advised / did
  action_kind           text,        -- 'verdict_worked' (teacher attested it helped) | 'suggestion_issued'
  action_date           date,        -- when that suggestion was generated
  cohort_lift           numeric,     -- CLASS-WIDE mean lift. UI: label "across the class" ONLY; never the learner's value.
  my_next_understood    smallint,    -- THIS learner's own rating in their earliest later same-course session
  my_next_date          date,
  my_understanding_rose boolean,     -- my_next_understood > my_prior_understood (the learner's OWN win)
  my_delta              smallint     -- my_next_understood - my_prior_understood (null until a later session exists)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_loop_closure_for_learner: not authenticated';
  END IF;
  SELECT lp.id INTO v_lp
  FROM public.learners_profiles lp
  WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;   -- caller is not a learner -> empty

  RETURN QUERY
  WITH
  -- The learner's OWN flagged classes (understood <= 2) in the window.
  mine AS (
    -- One row per flagged class. A learner can have >1 feedback row for the same
    -- class (e.g. async + live_poll, both understood<=2); without DISTINCT ON they
    -- would multiply into duplicate loop-closure cards. Keep the most-flagged
    -- (lowest understood), earliest.
    SELECT DISTINCT ON (f.institution_id, f.attendance_date, f.course_code)
           f.institution_id,
           f.attendance_date,
           f.course_code,
           f.course_name,
           lower(f.faculty_email) AS faculty,
           f.understood           AS my_understood,
           f.checklist
    FROM public.session_feedback f
    WHERE f.student_id = v_lp
      AND f.attendance_date BETWEEN p_from AND p_to
      AND f.understood <= 2
      AND f.course_code IS NOT NULL
    ORDER BY f.institution_id, f.attendance_date, f.course_code, f.understood ASC, f.created_at ASC
  ),
  -- Their input theme: the active checklist items they left false on the flagged row.
  themed AS (
    SELECT m.*,
           ARRAY(
             SELECT c.item_key
             FROM public.session_feedback_checklist_config c
             WHERE c.is_active = true
               AND (c.institution_id IS NULL OR c.institution_id = m.institution_id)
               AND COALESCE((m.checklist ->> c.item_key)::boolean, false) = false
             ORDER BY c.sort_order
           ) AS unmet_items
    FROM mine m
  ),
  -- The ONE strongest real action per flagged class, traceable to this learner's own flag:
  -- an AI suggestion issued to THIS teacher whose generation window CONTAINS this session.
  -- Strongest wins (teacher attested 'helped' > merely issued), tie-broken by recency.
  -- Mirrors fn_scf_my_impact.acted, plus carries outcome_lift (class-wide) for corroboration.
  acted AS (
    SELECT t.attendance_date,
           t.course_code,
           (array_agg(
              CASE WHEN s.human_verdict = 'tried_helped' THEN 'verdict_worked'
                   ELSE 'suggestion_issued' END
              ORDER BY (s.human_verdict = 'tried_helped') DESC NULLS LAST, s.generated_at DESC
            ))[1] AS action_kind,
           (array_agg(
              NULLIF(btrim(s.suggestion->>'summary'), '')
              ORDER BY (s.human_verdict = 'tried_helped') DESC NULLS LAST, s.generated_at DESC
            ))[1] AS the_change,
           (array_agg(
              (s.generated_at AT TIME ZONE 'Asia/Kolkata')::date   -- IST local date, matches attendance_date keys
              ORDER BY (s.human_verdict = 'tried_helped') DESC NULLS LAST, s.generated_at DESC
            ))[1] AS action_date,
           (array_agg(
              s.outcome_lift
              ORDER BY (s.human_verdict = 'tried_helped') DESC NULLS LAST, s.generated_at DESC
            ))[1] AS cohort_lift
    FROM themed t
    JOIN public.scf_ai_suggestions s
      ON  s.domain               = 'session_feedback'   -- SCF suggestions only, not other modules' rows
      AND s.kind                 = 'improvement'         -- only the "here's how to fix it" path has a `summary`;
                                                         -- a success row's the_change would be NULL → a hollow
                                                         -- "you changed this class" with no actual change.
      AND s.institution_id       = t.institution_id
      AND s.course_code          = t.course_code
      AND lower(s.faculty_email) = t.faculty
      AND t.attendance_date BETWEEN s.window_from AND s.window_to
    GROUP BY t.attendance_date, t.course_code
  )
  SELECT
    t.attendance_date,
    t.course_code,
    t.course_name,
    t.my_understood::smallint                          AS my_prior_understood,
    t.unmet_items::text[]                              AS input_theme,
    a.the_change,
    a.action_kind,
    a.action_date,
    a.cohort_lift,
    nx.understood::smallint                            AS my_next_understood,
    nx.attendance_date                                 AS my_next_date,
    (nx.understood IS NOT NULL AND nx.understood > t.my_understood) AS my_understanding_rose,
    CASE WHEN nx.understood IS NOT NULL
         THEN (nx.understood - t.my_understood)::smallint
         ELSE NULL END                                 AS my_delta
  FROM themed t
  JOIN acted a
    ON  a.attendance_date = t.attendance_date
    AND a.course_code IS NOT DISTINCT FROM t.course_code
  -- The learner's OWN earliest subsequent same-course session AFTER the change took effect
  -- (strictly after both the flagged date and the suggestion date). Their own rating only.
  LEFT JOIN LATERAL (
    SELECT f2.understood, f2.attendance_date
    FROM public.session_feedback f2
    WHERE f2.student_id = v_lp
      AND f2.course_code = t.course_code
      AND f2.understood IS NOT NULL    -- a null next rating must not read as a real later session ("awaiting")
      AND f2.attendance_date > GREATEST(t.attendance_date, COALESCE(a.action_date, t.attendance_date))
    ORDER BY f2.attendance_date ASC, f2.created_at ASC
    LIMIT 1
  ) nx ON true
  ORDER BY t.attendance_date DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_loop_closure_for_learner(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_loop_closure_for_learner(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
