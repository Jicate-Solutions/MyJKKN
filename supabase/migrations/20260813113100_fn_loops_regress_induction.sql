-- =============================================================================
-- 20260813113100_fn_loops_regress_induction.sql
-- fn_loops_regress_induction — the FIFTH scheduled known-delta regress sim,
-- joining scf (20260711064500, the mould), feeder (20260713010053), mess
-- (20260726073305) and bug-triage (20260813113000) on the weekly
-- /api/cron/loops-regress run (dispatcher row 'loops-regress', Sundays
-- 07:53 IST — seeded by the mould migration; NO schedule change here).
--
-- What it proves, weekly, against production data: the induction-session
-- loop's MEASURE fn — fn_induction_measure_session_effectiveness, the
-- RTM-corrected verifier behind the chartered outcome metric ("batch-B
-- session rating vs a regression-to-the-mean baseline (only real lift
-- counts)", loop_registry charter 20260726012000) — still measures known
-- deltas exactly.
--   Assert A (no-change): treated topic run1 avg 2.00, run2 avg 2.00 against
--                         an identity RTM line (controls with run2 == run1
--                         ⇒ slope 1, intercept 0, rtm_expected = input_avg)
--                         ⇒ net_effect must be exactly 0.00
--   Assert B (known +2):  same topic's run2 ratings raised to 4 (4.00 vs
--                         rtm_expected 2.00) ⇒ net_effect must be exactly 2.00
-- Recipe: the loops manifest .claude/loop-manifests/induction-session.yaml sim
-- block (schema facts verified read-only against prod 2026-07-13 and
-- re-verified 2026-08-13), executed as an fn-internal rolled-back sim
-- (savepoint pattern). Sentinel prefix here is ZZREGRESS, NOT the manifest's
-- ZZISE: the ZZISE slug belongs to the COMMITTED walk recipe, and
-- events.slug is UNIQUE — a walk artifact left mid-flight must never
-- collide with the weekly sim.
--
-- Traps this encodes (do not "simplify" them away — all manifest/catalog
-- verified):
--   * event_session_feedback FKs are REAL (unlike scf's session_feedback):
--     learner_id → learners_profiles(id) with UNIQUE(session_id, learner_id)
--     — borrow THREE distinct real learner ids, deterministically picked;
--     gen_random_uuid() is NOT safe here.
--   * CHECK (submitted_by IS NULL) = (capture_method='phone') — seeds use
--     'phone' + NULL submitted_by.
--   * The sentinel event gets NO induction_programs row: the measurer never
--     reads that table, and its absence makes the statement-level completion
--     trigger on event_session_feedback (fn_induction_completion_on_feedback)
--     a verified no-op for these seeds — no induction_completion writes, not
--     even rolled-back ones.
--   * events NOT NULLs without defaults are institution_id/event_type/name/
--     slug, plus CHECK venue_at_least_one — institution_id and a known-valid
--     event_type are borrowed from the oldest REAL induction event; slug is
--     sentinel; venue_text satisfies the venue check. status stays 'draft' so
--     the NAAC evidence fanout trigger does not qualify (naac_criteria is
--     empty anyway) and is_emergency stays false so the override trigger
--     no-ops.
--   * The RTM baseline needs >= p_min_pairs untreated pairs WITH x-variance
--     (regr_slope over run1 avgs) — controls U1..U5 carry run1 avgs
--     4.00/4.00/4.33/4.67/5.00 with run2 == run1, giving slope exactly 1 and
--     intercept exactly 0 (collinear points; bit-identical numerators). The
--     treated topic (run1 avg 2.00 < threshold 3.5) is excluded from the
--     baseline by the measurer's own filter.
--   * Topic identity = (event_id, fn_induction_norm_topic(title)) — the
--     effectiveness row's topic_key must be the NORMALIZED title
--     ('zzregress-t1'), and run order is start_at ASC (rn=1 vs rn=2).
--   * The measurer skips measure_status='measured' rows, so Assert B needs
--     the manifest's reset_between_deltas: status back to 'pending', not just
--     NULLed numbers.
--   * p_event_id is the SENTINEL event — NULL would also sweep real pending
--     rows (harmless under rollback, but the asserts stop being exact).
--   * The measurer CREATEs a TEMP table (_ise_runs, ON COMMIT DROP) and drops
--     it per event loop — two sequential calls inside one subtransaction are
--     safe (verified in the fn body).
--   * The measurer has no auth/permission gate (SECURITY DEFINER, body
--     verified) — no impersonation GUC is needed, unlike the feeder regress.
--   * Far-past session dates (~400 days) follow the mess convention: nothing
--     else keys on them (scoping is by sentinel event id), they just keep the
--     sim visibly outside any live induction window.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_loops_regress_induction()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_a        numeric;      -- no-change net_effect (must be 0.00)
  v_b        numeric;      -- +2-delta net_effect  (must be 2.00)
  v_status_a text;         -- measure_status at A (must be 'measured')
  v_status_b text;         -- measure_status at B (must be 'measured')
  v_err      text := NULL; -- non-sentinel failure inside the sim block
  v_verdict  text;
  v_inst     uuid;         -- borrowed REAL institution (from the anchor induction event)
  v_etype    text;         -- borrowed known-valid event_type (same anchor)
  v_event    uuid;         -- seeded sentinel event
  v_l1       uuid;         -- borrowed REAL learners (FK + UNIQUE(session, learner))
  v_l2       uuid;
  v_l3       uuid;
  v_first    uuid;         -- treated topic's run1 session
  v_first_at timestamptz;
  v_row      uuid;         -- seeded sentinel effectiveness row
  v_n_a      int;          -- measurer's returned row count at A (must be 1)
  v_n_b      int;          -- measurer's returned row count at B (must be 1)
BEGIN
  -- ── The sim, inside a subtransaction. The sentinel RAISE at the end rolls
  --    back every seeded row; the captured variables survive. Any OTHER error
  --    also rolls the seeds back and is reported as sim-error.
  BEGIN
    -- Deterministic anchor: the oldest REAL induction event lends its
    -- institution_id and a known-valid event_type (pin by date, never by a
    -- superlative that can re-aim — the feeder regress convention).
    SELECT e.institution_id, e.event_type INTO v_inst, v_etype
    FROM public.events e
    JOIN public.induction_programs ip ON ip.event_id = e.id
    ORDER BY e.created_at ASC, e.id ASC
    LIMIT 1;
    IF v_inst IS NULL THEN
      RAISE EXCEPTION 'no induction event available to anchor the sim';
    END IF;

    -- Three distinct real learners (event_session_feedback.learner_id FK).
    SELECT lp.id INTO v_l1 FROM public.learners_profiles lp ORDER BY lp.created_at ASC, lp.id ASC LIMIT 1;
    SELECT lp.id INTO v_l2 FROM public.learners_profiles lp ORDER BY lp.created_at ASC, lp.id ASC OFFSET 1 LIMIT 1;
    SELECT lp.id INTO v_l3 FROM public.learners_profiles lp ORDER BY lp.created_at ASC, lp.id ASC OFFSET 2 LIMIT 1;
    IF v_l1 IS NULL OR v_l2 IS NULL OR v_l3 IS NULL THEN
      RAISE EXCEPTION 'need three learners_profiles rows to act as sentinel raters';
    END IF;

    -- Seed: sentinel event (deliberately NO induction_programs row — see header).
    INSERT INTO public.events
      (institution_id, event_type, name, slug, venue_text, status)
    VALUES
      (v_inst, v_etype, 'ZZREGRESS induction regress sim',
       'zzregress-induction-sim', 'ZZREGRESS', 'draft')
    RETURNING id INTO v_event;

    -- Seed: 6 topics × 2 runs. Controls U1..U5 give the identity RTM line;
    -- treated T1 (run1 avg 2.00 < 3.5) is the measured topic. Far-past dates;
    -- run order by start_at (run1 older).
    INSERT INTO public.event_sessions (event_id, title, start_at, end_at)
    SELECT v_event, t.title, t.s_at, t.s_at + interval '1 hour'
    FROM (VALUES
      ('ZZREGRESS-U1', now() - interval '400 days'), ('ZZREGRESS-U1', now() - interval '399 days'),
      ('ZZREGRESS-U2', now() - interval '400 days'), ('ZZREGRESS-U2', now() - interval '399 days'),
      ('ZZREGRESS-U3', now() - interval '400 days'), ('ZZREGRESS-U3', now() - interval '399 days'),
      ('ZZREGRESS-U4', now() - interval '400 days'), ('ZZREGRESS-U4', now() - interval '399 days'),
      ('ZZREGRESS-U5', now() - interval '400 days'), ('ZZREGRESS-U5', now() - interval '399 days'),
      ('ZZREGRESS-T1', now() - interval '400 days'), ('ZZREGRESS-T1', now() - interval '399 days')
    ) AS t(title, s_at);

    -- Seed: 3 ratings per session from the 3 real learners. Same triple on
    -- both runs of a topic ⇒ run2 avg == run1 avg for every control:
    --   U1 (4,4,4)  U2 (4,4,4)  U3 (4,4,5)  U4 (4,5,5)  U5 (5,5,5)  T1 (2,2,2)
    INSERT INTO public.event_session_feedback
      (session_id, learner_id, event_id, institution_id, rating,
       capture_method, submitted_by)
    SELECT s.id, l.lid, v_event, v_inst,
           (CASE s.title
              WHEN 'ZZREGRESS-U1' THEN ARRAY[4,4,4]
              WHEN 'ZZREGRESS-U2' THEN ARRAY[4,4,4]
              WHEN 'ZZREGRESS-U3' THEN ARRAY[4,4,5]
              WHEN 'ZZREGRESS-U4' THEN ARRAY[4,5,5]
              WHEN 'ZZREGRESS-U5' THEN ARRAY[5,5,5]
              WHEN 'ZZREGRESS-T1' THEN ARRAY[2,2,2]
            END)[l.ord],
           'phone', NULL
    FROM public.event_sessions s
    CROSS JOIN (VALUES (v_l1, 1), (v_l2, 2), (v_l3, 3)) AS l(lid, ord)
    WHERE s.event_id = v_event;

    -- Seed: the treated topic's loop-memory row (cycle-1 tip already issued).
    -- topic_key MUST be the normalized title: fn_induction_norm_topic
    -- ('ZZREGRESS-T1') = 'zzregress-t1'.
    SELECT s.id, s.start_at INTO v_first, v_first_at
    FROM public.event_sessions s
    WHERE s.event_id = v_event AND s.title = 'ZZREGRESS-T1'
    ORDER BY s.start_at ASC
    LIMIT 1;

    INSERT INTO public.induction_session_effectiveness
      (institution_id, event_id, topic_key, first_session_id, window_start,
       input_avg, input_responses, suggestion, model)
    VALUES
      (v_inst, v_event, 'zzregress-t1', v_first, v_first_at, 2.00, 3,
       '{"summary":"ZZREGRESS induction regress sim"}'::jsonb, 'loops-regress')
    RETURNING id INTO v_row;

    -- Assert A: run2 avg 2.00 vs rtm_expected 2.00 ⇒ net_effect exactly 0.00.
    -- Manifest verifier signature: (event, threshold 3.5, min_responses 3,
    -- min_pairs 5) — exactly the 5 controls seeded above.
    SELECT public.fn_induction_measure_session_effectiveness(v_event, 3.5, 3, 5)
      INTO v_n_a;
    SELECT e.net_effect, e.measure_status INTO v_a, v_status_a
    FROM public.induction_session_effectiveness e
    WHERE e.id = v_row;

    -- Reset between deltas (manifest reset_between_deltas): the measurer
    -- skips 'measured' rows, so status must return to 'pending'.
    UPDATE public.induction_session_effectiveness
       SET measure_status = 'pending', rerun_session_id = NULL, rerun_avg = NULL,
           rerun_responses = NULL, raw_lift = NULL, rtm_expected_avg = NULL,
           net_effect = NULL, outcome_measured_at = NULL
     WHERE id = v_row;

    -- Known +2 delta: raise the treated topic's LATER run to 4s
    -- (4.00 vs rtm_expected 2.00 ⇒ exactly 2.00).
    UPDATE public.event_session_feedback f
       SET rating = 4
     WHERE f.session_id = (
       SELECT s.id FROM public.event_sessions s
       WHERE s.event_id = v_event AND s.title = 'ZZREGRESS-T1'
       ORDER BY s.start_at DESC
       LIMIT 1);

    SELECT public.fn_induction_measure_session_effectiveness(v_event, 3.5, 3, 5)
      INTO v_n_b;
    SELECT e.net_effect, e.measure_status INTO v_b, v_status_b
    FROM public.induction_session_effectiveness e
    WHERE e.id = v_row;

    -- Roll the seeds back. Everything above un-happens; captures survive.
    RAISE EXCEPTION 'LOOPS_REGRESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'LOOPS_REGRESS_ROLLBACK' THEN
      v_err := SQLERRM;   -- real failure: seeds still rolled back with the block
    END IF;
  END;

  v_verdict := CASE
    WHEN v_err IS NOT NULL THEN 'sim-error: ' || left(v_err, 180)
    WHEN v_a = 0.00 AND v_b = 2.00
         AND v_status_a = 'measured' AND v_status_b = 'measured'
      THEN 'measure-verified'
    ELSE 'sim-failed'
  END;

  -- The only persistent write: the verdict, visible on /admin/loops.
  INSERT INTO public.loop_audits (loop_key, layer, verdict, evidence)
  VALUES ('induction-session', 'sim', v_verdict,
          jsonb_build_object('no_change', v_a, 'known_delta_plus2', v_b,
                             'status_no_change', v_status_a,
                             'status_known_delta', v_status_b,
                             'measured_rows_a', v_n_a, 'measured_rows_b', v_n_b,
                             'runner', 'fn_loops_regress_induction'));

  RETURN QUERY SELECT 'induction-session'::text, v_verdict, v_a, v_b;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_induction() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_induction() TO service_role;

NOTIFY pgrst, 'reload schema';
