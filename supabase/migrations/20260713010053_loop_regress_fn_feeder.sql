-- =============================================================================
-- 20260713010053_loop_regress_fn_feeder.sql
-- fn_loops_regress_feeder — the SECOND scheduled known-delta regress sim,
-- joining fn_loops_regress_scf (20260711064500, the mould) on the weekly
-- /api/cron/loops-regress run (dispatcher row 'loops-regress', Sundays
-- 07:53 IST — already seeded by the mould migration; NO schedule change here).
--
-- What it proves, weekly, against production data: the feeder loop's MEASURE
-- fn — fn_schools_network_feeders, the priority-ranked cycle_delta panel
-- behind /admission/schools-network — still measures known deltas exactly.
--   Assert A (no-change): 3 prior-cycle + 3 current-cycle sentinel learners
--                         ⇒ cycle_delta must be exactly 0.00
--   Assert B (known +2):  2 more current-cycle learners (5 vs 3)
--                         ⇒ cycle_delta must be exactly 2.00
-- Recipe: the loops manifest feeder.yaml sim block (proven live 2026-07-03),
-- executed as an fn-internal rolled-back sim (savepoint pattern): every seed
-- lives inside the BEGIN…EXCEPTION subtransaction and is aborted by the
-- sentinel RAISE; the captured lifts survive into the outer scope; the ONLY
-- persistent write is the loop_audits verdict row that /admin/loops renders
-- as the chip's "tested" badge.
--
-- Traps this encodes (do not "simplify" them away):
--   * The verifier gates on is_super_admin()/is_admin()/user_has_permission(),
--     all of which resolve auth.uid() — NULL under the cron's service_role
--     context (and under a Mgmt-API session), so a bare call raises 42501.
--     We impersonate a super-admin profile via a TRANSACTION-LOCAL GUC
--     (request.jwt.claim.sub — the FIRST branch of auth.uid()'s COALESCE, so
--     it wins over PostgREST's request.jwt.claims); the subtransaction abort
--     reverts the GUC together with the seeds.
--   * Learner rows MUST carry institution_id = the admission-year row's own
--     institution (trg_validate_learner_admission_year_scope, IS DISTINCT
--     FROM) — the manifest's documented trap from the 2026-07-03 live sim.
--   * application_id is UNIQUE with a BEFORE-INSERT generator; all rows of a
--     multi-row INSERT share one command id, so the generator can mint
--     duplicate ids mid-statement — we supply explicit sentinel ids so the
--     generator is skipped entirely.
--   * Sentinel school 'ZZREGRESSFEEDER HSS' (normalized key
--     zzregressfeederhss): verified 2026-07-13 to collide with NO
--     schools_network_feeder_aliases key; unique to this fn (the SCF regress
--     uses ZZREGRESS1 course codes in session_feedback, a different table).
--   * cycle years are derived with the EXACT same expressions the verifier
--     uses (max year WITH learners; prior = next-lower year WITH learners,
--     gap-year safe) — never assume year-1.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_loops_regress_feeder()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_a       numeric;      -- no-change cycle_delta (must be 0.00)
  v_b       numeric;      -- +2-delta cycle_delta  (must be 2.00)
  v_err     text := NULL; -- non-sentinel failure inside the sim block
  v_verdict text;
  v_sa      uuid;         -- impersonated super admin (verifier permission gate)
  v_cycle   int;          -- verifier's current cycle year
  v_prior   int;          -- verifier's prior cycle year (gap-year safe)
  v_cur_ay  uuid; v_cur_inst uuid;
  v_pri_ay  uuid; v_pri_inst uuid;
BEGIN
  -- ── The sim, inside a subtransaction. The sentinel RAISE at the end rolls
  --    back every seeded row AND the impersonation GUC; the captured v_a/v_b
  --    variables survive. Any OTHER error also rolls the seeds back and is
  --    reported as sim-error.
  BEGIN
    -- Impersonation (see header). Deterministic pick: the dedicated test
    -- super admin first, else the oldest super admin (pin by date, never by
    -- a superlative that can re-aim — memory 2026-07-09).
    SELECT p.id INTO v_sa
    FROM public.profiles p
    WHERE p.is_super_admin = true
    ORDER BY (p.email = 'test.superadmin@jkkn.ac.in') DESC, p.created_at ASC
    LIMIT 1;
    IF v_sa IS NULL THEN
      RAISE EXCEPTION 'no super-admin profile available to impersonate';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);

    -- Derive the cycle years EXACTLY as fn_schools_network_feeders does.
    SELECT max(ay.year) INTO v_cycle
    FROM public.admission_years ay
    WHERE ay.year BETWEEN 2000 AND EXTRACT(YEAR FROM now())::int + 1
      AND EXISTS (SELECT 1 FROM public.learners_profiles lp
                  WHERE lp.admission_year_id = ay.id);
    SELECT max(ay.year) INTO v_prior
    FROM public.admission_years ay
    WHERE ay.year < v_cycle AND ay.year >= 2000
      AND EXISTS (SELECT 1 FROM public.learners_profiles lp
                  WHERE lp.admission_year_id = ay.id);
    IF v_cycle IS NULL OR v_prior IS NULL THEN
      RAISE EXCEPTION 'cannot derive cycle years (cycle=%, prior=%)', v_cycle, v_prior;
    END IF;

    -- Pin ONE admission_years row per year (deterministic: created_at ASC).
    -- institution_id comes FROM the pinned row — the scope-trigger trap.
    SELECT ay.id, ay.institution_id INTO v_cur_ay, v_cur_inst
    FROM public.admission_years ay
    WHERE ay.year = v_cycle
      AND EXISTS (SELECT 1 FROM public.learners_profiles lp
                  WHERE lp.admission_year_id = ay.id)
    ORDER BY ay.created_at ASC
    LIMIT 1;
    SELECT ay.id, ay.institution_id INTO v_pri_ay, v_pri_inst
    FROM public.admission_years ay
    WHERE ay.year = v_prior
      AND EXISTS (SELECT 1 FROM public.learners_profiles lp
                  WHERE lp.admission_year_id = ay.id)
    ORDER BY ay.created_at ASC
    LIMIT 1;

    -- Seed: 3 prior-cycle + 3 current-cycle sentinel learners. NOT NULL
    -- columns filled with obvious sentinel values; every vocab-CHECKed
    -- column (school_type, blood_group, …) is left NULL — CHECKs pass on
    -- NULL by SQL semantics. college_email left NULL (UNIQUE).
    INSERT INTO public.learners_profiles
      (application_id, admission_year_id, institution_id,
       first_name, date_of_birth, gender, religion,
       father_name, father_mobile, mother_name, mother_mobile,
       last_school, board_of_study, tenth_marks, twelfth_marks,
       entry_type, student_mobile, student_email,
       permanent_address_street, permanent_address_district,
       permanent_address_pin_code, permanent_address_state)
    SELECT 'ZZREGRESS-' || gen_random_uuid(), s.ay, s.inst,
           'ZZREGRESS Feeder Sim', '2008-01-01', 'other', 'other',
           'ZZREGRESS Father', '0000000000', 'ZZREGRESS Mother', '0000000000',
           'ZZREGRESSFEEDER HSS', 'state_board', '{}'::jsonb, '{}'::jsonb,
           'regular', '0000000000', 'zzregress.feeder@invalid.jkkn',
           'ZZREGRESS Street', 'ZZREGRESS District', '000000', 'Tamil Nadu'
    FROM (VALUES (v_pri_ay, v_pri_inst), (v_cur_ay, v_cur_inst)) AS s(ay, inst),
         generate_series(1, 3);

    -- Assert A: equal cycles (3 vs 3) ⇒ cycle_delta must be exactly 0.00
    SELECT f.cycle_delta::numeric INTO v_a
    FROM public.fn_schools_network_feeders(
           p_search => 'ZZREGRESSFEEDER HSS',
           p_sort   => 'priority',
           p_limit  => 5) f
    WHERE f.school_name = 'ZZREGRESSFEEDER HSS';

    -- Assert B: +2 current-cycle learners (5 vs 3) ⇒ exactly 2.00
    INSERT INTO public.learners_profiles
      (application_id, admission_year_id, institution_id,
       first_name, date_of_birth, gender, religion,
       father_name, father_mobile, mother_name, mother_mobile,
       last_school, board_of_study, tenth_marks, twelfth_marks,
       entry_type, student_mobile, student_email,
       permanent_address_street, permanent_address_district,
       permanent_address_pin_code, permanent_address_state)
    SELECT 'ZZREGRESS-' || gen_random_uuid(), v_cur_ay, v_cur_inst,
           'ZZREGRESS Feeder Sim', '2008-01-01', 'other', 'other',
           'ZZREGRESS Father', '0000000000', 'ZZREGRESS Mother', '0000000000',
           'ZZREGRESSFEEDER HSS', 'state_board', '{}'::jsonb, '{}'::jsonb,
           'regular', '0000000000', 'zzregress.feeder@invalid.jkkn',
           'ZZREGRESS Street', 'ZZREGRESS District', '000000', 'Tamil Nadu'
    FROM generate_series(1, 2);

    SELECT f.cycle_delta::numeric INTO v_b
    FROM public.fn_schools_network_feeders(
           p_search => 'ZZREGRESSFEEDER HSS',
           p_sort   => 'priority',
           p_limit  => 5) f
    WHERE f.school_name = 'ZZREGRESSFEEDER HSS';

    -- Roll the seeds back. Everything above un-happens; v_a/v_b survive.
    RAISE EXCEPTION 'LOOPS_REGRESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'LOOPS_REGRESS_ROLLBACK' THEN
      v_err := SQLERRM;   -- real failure: seeds still rolled back with the block
    END IF;
  END;

  v_verdict := CASE
    WHEN v_err IS NOT NULL           THEN 'sim-error: ' || left(v_err, 180)
    WHEN v_a = 0.00 AND v_b = 2.00   THEN 'measure-verified'
    ELSE 'sim-failed'
  END;

  -- The only persistent write: the verdict, visible on /admin/loops.
  INSERT INTO public.loop_audits (loop_key, layer, verdict, evidence)
  VALUES ('feeder', 'sim', v_verdict,
          jsonb_build_object('no_change', v_a, 'known_delta_plus2', v_b,
                             'cycle_year', v_cycle, 'prior_year', v_prior,
                             'runner', 'fn_loops_regress_feeder'));

  RETURN QUERY SELECT 'feeder'::text, v_verdict, v_a, v_b;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_feeder() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_feeder() TO service_role;

NOTIFY pgrst, 'reload schema';
