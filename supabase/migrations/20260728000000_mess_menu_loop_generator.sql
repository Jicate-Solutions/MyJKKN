-- Migration: Choose Your Menu self-improving loop — PR2 generator (Parts 3 + 5)
-- Date: 2026-06-28  Reason: add the recommend-next-menu generator + feed-forward.
--   Pairs with PR1 (20260727000000 spine + fn_mess_measure_menu_lift).
--   Spec: specs/mess-choose-your-menu-self-improving-loop-2026-06-28.md
-- Ships DARK (cron gated on mess.choose.loop.master_enabled=false from PR1).

-- ── Config (every decision = a config row) ───────────────────────────────────
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('mess.choose.loop.baseline_window_weeks', 'global', '4'::jsonb, 'number', 'major', 'published', true,
   'Trailing weeks averaged for the satisfaction/waste baseline (same window the generator stores and the measure compares against).'),
  ('mess.choose.loop.recommend_count', 'global', '6'::jsonb, 'number', 'major', 'published', true,
   'How many top-demand dishes the generator proposes per slot per week.'),
  ('mess.choose.loop.noise_band', 'global', '0.2'::jsonb, 'number', 'major', 'published', true,
   'Lift magnitude treated as "no measurable gain". A prior cycle with |rating_lift| <= this triggers a change-of-approach in the next recommendation.')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ── PART 3 (action) + PART 5 (feed-forward) generator ────────────────────────
-- Selects dishes by the UUID-keyed demand signals (votes + tier choices), captures the
-- baseline with the SAME estimator as fn_mess_measure_menu_lift, and — the moat part —
-- reads the prior cycle's measured lift + chairperson verdict: if the prior cycle was
-- REJECTED or produced no measurable gain (|lift| <= noise_band), it CHANGES APPROACH
-- (drops the prior picks, records why). Sets prior_recommendation_id so feed-forward is provable.
CREATE OR REPLACE FUNCTION public.fn_mess_recommend_next_menu(
  p_institution_id uuid, p_tier_key text, p_meal_type text, p_week_start date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window  int;
  v_count   int;
  v_noise   numeric;
  v_prior   public.mess_menu_recommendations%ROWTYPE;
  v_has_prior boolean := false;
  v_change  boolean := false;
  v_baseline_rating numeric;
  v_baseline_n      int;
  v_baseline_waste  numeric;
  v_rec_ids  uuid[];
  v_rationale jsonb;
  v_new_id   uuid;
BEGIN
  v_window := COALESCE((SELECT (value #>> '{}')::int     FROM platform_policies WHERE policy_key='mess.choose.loop.baseline_window_weeks'), 4);
  v_count  := COALESCE((SELECT (value #>> '{}')::int     FROM platform_policies WHERE policy_key='mess.choose.loop.recommend_count'), 6);
  v_noise  := COALESCE((SELECT (value #>> '{}')::numeric FROM platform_policies WHERE policy_key='mess.choose.loop.noise_band'), 0.2);

  -- PART 5: most recent prior cycle for this slot
  SELECT * INTO v_prior FROM public.mess_menu_recommendations
   WHERE institution_id=p_institution_id AND tier_key=p_tier_key AND meal_type=p_meal_type
     AND week_start_date < p_week_start
   ORDER BY week_start_date DESC LIMIT 1;
  v_has_prior := FOUND;
  IF v_has_prior AND (v_prior.status='rejected'
       OR (v_prior.rating_lift IS NOT NULL AND abs(v_prior.rating_lift) <= v_noise)) THEN
    v_change := true;   -- prior advice didn't land → change approach
  END IF;

  -- PART 4 baseline — SAME avg(rating) estimator as fn_mess_measure_menu_lift's outcome
  SELECT round(avg(r.rating)::numeric, 2), count(*)::int
    INTO v_baseline_rating, v_baseline_n
  FROM public.mess_meal_ratings r
  JOIN public.mess_menus m ON m.id = r.menu_id
  WHERE m.institution_id  = p_institution_id AND m.tier_key = p_tier_key
    AND m.meal_type::text  = p_meal_type
    AND m.week_start_date >= p_week_start - (v_window * 7)
    AND m.week_start_date <  p_week_start;
  SELECT round(avg(w.waste_percentage)::numeric, 2) INTO v_baseline_waste
  FROM public.mess_waste_log w
  WHERE w.institution_id = p_institution_id AND w.meal_type::text = p_meal_type
    AND w.date >= p_week_start - (v_window * 7) AND w.date < p_week_start;

  -- PART 3 action — rank library items by demand (net votes + tier choices); on change-of-approach, exclude prior picks
  WITH votes AS (
    SELECT item_id, sum(vote)::numeric AS net_votes FROM public.mess_dish_votes GROUP BY item_id
  ), choices AS (
    SELECT chosen_item_id AS item_id, count(*)::numeric AS picks
    FROM public.mess_meal_choices
    WHERE tier_key = p_tier_key AND meal_type = p_meal_type
    GROUP BY chosen_item_id
  ), scored AS (
    SELECT lib.id AS item_id,
           COALESCE(v.net_votes,0) AS net_votes,
           COALESCE(c.picks,0)     AS picks,
           COALESCE(v.net_votes,0) + COALESCE(c.picks,0) AS score
    FROM public.mess_menu_item_library lib
    LEFT JOIN votes   v ON v.item_id = lib.id
    LEFT JOIN choices c ON c.item_id = lib.id
    WHERE COALESCE(v.net_votes,0) + COALESCE(c.picks,0) > 0
      AND (NOT v_change OR lib.id <> ALL (COALESCE(v_prior.recommended_item_ids, ARRAY[]::uuid[])))
    ORDER BY score DESC, item_id
    LIMIT v_count
  )
  SELECT array_agg(item_id ORDER BY score DESC),
         jsonb_object_agg(item_id::text, jsonb_build_object('net_votes', net_votes, 'picks', picks))
    INTO v_rec_ids, v_rationale
  FROM scored;

  v_rec_ids := COALESCE(v_rec_ids, ARRAY[]::uuid[]);
  v_rationale := COALESCE(v_rationale, '{}'::jsonb) || jsonb_build_object(
    'change_approach', v_change,
    'feed_forward', CASE WHEN v_has_prior THEN
       jsonb_build_object('prior_id', v_prior.id, 'prior_status', v_prior.status, 'prior_rating_lift', v_prior.rating_lift)
       ELSE NULL END);

  INSERT INTO public.mess_menu_recommendations
    (institution_id, tier_key, meal_type, week_start_date, baseline_window_weeks,
     baseline_avg_rating, baseline_waste_pct, baseline_rating_n,
     recommended_item_ids, demoted_item_ids, rationale, prior_recommendation_id, status)
  VALUES
    (p_institution_id, p_tier_key, p_meal_type, p_week_start, v_window,
     v_baseline_rating, v_baseline_waste, v_baseline_n,
     v_rec_ids,
     CASE WHEN v_change THEN COALESCE(v_prior.recommended_item_ids, ARRAY[]::uuid[]) ELSE ARRAY[]::uuid[] END,
     v_rationale,
     CASE WHEN v_has_prior THEN v_prior.id ELSE NULL END,
     'proposed')
  ON CONFLICT (institution_id, tier_key, meal_type, week_start_date) DO UPDATE
    SET baseline_avg_rating = EXCLUDED.baseline_avg_rating,
        baseline_waste_pct  = EXCLUDED.baseline_waste_pct,
        baseline_rating_n   = EXCLUDED.baseline_rating_n,
        recommended_item_ids = EXCLUDED.recommended_item_ids,
        demoted_item_ids     = EXCLUDED.demoted_item_ids,
        rationale            = EXCLUDED.rationale,
        prior_recommendation_id = EXCLUDED.prior_recommendation_id,
        updated_at = now()
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_recommend_next_menu(uuid,text,text,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_recommend_next_menu(uuid,text,text,date) TO authenticated;

NOTIFY pgrst, 'reload schema';
