-- 2026-07-08: Close the SCF loop at the STUDENT end, openly (Director directive).
-- Two-contract model: feedback stays ANONYMOUS TO THE FACILITATOR (k>=3 aggregates
-- only), while the SYSTEM personalises for the learner. This adds the learner's
-- explicit Better/Same/Worse on the note their own flag triggered - the loop's
-- fourth witness (facilitator verdict, avg lift, crowd witness, student confirm).

-- (1) The votes. System-visible; NEVER faculty-readable as rows.
CREATE TABLE IF NOT EXISTS public.scf_note_resolution_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES public.scf_ai_suggestions(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('better','same','worse')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (suggestion_id, learner_id)
);
ALTER TABLE public.scf_note_resolution_votes ENABLE ROW LEVEL SECURITY;
-- Learner reads own votes (the card shows "you said Better"); admins read all (audit).
-- Faculty get NO row access - only the k>=3 aggregate fn below.
DROP POLICY IF EXISTS "scf_note_resolution_votes_select" ON public.scf_note_resolution_votes;
CREATE POLICY "scf_note_resolution_votes_select" ON public.scf_note_resolution_votes
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR learner_id IN (SELECT lp.id FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid())
);
-- Writes ONLY via the SECURITY DEFINER RPC (no write policies, no write grants).
REVOKE ALL ON public.scf_note_resolution_votes FROM anon, PUBLIC;
GRANT SELECT ON public.scf_note_resolution_votes TO authenticated;

-- (2) Closure fn gains suggestion_id + my_resolution_vote (RETURNS change => drop+recreate).
DROP FUNCTION IF EXISTS public.fn_scf_loop_closure_for_learner(date, date);
CREATE OR REPLACE FUNCTION public.fn_scf_loop_closure_for_learner(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, course_code text, course_name text, my_prior_understood smallint, input_theme text[], the_change text, action_kind text, action_date date, cohort_lift numeric, my_next_understood smallint, my_next_date date, my_understanding_rose boolean, my_delta smallint, suggestion_id uuid, my_resolution_vote text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
              s.id
              ORDER BY (s.human_verdict = 'tried_helped') DESC NULLS LAST, s.generated_at DESC
            ))[1] AS suggestion_id,
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
         ELSE NULL END                                 AS my_delta,
    a.suggestion_id,
    rv.vote                                            AS my_resolution_vote
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
  LEFT JOIN public.scf_note_resolution_votes rv
    ON rv.suggestion_id = a.suggestion_id AND rv.learner_id = v_lp
  ORDER BY t.attendance_date DESC;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.fn_scf_loop_closure_for_learner(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_loop_closure_for_learner(date, date) TO authenticated;

-- (3) Cast the vote. Authority-bound: the caller must BE a learner whose own
-- flagged (<=2) session falls inside the suggestion's window - mirrors the
-- closure fn's join, so a learner can only vote on notes their flag fed.
CREATE OR REPLACE FUNCTION public.fn_scf_cast_resolution_vote(p_suggestion_id uuid, p_vote text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_cast_resolution_vote: not authenticated';
  END IF;
  IF p_vote NOT IN ('better','same','worse') THEN
    RAISE EXCEPTION 'fn_scf_cast_resolution_vote: invalid vote';
  END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN
    RAISE EXCEPTION 'fn_scf_cast_resolution_vote: caller is not a learner';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.scf_ai_suggestions s
    JOIN public.session_feedback f
      ON  f.student_id = v_lp
      AND f.course_code = s.course_code
      AND f.institution_id IS NOT DISTINCT FROM s.institution_id
      AND f.understood <= 2
      AND f.attendance_date BETWEEN s.window_from AND s.window_to
    WHERE s.id = p_suggestion_id
      AND s.domain = 'session_feedback'
      AND s.kind   = 'improvement'
  ) THEN
    RAISE EXCEPTION 'fn_scf_cast_resolution_vote: this note was not fed by your feedback';
  END IF;
  INSERT INTO public.scf_note_resolution_votes (suggestion_id, learner_id, vote)
  VALUES (p_suggestion_id, v_lp, p_vote)
  ON CONFLICT (suggestion_id, learner_id)
  DO UPDATE SET vote = EXCLUDED.vote, updated_at = now();
  RETURN true;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_scf_cast_resolution_vote(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_cast_resolution_vote(uuid, text) TO authenticated;

-- (4) The aggregate the OTHER side sees: k>=3 floor enforced IN the fn, so a
-- facilitator/leader can never reconstruct an individual from a tiny class.
CREATE OR REPLACE FUNCTION public.fn_scf_note_resolution_counts(p_suggestion_ids uuid[])
RETURNS TABLE(suggestion_id uuid, better integer, same integer, worse integer, total integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT v.suggestion_id,
         count(*) FILTER (WHERE v.vote = 'better')::int,
         count(*) FILTER (WHERE v.vote = 'same')::int,
         count(*) FILTER (WHERE v.vote = 'worse')::int,
         count(*)::int
  FROM public.scf_note_resolution_votes v
  WHERE auth.uid() IS NOT NULL
    AND v.suggestion_id = ANY(p_suggestion_ids)
  GROUP BY v.suggestion_id
  HAVING count(*) >= 3;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_scf_note_resolution_counts(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_note_resolution_counts(uuid[]) TO authenticated;
