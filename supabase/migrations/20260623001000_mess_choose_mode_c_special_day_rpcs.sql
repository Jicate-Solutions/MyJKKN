-- ============================================================================
-- Choose Your Menu — Mode C "special-day / festival picker" RPCs (ships DARK)
-- ============================================================================
-- Date: 2026-06-23. Spec: specs/choose-your-menu-platform-spec-2026-06-11.md §Mode C.
--
-- Builds the propose -> approve/reject flow + the mandatory return-arc on top of
-- the already-live P0 substrate (NO new tables):
--   • mess_special_day_proposals (table: special_date, meal_type, tier_key,
--     gender, item_ids[], occasion_name, proposed_by, status)              — #1341
--   • mess_menus.is_special_day / special_day_name (cell override columns)
--   • mess_dish_votes (Mode B votes — drives upvoter recognition)          — Mode B 20260622234500
--   • campus_living_recognition (cross-module recognition stream)          — keystone 20260612003000
--   • fn_mess_choose_caller_context() (learner_id + plan_key + gender)      — Mode A 20260612123000
--
-- Triple-dark today: mess.choose.master_enabled=false. propose re-checks master
-- + mess.choose.special_day.enabled + the caller's role ∈ proposer_roles at call
-- time, so lighting it up needs zero deploys.
--
-- Functions:
--   fn_mess_special_day_propose(date,meal,tier,gender,item_ids[],occasion)
--       — proposer-role-gated (warden/chief_warden per config, + admin); inserts
--         a 'pending' proposal.
--   fn_mess_special_day_approve(id)  [ADMIN/menu.publish] — the REQUIRED return-
--       arc: approves, marks the matching mess_menus cell(s) is_special_day +
--       appends the festival dishes, and confers 'proposal_approved' recognition
--       on every resident who UPVOTED a dish in the proposal (idempotent per
--       learner+proposal). Proposers are staff (no learner_id) → their loop is
--       the approval status itself.
--   fn_mess_special_day_reject(id)   [ADMIN/menu.publish] — rejects.
--   fn_mess_special_day_list(status, upcoming_only) — proposal list with proposer
--       name + dish names (admin queue + resident "coming up" surface).
--
-- SECURITY: SECURITY DEFINER + REVOKE FROM anon, PUBLIC + GRANT authenticated.
-- propose/approve/reject validate identity + role server-side; the RPCs bypass
-- the table's menu.publish write-RLS deliberately (a warden proposes without
-- holding menu.publish). Idempotent (CREATE OR REPLACE). Applied via Management
-- API after Director approval (show-SQL-first).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- helper: is the caller allowed to propose? (admin OR a role in proposer_roles)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_special_day_can_propose()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles jsonb;
BEGIN
  IF public.is_super_admin() OR public.is_admin() THEN RETURN true; END IF;
  v_roles := COALESCE(
    (SELECT value FROM public.platform_policies
      WHERE policy_key = 'mess.choose.special_day.proposer_roles'
        AND scope_type = 'global' LIMIT 1), '[]'::jsonb);
  -- legacy single-role
  IF v_roles ? COALESCE(public.get_current_user_role(), '') THEN RETURN true; END IF;
  -- multi-role (user_roles -> custom_roles.role_key)
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND v_roles ? cr.role_key
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_mess_special_day_can_propose() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_special_day_can_propose() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 1. propose a festival menu (status='pending')
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_special_day_propose(
  p_special_date date,
  p_meal_type    text,
  p_tier_key     text,
  p_gender       text,
  p_item_ids     uuid[],
  p_occasion     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id        uuid;
  v_valid_ids int;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public.fn_get_policy_bool('mess.choose.master_enabled', false, NULL::uuid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_disabled');
  END IF;
  IF NOT public.fn_get_policy_bool('mess.choose.special_day.enabled', false, NULL::uuid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'special_day_disabled');
  END IF;
  IF NOT public.fn_mess_special_day_can_propose() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;
  IF p_special_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_date');
  END IF;
  IF p_meal_type NOT IN ('breakfast','lunch','tea','dinner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_meal');
  END IF;
  IF p_gender NOT IN ('boys','girls') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_gender');
  END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_items');
  END IF;
  SELECT count(*) INTO v_valid_ids
    FROM public.mess_menu_item_library WHERE id = ANY(p_item_ids) AND is_active = true;
  IF v_valid_ids <> array_length(p_item_ids, 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_items');
  END IF;

  INSERT INTO public.mess_special_day_proposals
    (special_date, meal_type, tier_key, gender, item_ids, occasion_name, proposed_by, status)
  VALUES
    (p_special_date, p_meal_type, p_tier_key, p_gender, p_item_ids,
     NULLIF(trim(COALESCE(p_occasion, '')), ''), auth.uid(), 'pending')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'proposal_id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_mess_special_day_propose(date, text, text, text, uuid[], text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_special_day_propose(date, text, text, text, uuid[], text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 2. approve — the return-arc: mark the cell + recognise dish-upvoters
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_special_day_approve(
  p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p           record;
  v_week        date;
  v_dow         int;
  v_names       text[];
  v_label       text;
  v_cells       int := 0;
  v_recognised  int := 0;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('campus_living.mess.menu.publish')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT * INTO v_p FROM public.mess_special_day_proposals WHERE id = p_proposal_id;
  IF v_p.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_p.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_reviewed', 'status', v_p.status);
  END IF;

  UPDATE public.mess_special_day_proposals
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = p_proposal_id;

  -- Festival dish names + the day label.
  SELECT array_agg(COALESCE(name_english, name_tamil)) INTO v_names
    FROM public.mess_menu_item_library WHERE id = ANY(v_p.item_ids);
  v_label := COALESCE(NULLIF(trim(v_p.occasion_name), ''), 'Special day');

  -- Best-effort cell override: mark the matching mess_menus cell(s) is_special_day
  -- and append the festival dishes. ISODOW 1..7 matches mess_menus.day_of_week.
  -- (No gender column on mess_menus — matches on tier/day/meal; harmless if 0.)
  v_week := date_trunc('week', v_p.special_date)::date;  -- Postgres ISO week → Monday
  v_dow  := EXTRACT(ISODOW FROM v_p.special_date)::int;   -- 1=Mon .. 7=Sun

  UPDATE public.mess_menus m
    SET is_special_day  = true,
        special_day_name = v_label,
        items_english = (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(m.items_english, '{}') || COALESCE(v_names, '{}')) x),
        items         = (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(m.items, '{}')         || COALESCE(v_names, '{}')) x),
        updated_at    = now()
    WHERE m.week_start_date = v_week
      AND m.day_of_week     = v_dow
      AND m.meal_type       = v_p.meal_type
      AND m.tier_key        = v_p.tier_key;
  GET DIAGNOSTICS v_cells = ROW_COUNT;

  -- Return-arc: recognise every resident who UPVOTED a dish in this proposal.
  -- Idempotent per (learner, proposal).
  INSERT INTO public.campus_living_recognition
    (learner_id, module, event_type, title, detail, ref, is_public, fired_at)
  SELECT DISTINCT dv.learner_id, 'mess', 'proposal_approved',
    'A dish you backed made a festival menu',
    v_label || COALESCE(' — ' || array_to_string(v_names, ', '), ''),
    jsonb_build_object('proposal_id', p_proposal_id, 'special_date', v_p.special_date),
    true, now()
  FROM public.mess_dish_votes dv
  WHERE dv.item_id = ANY(v_p.item_ids) AND dv.vote = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.campus_living_recognition r
      WHERE r.learner_id = dv.learner_id
        AND r.module = 'mess' AND r.event_type = 'proposal_approved'
        AND r.ref->>'proposal_id' = p_proposal_id::text
    );
  GET DIAGNOSTICS v_recognised = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'occasion', v_label,
    'cells_marked', v_cells, 'recognised', v_recognised);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_mess_special_day_approve(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_special_day_approve(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 3. reject
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_special_day_reject(
  p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('campus_living.mess.menu.publish')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;
  SELECT status INTO v_status FROM public.mess_special_day_proposals WHERE id = p_proposal_id;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_reviewed', 'status', v_status);
  END IF;
  UPDATE public.mess_special_day_proposals
    SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = p_proposal_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_mess_special_day_reject(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_special_day_reject(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 4. list — admin queue (by status) + resident "coming up" (approved + future)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mess_special_day_list(
  p_status        text    DEFAULT NULL,   -- 'pending'|'approved'|'rejected'|NULL(all)
  p_upcoming_only boolean DEFAULT false   -- true → special_date >= today
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.special_date), '[]'::jsonb) INTO v FROM (
    SELECT
      sp.id, sp.special_date, sp.meal_type, sp.tier_key, sp.gender,
      sp.occasion_name, sp.status, sp.created_at, sp.reviewed_at,
      COALESCE(pr.full_name, pr.email, 'Staff') AS proposed_by_name,
      (SELECT array_agg(COALESCE(lib.name_english, lib.name_tamil))
         FROM public.mess_menu_item_library lib WHERE lib.id = ANY(sp.item_ids)) AS dishes
    FROM public.mess_special_day_proposals sp
    LEFT JOIN public.profiles pr ON pr.id = sp.proposed_by
    WHERE (p_status IS NULL OR sp.status = p_status)
      AND (NOT p_upcoming_only OR sp.special_date >= CURRENT_DATE)
    ORDER BY sp.special_date
  ) t;
  RETURN jsonb_build_object('results', COALESCE(v, '[]'::jsonb));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_mess_special_day_list(text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_special_day_list(text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
