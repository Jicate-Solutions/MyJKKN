-- =============================================================================
-- 20260710160000_scf_three_zone_retry_fairness.sql
-- Director interview 2026-07-10 (post moat-loop audit) — SQL half of decisions
-- 1, 6, 7. The TS half (three-zone prompt bands, sample-size in the cron
-- prompt, measured-unblocks regen guard, 5 retry slots, cross-peek) ships in
-- the same PR so DB language and AI language never disagree.
--
--   1. THREE-ZONE outcome language: lift < 0 = didn't help · 0–0.5 = "about
--      the same" · >= 0.5 = helped. A contradiction alert now requires an
--      actual DROP (lift < 0, was <= 0); a teacher who says "tried, helped"
--      over a +0.36 rise is no longer flaggable (383835 case: one screen said
--      "agreed" while the AI memory said "did NOT meaningfully improve").
--      The 0–0.5 zone lands in NEITHER agreed nor contradicted — the honest
--      visible gap, same pattern the fns already use for unknown verdicts.
--   7. FLAG FAIRNESS: accusation-grade surfaces (track record + contradiction
--      alerts) require >= 5 next-session answers (was 3). BOTH fns move
--      together — deep-review 2026-07-09 consensus requires the card and the
--      alert list to count the same rows. Everything else keeps k >= 3.
--   6. STUCK NOTES: an improvement note still unmeasured after 30 days (its
--      course likely ended for the term — no qualifying next session will
--      ever exist) is stamped outcome_unmeasurable_at and leaves the
--      measurer's candidate scan. Honest label; nothing is deleted.
-- =============================================================================

-- ── 6a. Column: the honest "could not be measured" stamp ────────────────────
ALTER TABLE public.scf_ai_suggestions
  ADD COLUMN IF NOT EXISTS outcome_unmeasurable_at timestamptz;

COMMENT ON COLUMN public.scf_ai_suggestions.outcome_unmeasurable_at IS
  'Stamped by fn_scf_measure_suggestion_outcomes when an improvement note has waited 30+ days with no qualifying next session (course likely ended). Excluded from candidate scans; surfaces read it as "could not be measured", not "waiting".';

-- ── 1+7. fn_scf_verdict_track_record — three zones + k>=5 ───────────────────
-- Body identical to the deployed (permission-gated) version except:
--   • measured/agreed/contradicted floors: outcome_responses >= 5 (was 3)
--   • agreed:       tried_helped needs lift >= 0.5 (was > 0)
--   • contradicted: tried_helped needs lift < 0    (was <= 0)
CREATE OR REPLACE FUNCTION public.fn_scf_verdict_track_record(p_from date, p_to date)
 RETURNS TABLE(faculty_email text, institution_id uuid, verdicts integer, measured integer, agreed integer, contradicted integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean; v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_verdict_track_record: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.verdict_report.view')),
         lower(p.email)
    INTO v_inst, v_super, v_allowed, v_email
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_verdict_track_record: not authorized';
  END IF;

  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  SELECT s.faculty_email,
         s.institution_id,
         count(*)::int AS verdicts,
         -- k>=5 floor on EVERY measured bucket (Director 2026-07-10, decision
         -- 7): claims ABOUT A PERSON need sturdier evidence than a 3-answer
         -- class. Must match fn_scf_verdict_contradictions exactly (deep-review
         -- 2026-07-09 consensus), or the card can show a "contradicted" mark
         -- the alert list suppresses. Sub-floor rows read as awaiting.
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL
           AND COALESCE(s.outcome_responses, 0) >= 5)::int AS measured,
         -- agreed is computed POSITIVELY: an unexpected future verdict value
         -- lands in NEITHER bucket (an honest visible gap). Three-zone rule:
         -- tried_helped agrees only when the lift cleared the "meaningful"
         -- band (>= 0.5); a 0–0.5 rise is "about the same" — neither bucket.
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL
           AND COALESCE(s.outcome_responses, 0) >= 5
           AND ((s.human_verdict = 'tried_helped' AND s.outcome_lift >= 0.5)
                OR s.human_verdict = 'tried_no_change'))::int AS agreed,
         -- contradicted only on an actual DROP (three-zone rule): claiming
         -- "it helped" over a flat-to-slightly-up class is optimism, not a
         -- bluff. lift < 0 is the only zone where numbers oppose the claim.
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL
           AND COALESCE(s.outcome_responses, 0) >= 5
           AND s.human_verdict = 'tried_helped' AND s.outcome_lift < 0)::int AS contradicted
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'session_feedback'
    AND s.human_verdict IS NOT NULL
    AND s.human_verdict <> 'not_tried'        -- no effect claimed → nothing to check
    -- IST local date: verdicts land near midnight IST; a raw ::date is UTC
    -- and shifts evening verdicts to the previous day.
    AND (s.human_verdict_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to
    AND (v_super OR s.institution_id = ANY(v_insts))
    -- Own-row exclusion: supers (Director lane) see all; a NULL caller email
    -- FAILS CLOSED (no rows) rather than fail-open.
    AND (v_super OR (v_email IS NOT NULL AND lower(s.faculty_email) IS DISTINCT FROM v_email))
  GROUP BY s.faculty_email, s.institution_id
  ORDER BY contradicted DESC, verdicts DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_verdict_track_record(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_verdict_track_record(date, date) TO authenticated;

-- ── 1+7. fn_scf_verdict_contradictions — DROP-only + k>=5 ───────────────────
-- Body identical to the deployed version except: outcome_lift < 0 (was <= 0)
-- and outcome_responses >= 5 (was 3) — in lockstep with the track record.
CREATE OR REPLACE FUNCTION public.fn_scf_verdict_contradictions(p_from date, p_to date)
 RETURNS TABLE(id uuid, course_code text, faculty_email text, human_verdict text, verdict_on date, window_from date, window_to date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_insts uuid[]; v_inst uuid; v_super boolean; v_allowed boolean; v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_verdict_contradictions: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (public.is_super_admin() OR public.user_has_permission('academic.session_feedback.verdict_report.view')),
         lower(p.email)
    INTO v_inst, v_super, v_allowed, v_email
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_verdict_contradictions: not authorized';
  END IF;

  SELECT array_agg(i.id) INTO v_insts FROM public.institutions i WHERE public.role_has_institution_access(i.id);

  RETURN QUERY
  SELECT s.id, s.course_code, s.faculty_email, s.human_verdict,
         (s.human_verdict_at AT TIME ZONE 'Asia/Kolkata')::date AS verdict_on,   -- IST, matches track_record's window
         s.window_from, s.window_to
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'session_feedback'
    AND s.human_verdict = 'tried_helped'
    AND s.outcome_lift IS NOT NULL
    -- Three-zone rule (Director 2026-07-10): only an actual DROP contradicts
    -- a "tried, helped" claim. A 0–0.5 rise is "about the same" — no alert.
    AND s.outcome_lift < 0
    -- k>=5 floor (decision 7): an alert about a person built on 3-4 answers
    -- can be pure chance (a -0.2 wobble). This fn must not depend on the
    -- upstream measurer's floor staying in place.
    AND COALESCE(s.outcome_responses, 0) >= 5
    AND (s.human_verdict_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to
    AND (v_super OR s.institution_id = ANY(v_insts))
    -- Own-row exclusion — same invariant as fn_scf_verdict_track_record: even a
    -- teaching dean/principal never sees a contradiction row about themselves;
    -- NULL caller email fails closed.
    AND (v_super OR (v_email IS NOT NULL AND lower(s.faculty_email) IS DISTINCT FROM v_email))
  ORDER BY s.human_verdict_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_verdict_contradictions(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_verdict_contradictions(date, date) TO authenticated;

-- ── 6b. fn_scf_measure_suggestion_outcomes — skip + stamp unmeasurable ──────
-- Body identical to the deployed (improvement-only, estimator-symmetric)
-- version — verified exact by a known-delta sim on 2026-07-10 (no-change ⇒
-- 0.00, +2 ⇒ 2.00) — except two additions marked NEW below.
CREATE OR REPLACE FUNCTION public.fn_scf_measure_suggestion_outcomes(p_min_age_days integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_measured int;
BEGIN
  WITH candidates AS (
    SELECT s.id, s.institution_id, s.section_id, s.course_code,
           s.faculty_email, s.window_from, s.window_to
    FROM public.scf_ai_suggestions s
    WHERE s.outcome_lift IS NULL
      AND s.domain = 'session_feedback'
      AND s.kind = 'improvement'   -- success rows are not graded on lift (review #1681)
      AND s.outcome_unmeasurable_at IS NULL   -- NEW (decision 6): stamped rows leave the scan
      AND s.generated_at <= now() - make_interval(days => p_min_age_days)
  ),
  -- Recompute the input baseline over the suggestion's own window using the SAME
  -- estimator as the outcome side: round(avg(understood),2) over feedback rows that
  -- belong to a session (date) with >=3 responses. (Fix 2026-06-28: the prior
  -- response-weighted division double-counted s_responses once per joined row.)
  recomputed_baseline AS (
    SELECT c.id, round(avg(f.understood)::numeric, 2) AS baseline_avg
    FROM candidates c
    JOIN (
      SELECT course_code, institution_id, lower(faculty_email) AS faculty_email, attendance_date
      FROM public.session_feedback
      GROUP BY course_code, institution_id, lower(faculty_email), attendance_date
      HAVING count(*) >= 3
    ) sess
      ON  sess.course_code     = c.course_code
      AND sess.institution_id IS NOT DISTINCT FROM c.institution_id
      AND (c.faculty_email IS NULL
           OR sess.faculty_email IS NOT DISTINCT FROM lower(c.faculty_email))
    JOIN public.session_feedback f
      ON  f.course_code     = sess.course_code
      AND f.institution_id IS NOT DISTINCT FROM sess.institution_id
      AND lower(f.faculty_email) IS NOT DISTINCT FROM sess.faculty_email
      AND f.attendance_date = sess.attendance_date
      AND f.attendance_date BETWEEN c.window_from AND c.window_to
    GROUP BY c.id
  ),
  next_session AS (
    SELECT c.id,
           (SELECT f.attendance_date
            FROM public.session_feedback f
            WHERE f.course_code     = c.course_code
              AND f.institution_id IS NOT DISTINCT FROM c.institution_id
              AND (c.faculty_email IS NULL
                   OR lower(f.faculty_email) IS NOT DISTINCT FROM c.faculty_email)
              AND f.attendance_date > c.window_to
            GROUP BY f.attendance_date
            HAVING count(*) >= 3
            ORDER BY f.attendance_date ASC
            LIMIT 1) AS next_date
    FROM candidates c
  ),
  outcome AS (
    SELECT c.id,
           round(avg(f.understood)::numeric, 2)  AS out_avg,
           count(*)::int                          AS out_n,
           rb.baseline_avg                        AS baseline_avg
    FROM candidates c
    JOIN next_session ns  ON ns.id = c.id AND ns.next_date IS NOT NULL
    JOIN public.session_feedback f
      ON  f.course_code     = c.course_code
      AND f.institution_id IS NOT DISTINCT FROM c.institution_id
      AND (c.faculty_email IS NULL
           OR lower(f.faculty_email) IS NOT DISTINCT FROM c.faculty_email)
      AND f.attendance_date = ns.next_date
    LEFT JOIN recomputed_baseline rb ON rb.id = c.id
    GROUP BY c.id, rb.baseline_avg
  )
  UPDATE public.scf_ai_suggestions s
  SET outcome_avg_understood = o.out_avg::numeric,
      outcome_responses      = o.out_n::integer,
      outcome_lift           = round((o.out_avg - COALESCE(o.baseline_avg, o.out_avg))::numeric, 2)::numeric,
      outcome_measured_at    = now(),
      updated_at             = now()
  FROM outcome o
  WHERE s.id = o.id;

  GET DIAGNOSTICS v_measured = ROW_COUNT;

  -- NEW (decision 6): stamp improvement notes that have waited 30+ days with
  -- no qualifying next session — the course likely ended for the term and the
  -- note can never be graded. Runs AFTER the measure pass, so a note whose
  -- next session appeared on day 30 is measured, not stamped. Not counted in
  -- the return value (that stays "rows measured this run").
  UPDATE public.scf_ai_suggestions s
  SET outcome_unmeasurable_at = now(),
      updated_at              = now()
  WHERE s.outcome_lift IS NULL
    AND s.outcome_unmeasurable_at IS NULL
    AND s.domain = 'session_feedback'
    AND s.kind = 'improvement'
    AND s.generated_at <= now() - interval '30 days';

  RETURN v_measured;
END;
$function$;

-- Preserve the service_role-only lock from 20260630160000.
REVOKE EXECUTE ON FUNCTION public.fn_scf_measure_suggestion_outcomes(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_measure_suggestion_outcomes(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
