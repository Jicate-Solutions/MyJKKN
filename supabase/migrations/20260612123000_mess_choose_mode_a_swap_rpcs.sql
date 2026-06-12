-- ============================================================================
-- Choose Your Menu — Mode A "pick your meal" RPCs (ships DARK)
-- ============================================================================
-- Date: 2026-06-12. Director: "build it now, use it only when needed".
-- Spec: specs/choose-your-menu-platform-spec-2026-06-11.md §Mode A.
--
-- Triple-dark today: mess.choose.master_enabled=false AND the Premium Plus
-- plan (the only personalization-enabled plan) is is_active=false AND no
-- learner holds it. Every write guard below re-checks at call time, so
-- flipping surfaces later needs zero deploys.
--
-- Option model (Director 2026-06-12, low-caterer-effort): "pick from either
-- menu line" — options for a meal = dishes from EVERY active plan's menu for
-- that cell (resolved to mess_menu_item_library by exact English-name match)
-- ∪ admin-curated mess_meal_alternatives. Capped by
-- mess.choose.personalization.options_per_meal. Pre-commit cutoff =
-- mess.choose.personalization.cutoff_hours before the meal's IST start time
-- (same MEAL_START_TIMES_IST convention as mess-rating-gate /
-- mess-menu-service: breakfast 07:30, lunch 12:30, tea 16:30, dinner 19:00).
--
-- SECURITY: SECURITY DEFINER + REVOKE FROM anon, PUBLIC + GRANT authenticated
-- (Supabase default-grants anon EXECUTE on every new function). The write
-- path validates caller identity via auth.uid() (service_role gets
-- not_authenticated — recognition stays conferred, choices stay owner-made).
-- Idempotent (CREATE OR REPLACE). Applied via exec_sql post-merge.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- Helper: the caller's mess plan + gender + learner id (NULL row if none).
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_choose_caller_context()
RETURNS TABLE (learner_id uuid, plan_key text, gender text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lp.id,
    COALESCE(mc.menu_tier_key, lower(regexp_replace(trim(mc.name), '\s+', '_', 'g'))),
    CASE
      WHEN mc.type IN ('boys','girls') THEN mc.type
      WHEN upper(COALESCE(lp.gender,'')) = 'MALE'   THEN 'boys'
      WHEN upper(COALESCE(lp.gender,'')) = 'FEMALE' THEN 'girls'
      ELSE NULL
    END
  FROM public.profiles p
  JOIN public.learners_profiles lp ON lp.id = p.learner_id
  LEFT JOIN public.mess_categories mc ON mc.id = lp.mess_category_id
  WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_choose_caller_context() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_choose_caller_context() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 1. Swap options for a meal cell — "either line" ∪ curated alternatives.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_choose_swap_options(
  p_week_start  date,
  p_day_of_week int,
  p_meal_type   text,
  p_gender      text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_week date;
  v_cap int;
  v_options jsonb;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;
  IF p_gender NOT IN ('boys','girls') THEN
    RETURN jsonb_build_object('error', 'invalid_gender');
  END IF;

  v_cap := GREATEST(COALESCE(public.fn_get_policy_int(
    'mess.choose.personalization.options_per_meal', 3, NULL), 3), 1);

  -- Same default-week fallback as fn_mess_menu_week, so options track
  -- whatever week the menu viewer is actually showing.
  SELECT m.week_start_date INTO v_effective_week
  FROM public.mess_menus m
  JOIN public.mess_caterers cat ON cat.id = m.caterer_id
  WHERE cat.gender_served = p_gender
    AND (m.items_tamil IS NOT NULL OR m.items_english IS NOT NULL OR m.items IS NOT NULL)
    AND m.week_start_date <= p_week_start
  ORDER BY m.week_start_date DESC
  LIMIT 1;
  IF v_effective_week IS NULL THEN
    SELECT m.week_start_date INTO v_effective_week
    FROM public.mess_menus m
    JOIN public.mess_caterers cat ON cat.id = m.caterer_id
    WHERE cat.gender_served = p_gender
      AND (m.items_tamil IS NOT NULL OR m.items_english IS NOT NULL OR m.items IS NOT NULL)
    ORDER BY m.week_start_date ASC
    LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_options FROM (
    SELECT d.item_id, d.dish, d.source_plan
    FROM (
      -- One row per item: curated beats line-sourced when both exist.
      SELECT DISTINCT ON (u.item_id) u.*
      FROM (
        -- (a) every active plan's line for this cell, name-matched to library
        SELECT
          lib.id   AS item_id,
          COALESCE(lib.name_english, lib.name_tamil) AS dish,
          m.tier_key AS source_plan,
          0 AS curated
        FROM public.mess_menus m
        JOIN public.mess_caterers cat ON cat.id = m.caterer_id
        CROSS JOIN LATERAL unnest(COALESCE(m.items_english, ARRAY[]::text[])) AS dish_name
        JOIN public.mess_menu_item_library lib
          ON lower(trim(lib.name_english)) = lower(trim(dish_name))
        WHERE m.week_start_date = v_effective_week
          AND m.day_of_week     = p_day_of_week
          AND m.meal_type       = p_meal_type
          AND cat.gender_served = p_gender
          AND m.tier_key IN (
            SELECT DISTINCT COALESCE(c.menu_tier_key, lower(regexp_replace(trim(c.name), '\s+', '_', 'g')))
            FROM public.mess_categories c WHERE c.is_active
          )
        UNION ALL
        -- (b) admin-curated alternatives for this cell (this gender)
        SELECT
          lib2.id,
          COALESCE(lib2.name_english, lib2.name_tamil),
          'curated',
          1
        FROM public.mess_meal_alternatives a
        JOIN public.mess_menu_item_library lib2 ON lib2.id = a.item_id
        WHERE a.week_start_date IN (p_week_start, v_effective_week)
          AND a.day_of_week = p_day_of_week
          AND a.meal_type   = p_meal_type
          AND a.gender      = p_gender
      ) u
      ORDER BY u.item_id, u.curated DESC
    ) d
    ORDER BY (d.source_plan = 'curated') DESC, d.dish ASC
    LIMIT v_cap
  ) t;

  RETURN jsonb_build_object(
    'week_start', p_week_start,
    'effective_week', v_effective_week,
    'options', v_options
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_choose_swap_options(date, int, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_choose_swap_options(date, int, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 2. Set my choice — the full guard stack, then upsert my own row.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_choose_set_choice(
  p_week_start  date,
  p_day_of_week int,
  p_meal_type   text,
  p_item_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx record;
  v_enabled_plans jsonb;
  v_cutoff_hours int;
  v_meal_start_ist time;
  v_deadline timestamptz;
  v_dish text;
  v_valid boolean;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Master switch (fail closed).
  IF NOT COALESCE((public.fn_get_policy('mess.choose.master_enabled', NULL))::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_disabled');
  END IF;

  SELECT * INTO v_ctx FROM public.fn_mess_choose_caller_context();
  IF v_ctx.learner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_learner_profile');
  END IF;
  IF v_ctx.plan_key IS NULL OR v_ctx.gender IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_mess_plan');
  END IF;

  -- Plan must be personalization-enabled (jsonb array policy).
  v_enabled_plans := COALESCE(
    public.fn_get_policy('mess.choose.personalization.enabled_tiers', NULL), '[]'::jsonb);
  IF NOT (v_enabled_plans ? v_ctx.plan_key) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'plan_not_enabled');
  END IF;

  IF p_meal_type NOT IN ('breakfast','lunch','tea','dinner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_meal');
  END IF;
  IF p_day_of_week NOT BETWEEN 1 AND 7 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_day');
  END IF;

  -- Cutoff: meal IST start (mess-rating-gate convention) minus cutoff_hours.
  v_cutoff_hours := COALESCE(public.fn_get_policy_int(
    'mess.choose.personalization.cutoff_hours', 12, NULL), 12);
  v_meal_start_ist := CASE p_meal_type
    WHEN 'breakfast' THEN time '07:30'
    WHEN 'lunch'     THEN time '12:30'
    WHEN 'tea'       THEN time '16:30'
    WHEN 'dinner'    THEN time '19:00'
  END;
  v_deadline := ((p_week_start + (p_day_of_week - 1)) + v_meal_start_ist)
                  AT TIME ZONE 'Asia/Kolkata'
                - make_interval(hours => v_cutoff_hours);
  IF now() >= v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cutoff_passed',
                              'deadline', v_deadline);
  END IF;

  -- The item must be one of the offered options for this cell.
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      (public.fn_mess_choose_swap_options(
         p_week_start, p_day_of_week, p_meal_type, v_ctx.gender) -> 'options')
    ) o
    WHERE (o ->> 'item_id')::uuid = p_item_id
  ) INTO v_valid;
  IF NOT v_valid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_option');
  END IF;

  SELECT COALESCE(name_english, name_tamil) INTO v_dish
  FROM public.mess_menu_item_library WHERE id = p_item_id;

  INSERT INTO public.mess_meal_choices
    (learner_id, week_start_date, day_of_week, meal_type, tier_key, gender, chosen_item_id)
  VALUES
    (v_ctx.learner_id, p_week_start, p_day_of_week, p_meal_type,
     v_ctx.plan_key, v_ctx.gender, p_item_id)
  ON CONFLICT (learner_id, week_start_date, day_of_week, meal_type)
  DO UPDATE SET chosen_item_id = EXCLUDED.chosen_item_id,
                tier_key = EXCLUDED.tier_key,
                gender   = EXCLUDED.gender,
                updated_at = now();

  RETURN jsonb_build_object('ok', true, 'dish', v_dish);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_choose_set_choice(date, int, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_choose_set_choice(date, int, text, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 3. Clear my choice (same cutoff guard — no un-picking after the kitchen
--    has its counts).
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_choose_clear_choice(
  p_week_start  date,
  p_day_of_week int,
  p_meal_type   text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx record;
  v_cutoff_hours int;
  v_meal_start_ist time;
  v_deadline timestamptz;
  v_deleted int;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  SELECT * INTO v_ctx FROM public.fn_mess_choose_caller_context();
  IF v_ctx.learner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_learner_profile');
  END IF;

  v_cutoff_hours := COALESCE(public.fn_get_policy_int(
    'mess.choose.personalization.cutoff_hours', 12, NULL), 12);
  v_meal_start_ist := CASE p_meal_type
    WHEN 'breakfast' THEN time '07:30'
    WHEN 'lunch'     THEN time '12:30'
    WHEN 'tea'       THEN time '16:30'
    WHEN 'dinner'    THEN time '19:00'
    ELSE NULL
  END;
  IF v_meal_start_ist IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_meal');
  END IF;
  v_deadline := ((p_week_start + (p_day_of_week - 1)) + v_meal_start_ist)
                  AT TIME ZONE 'Asia/Kolkata'
                - make_interval(hours => v_cutoff_hours);
  IF now() >= v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cutoff_passed');
  END IF;

  DELETE FROM public.mess_meal_choices
  WHERE learner_id = v_ctx.learner_id
    AND week_start_date = p_week_start
    AND day_of_week = p_day_of_week
    AND meal_type = p_meal_type;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'cleared', v_deleted > 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_choose_clear_choice(date, int, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_choose_clear_choice(date, int, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
