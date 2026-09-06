-- ============================================================================
-- Safety net: a bounded, re-runnable sweep over stranded learner statuses
-- ============================================================================
-- 20260811140000 repaired the payment triggers and 20260811160000 backfilled the
-- 100 learners they had already stranded. This is the third leg: something that
-- notices if the pipeline ever silently stops again.
--
-- That is not hypothetical. The bug this replaces went unnoticed for months
-- precisely because it failed in the SAFE direction — stale reads can only
-- under-report progress, so nothing errored, no history row was written, and the
-- payment itself always succeeded. The only visible symptom was a number on a
-- report that nobody was diffing. A sweep that promotes 0 learners every night
-- and suddenly promotes 40 is the alarm this system never had.
--
-- Runs IN THE DATABASE rather than as N round trips from the route: the caller
-- gets one call and one summary, and the ~950 evaluations stay next to the data.
--
-- SAFE TO RE-RUN AND SAFE TO OVER-RUN. evaluate_learner_status_after_payment
-- only ever promotes — it returns 'no_op_for_status' outside ('account',
-- 'reserved') and re-asserts the from-status in every UPDATE's WHERE clause.
-- A learner it cannot promote costs one indexed lookup.
--
-- NOT granted to `authenticated`: this is an operator/cron entry point. The
-- single-learner path (the admin "Re-evaluate" action) calls
-- evaluate_learner_status_after_payment directly, which authenticated already
-- holds and which is gated in the service layer.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_sweep_learner_status_promotions(
  p_max_learners integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r             record;
  v_result      jsonb;
  v_seen        integer := 0;
  v_to_reserved integer := 0;
  v_to_admitted integer := 0;
  v_cap         integer := LEAST(GREATEST(COALESCE(p_max_learners, 5000), 1), 20000);
BEGIN
  FOR r IN
    SELECT lp.id
    FROM public.learners_profiles lp
    -- The only two statuses the evaluator can act on. Scoping here rather than
    -- letting it no-op keeps the sweep proportional to the backlog, not to the
    -- 6,000-row learner table.
    WHERE lp.lifecycle_status::text IN ('account', 'reserved')
    ORDER BY lp.id
    LIMIT v_cap
  LOOP
    v_result := public.evaluate_learner_status_after_payment(r.id);
    v_seen := v_seen + 1;

    IF (v_result ->> 'promoted_to_universal')::boolean THEN
      v_to_reserved := v_to_reserved + 1;
    END IF;
    IF (v_result ->> 'promoted_to_threshold')::boolean THEN
      v_to_admitted := v_to_admitted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'evaluated', v_seen,
    'promoted_to_reserved', v_to_reserved,
    'promoted_to_admitted', v_to_admitted,
    -- Non-zero on a healthy night means a payment slipped past the triggers.
    -- Treat a sustained non-zero as a regression, not as routine catch-up.
    'promoted_total', v_to_reserved + v_to_admitted,
    'capped', (v_seen = v_cap)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_sweep_learner_status_promotions(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sweep_learner_status_promotions(integer)
  TO service_role;
