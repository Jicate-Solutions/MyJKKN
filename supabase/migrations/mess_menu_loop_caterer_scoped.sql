-- Mess menu-loop: CATERER-scoped, not institution-scoped (2026-07-10)
-- Director: "same caterer, not institution wise." One institution (Dental) runs two
-- hostels = two caterers (boys/girls, mess_caterers.gender_served). The loop must
-- recommend + measure PER CATERER so each hostel's own students shape its menu.
-- Data already carries caterer: menus.caterer_id, waste_log.caterer_id, a rating's
-- menu_id -> menu.caterer_id, and a vote/choice's learner_id -> learner gender.

-- 1) recommendations carry caterer_id; the unique slot is per-caterer (0 existing rows).
ALTER TABLE public.mess_menu_recommendations
  ADD COLUMN IF NOT EXISTS caterer_id uuid REFERENCES public.mess_caterers(id);
ALTER TABLE public.mess_menu_recommendations
  DROP CONSTRAINT IF EXISTS mess_menu_recommendations_institution_id_tier_key_meal_type_key;
ALTER TABLE public.mess_menu_recommendations
  ADD CONSTRAINT mess_menu_recommendations_caterer_slot_key
  UNIQUE (caterer_id, tier_key, meal_type, week_start_date);

-- 2) recommend generator: scope by caterer. First param becomes p_caterer_id (rename
--    requires DROP+CREATE, not CREATE OR REPLACE). Votes/choices routed by voter
--    gender -> caterer.gender_served; ratings/waste by caterer_id.
DROP FUNCTION IF EXISTS public.fn_mess_recommend_next_menu(uuid, text, text, date);
CREATE FUNCTION public.fn_mess_recommend_next_menu(
    p_caterer_id uuid, p_tier_key text, p_meal_type text, p_week_start date)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_gender text;
  v_window int; v_count int; v_noise numeric;
  v_prior public.mess_menu_recommendations%ROWTYPE;
  v_has_prior boolean := false; v_change boolean := false;
  v_baseline_rating numeric; v_baseline_n int; v_baseline_waste numeric;
  v_rec_ids uuid[]; v_rationale jsonb; v_new_id uuid;
BEGIN
  SELECT institution_id, gender_served INTO v_inst, v_gender
    FROM public.mess_caterers WHERE id = p_caterer_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_mess_recommend_next_menu: caterer % not found', p_caterer_id;
  END IF;

  v_window := COALESCE((SELECT (value #>> '{}')::int     FROM platform_policies WHERE policy_key='mess.choose.loop.baseline_window_weeks'), 4);
  v_count  := COALESCE((SELECT (value #>> '{}')::int     FROM platform_policies WHERE policy_key='mess.choose.loop.recommend_count'), 6);
  v_noise  := COALESCE((SELECT (value #>> '{}')::numeric FROM platform_policies WHERE policy_key='mess.choose.loop.noise_band'), 0.2);

  -- prior cycle for THIS caterer's slot
  SELECT * INTO v_prior FROM public.mess_menu_recommendations
   WHERE caterer_id=p_caterer_id AND tier_key=p_tier_key AND meal_type=p_meal_type
     AND week_start_date < p_week_start
   ORDER BY week_start_date DESC LIMIT 1;
  v_has_prior := FOUND;
  IF v_has_prior AND (v_prior.status='rejected'
       OR (v_prior.rating_lift IS NOT NULL AND abs(v_prior.rating_lift) <= v_noise)) THEN
    v_change := true;
  END IF;

  -- baseline satisfaction: this caterer's menus only
  SELECT round(avg(r.rating)::numeric,2), count(*)::int INTO v_baseline_rating, v_baseline_n
  FROM public.mess_meal_ratings r JOIN public.mess_menus m ON m.id = r.menu_id
  WHERE m.caterer_id = p_caterer_id AND m.tier_key = p_tier_key AND m.meal_type::text = p_meal_type
    AND m.week_start_date >= p_week_start - (v_window*7) AND m.week_start_date < p_week_start;

  -- baseline waste: this caterer only
  SELECT round(avg(w.waste_percentage)::numeric,2) INTO v_baseline_waste
  FROM public.mess_waste_log w
  WHERE w.caterer_id = p_caterer_id AND w.meal_type::text = p_meal_type
    AND w.date >= p_week_start - (v_window*7) AND w.date < p_week_start;

  -- action: rank library items by THIS hostel's demand (votes+choices from students
  -- whose gender matches this caterer's gender_served).
  WITH votes AS (
    SELECT dv.item_id, sum(dv.vote)::numeric AS net_votes
    FROM public.mess_dish_votes dv
    JOIN public.learners_profiles lp ON lp.id = dv.learner_id
    WHERE (CASE WHEN upper(btrim(lp.gender)) LIKE 'M%' THEN 'boys'
                WHEN upper(btrim(lp.gender)) LIKE 'F%' THEN 'girls' END) = v_gender
    GROUP BY dv.item_id
  ), choices AS (
    SELECT mc.chosen_item_id AS item_id, count(*)::numeric AS picks
    FROM public.mess_meal_choices mc
    JOIN public.learners_profiles lp ON lp.id = mc.learner_id
    WHERE mc.tier_key = p_tier_key AND mc.meal_type = p_meal_type
      AND (CASE WHEN upper(btrim(lp.gender)) LIKE 'M%' THEN 'boys'
                WHEN upper(btrim(lp.gender)) LIKE 'F%' THEN 'girls' END) = v_gender
    GROUP BY mc.chosen_item_id
  ), scored AS (
    SELECT lib.id AS item_id, COALESCE(v.net_votes,0) AS net_votes, COALESCE(c.picks,0) AS picks,
           COALESCE(v.net_votes,0)+COALESCE(c.picks,0) AS score
    FROM public.mess_menu_item_library lib
    LEFT JOIN votes v ON v.item_id=lib.id
    LEFT JOIN choices c ON c.item_id=lib.id
    WHERE COALESCE(v.net_votes,0)+COALESCE(c.picks,0) > 0
      AND (NOT v_change OR lib.id <> ALL (COALESCE(v_prior.recommended_item_ids, ARRAY[]::uuid[])))
    ORDER BY score DESC, item_id LIMIT v_count
  )
  SELECT array_agg(item_id ORDER BY score DESC),
         jsonb_object_agg(item_id::text, jsonb_build_object('net_votes',net_votes,'picks',picks))
    INTO v_rec_ids, v_rationale FROM scored;

  v_rec_ids := COALESCE(v_rec_ids, ARRAY[]::uuid[]);
  v_rationale := COALESCE(v_rationale,'{}'::jsonb) || jsonb_build_object(
    'change_approach', v_change,
    'feed_forward', CASE WHEN v_has_prior THEN
       jsonb_build_object('prior_id',v_prior.id,'prior_status',v_prior.status,'prior_rating_lift',v_prior.rating_lift)
       ELSE NULL END);

  INSERT INTO public.mess_menu_recommendations
    (institution_id, caterer_id, tier_key, meal_type, week_start_date, baseline_window_weeks,
     baseline_avg_rating, baseline_waste_pct, baseline_rating_n,
     recommended_item_ids, demoted_item_ids, rationale, prior_recommendation_id, status)
  VALUES
    (v_inst, p_caterer_id, p_tier_key, p_meal_type, p_week_start, v_window,
     v_baseline_rating, v_baseline_waste, v_baseline_n, v_rec_ids,
     CASE WHEN v_change THEN COALESCE(v_prior.recommended_item_ids, ARRAY[]::uuid[]) ELSE ARRAY[]::uuid[] END,
     v_rationale, CASE WHEN v_has_prior THEN v_prior.id ELSE NULL END, 'proposed')
  ON CONFLICT (caterer_id, tier_key, meal_type, week_start_date) DO UPDATE
    SET baseline_avg_rating=EXCLUDED.baseline_avg_rating, baseline_waste_pct=EXCLUDED.baseline_waste_pct,
        baseline_rating_n=EXCLUDED.baseline_rating_n, recommended_item_ids=EXCLUDED.recommended_item_ids,
        demoted_item_ids=EXCLUDED.demoted_item_ids, rationale=EXCLUDED.rationale,
        prior_recommendation_id=EXCLUDED.prior_recommendation_id, updated_at=now()
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_recommend_next_menu(uuid,text,text,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_recommend_next_menu(uuid,text,text,date) TO authenticated;

-- 3) measure: satisfaction + waste lift filtered by the recommendation's caterer_id.
CREATE OR REPLACE FUNCTION public.fn_mess_measure_menu_lift(p_recommendation_id uuid)
 RETURNS TABLE(rating_lift numeric, waste_lift numeric, outcome_rating_n integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_rec public.mess_menu_recommendations%ROWTYPE;
  v_k int; v_outcome_rating numeric; v_outcome_n int; v_outcome_waste numeric;
  v_rating_lift numeric; v_waste_lift numeric;
BEGIN
  SELECT * INTO v_rec FROM public.mess_menu_recommendations WHERE id = p_recommendation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation % not found', p_recommendation_id; END IF;
  v_k := COALESCE((SELECT (value #>> '{}')::int FROM public.platform_policies WHERE policy_key='mess.choose.loop.min_ratings_k'), 3);

  -- OUTCOME satisfaction — this caterer's menus only
  SELECT round(avg(r.rating)::numeric,2), count(*)::int INTO v_outcome_rating, v_outcome_n
  FROM public.mess_meal_ratings r JOIN public.mess_menus m ON m.id = r.menu_id
  WHERE m.caterer_id = v_rec.caterer_id AND m.tier_key = v_rec.tier_key
    AND m.meal_type::text = v_rec.meal_type AND m.week_start_date = v_rec.week_start_date;

  -- OUTCOME waste — this caterer only
  SELECT round(avg(w.waste_percentage)::numeric,2) INTO v_outcome_waste
  FROM public.mess_waste_log w
  WHERE w.caterer_id = v_rec.caterer_id AND w.meal_type::text = v_rec.meal_type
    AND w.date >= v_rec.week_start_date AND w.date < v_rec.week_start_date + 7;

  v_rating_lift := CASE WHEN v_outcome_n >= v_k AND v_rec.baseline_avg_rating IS NOT NULL
                        THEN round(v_outcome_rating - v_rec.baseline_avg_rating, 2) END;
  v_waste_lift  := CASE WHEN v_rec.baseline_waste_pct IS NOT NULL AND v_outcome_waste IS NOT NULL
                        THEN round(v_rec.baseline_waste_pct - v_outcome_waste, 2) END;

  UPDATE public.mess_menu_recommendations
     SET outcome_avg_rating=v_outcome_rating, outcome_waste_pct=v_outcome_waste,
         outcome_rating_n=v_outcome_n, rating_lift=v_rating_lift, waste_lift=v_waste_lift,
         measured_at=now(), updated_at=now()
   WHERE id = p_recommendation_id;
  RETURN QUERY SELECT v_rating_lift, v_waste_lift, v_outcome_n;
END; $function$;
