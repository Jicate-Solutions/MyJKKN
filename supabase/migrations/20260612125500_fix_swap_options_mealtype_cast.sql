-- ============================================================================
-- Fix fn_mess_choose_swap_options — meal_type enum/text cast
-- ============================================================================
-- Date: 2026-06-12. Caught by post-apply probe: mess_menus.meal_type is the
-- meal_type_enum, the substrate tables use text — the line-source arm's
-- equality needed ::text. (fn_mess_menu_week never filters by meal, which is
-- why it never hit this.) CREATE OR REPLACE of the one function; everything
-- else from 20260612123000 unchanged.
-- ============================================================================

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
          AND m.meal_type::text = p_meal_type
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


NOTIFY pgrst, 'reload schema';
