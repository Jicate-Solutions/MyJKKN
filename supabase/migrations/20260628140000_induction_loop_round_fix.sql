-- ============================================================================
-- Fresher Induction — Phase 6 follow-up: scale-consistency fix on the verifier
-- File: 20260628140000_induction_loop_round_fix.sql | Date: 2026-06-28
--
-- COSMETIC / SCALE fix only — no behavioural change. The no-data branch of
-- fn_induction_measure_loop_outcomes returned a bare integer `0` for outcome_lift
-- while the measured branch returns round(...,2). Both are numerically identical
-- (outcome_lift is numeric), but the unrounded branch yields scale-0 `0` vs the
-- measured branch's scale-2 `0.00`. Wrap the no-data branch in round(0::numeric,2)
-- so every outcome_lift this function writes has a consistent numeric scale of 2.
--
-- Found by the moat-loop 2-cycle simulation (2026-06-28): scenario E (zero-
-- enrollment cohort) returned lift `0` rather than `0.00`. Behaviour is correct
-- (neutral lift, never a spurious negative) — this only normalises the scale.
--
-- Body is otherwise byte-identical to 20260628130000_induction_phase6_self_improving_loop.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_measure_loop_outcomes(
  p_min_age_days int DEFAULT 300   -- ≈ a full admission cycle; measure once, joins complete
)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_measured int;
BEGIN
  WITH candidates AS (
    SELECT s.id, s.institution_id, s.academic_year_id, s.input_avg_understood
    FROM public.scf_ai_suggestions s
    WHERE s.domain = 'induction'
      AND s.outcome_lift IS NULL
      AND s.academic_year_id IS NOT NULL
      AND s.window_to <= current_date - p_min_age_days
  ),
  cohort_learners AS (  -- DISTINCT (candidate, learner) across all the year's events
    SELECT DISTINCT c.id AS cand_id, c.institution_id, c.academic_year_id, ie.learner_id
    FROM candidates c
    JOIN public.induction_programs ip
      ON ip.institution_id = c.institution_id AND ip.academic_year_id = c.academic_year_id
    JOIN public.induction_enrollment ie ON ie.event_id = ip.event_id
  ),
  per_learner AS (  -- one row per (candidate, learner): value across the cohort's
                    -- events; joined referrals counted ONCE (event-independent)
    SELECT cl.cand_id, cl.learner_id,
           (SELECT avg(comp.value_score_avg)
              FROM public.induction_completion comp
              JOIN public.induction_programs ip2 ON ip2.event_id = comp.event_id
              WHERE comp.learner_id = cl.learner_id
                AND ip2.institution_id = cl.institution_id
                AND ip2.academic_year_id = cl.academic_year_id) AS value_avg,
           (SELECT count(DISTINCT al.id)
              FROM public.admission_leads al
              WHERE al.referred_by_id = cl.learner_id
                AND al.source = 'referral'::lead_source
                AND al.institution_id = cl.institution_id
                AND al.funnel_stage IN ('token_paid','confirmed','enrolled')) AS joined
    FROM cohort_learners cl
  ),
  agg AS (  -- one row per candidate (always — even zero-enrollment)
    SELECT c.id, c.input_avg_understood,
           (SELECT count(*)                 FROM per_learner pl WHERE pl.cand_id = c.id)         AS enrolled,
           (SELECT COALESCE(sum(pl.joined),0) FROM per_learner pl WHERE pl.cand_id = c.id)       AS joined,
           (SELECT avg(pl.value_avg)        FROM per_learner pl WHERE pl.cand_id = c.id)         AS value_avg
    FROM candidates c
  ),
  scored AS (
    SELECT a.id, a.input_avg_understood, a.enrolled,
           CASE WHEN COALESCE(a.enrolled, 0) = 0 THEN NULL        -- reached nobody (or not yet loaded)
                WHEN a.value_avg IS NULL        THEN NULL         -- no value signal
                ELSE round(100.0 * (a.joined::numeric / a.enrolled) * (a.value_avg / 5.0), 2)
           END AS score
    FROM agg a
  )
  UPDATE public.scf_ai_suggestions s
  SET outcome_avg_understood = sc.score,
      outcome_responses      = sc.enrolled,
      -- neutral lift (0.00) when there is no value signal, so a no-data cohort is
      -- measured once without injecting a spurious large negative into the loop.
      -- round(0::numeric,2) keeps the scale consistent with the measured branch.
      outcome_lift           = CASE WHEN sc.score IS NULL THEN round(0::numeric, 2)
                                    ELSE round(sc.score - COALESCE(s.input_avg_understood, sc.score), 2) END,
      outcome_measured_at    = now(),
      updated_at             = now()
  FROM scored sc
  WHERE s.id = sc.id;

  GET DIAGNOSTICS v_measured = ROW_COUNT;
  RETURN v_measured;
END;
$$;

-- Anon-lock (idempotent restatement — NOT a privilege change; the function was
-- already service_role only). Satisfies the anon-lock gate on CREATE OR REPLACE.
REVOKE EXECUTE ON FUNCTION public.fn_induction_measure_loop_outcomes(int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_induction_measure_loop_outcomes(int) TO service_role;

NOTIFY pgrst, 'reload schema';
