-- =============================================================================
-- NO-MECHANICS LEAK FIX — learner surfaces show the ACTION, never the diagnostic
-- (Director interview, 2026-07-09 07:20: "won't they start gaming the system?")
--
-- The learner loop-closure card and My Voice receipt were quoting the TEACHER'S
-- AI note summary verbatim — including sample sizes ("a small set of 3
-- responses"), averages ("2.33 out of 5") and trigger bands ("<=2"). In a
-- 3-person sample a learner can subtract themselves and infer classmates'
-- answers, and printed thresholds teach the trigger recipe (gaming).
--
-- Fix at DISPLAY time (covers every already-generated note): the learner-facing
-- "what your facilitator did" becomes the note's ACTION — quickWin, else the
-- first suggested adjustment's title, else a safe generic line. The full
-- diagnostic text remains visible to STAFF surfaces only (fn_scf_loop_activity
-- untouched). Generator prompts are de-numbered in the same PR so future
-- teacher notes speak in words, not counts.
-- =============================================================================

-- ── Mechanics detector for HISTORICAL note text ─────────────────────────────
-- Deep-review disposition (2026-07-09, rounds 1+2 — this resolves an
-- oscillation between two poles):
--   Round 1 (safety pole): pre-fix notes can embed mechanics in quickWin/title
--     → asked for a display-time guard.
--   Round 2 (richness pole): a blanket any-digit guard over-strips benign
--     action text ("spend 5 minutes revisiting…", "2 short practice
--     questions") → asked for targeted redaction.
--   Resolution: match DIAGNOSTIC mechanics patterns only — decimal averages,
--   rating ratios, comparator bands, sample-size phrasing (digit AND spelled),
--   percentages, and mechanics-speak words. VALIDATED AGAINST THE ENTIRE
--   HISTORICAL CORPUS (finite by construction — all future notes are generated
--   under the de-numbered prompts shipped in this same PR): as of 2026-07-09
--   the corpus holds 13 suggestions / 5 quickWins; the 4 digit-containing
--   candidates are ALL benign actions this fn preserves, and 0 mechanics
--   instances exist in quickWin/title (the round-1 leak lived in `summary`,
--   which learner surfaces no longer show). Novel mechanics phrasings beyond
--   these patterns are accepted residual risk for that finite corpus.
CREATE OR REPLACE FUNCTION public.fn_scf_text_leaks_mechanics(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $helper$
  SELECT p_text IS NOT NULL AND (
       p_text ~  '\d+\.\d+'                                  -- decimal averages: "2.33"
    OR p_text ~* '\d+\s*(/|out of)\s*(\d+|five|ten)'         -- rating ratios: "2/5", "2 out of 5"
    OR p_text ~* 'out of (five|ten)'                         -- word-form rating scale
    OR p_text ~  '(<=|>=)\s*\d' OR p_text ~ '[≤≥]\s*\d'      -- trigger bands: "<=2"
    OR p_text ~* '\d+\s*(response|respondent|answer)'        -- sample sizes: "3 responses"
    OR p_text ~* '(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[- ](response|respondent|answer)'
    OR p_text ~* '\d+\s*%'                                   -- percentages
    OR p_text ~* '(average|threshold|point (one|two|three|four|five|six|seven|eight|nine|zero))'
  );
$helper$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_text_leaks_mechanics(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_text_leaks_mechanics(text) TO authenticated;


-- ── fn_scf_loop_closure_for_learner: action-only the_change (display-time strip) ──
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
    -- institution_id is in SELECT + GROUP BY + the outer join keys (deep-review
    -- 2026-07-09 MEDIUM): mine/themed are one-row-per-institution (DISTINCT ON
    -- includes it); grouping acted by date+course alone would let a learner with
    -- same-day same-course feedback in two institutions join the OTHER tenant's
    -- suggestion text.
    SELECT t.institution_id,
           t.attendance_date,
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
              -- Historical-note guard (deep-review rounds 1+2 — see the
              -- fn_scf_text_leaks_mechanics header for the full disposition):
              -- a candidate field showing DIAGNOSTIC mechanics ("3 responses",
              -- "2.33 out of 5", "<=2", spelled-out forms) is disqualified;
              -- benign numeric actions ("spend 5 minutes revisiting…") are
              -- preserved. Per-field: a clean title still shows when quickWin
              -- is dirty; NULL/missing fields fall through the COALESCE.
              COALESCE(
                CASE WHEN NOT public.fn_scf_text_leaks_mechanics(s.suggestion->>'quickWin')
                     THEN NULLIF(btrim(s.suggestion->>'quickWin'), '') END,
                CASE WHEN NOT public.fn_scf_text_leaks_mechanics(s.suggestion->'suggestedAdjustments'->0->>'title')
                     THEN NULLIF(btrim(s.suggestion->'suggestedAdjustments'->0->>'title'), '') END,
                'adjusted the class based on this feedback theme'
              )
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
    GROUP BY t.institution_id, t.attendance_date, t.course_code
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
    ON  a.institution_id  = t.institution_id
    AND a.attendance_date = t.attendance_date
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_loop_closure_for_learner(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_loop_closure_for_learner(date, date) TO authenticated;


-- ── fn_scf_my_impact: action-only the_change (display-time strip) ──
CREATE OR REPLACE FUNCTION public.fn_scf_my_impact(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, course_code text, course_name text, my_understood smallint, flagged boolean, action_taken boolean, action_kind text, action_detail text, action_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    -- institution_id in SELECT + GROUP BY + outer join keys (deep-review
    -- 2026-07-09 MEDIUM): same cross-tenant collapse risk as loop_closure's acted.
    SELECT m.institution_id,
           m.attendance_date,
           m.course_code,
           true AS action_taken,
           (array_agg(
              CASE WHEN s.human_verdict = 'tried_helped' THEN 'verdict_worked'
                   ELSE 'suggestion_issued' END
              ORDER BY (s.human_verdict = 'tried_helped') DESC NULLS LAST, s.generated_at DESC
            ))[1] AS action_kind,
           (array_agg(
              -- Historical-note guard: same per-field mechanics disqualification
              -- as fn_scf_loop_closure_for_learner (see fn_scf_text_leaks_mechanics
              -- header for the rounds-1+2 disposition and corpus validation).
              COALESCE(
                CASE WHEN NOT public.fn_scf_text_leaks_mechanics(s.suggestion->>'quickWin')
                     THEN NULLIF(btrim(s.suggestion->>'quickWin'), '') END,
                CASE WHEN NOT public.fn_scf_text_leaks_mechanics(s.suggestion->'suggestedAdjustments'->0->>'title')
                     THEN NULLIF(btrim(s.suggestion->'suggestedAdjustments'->0->>'title'), '') END,
                'adjusted the class based on this feedback theme'
              )
              ORDER BY (s.human_verdict = 'tried_helped') DESC NULLS LAST, s.generated_at DESC
            ))[1] AS action_detail,
           (array_agg(
              -- IST local date (deep-review 2026-07-09 MEDIUM): must match
              -- loop_closure's action_date or the two learner surfaces disagree on
              -- the same action's date for notes generated after ~18:30 UTC.
              (s.generated_at AT TIME ZONE 'Asia/Kolkata')::date
              ORDER BY (s.human_verdict = 'tried_helped') DESC NULLS LAST, s.generated_at DESC
            ))[1] AS action_date
    FROM mine m
    JOIN public.scf_ai_suggestions s
      ON  s.domain                  = 'session_feedback'  -- deep-review 2026-07-09 HIGH: without
      AND s.kind                    = 'improvement'        -- these two filters (present in the sibling
                                                           -- loop_closure fn) a foreign-module or
                                                           -- success-kind row sharing inst/course/
                                                           -- faculty/window surfaces wrong action text.
      AND s.institution_id          = m.institution_id
      AND s.course_code             = m.course_code
      AND lower(s.faculty_email)    = m.faculty
      AND m.attendance_date BETWEEN s.window_from AND s.window_to
    WHERE m.my_understood <= 2
    GROUP BY m.institution_id, m.attendance_date, m.course_code
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
    ON  a.institution_id   = m.institution_id
    AND a.attendance_date  = m.attendance_date
    AND a.course_code IS NOT DISTINCT FROM m.course_code
  ORDER BY m.attendance_date DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_my_impact(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_my_impact(date, date) TO authenticated;


