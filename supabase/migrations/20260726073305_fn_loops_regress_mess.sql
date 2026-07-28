-- =============================================================================
-- 20260726073305_fn_loops_regress_mess.sql
-- fn_loops_regress_mess — the THIRD scheduled known-delta regress sim,
-- joining fn_loops_regress_scf (20260711064500, the mould) and
-- fn_loops_regress_feeder (20260713010053) on the weekly
-- /api/cron/loops-regress run (dispatcher row 'loops-regress', Sundays
-- 07:53 IST — already seeded by the mould migration; NO schedule change here).
--
-- What it proves, weekly, against production data: the mess loop's MEASURE
-- fn — fn_mess_measure_menu_lift, the per-recommendation satisfaction/waste
-- lift estimator behind the Choose Your Menu loop — still measures known
-- deltas exactly.
--   Assert A (no-change): k=3 sentinel ratings at 3 stars vs a seeded
--                         baseline of 3.00 ⇒ rating_lift must be exactly 0.00
--   Assert B (known +2):  same ratings raised to 5 stars (5.00 vs 3.00)
--                         ⇒ rating_lift must be exactly 2.00
-- Why mess earned slot 3: loop_registry claimed m=on while the loop had
-- measured 0 rows — exactly the fabricated-metric bug class this cron exists
-- to catch.
-- Recipe: the loops manifest .claude/loop-manifests/mess.yaml sim block
-- (schema facts verified read-only against prod 2026-07-13), executed as an
-- fn-internal rolled-back sim (savepoint pattern): every seed lives inside
-- the BEGIN…EXCEPTION subtransaction and is aborted by the sentinel RAISE;
-- the captured lifts survive into the outer scope; the ONLY persistent write
-- is the loop_audits verdict row that /admin/loops renders as the chip's
-- "tested" badge.
--
-- Traps this encodes (do not "simplify" them away — all manifest-verified):
--   * rating_lift is NULL (not 0) when outcome_rating_n < min_ratings_k(3) —
--     a 2-rating seed silently yields NULL; seed exactly k=3.
--   * The waste leg has NO tier filter (caterer+meal+date only), so a live
--     week would let a real caterer's waste rows contaminate the row. We use
--     a far-past week AND assert rating_lift only; baseline_waste_pct is left
--     NULL so waste_lift stays NULL by the fn's own CASE.
--   * mess_menus.caterer_id / mess_menu_recommendations.caterer_id are FKs to
--     mess_caterers (NOT NULL billing_model etc. would make seeding one
--     heavy) — so we borrow a REAL caterer id but scope every join with a
--     sentinel tier_key ('ZZREGRESSMESS_TIER'): the measurer's rating leg
--     joins caterer+tier+meal+week, which only the seeded rows can match.
--   * mess_menus.meal_type is an ENUM (meal_type_enum) while the
--     recommendation's meal_type is TEXT — the measurer joins via
--     m.meal_type::text; both sides are seeded 'lunch'.
--   * mess_meal_ratings has a FK ONLY on menu_id (profile_id/institution_id
--     carry no FK) — gen_random_uuid() profile ids are safe and also satisfy
--     UNIQUE(profile_id, menu_id, item_text).
--   * Outcome columns are reset between deltas (manifest reset_between_deltas)
--     so Assert B reads a freshly computed lift, never a stale one.
--   * The measurer is per-recommendation-id (NOT a sweep like scf's) and has
--     no auth/permission gate (SECURITY DEFINER, body verified) — no
--     impersonation GUC is needed, unlike the feeder regress.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_loops_regress_mess()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_a       numeric;      -- no-change rating_lift (must be 0.00)
  v_b       numeric;      -- +2-delta rating_lift  (must be 2.00)
  v_err     text := NULL; -- non-sentinel failure inside the sim block
  v_verdict text;
  v_cat     uuid;         -- borrowed REAL caterer (FK; sentinel tier scopes the join)
  v_inst    uuid;         -- that caterer's institution (NOT NULL FK on both seeds)
  v_week    date;         -- far-past Monday (waste-leg contamination guard)
  v_menu    uuid;         -- seeded sentinel menu cell
  v_rec     uuid;         -- seeded sentinel recommendation
BEGIN
  -- ── The sim, inside a subtransaction. The sentinel RAISE at the end rolls
  --    back every seeded row; the captured v_a/v_b variables survive. Any
  --    OTHER error also rolls the seeds back and is reported as sim-error.
  BEGIN
    -- Deterministic caterer pick (pin by date, never by a superlative that
    -- can re-aim — the feeder regress convention).
    SELECT c.id, c.institution_id INTO v_cat, v_inst
    FROM public.mess_caterers c
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1;
    IF v_cat IS NULL THEN
      RAISE EXCEPTION 'no mess_caterers row available to anchor the sim';
    END IF;

    -- Far-past Monday (date_trunc(week) is ISO-Monday). ~400 days back
    -- predates the mess module entirely, so the tier-less waste leg finds
    -- nothing even for this real caterer.
    v_week := date_trunc('week', current_date - 400)::date;

    -- Seed: cycle-1 sentinel menu cell + exactly k=3 ratings at 3 stars.
    INSERT INTO public.mess_menus
      (institution_id, caterer_id, week_start_date, day_of_week, meal_type,
       items, status, tier_key)
    VALUES
      (v_inst, v_cat, v_week, 1, 'lunch', ARRAY['ZZREGRESS mess item'],
       'served', 'ZZREGRESSMESS_TIER')
    RETURNING id INTO v_menu;

    INSERT INTO public.mess_meal_ratings
      (institution_id, profile_id, menu_id, item_text, rating)
    SELECT v_inst, gen_random_uuid(), v_menu, 'ZZREGRESS mess item', 3
    FROM generate_series(1, 3);

    -- Seed: cycle-1 recommendation with a KNOWN baseline (3.00 over n=3).
    -- baseline_waste_pct deliberately NULL ⇒ waste_lift NULL (see header).
    INSERT INTO public.mess_menu_recommendations
      (institution_id, caterer_id, tier_key, meal_type, week_start_date,
       baseline_window_weeks, baseline_avg_rating, baseline_rating_n,
       recommended_item_ids, rationale, status)
    VALUES
      (v_inst, v_cat, 'ZZREGRESSMESS_TIER', 'lunch', v_week,
       4, 3.00, 3, ARRAY[gen_random_uuid()],
       '{"seed":"ZZREGRESS mess regress sim"}'::jsonb, 'proposed')
    RETURNING id INTO v_rec;

    -- Assert A: 3× rating=3 vs baseline 3.00 ⇒ rating_lift exactly 0.00
    SELECT m.rating_lift INTO v_a
    FROM public.fn_mess_measure_menu_lift(v_rec) m;

    -- Reset outcome columns between deltas (manifest reset_between_deltas).
    UPDATE public.mess_menu_recommendations
       SET outcome_avg_rating = NULL, outcome_waste_pct = NULL,
           outcome_rating_n = NULL, rating_lift = NULL, waste_lift = NULL,
           measured_at = NULL
     WHERE id = v_rec;

    -- Assert B: raise the seeded ratings to 5 (5.00 vs 3.00) ⇒ exactly 2.00
    UPDATE public.mess_meal_ratings SET rating = 5 WHERE menu_id = v_menu;

    SELECT m.rating_lift INTO v_b
    FROM public.fn_mess_measure_menu_lift(v_rec) m;

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
  VALUES ('mess', 'sim', v_verdict,
          jsonb_build_object('no_change', v_a, 'known_delta_plus2', v_b,
                             'runner', 'fn_loops_regress_mess'));

  RETURN QUERY SELECT 'mess'::text, v_verdict, v_a, v_b;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_mess() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_mess() TO service_role;

NOTIFY pgrst, 'reload schema';
