-- =============================================================================
-- 20260930020000_fn_loops_regress_learner360.sql
-- fn_loops_regress_learner360 — the SIXTH scheduled known-delta regress sim,
-- joining fn_loops_regress_scf (20260711064500, the mould), _feeder
-- (20260713010053), _mess (20260726073305), _bug_triage (20260813113000) and
-- _induction (20260813113100) on the weekly /api/cron/loops-regress run
-- (dispatcher row 'loops-regress', Sundays 07:53 IST — seeded by the mould
-- migration; NO schedule change here; LOOP_FNS extended in the same PR).
--
-- 🛑 NOT APPLIED TO ANY DATABASE — Director-gated apply. File only.
-- Depends on 20260930010000 (interventions table + the REAL measure fn) and on
-- 20260808110003 (learner_360_verdicts — restored in this same PR).
--
-- What it proves, weekly, against production data: the learner-360 loop's
-- MEASURE fn — fn_learner_360_measure_reverdict_delta, the return-edge
-- measurer that compares a learner's next verdict against the verdict that
-- triggered a recorded intervention — still measures known deltas exactly, and
-- still refuses to fabricate a delta where no re-verdict exists.
--   Assert A (no-change): a sentinel intervention whose learner has NO verdict
--                         after the action ⇒ the row must stay UNMEASURED
--                         (measured_at NULL, no band_delta invented).
--   Assert B (known +1):  a sentinel re-verdict 14 days later, exactly one
--                         band up (needs_support -> steady) ⇒ band_delta must
--                         be exactly 1, re_verdict_id must be the seeded
--                         re-verdict, days_to_reverdict exactly 14.
--
-- Traps this encodes (do not "simplify" them away):
--   * Seeds use far-past dates (2000-01-01 / 2000-01-15): learner_360_verdicts
--     is UNIQUE (learner_id, verdict_date) and no real verdict predates 2026,
--     so the sentinel inserts can never collide with — or overwrite via any
--     upsert path — a real verdict. Plain INSERTs on purpose: a collision
--     should surface as sim-error, not be absorbed.
--   * Seeds are direct INSERTs, NOT fn_learner_360_record_intervention — that
--     recorder requires auth.uid() and this runner executes as service with a
--     NULL uid (correctly refused). The MEASURE assert still goes through the
--     loop's REAL measurement fn, never a re-implementation.
--   * acted_by borrows the oldest profiles row: profiles.id == auth.users.id
--     (1:1), satisfying the FK; rolled back with everything else.
--   * The measure fn sweeps ALL unmeasured interventions, so each sim call may
--     also measure real pending rows — harmless: the sentinel RAISE rolls
--     those writes back and the nightly cron re-measures them for real.
--   * Assert A checks the SENTINEL row specifically (not the fn's summary
--     counts), so real traffic in the sweep can never mask a fabricated delta.
--   * loop_audits.loop_key FKs loop_registry — the 'learner-360' row is seeded
--     by 20260930010000; apply that first.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_loops_regress_learner360()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_a           numeric;      -- sentinel rows measured at A (must be 0.00)
  v_b           numeric;      -- sentinel band_delta at B    (must be 1.00)
  v_rv          uuid;         -- measured re_verdict_id at B (must equal v_v2)
  v_days        integer;      -- measured days_to_reverdict  (must be 14)
  v_err         text := NULL; -- non-sentinel failure inside the sim block
  v_verdict     text;
  v_learner     uuid;         -- borrowed REAL learner (FKs; rolled back)
  v_institution uuid;
  v_actor       uuid;         -- borrowed REAL profile as the acting user
  v_v1          uuid;         -- seeded sentinel triggering verdict
  v_v2          uuid;         -- seeded sentinel re-verdict
  v_iv          uuid;         -- seeded sentinel intervention
  v_res         jsonb;        -- measurer return payload
BEGIN
  -- ── The sim, inside a subtransaction. The sentinel RAISE at the end rolls
  --    back every seeded row; the captured variables survive. Any OTHER error
  --    also rolls the seeds back and is reported as sim-error.
  BEGIN
    -- Deterministic anchors: oldest by (created_at, id), never a superlative
    -- that can re-aim between runs. The anchor must also carry ZERO real
    -- learner_360_verdicts: Assert A reasons about "no verdict after the
    -- action", and a real verdict landing in the window would corrupt the
    -- assertion (verifier finding, 2026-08-26). An honest loud failure beats
    -- a silently mis-anchored sim.
    SELECT lp.id, lp.institution_id INTO v_learner, v_institution
      FROM public.learners_profiles lp
     WHERE lp.institution_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.learner_360_verdicts v WHERE v.learner_id = lp.id
       )
     ORDER BY lp.created_at ASC, lp.id ASC
     LIMIT 1;
    IF v_learner IS NULL THEN
      RAISE EXCEPTION 'no verdict-free learners_profiles row to anchor the sim (every learner carries real 360 verdicts)';
    END IF;

    SELECT p.id INTO v_actor
      FROM public.profiles p
     ORDER BY p.created_at ASC, p.id ASC
     LIMIT 1;
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'need a profiles row to act as the sentinel actor';
    END IF;

    -- Seed: sentinel triggering verdict, far past.
    INSERT INTO public.learner_360_verdicts
      (learner_id, institution_id, verdict_date, standing_band, standing_narrative, model)
    VALUES (v_learner, v_institution, DATE '2000-01-01', 'needs_support',
            'ZZREGRESS learner-360 regress sim (triggering verdict)', 'zzregress')
    RETURNING id INTO v_v1;

    -- Seed: sentinel intervention, acted the day after the triggering verdict.
    INSERT INTO public.learner_360_interventions
      (verdict_id, learner_id, institution_id, action_taken, acted_by, acted_at)
    VALUES (v_v1, v_learner, v_institution,
            'ZZREGRESS sentinel action (loops-regress sim)', v_actor,
            TIMESTAMPTZ '2000-01-02 00:00:00+00')
    RETURNING id INTO v_iv;

    -- Assert A: no verdict exists after the action ⇒ the sentinel row must
    -- remain unmeasured. Checked on the row itself, not the summary counts.
    v_res := public.fn_learner_360_measure_reverdict_delta();
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'measure returned success=false: %',
        COALESCE(v_res ->> 'error', 'no error detail');
    END IF;
    SELECT count(*)::numeric INTO v_a
      FROM public.learner_360_interventions i
     WHERE i.id = v_iv AND i.measured_at IS NOT NULL;

    -- Known +1 delta: sentinel re-verdict 14 days later, one band up.
    INSERT INTO public.learner_360_verdicts
      (learner_id, institution_id, verdict_date, standing_band, standing_narrative, model)
    VALUES (v_learner, v_institution, DATE '2000-01-15', 'steady',
            'ZZREGRESS learner-360 regress sim (re-verdict)', 'zzregress')
    RETURNING id INTO v_v2;

    -- Assert B: the REAL measurer must now write delta +1 against the seeded
    -- re-verdict, 14 days out.
    v_res := public.fn_learner_360_measure_reverdict_delta();
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'measure (delta) returned success=false: %',
        COALESCE(v_res ->> 'error', 'no error detail');
    END IF;
    SELECT i.band_delta::numeric, i.re_verdict_id, i.days_to_reverdict
      INTO v_b, v_rv, v_days
      FROM public.learner_360_interventions i
     WHERE i.id = v_iv AND i.measured_at IS NOT NULL;

    -- Roll the seeds back. Everything above un-happens; captures survive.
    RAISE EXCEPTION 'LOOPS_REGRESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'LOOPS_REGRESS_ROLLBACK' THEN
      v_err := SQLERRM;   -- real failure: seeds still rolled back with the block
    END IF;
  END;

  v_verdict := CASE
    WHEN v_err IS NOT NULL THEN 'sim-error: ' || left(v_err, 180)
    WHEN v_a = 0.00 AND v_b = 1.00 AND v_rv = v_v2 AND v_days = 14
      THEN 'measure-verified'
    ELSE 'sim-failed'   -- any NULL capture also lands here (CASE is NULL-safe)
  END;

  -- The only persistent write: the verdict, visible on /admin/loops.
  INSERT INTO public.loop_audits (loop_key, layer, verdict, evidence)
  VALUES ('learner-360', 'sim', v_verdict,
          jsonb_build_object('no_change_measured', v_a, 'known_delta_plus1', v_b,
                             'days_to_reverdict', v_days,
                             'reverdict_matches_seed', (v_rv = v_v2),
                             'runner', 'fn_loops_regress_learner360'));

  RETURN QUERY SELECT 'learner-360'::text, v_verdict, v_a, v_b;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_learner360() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_learner360() TO service_role;

NOTIFY pgrst, 'reload schema';
