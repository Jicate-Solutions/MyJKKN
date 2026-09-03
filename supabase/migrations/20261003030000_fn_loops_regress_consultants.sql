-- =============================================================================
-- 20261003030000_fn_loops_regress_consultants.sql
-- fn_loops_regress_consultants — the consultants loop joins the weekly
-- known-delta regress sim (dispatcher row 'loops-regress', Sundays 07:53 IST —
-- seeded by the mould 20260711064500; NO schedule change here). Pattern mould:
-- fn_loops_regress_bug_triage (20260813113000) — sentinel seeds inside a
-- plpgsql subtransaction → assert through the loop's REAL measure fn (never a
-- re-implementation) → sentinel RAISE rolls every seed back → the only
-- persistent write is the loop_audits verdict row.
--
-- What it proves, weekly, against production data: the consultants loop's
-- MEASURE fn — fn_consultants_measure_conversion (20261003010000) — still
-- computes window-vs-own-baseline conversion deltas exactly:
--   Assert A (no-change): sentinel Consultant A with baseline 2-of-4 enrolled
--     (50.00%) and window 1-of-2 enrolled (50.00%) ⇒ conversion_delta must be
--     exactly 0.00 (the fabricated-metric bug class: a broken estimator that
--     manufactures lift from no change).
--   Assert B (known +50pp): sentinel Consultant B with baseline 2-of-4
--     enrolled (50.00%) and window 2-of-2 enrolled (100.00%) ⇒ delta exactly
--     +50.00, window rate 100.00, baseline rate 50.00.
--
-- Traps this encodes (catalog-verified against repo schema 2026-08-26):
--   * consultant_lead_attributions.admission_id FKs admission_leads(id) and
--     the table CHECKs (learner_profile_id OR admission_id) — the sim borrows
--     12 REAL admission_leads that have NO attribution row (deterministic:
--     oldest by created_at, id), one per sentinel attribution, so any live
--     uniqueness on admission_id can never collide.
--   * institution_id is NOT NULL — each sentinel attribution reuses its
--     borrowed lead's own institution_id (always NOT NULL on admission_leads).
--   * education_consultants requires only (name, consultant_type) at insert
--     (createConsultant receipt); code is set to a ZZREGRESS sentinel value so
--     a UNIQUE code can never collide with a real consultant.
--   * AFTER INSERT trigger trg_update_consultant_lead_stats recomputes
--     counters for the SENTINEL consultant only (v_consultant_id scoping in
--     update_consultant_stats) — harmless, and rolled back with everything
--     else.
--   * The measure fn is called SCOPED (p_consultant_id) with p_min_n = 2, so
--     the sim never touches real consultants' measurement rows and the
--     de-noise floor is satisfied by 2-row windows; production runs keep the
--     policy floor (5).
--   * Baseline rows are seeded 60 days back, window rows 5 days back, against
--     a 30-day window ending CURRENT_DATE — both far from the date boundary,
--     so date-vs-timestamptz cast timezone skew cannot flip a row's side.
--
-- ⚠️ ORDER OF OPERATIONS (same rule as the feeder runner, index entry
-- 2026-07-13): apply this migration (and 20261003010000/20261003020000) via
-- the Mgmt API BEFORE merging the companion LOOP_FNS route change — the weekly
-- cron sim-errors if the fn is absent. All three files are Director-gated and
-- NOT applied by this PR.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_loops_regress_consultants()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_a       numeric;        -- Consultant A conversion_delta (must be exactly 0.00)
  v_b       numeric;        -- Consultant B conversion_delta (must be exactly 50.00)
  v_wr_a    numeric;        -- A window rate    (must be 50.00)
  v_br_a    numeric;        -- A baseline rate  (must be 50.00)
  v_wr_b    numeric;        -- B window rate    (must be 100.00)
  v_br_b    numeric;        -- B baseline rate  (must be 50.00)
  v_err     text := NULL;   -- non-sentinel failure inside the sim block
  v_verdict text;
  v_cons_a  uuid;           -- sentinel consultant A (no-change)
  v_cons_b  uuid;           -- sentinel consultant B (known +50pp)
  v_leads   uuid[];         -- 12 borrowed REAL attribution-free admission_leads
  v_insts   uuid[];         -- their institution_ids (NOT NULL FK on attributions)
BEGIN
  -- ── The sim, inside a subtransaction. The sentinel RAISE at the end rolls
  --    back every seeded row; the captured variables survive. Any OTHER error
  --    also rolls the seeds back and is reported as sim-error.
  BEGIN
    -- Deterministic anchors: the 12 oldest admission_leads with NO attribution
    -- row (distinct leads ⇒ immune to any live uniqueness on admission_id).
    SELECT array_agg(x.id ORDER BY x.rn), array_agg(x.institution_id ORDER BY x.rn)
      INTO v_leads, v_insts
    FROM (
      SELECT l.id, l.institution_id,
             row_number() OVER (ORDER BY l.created_at ASC, l.id ASC) AS rn
      FROM public.admission_leads l
      WHERE NOT EXISTS (SELECT 1 FROM public.consultant_lead_attributions a
                        WHERE a.admission_id = l.id)
      ORDER BY l.created_at ASC, l.id ASC
      LIMIT 12
    ) x;
    IF v_leads IS NULL OR array_length(v_leads, 1) < 12 THEN
      RAISE EXCEPTION 'need 12 attribution-free admission_leads rows to anchor the sim';
    END IF;

    -- Sentinel consultants (global entities; only name + consultant_type are
    -- required — code set explicitly so a UNIQUE code cannot collide).
    INSERT INTO public.education_consultants (name, consultant_type, code)
    VALUES ('ZZREGRESS Consultant A (loops-regress sim)', 'external', 'ZZREGRESS-CONS-A')
    RETURNING id INTO v_cons_a;
    INSERT INTO public.education_consultants (name, consultant_type, code)
    VALUES ('ZZREGRESS Consultant B (loops-regress sim)', 'external', 'ZZREGRESS-CONS-B')
    RETURNING id INTO v_cons_b;

    -- Seeds. Window = [CURRENT_DATE-30, CURRENT_DATE): baseline rows at -60d,
    -- window rows at -5d. Conversion vocabulary = the house predicate
    -- (current_stage IN ('enrolled','confirmed')) — 'enrolled' converts,
    -- 'lead_registered' does not.
    INSERT INTO public.consultant_lead_attributions
      (institution_id, admission_id, consultant_id, attribution_type,
       attribution_percentage, current_stage, created_at)
    VALUES
      -- Consultant A baseline: 2 of 4 enrolled ⇒ 50.00%
      (v_insts[1],  v_leads[1],  v_cons_a, 'primary', 100, 'enrolled',        now() - interval '60 days'),
      (v_insts[2],  v_leads[2],  v_cons_a, 'primary', 100, 'enrolled',        now() - interval '60 days'),
      (v_insts[3],  v_leads[3],  v_cons_a, 'primary', 100, 'lead_registered', now() - interval '60 days'),
      (v_insts[4],  v_leads[4],  v_cons_a, 'primary', 100, 'lead_registered', now() - interval '60 days'),
      -- Consultant A window: 1 of 2 enrolled ⇒ 50.00% (no change)
      (v_insts[5],  v_leads[5],  v_cons_a, 'primary', 100, 'enrolled',        now() - interval '5 days'),
      (v_insts[6],  v_leads[6],  v_cons_a, 'primary', 100, 'lead_registered', now() - interval '5 days'),
      -- Consultant B baseline: 2 of 4 enrolled ⇒ 50.00%
      (v_insts[7],  v_leads[7],  v_cons_b, 'primary', 100, 'enrolled',        now() - interval '60 days'),
      (v_insts[8],  v_leads[8],  v_cons_b, 'primary', 100, 'enrolled',        now() - interval '60 days'),
      (v_insts[9],  v_leads[9],  v_cons_b, 'primary', 100, 'lead_registered', now() - interval '60 days'),
      (v_insts[10], v_leads[10], v_cons_b, 'primary', 100, 'lead_registered', now() - interval '60 days'),
      -- Consultant B window: 2 of 2 enrolled ⇒ 100.00% (known +50pp)
      (v_insts[11], v_leads[11], v_cons_b, 'primary', 100, 'enrolled',        now() - interval '5 days'),
      (v_insts[12], v_leads[12], v_cons_b, 'primary', 100, 'enrolled',        now() - interval '5 days');

    -- Assert A through the loop's REAL measure fn, scoped to the sentinel
    -- (p_min_n=2 satisfies the floor with 2-row windows; sim-only override).
    SELECT r.conversion_delta, r.window_conversion_rate, r.baseline_conversion_rate
      INTO v_a, v_wr_a, v_br_a
    FROM public.fn_consultants_measure_conversion(CURRENT_DATE, 30, v_cons_a, 2) r;

    -- Assert B: the known +50pp delta.
    SELECT r.conversion_delta, r.window_conversion_rate, r.baseline_conversion_rate
      INTO v_b, v_wr_b, v_br_b
    FROM public.fn_consultants_measure_conversion(CURRENT_DATE, 30, v_cons_b, 2) r;

    -- Roll the seeds back. Everything above un-happens; captures survive.
    RAISE EXCEPTION 'LOOPS_REGRESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'LOOPS_REGRESS_ROLLBACK' THEN
      v_err := SQLERRM;   -- real failure: seeds still rolled back with the block
    END IF;
  END;

  v_verdict := CASE
    WHEN v_err IS NOT NULL THEN 'sim-error: ' || left(v_err, 180)
    WHEN v_a = 0.00 AND v_b = 50.00
         AND v_wr_a = 50.00 AND v_br_a = 50.00
         AND v_wr_b = 100.00 AND v_br_b = 50.00
      THEN 'measure-verified'
    ELSE 'sim-failed'
  END;

  -- The only persistent write: the verdict, visible on /admin/loops.
  INSERT INTO public.loop_audits (loop_key, layer, verdict, evidence)
  VALUES ('consultants', 'sim', v_verdict,
          jsonb_build_object('no_change_delta', v_a, 'known_delta_plus50pp', v_b,
                             'window_rate_a', v_wr_a, 'baseline_rate_a', v_br_a,
                             'window_rate_b', v_wr_b, 'baseline_rate_b', v_br_b,
                             'runner', 'fn_loops_regress_consultants'));

  RETURN QUERY SELECT 'consultants'::text, v_verdict, v_a, v_b;
END;
$function$;

-- Lock: SECURITY DEFINER ⇒ explicit revoke from anon AND PUBLIC in the same
-- file; the runner is service_role-only (invoked by /api/cron/loops-regress).
REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_consultants() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_consultants() TO service_role;

NOTIFY pgrst, 'reload schema';
