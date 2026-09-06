-- ============================================================================
-- Mess Menu — shared read by (week, tier, gender), institution-agnostic
-- ============================================================================
-- Date: 2026-06-11
-- Why: the mess menu is ONE shared set across all JKKN colleges, varying only
--   by tier (standard/premium/premium_plus) and gender (boys/girls). Gender
--   lives on the caterer (mess_caterers.gender_served), linked from
--   mess_menus.caterer_id. But mess_menus RLS is institution-scoped
--   (role_has_institution_access(institution_id), per persona-design PR4), so
--   a hosteller at a college that ISN'T the one the menu was authored under
--   sees nothing. This SECURITY DEFINER reader returns ONLY the menu cells for
--   a (week, tier, gender) to ANY authenticated user, bypassing the
--   institution scope — without exposing the caterer's sensitive columns
--   (FSSAI/GST/bank/contract), which is why a blanket open-read policy is the
--   wrong tool here.
--
-- Canonical-authoring assumption: today exactly two caterers exist org-wide
--   (one boys, one girls). If multiple same-gender caterers ever exist, the
--   reader takes the most-recently-updated cell per (day, meal) — DISTINCT ON
--   updated_at DESC — so a single canonical menu still resolves cleanly.
--
-- Writes are unchanged: the Menu Editor continues to write through the
-- institution/permission-scoped path. This only widens READ of the menu cells.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_mess_menu_week(
  p_week_start date,
  p_tier_key   text,
  p_gender     text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cells jsonb;
  v_effective_week date;
BEGIN
  -- Validate inputs (cheap guard; keeps the function honest).
  IF p_gender NOT IN ('boys', 'girls') THEN
    RETURN jsonb_build_object('error', 'invalid_gender');
  END IF;

  -- The printed menu is a DEFAULT weekly cycle, stored against one week. If
  -- the requested week has no cells, fall back to the most recent week
  -- (on or before the requested one) that does — so the default menu shows
  -- every week until a newer week is entered.
  SELECT m.week_start_date INTO v_effective_week
  FROM public.mess_menus m
  JOIN public.mess_caterers cat ON cat.id = m.caterer_id
  WHERE m.tier_key = p_tier_key
    AND cat.gender_served = p_gender
    AND (m.items_tamil IS NOT NULL OR m.items_english IS NOT NULL OR m.items IS NOT NULL)
    AND m.week_start_date <= p_week_start
  ORDER BY m.week_start_date DESC
  LIMIT 1;

  -- If nothing on/before the requested week, take the earliest available
  -- (so a future-dated default still surfaces rather than showing empty).
  IF v_effective_week IS NULL THEN
    SELECT m.week_start_date INTO v_effective_week
    FROM public.mess_menus m
    JOIN public.mess_caterers cat ON cat.id = m.caterer_id
    WHERE m.tier_key = p_tier_key
      AND cat.gender_served = p_gender
      AND (m.items_tamil IS NOT NULL OR m.items_english IS NOT NULL OR m.items IS NOT NULL)
    ORDER BY m.week_start_date ASC
    LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(c ORDER BY (c->>'day_of_week')::int, c->>'meal_type'), '[]'::jsonb)
  INTO v_cells
  FROM (
    SELECT DISTINCT ON (m.day_of_week, m.meal_type)
      jsonb_build_object(
        'day_of_week',   m.day_of_week,
        'meal_type',     m.meal_type,
        -- items / items_tamil / items_english are text[] (PR1 schema), so wrap
        -- in to_jsonb to emit JSON arrays.
        'items',         to_jsonb(COALESCE(m.items, ARRAY[]::text[])),
        'items_tamil',   to_jsonb(COALESCE(m.items_tamil, ARRAY[]::text[])),
        'items_english', to_jsonb(COALESCE(m.items_english, ARRAY[]::text[])),
        'status',        m.status,
        'is_special_day', COALESCE(m.is_special_day, false),
        'special_day_name', m.special_day_name
      ) AS c
    FROM public.mess_menus m
    JOIN public.mess_caterers cat ON cat.id = m.caterer_id
    WHERE m.week_start_date = v_effective_week
      AND m.tier_key        = p_tier_key
      AND cat.gender_served = p_gender
    ORDER BY m.day_of_week, m.meal_type, m.updated_at DESC
  ) cells;

  RETURN jsonb_build_object(
    'week_start', p_week_start,
    'effective_week', v_effective_week,
    'tier_key',   p_tier_key,
    'gender',     p_gender,
    'cells',      v_cells
  );
END;
$$;

-- Supabase default-grants anon EXECUTE on every new function — revoke it.
REVOKE EXECUTE ON FUNCTION public.fn_mess_menu_week(date, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_menu_week(date, text, text) TO authenticated;

-- Distinct tiers + genders that actually have a menu authored (for the
-- viewer's selectors — avoids showing a gender/tier that has no data anywhere).
CREATE OR REPLACE FUNCTION public.fn_mess_menu_facets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tiers',   COALESCE((SELECT jsonb_agg(DISTINCT m.tier_key) FROM public.mess_menus m), '[]'::jsonb),
    'genders', COALESCE((SELECT jsonb_agg(DISTINCT cat.gender_served)
                         FROM public.mess_menus m
                         JOIN public.mess_caterers cat ON cat.id = m.caterer_id), '[]'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_menu_facets() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_menu_facets() TO authenticated;

NOTIFY pgrst, 'reload schema';
