-- =============================================================================
-- 20260711064500_loop_regress_fn_and_wire_schedules.sql
-- The three governance wires (Director, 2026-07-11 06:17 IST: "yes want them"):
--   WIRE 1 — scheduled regress: fn_loops_regress_scf() runs the SCF known-delta
--            measure sim ENTIRELY INSIDE a subtransaction (savepoint): seed →
--            measure → assert → roll back the seeds; only the loop_audits
--            verdict row persists. Fired weekly by the dispatcher (row below)
--            via /api/cron/loops-regress. This is the standing defense against
--            the fabricated-metric bug class (the moat-loop capstone lesson):
--            a migration that breaks the measurer turns a "self-improving"
--            loop into a confident liar, and only a known-delta assert
--            catches it.
--   WIRE 2 — sim-failed alerting: the cron routes read this fn's verdict and
--            fan out a Director notification on anything not measure-verified.
--   WIRE 3 — silence watchdog: /api/cron/loop-watchdog (daily row below)
--            flags dispatcher-managed routines that errored OR went silent
--            past their cadence. Silence must not look like health
--            (pde-bridge lesson: HTTP 200 daily into a dead pipe).
--
-- The sim recipe mirrors manifests/scf.yaml in ~/.claude/skills/loops (also
-- mirrored into .claude/loop-manifests/ in this repo) and the executable audit
-- of 2026-07-10: no-change MUST measure exactly 0.00; a +2 delta MUST measure
-- exactly 2.00. The invariant is the assert, not the numbers' provenance.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_loops_regress_scf()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_a   numeric;      -- no-change lift (must be 0.00)
  v_b   numeric;      -- +2-delta lift  (must be 2.00)
  v_err text := NULL; -- non-sentinel failure inside the sim block
  v_verdict text;
BEGIN
  -- ── The sim, inside a subtransaction. The sentinel RAISE at the end rolls
  --    back every seeded row; the captured v_a/v_b variables survive. Any
  --    OTHER error also rolls the seeds back and is reported as sim-error.
  BEGIN
    -- Seed: 3 responses × 2 sessions (window day-10, next day-4 — both past
    -- the 48h closed-window rule), understood=2, sentinel course, NULL-faculty
    -- leadership lane. No FKs on student_id/timetable_id (verified 2026-07-10);
    -- institution must be REAL and match the action row or the measurer's
    -- IS NOT DISTINCT FROM join never matches (the #1868 orphan class).
    INSERT INTO public.session_feedback
      (institution_id, student_id, attendance_date, timetable_id, period_id,
       course_code, faculty_email, understood, source)
    SELECT i.institution_id, gen_random_uuid(), d.dt, gen_random_uuid(), 'ZZ-P1',
           'ZZREGRESS1', NULL, 2, 'async'
    FROM (SELECT institution_id FROM public.session_feedback
          WHERE institution_id IS NOT NULL LIMIT 1) i,
         (VALUES (current_date-10),(current_date-4)) AS d(dt),
         generate_series(1,3);

    INSERT INTO public.scf_ai_suggestions
      (domain, institution_id, course_code, faculty_email, window_from, window_to,
       input_avg_understood, suggestion, kind, model, generated_at)
    SELECT 'session_feedback', institution_id, 'ZZREGRESS1', NULL,
           current_date-12, current_date-9, 2.0,
           '{"summary":"ZZREGRESS sentinel"}'::jsonb, 'improvement',
           'loops-regress', now() - interval '5 days'
    FROM public.session_feedback WHERE course_code='ZZREGRESS1' LIMIT 1;

    -- Assert A: identical sessions ⇒ lift must be exactly 0.00
    PERFORM public.fn_scf_measure_suggestion_outcomes(0);
    SELECT s.outcome_lift INTO v_a
    FROM public.scf_ai_suggestions s WHERE s.course_code='ZZREGRESS1';

    -- Assert B: raise next session to 4 ⇒ lift must be exactly 2.00
    UPDATE public.scf_ai_suggestions
    SET outcome_lift=NULL, outcome_avg_understood=NULL,
        outcome_responses=NULL, outcome_measured_at=NULL
    WHERE course_code='ZZREGRESS1';
    UPDATE public.session_feedback SET understood=4
    WHERE course_code='ZZREGRESS1' AND attendance_date=current_date-4;
    PERFORM public.fn_scf_measure_suggestion_outcomes(0);
    SELECT s.outcome_lift INTO v_b
    FROM public.scf_ai_suggestions s WHERE s.course_code='ZZREGRESS1';

    -- Roll the seeds back. Everything above un-happens; v_a/v_b survive.
    RAISE EXCEPTION 'LOOPS_REGRESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'LOOPS_REGRESS_ROLLBACK' THEN
      v_err := SQLERRM;   -- real failure: seeds still rolled back with the block
    END IF;
  END;

  v_verdict := CASE
    WHEN v_err IS NOT NULL                 THEN 'sim-error: ' || left(v_err, 180)
    WHEN v_a = 0.00 AND v_b = 2.00         THEN 'measure-verified'
    ELSE 'sim-failed'
  END;

  -- The only persistent write: the verdict, visible on /admin/loops.
  INSERT INTO public.loop_audits (loop_key, layer, verdict, evidence)
  VALUES ('scf', 'sim', v_verdict,
          jsonb_build_object('no_change', v_a, 'known_delta_plus2', v_b,
                             'runner', 'fn_loops_regress_scf'));

  RETURN QUERY SELECT 'scf'::text, v_verdict, v_a, v_b;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_scf() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_scf() TO service_role;

-- ── Dispatcher schedule rows (editable on /admin/ai-routines, no deploy to
--    change). minute_of_day is IST minutes; identity-guarded seeds.
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES
  ('loops-regress', true, true, ARRAY[0], 473),            -- Sundays 07:53 IST
  ('loop-watchdog', true, true, ARRAY[0,1,2,3,4,5,6], 563) -- daily 09:23 IST (after the 08:15 measure)
ON CONFLICT (routine_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
