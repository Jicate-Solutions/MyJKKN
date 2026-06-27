-- ============================================================================
-- Choose Your Menu — Mode B "menu voting / wishlist" RPCs (ships DARK)
-- ============================================================================
-- Date: 2026-06-22. Spec: specs/choose-your-menu-platform-spec-2026-06-11.md §Mode B.
--
-- Builds the INPUT path + the mandatory return-arc closer for Mode B on top of
-- the P0 substrate that is already live:
--   • mess_dish_votes                       (table, resident-owned RLS)        — #1341
--   • fn_mess_choose_live_counts('votes')   (leaderboard aggregate, anon-revoked) — #1341
--   • campus_living_recognition             (cross-module recognition stream)  — keystone 20260612003000
--   • fn_mess_choose_caller_context()       (learner_id + plan_key + gender)   — Mode A 20260612123000
--
-- Triple-dark today: mess.choose.master_enabled=false. Every resident write RPC
-- re-checks master + the caller's mess-plan tier ∈ mess.choose.voting.enabled_tiers
-- at CALL TIME, so lighting the surface later needs zero deploys (same idiom as
-- Mode A's swap RPCs).
--
-- Functions:
--   fn_mess_choose_cast_vote(item, vote)   — thumbs ±1 on a library dish (upsert own row)
--   fn_mess_choose_clear_vote(item)        — withdraw my vote
--   fn_mess_choose_votable_dishes(q,limit) — browse/search the 332-dish library WITH
--                                            net tally + voter count + MY current vote
--   fn_mess_choose_recognize_voted_dish(item, week) [ADMIN, menu.publish] — the
--     spec's REQUIRED return-arc: confer 'vote_landed' recognition on every upvoter,
--     but ONLY if the dish is verifiably on a real mess_menus cell that week
--     (integrity — recognition is conferred, never theatre). Idempotent per
--     (learner, item, week) so re-running can't double-recognise.
--
-- SECURITY: SECURITY DEFINER + REVOKE FROM anon, PUBLIC + GRANT authenticated
-- (Supabase default-grants anon EXECUTE on every new function — CLAUDE.md). The
-- resident write RPCs validate auth.uid() identity via fn_mess_choose_caller_context;
-- the admin RPC requires campus_living.mess.menu.publish (same gate the substrate's
-- write-staff RLS uses). Idempotent (CREATE OR REPLACE). Applied via Management API
-- after Director approval (show-SQL-first).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. fn_mess_choose_cast_vote — resident thumbs ±1 on a library dish.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_choose_cast_vote(
  p_item_id uuid,
  p_vote    int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner uuid;
  v_plan    text;
  v_gender  text;
  v_tiers   jsonb;
  v_dish    text;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_vote NOT IN (1, -1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_vote');
  END IF;

  -- Master switch (fail-dark): a broken/off read keeps the feature off.
  IF NOT public.fn_get_policy_bool('mess.choose.master_enabled', false, NULL::uuid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_disabled');
  END IF;

  SELECT learner_id, plan_key, gender
    INTO v_learner, v_plan, v_gender
    FROM public.fn_mess_choose_caller_context();
  IF v_learner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_learner_profile');
  END IF;

  -- Tier gate: only mess-plan tiers in voting.enabled_tiers may vote.
  v_tiers := COALESCE(
    (SELECT value FROM public.platform_policies
      WHERE policy_key = 'mess.choose.voting.enabled_tiers'
        AND scope_type = 'global' LIMIT 1), '[]'::jsonb);
  IF NOT (v_tiers ? COALESCE(v_plan, '')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'plan_not_enabled');
  END IF;

  -- Dish must exist + be active.
  SELECT COALESCE(name_english, name_tamil) INTO v_dish
    FROM public.mess_menu_item_library
   WHERE id = p_item_id AND is_active = true;
  IF v_dish IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_dish');
  END IF;

  -- Upsert: one vote per (learner, dish); re-voting flips the sign.
  INSERT INTO public.mess_dish_votes (learner_id, item_id, vote)
  VALUES (v_learner, p_item_id, p_vote::smallint)
  ON CONFLICT (learner_id, item_id)
  DO UPDATE SET vote = EXCLUDED.vote, updated_at = now();

  RETURN jsonb_build_object('ok', true, 'dish', v_dish, 'vote', p_vote);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_choose_cast_vote(uuid, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_choose_cast_vote(uuid, int) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 2. fn_mess_choose_clear_vote — withdraw my vote (no master gate: a resident
--    can always retract, even if the surface was toggled off).
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_choose_clear_vote(
  p_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner uuid;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  SELECT learner_id INTO v_learner FROM public.fn_mess_choose_caller_context();
  IF v_learner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_learner_profile');
  END IF;
  DELETE FROM public.mess_dish_votes
   WHERE learner_id = v_learner AND item_id = p_item_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_choose_clear_vote(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_choose_clear_vote(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 3. fn_mess_choose_votable_dishes — the resident "Rate dishes" surface data.
--    Library dishes + net tally + voter count + MY current vote, searchable.
--    Aggregate join (no per-resident leak beyond the caller's OWN vote).
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_choose_votable_dishes(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner uuid;
  v jsonb;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;
  -- caller context is best-effort: my_vote is NULL for staff/non-residents,
  -- the dish list + tally still renders.
  SELECT learner_id INTO v_learner FROM public.fn_mess_choose_caller_context();

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v FROM (
    SELECT
      lib.id                                        AS item_id,
      COALESCE(lib.name_english, lib.name_tamil)    AS dish,
      lib.name_tamil                                AS name_tamil,
      lib.category                                  AS category,
      COALESCE(agg.net_score, 0)::int               AS net_score,
      COALESCE(agg.voters, 0)::int                  AS voters,
      mv.vote                                        AS my_vote
    FROM public.mess_menu_item_library lib
    LEFT JOIN (
      SELECT item_id, SUM(vote)::int AS net_score, COUNT(*)::int AS voters
      FROM public.mess_dish_votes GROUP BY item_id
    ) agg ON agg.item_id = lib.id
    LEFT JOIN public.mess_dish_votes mv
      ON mv.item_id = lib.id AND mv.learner_id = v_learner
    WHERE lib.is_active = true
      AND (
        p_search IS NULL OR p_search = ''
        OR lib.name_english ILIKE '%' || p_search || '%'
        OR lib.name_tamil   ILIKE '%' || p_search || '%'
      )
    ORDER BY
      (mv.vote IS NOT NULL) DESC,           -- dishes I've voted on first
      COALESCE(agg.net_score, 0) DESC,       -- then the demand leaderboard
      lib.usage_count DESC NULLS LAST,       -- then commonly-served
      lib.name_english ASC
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 50), 200), 1)
  ) t;

  RETURN jsonb_build_object('results', COALESCE(v, '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_choose_votable_dishes(text, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_choose_votable_dishes(text, int) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 4. fn_mess_choose_recognize_voted_dish — the REQUIRED return-arc (ADMIN).
--    Confer 'vote_landed' recognition on every upvoter of a dish — but ONLY
--    when that dish is verifiably on a real mess_menus cell for the given week.
--    Integrity over theatre; idempotent per (learner, item, week).
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_choose_recognize_voted_dish(
  p_item_id    uuid,
  p_week_start date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dish        text;
  v_dish_tamil  text;
  v_on_menu     boolean;
  v_recognised  int := 0;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('campus_living.mess.menu.publish')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT COALESCE(name_english, name_tamil), name_tamil
    INTO v_dish, v_dish_tamil
    FROM public.mess_menu_item_library WHERE id = p_item_id;
  IF v_dish IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_dish');
  END IF;

  -- Integrity gate: the dish must actually appear on a published menu cell for
  -- the week before any recognition fires. Checks items / items_english /
  -- items_tamil arrays (the three name columns mess_menus carries).
  SELECT EXISTS (
    SELECT 1 FROM public.mess_menus m
    WHERE m.week_start_date = p_week_start
      AND (
            v_dish = ANY (COALESCE(m.items, '{}'))
        OR  v_dish = ANY (COALESCE(m.items_english, '{}'))
        OR (v_dish_tamil IS NOT NULL AND v_dish_tamil = ANY (COALESCE(m.items_tamil, '{}')))
      )
  ) INTO v_on_menu;
  IF NOT v_on_menu THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dish_not_on_menu', 'dish', v_dish);
  END IF;

  -- Confer on every upvoter; skip anyone already recognised for this item+week.
  INSERT INTO public.campus_living_recognition
    (learner_id, module, event_type, title, detail, ref, is_public, fired_at)
  SELECT
    dv.learner_id, 'mess', 'vote_landed',
    'A dish you voted for made the menu', v_dish,
    jsonb_build_object('item_id', p_item_id, 'menu_week', p_week_start),
    true, now()
  FROM public.mess_dish_votes dv
  WHERE dv.item_id = p_item_id AND dv.vote = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.campus_living_recognition r
      WHERE r.learner_id = dv.learner_id
        AND r.module = 'mess' AND r.event_type = 'vote_landed'
        AND r.ref->>'item_id'   = p_item_id::text
        AND r.ref->>'menu_week' = p_week_start::text
    );
  GET DIAGNOSTICS v_recognised = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'dish', v_dish, 'recognised', v_recognised);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_choose_recognize_voted_dish(uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_choose_recognize_voted_dish(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
