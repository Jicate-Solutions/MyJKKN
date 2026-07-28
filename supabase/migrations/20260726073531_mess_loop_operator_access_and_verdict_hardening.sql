-- ============================================================================
-- Mess menu loop — wire the measurement leg (operator access + verdict hardening)
-- ============================================================================
-- Date: 2026-07-26  Reason: the loop has measured 0 forever — three dead wires
-- (verified live on prod 2026-07-26, see .claude/loop-manifests/mess.yaml):
--   1. mess_meal_ratings has NO reachable UI intake (RateMealDialog built but
--      imported nowhere) → fn_mess_measure_menu_lift can never compute a
--      rating_lift. Part 1 below adds the menu-row identity to
--      fn_mess_menu_week's cells so the resident surface (My Meals) can mount
--      the dialog against the real mess_menus row.
--   2. The chairperson board (/campus-living/mess/menu-loop) is page-gated on
--      campus_living.settings.view (chief_warden holds it) BUT the mmr_select
--      RLS on mess_menu_recommendations requires campus_living.mess.menu.manage
--      — which NO active role holds. The intended operator opens an EMPTY
--      board; all recommendations sit status='proposed', 0 verdicts ever.
--      Part 2 grants the key to chief_warden.
--   3. fn_mess_recommendation_set_verdict (SECURITY DEFINER, EXECUTE granted
--      to authenticated) had NO internal permission check — any logged-in user
--      could verdict. Flagged for hardening in the loop manifest. Part 3 adds
--      the gate.
-- NOT APPLIED anywhere by this PR — prod apply is Director-gated.

-- ── Part 1: fn_mess_menu_week cells carry their menu-row identity ────────────
-- Reproduces 20260611200000_mess_menu_shared_read_by_tier_gender.sql verbatim,
-- adding ONLY the 'id' / 'institution_id' / 'week_start_date' keys per cell.
-- The rating gate + rating INSERT need the real mess_menus row (menu_id FK,
-- NOT NULL institution_id) and the EFFECTIVE week (the measurer joins ratings
-- via mess_menus on tier+meal+week). Additive JSONB keys — existing consumers
-- (mess/menu viewer, My Meals strip) ignore unknown keys; the new Rate surface
-- stays dark until this is applied.
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
        -- Menu-row identity (2026-07-26): lets the resident Rate surface write
        -- mess_meal_ratings against the real row. UUID + institution_id only —
        -- no caterer-sensitive columns exposed.
        'id',             m.id,
        'institution_id', m.institution_id,
        'week_start_date', m.week_start_date,
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

-- CREATE OR REPLACE = new function to the grant gate — re-assert the anon lock.
REVOKE EXECUTE ON FUNCTION public.fn_mess_menu_week(date, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_menu_week(date, text, text) TO authenticated;

-- ── Part 2: chief_warden gets campus_living.mess.menu.manage ────────────────
-- The board's rows ride RLS mmr_select = admin OR (menu.manage + institution
-- scope). chief_warden is the intended loop operator (already holds the page
-- gate campus_living.settings.view). Idiom matches
-- 20260801001400_tournament_student_browse_and_grant_narrowing.sql.
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('campus_living.mess.menu.manage', true),
       updated_at  = now()
 WHERE role_key = 'chief_warden'
   AND NOT (permissions ? 'campus_living.mess.menu.manage');

-- ── Part 3: verdict RPC hardening — internal permission gate ────────────────
-- Reproduces 20260729000000_mess_menu_loop_verdict.sql verbatim, adding ONLY
-- the permission gate. Verdicts are the loop's control labels; before this,
-- ANY authenticated user could stamp them (EXECUTE granted to authenticated,
-- no internal check — flagged in .claude/loop-manifests/mess.yaml).
CREATE OR REPLACE FUNCTION public.fn_mess_recommendation_set_verdict(
  p_recommendation_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verdict = operator action. Same key the board's mmr_select RLS rides, so
  -- whoever can SEE recommendations can verdict them — and nobody else.
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('campus_living.mess.menu.manage')
  ) THEN
    RAISE EXCEPTION 'permission denied: mess menu manage required';
  END IF;

  -- A verdict is one of the three terminal review states. 'proposed' is the
  -- generator's initial state and is NOT a settable verdict.
  IF p_status NOT IN ('accepted','rejected','edited') THEN
    RAISE EXCEPTION 'invalid verdict status %, expected accepted|rejected|edited', p_status;
  END IF;

  UPDATE public.mess_menu_recommendations
     SET status      = p_status,
         review_note = p_note,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at  = now()
   WHERE id = p_recommendation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation % not found', p_recommendation_id;
  END IF;
END;
$$;

-- CREATE OR REPLACE = new function to the grant gate — re-assert the anon lock.
REVOKE EXECUTE ON FUNCTION public.fn_mess_recommendation_set_verdict(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_recommendation_set_verdict(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
