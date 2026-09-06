-- ============================================================================
-- Choose Your Menu — P0 substrate (resident menu engagement, ships DARK)
-- ============================================================================
-- Date: 2026-06-11
-- Spec: specs/choose-your-menu-platform-spec-2026-06-11.md
-- The mess menu is org-wide tier × gender (see reference_mess_menu_tier_gender_model).
-- "Choose Your Menu" is an OPTIONAL engagement layer on the default menu, drawing
-- from mess_menu_item_library (332 dishes). Three modes (personalization / voting /
-- special-day), each super-admin-toggleable per tier via platform_policies.
--
-- Design principle (CARE / Gen-Z): the loop is the product. Every mode ships its
-- return-arc — live counts + recognition when input reaches the menu. This P0 lays
-- the SPINE: tables, config rows, and fn_mess_choose_live_counts so later modes plug
-- into a working loop instead of bolting one on.
--
-- Institution-agnostic (menu is shared across colleges). RLS: residents own their
-- rows (auth.uid() = profiles.id → profiles.learner_id); staff read via permission;
-- is_super_admin()/is_admin() bypass. Writes from residents go direct (own rows);
-- cross-resident aggregates go through the SECURITY DEFINER RPC so per-resident rows
-- never leak into a public count.
--
-- SECURITY: every RPC = SECURITY DEFINER + REVOKE EXECUTE FROM anon, PUBLIC +
-- GRANT TO authenticated (Supabase default-grants anon on every new function).
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT / guarded).
-- Applied via exec_sql after Director approval (show-SQL-first).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. mess_meal_choices — a resident's per-meal swap (Mode A personalization)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mess_meal_choices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id      uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  day_of_week     int  NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  meal_type       text NOT NULL CHECK (meal_type IN ('breakfast','lunch','tea','dinner')),
  tier_key        text NOT NULL,
  gender          text NOT NULL CHECK (gender IN ('boys','girls')),
  chosen_item_id  uuid NOT NULL REFERENCES public.mess_menu_item_library(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (learner_id, week_start_date, day_of_week, meal_type)
);
CREATE INDEX IF NOT EXISTS idx_mess_meal_choices_cell
  ON public.mess_meal_choices (week_start_date, day_of_week, meal_type, tier_key, gender);

-- ────────────────────────────────────────────────────────────────────────
-- 2. mess_dish_votes — resident thumbs up/down on a library dish (Mode B)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mess_dish_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id  uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES public.mess_menu_item_library(id) ON DELETE CASCADE,
  vote        smallint NOT NULL CHECK (vote IN (1, -1)),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (learner_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_mess_dish_votes_item ON public.mess_dish_votes (item_id);

-- ────────────────────────────────────────────────────────────────────────
-- 3. mess_meal_alternatives — which library dishes are valid swaps for a cell
--    (admin curates; powers Mode A's options-per-meal)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mess_meal_alternatives (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date date NOT NULL,
  day_of_week     int  NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  meal_type       text NOT NULL CHECK (meal_type IN ('breakfast','lunch','tea','dinner')),
  tier_key        text NOT NULL,
  gender          text NOT NULL CHECK (gender IN ('boys','girls')),
  item_id         uuid NOT NULL REFERENCES public.mess_menu_item_library(id) ON DELETE CASCADE,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (week_start_date, day_of_week, meal_type, tier_key, gender, item_id)
);
CREATE INDEX IF NOT EXISTS idx_mess_meal_alternatives_cell
  ON public.mess_meal_alternatives (week_start_date, day_of_week, meal_type, tier_key, gender);

-- ────────────────────────────────────────────────────────────────────────
-- 4. mess_special_day_proposals — festival menu proposals (Mode C)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mess_special_day_proposals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  special_date    date NOT NULL,
  meal_type       text NOT NULL CHECK (meal_type IN ('breakfast','lunch','tea','dinner')),
  tier_key        text NOT NULL,
  gender          text NOT NULL CHECK (gender IN ('boys','girls')),
  item_ids        uuid[] NOT NULL DEFAULT '{}',
  occasion_name   text,
  proposed_by     uuid NOT NULL REFERENCES public.profiles(id),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     uuid REFERENCES public.profiles(id),
  reviewed_at     timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mess_special_day_proposals_status
  ON public.mess_special_day_proposals (status, special_date);

-- ────────────────────────────────────────────────────────────────────────
-- 5. mess_choose_recognition — return-arc audit log (who was recognised, for
--    what dish, when it hit the menu). Proof the loop actually closes.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mess_choose_recognition (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id    uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  event_type    text NOT NULL CHECK (event_type IN ('vote_landed','proposal_approved','choice_served')),
  item_id       uuid REFERENCES public.mess_menu_item_library(id),
  dish_name     text,
  menu_week     date,
  fired_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mess_choose_recognition_learner
  ON public.mess_choose_recognition (learner_id, fired_at DESC);

-- updated_at triggers (shared fn, matches the mess_* table family)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mess_meal_choices','mess_dish_votes','mess_special_day_proposals'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%s', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 6. RLS — residents own their rows; staff read via permission; admin bypass
-- ────────────────────────────────────────────────────────────────────────
-- Resident-owned tables (choices, votes, recognition): the resident reads/writes
-- only rows tied to their own learner_id via auth.uid() = profiles.id chain.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mess_meal_choices','mess_dish_votes','mess_choose_recognition'] LOOP
    EXECUTE format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %s_owner_all ON public.%s', t, t);
    EXECUTE format($p$CREATE POLICY %1$s_owner_all ON public.%1$s FOR ALL
      USING (is_super_admin() OR is_admin()
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.learner_id = %1$s.learner_id)
        OR user_has_permission('campus_living.mess.menu.view'))
      WITH CHECK (is_super_admin() OR is_admin()
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.learner_id = %1$s.learner_id))$p$, t);
  END LOOP;
END $$;

-- Admin-curated tables (alternatives, proposals): authenticated may READ (so the
-- resident picker/board can show them); writes gated to admin/staff permission.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mess_meal_alternatives','mess_special_day_proposals'] LOOP
    EXECUTE format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %s_read_auth ON public.%s', t, t);
    EXECUTE format('CREATE POLICY %1$s_read_auth ON public.%1$s FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('DROP POLICY IF EXISTS %s_write_staff ON public.%s', t, t);
    EXECUTE format($p$CREATE POLICY %1$s_write_staff ON public.%1$s FOR ALL
      USING (is_super_admin() OR is_admin() OR user_has_permission('campus_living.mess.menu.publish'))
      WITH CHECK (is_super_admin() OR is_admin() OR user_has_permission('campus_living.mess.menu.publish'))$p$, t);
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 7. Config seeds — mess.choose.* (ships DARK: master_enabled = false)
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system)
VALUES
  ('mess.choose.master_enabled', 'global', NULL, 'false'::jsonb,
   'Master switch for the Choose Your Menu platform. Ships OFF — super-admin turns it on when ready.', 'boolean', NULL, true),
  ('mess.choose.personalization.enabled_tiers', 'global', NULL, '["premium","premium_plus"]'::jsonb,
   'Tiers whose residents can pre-pick meal alternatives (Mode A). [] = off.', 'array', NULL, true),
  ('mess.choose.personalization.options_per_meal', 'global', NULL, '3'::jsonb,
   'How many library alternatives offered per swappable meal.', 'number', NULL, true),
  ('mess.choose.personalization.cutoff_hours', 'global', NULL, '12'::jsonb,
   'Hours before a meal that a resident can still change their pick.', 'number', NULL, true),
  ('mess.choose.voting.enabled_tiers', 'global', NULL, '["standard","premium","premium_plus"]'::jsonb,
   'Tiers whose residents can vote dishes up/down (Mode B). [] = off.', 'array', NULL, true),
  ('mess.choose.special_day.enabled', 'global', NULL, 'true'::jsonb,
   'Special-day / festival menu proposals (Mode C) on/off.', 'boolean', NULL, true),
  ('mess.choose.special_day.proposer_roles', 'global', NULL, '["warden","chief_warden"]'::jsonb,
   'Roles allowed to propose special-day menus. (mess_committee role not yet seeded — add for Mode C.)', 'array', NULL, true),
  ('mess.choose.feedback.live_counts', 'global', NULL, 'true'::jsonb,
   'Show residents the live tally on their own choices/votes (the return-arc).', 'boolean', NULL, true),
  ('mess.choose.feedback.recognition', 'global', NULL, 'true'::jsonb,
   'Notify a resident when a dish they backed gets scheduled onto the menu.', 'boolean', NULL, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 8. fn_mess_choose_live_counts — the return-arc aggregate (no per-resident leak)
-- ────────────────────────────────────────────────────────────────────────
-- p_scope: 'votes' → top-voted dishes (net score, voter count) for a gender/tier;
--          'choices' → per-dish chosen-count for a specific cell.
-- Returns aggregates ONLY — never per-resident rows — so it can cross tier/gender
-- without leaking who voted what.
CREATE OR REPLACE FUNCTION public.fn_mess_choose_live_counts(
  p_scope          text,
  p_week_start     date DEFAULT NULL,
  p_day_of_week    int  DEFAULT NULL,
  p_meal_type      text DEFAULT NULL,
  p_tier_key       text DEFAULT NULL,
  p_gender         text DEFAULT NULL,
  p_limit          int  DEFAULT 20
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
  IF p_scope = 'votes' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v FROM (
      SELECT lib.id AS item_id,
             COALESCE(lib.name_english, lib.name_tamil) AS dish,
             SUM(dv.vote)::int AS net_score,
             COUNT(*)::int      AS voters
      FROM public.mess_dish_votes dv
      JOIN public.mess_menu_item_library lib ON lib.id = dv.item_id
      GROUP BY lib.id, lib.name_english, lib.name_tamil
      ORDER BY net_score DESC, voters DESC
      LIMIT p_limit
    ) t;
  ELSIF p_scope = 'choices' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v FROM (
      SELECT lib.id AS item_id,
             COALESCE(lib.name_english, lib.name_tamil) AS dish,
             COUNT(*)::int AS chosen_by
      FROM public.mess_meal_choices mc
      JOIN public.mess_menu_item_library lib ON lib.id = mc.chosen_item_id
      WHERE (p_week_start  IS NULL OR mc.week_start_date = p_week_start)
        AND (p_day_of_week IS NULL OR mc.day_of_week     = p_day_of_week)
        AND (p_meal_type   IS NULL OR mc.meal_type       = p_meal_type)
        AND (p_tier_key    IS NULL OR mc.tier_key        = p_tier_key)
        AND (p_gender      IS NULL OR mc.gender          = p_gender)
      GROUP BY lib.id, lib.name_english, lib.name_tamil
      ORDER BY chosen_by DESC
      LIMIT p_limit
    ) t;
  ELSE
    RETURN jsonb_build_object('error', 'invalid_scope');
  END IF;

  RETURN jsonb_build_object('scope', p_scope, 'results', COALESCE(v, '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_mess_choose_live_counts(text, date, int, text, text, text, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mess_choose_live_counts(text, date, int, text, text, text, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
