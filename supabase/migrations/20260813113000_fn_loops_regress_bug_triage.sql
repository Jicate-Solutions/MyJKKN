-- =============================================================================
-- 20260813113000_fn_loops_regress_bug_triage.sql
-- fn_loops_regress_bug_triage — the FOURTH scheduled known-delta regress sim,
-- joining fn_loops_regress_scf (20260711064500, the mould),
-- fn_loops_regress_feeder (20260713010053) and fn_loops_regress_mess
-- (20260726073305) on the weekly /api/cron/loops-regress run (dispatcher row
-- 'loops-regress', Sundays 07:53 IST — seeded by the mould migration; NO
-- schedule change here).
--
-- What it proves, weekly, against production data: the bug-triage loop's
-- MEASURE fn — fn_bug_fix_outcome_record, the outcome-ledger writer that
-- derives reporter_confirmed / reporter_pos / reporter_neg from the reporters'
-- own 👍/👎 answers (bug_fix_feedback_requests, status='answered') — still
-- measures known deltas exactly. This IS the loop's chartered outcome metric
-- ("reporter thumbs up/down on resolution emails (outcome ledger)",
-- loop_registry charter 20260726012000): the ledger's ground-truth rule is
-- D5/E2 of 20260718190000 — any 👎 = negative, silence = none, and the AI's
-- own verify tally is NEVER a retrieval key.
--   Assert A (no-change): a sentinel cluster with ZERO answered feedback
--                         requests ⇒ reporter_pos must be exactly 0 and
--                         reporter_confirmed must be 'none'
--   Assert B (known +2):  exactly 2 answered 'fixed' thumbs from 2 distinct
--                         reporters ⇒ reporter_pos must be exactly 2 and
--                         reporter_confirmed must be 'positive'
-- Why bug-triage earned slot 4: chartered 2026-07-26 (one of only four
-- chartered loops) yet never regress-proven — on the Loop Control Tower's
-- proven-green algebra that reads AMBER "unproven — no self-test runner".
-- This runner turns the badge honest.
--
-- Traps this encodes (do not "simplify" them away — all catalog-verified
-- read-only against prod 2026-08-13):
--   * bug_clusters.seed_bug_id is NOT NULL, FK to bug_reports(id) AND UNIQUE —
--     the anchor bug must be one that is not already some real cluster's seed
--     (3,021 such bugs at desk-check time). Deterministic pick: oldest by
--     (created_at, id), never a superlative that can re-aim.
--   * bug_fix_feedback_requests has UNIQUE (cluster_id, reporter_user_id) and
--     reporter_user_id FKs profiles(id) — the two sentinel thumbs need TWO
--     DISTINCT real profile ids (borrowed deterministically; rolled back).
--   * The measurer requires metadata->'fixability'->'verdict' or it returns
--     success=false ('no fixability verdict to learn from') — the sentinel
--     cluster carries a ZZREGRESS verdict with a sentinel file path, so the
--     derived root_cause_category ('zzregress/sim/runner') can never collide
--     with a real retrieval category even for the instant the row exists.
--   * The measurer counts ONLY rows WHERE cluster_id = p_cluster_id AND
--     status='answered' — scoping is by the sentinel cluster id itself, so no
--     far-past-date guard is needed here (unlike mess's tier-less waste leg).
--   * fn_bug_fix_outcome_record reads bug_reports.resolved_at for the anchor
--     bug (SELECT INTO, no FOUND check — NULL-safe) and upserts ONE
--     bug_fix_outcomes row keyed on cluster_id; both effects live inside the
--     subtransaction and are rolled back by the sentinel RAISE.
--   * No reset is needed between deltas: pos/neg are re-derived from the
--     feedback-request rows on every call (the upsert is ON CONFLICT UPDATE).
--   * The measurer has no auth/permission gate (SECURITY DEFINER, body
--     verified) — no impersonation GUC is needed, unlike the feeder regress.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_loops_regress_bug_triage()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_a       numeric;      -- no-change reporter_pos (must be 0.00)
  v_b       numeric;      -- +2-delta reporter_pos  (must be 2.00)
  v_conf_a  text;         -- reporter_confirmed at A (must be 'none')
  v_conf_b  text;         -- reporter_confirmed at B (must be 'positive')
  v_err     text := NULL; -- non-sentinel failure inside the sim block
  v_verdict text;
  v_bug     uuid;         -- borrowed REAL bug (seed FK; must not already seed a cluster)
  v_r1      uuid;         -- borrowed REAL reporter profile #1
  v_r2      uuid;         -- borrowed REAL reporter profile #2
  v_cluster uuid;         -- seeded sentinel cluster
  v_res     jsonb;        -- measurer return payload
BEGIN
  -- ── The sim, inside a subtransaction. The sentinel RAISE at the end rolls
  --    back every seeded row; the captured variables survive. Any OTHER error
  --    also rolls the seeds back and is reported as sim-error.
  BEGIN
    -- Deterministic anchor bug: oldest bug_reports row that is NOT already a
    -- cluster seed (seed_bug_id is UNIQUE — reusing a real seed would fail).
    SELECT b.id INTO v_bug
    FROM public.bug_reports b
    WHERE NOT EXISTS (SELECT 1 FROM public.bug_clusters c WHERE c.seed_bug_id = b.id)
    ORDER BY b.created_at ASC, b.id ASC
    LIMIT 1;
    IF v_bug IS NULL THEN
      RAISE EXCEPTION 'no non-seed bug_reports row available to anchor the sim';
    END IF;

    -- Two distinct real reporter profiles (FK + UNIQUE(cluster_id, reporter)).
    SELECT p.id INTO v_r1 FROM public.profiles p ORDER BY p.created_at ASC, p.id ASC LIMIT 1;
    SELECT p.id INTO v_r2 FROM public.profiles p ORDER BY p.created_at ASC, p.id ASC OFFSET 1 LIMIT 1;
    IF v_r1 IS NULL OR v_r2 IS NULL THEN
      RAISE EXCEPTION 'need two profiles rows to act as sentinel reporters';
    END IF;

    -- Seed: the sentinel cluster, carrying the fixability verdict the
    -- measurer requires. Sentinel file path ⇒ sentinel category.
    INSERT INTO public.bug_clusters
      (seed_bug_id, member_ids, member_count, sample_description, module_names,
       status, metadata)
    VALUES
      (v_bug, ARRAY[v_bug], 1, 'ZZREGRESS bug-triage regress sim', '{}'::text[],
       'proposed',
       jsonb_build_object('fixability', jsonb_build_object('verdict',
         jsonb_build_object(
           'root_cause', 'ZZREGRESS sentinel root cause (loops-regress sim)',
           'files', jsonb_build_array('zzregress/sim/runner')))))
    RETURNING id INTO v_cluster;

    -- Assert A: zero answered thumbs ⇒ pos exactly 0, confirmed 'none'.
    v_res := public.fn_bug_fix_outcome_record(v_cluster);
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'measure returned success=false: %',
        COALESCE(v_res ->> 'error', 'no error detail');
    END IF;
    v_a      := (v_res ->> 'pos')::numeric;
    v_conf_a := v_res ->> 'reporter_confirmed';

    -- Known +2 delta: exactly two answered 'fixed' thumbs (distinct reporters;
    -- status vocabulary and answer vocabulary are CHECK-constrained).
    INSERT INTO public.bug_fix_feedback_requests
      (cluster_id, bug_id, reporter_user_id, status, answer,
       sent_at, delivered_at, answered_at)
    SELECT v_cluster, v_bug, r.rid, 'answered', 'fixed', now(), now(), now()
    FROM (VALUES (v_r1), (v_r2)) AS r(rid);

    -- Assert B: pos exactly 2, confirmed 'positive'. No reset needed — the
    -- measurer re-derives from the request rows on every call.
    v_res := public.fn_bug_fix_outcome_record(v_cluster);
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'measure (delta) returned success=false: %',
        COALESCE(v_res ->> 'error', 'no error detail');
    END IF;
    v_b      := (v_res ->> 'pos')::numeric;
    v_conf_b := v_res ->> 'reporter_confirmed';

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
         AND v_conf_a = 'none' AND v_conf_b = 'positive'
      THEN 'measure-verified'
    ELSE 'sim-failed'
  END;

  -- The only persistent write: the verdict, visible on /admin/loops.
  INSERT INTO public.loop_audits (loop_key, layer, verdict, evidence)
  VALUES ('bug-triage', 'sim', v_verdict,
          jsonb_build_object('no_change', v_a, 'known_delta_plus2', v_b,
                             'confirmed_no_change', v_conf_a,
                             'confirmed_known_delta', v_conf_b,
                             'runner', 'fn_loops_regress_bug_triage'));

  RETURN QUERY SELECT 'bug-triage'::text, v_verdict, v_a, v_b;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_bug_triage() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_bug_triage() TO service_role;

NOTIFY pgrst, 'reload schema';
