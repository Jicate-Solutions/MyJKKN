-- ============================================================================
-- Mess Rating System — PR 1: Schema + RLS + function + 2 policy rows
-- ============================================================================
-- Created: 2026-05-26
-- Spec: Director interview locked 2026-05-26 (Premium-Plus residents rate
--       individual menu items per meal; aggregates feed a chairperson
--       "popular items" insights dashboard).
--
-- Architectural decisions (locked by Director 2026-05-26):
--   D1: SEPARATE table mess_meal_ratings (NOT extension of mess_feedback).
--       mess_feedback is meal-level (taste/hygiene/quantity/variety/overall on
--       the entire meal). mess_meal_ratings is per-item-per-meal (e.g. one
--       row for "Idli" + one row for "Sambar" within the same breakfast).
--       Distinct grain → distinct table.
--   D2: REUSE mess_menus.id as the menu_id FK (the (week, day, meal, tier) cell
--       a resident actually ate at). NOT a join to mess_meal_records — keeps
--       the rating layer decoupled from the booking layer.
--   D3: DENORMALIZE item_text on each row. Items live as text[] inside
--       mess_menus.items / items_tamil / items_english; we copy the rated
--       string onto the rating row so renaming items later doesn't orphan
--       historical ratings.
--   D4: UNIQUE (profile_id, menu_id, item_text). One resident, one rating per
--       item per meal cell. Re-submission = UPDATE not duplicate.
--   D5: TIER gating + window enforcement lives in the SERVICE layer (rating-
--       gate.ts), NOT in a DB trigger. Two platform_policies rows control it:
--       mess.rating.premium_plus_only (boolean) and mess.rating.window_hours
--       (int). Keeps Director able to flip gating from /admin without
--       migration churn. RLS still requires authenticated identity.
--
-- Idempotent. Safe to re-apply.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mess_meal_ratings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL,
  profile_id      uuid NOT NULL,
  menu_id         uuid NOT NULL,
  item_text       text NOT NULL,
  rating          smallint NOT NULL,
  comment         text NULL,
  rated_at        timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mess_meal_ratings_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT mess_meal_ratings_comment_length CHECK (comment IS NULL OR char_length(comment) <= 200),
  CONSTRAINT mess_meal_ratings_item_not_empty CHECK (char_length(trim(item_text)) > 0)
);

-- FK to mess_menus — cell the resident ate at.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mess_meal_ratings_menu_id_fkey'
  ) THEN
    ALTER TABLE public.mess_meal_ratings
      ADD CONSTRAINT mess_meal_ratings_menu_id_fkey
      FOREIGN KEY (menu_id) REFERENCES public.mess_menus(id) ON DELETE CASCADE;
  END IF;
END $$;

-- UNIQUE: one rating per resident, per menu cell, per item.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mess_meal_ratings_unique_per_item'
  ) THEN
    ALTER TABLE public.mess_meal_ratings
      ADD CONSTRAINT mess_meal_ratings_unique_per_item
      UNIQUE (profile_id, menu_id, item_text);
  END IF;
END $$;

-- Index: menu cell → ratings (aggregate query path).
CREATE INDEX IF NOT EXISTS mess_meal_ratings_menu_id_idx
  ON public.mess_meal_ratings (menu_id);

-- Index: institution + time (insights dashboard time-range filter).
CREATE INDEX IF NOT EXISTS mess_meal_ratings_inst_rated_idx
  ON public.mess_meal_ratings (institution_id, rated_at DESC);

-- Index: resident's own history.
CREATE INDEX IF NOT EXISTS mess_meal_ratings_profile_idx
  ON public.mess_meal_ratings (profile_id, rated_at DESC);

COMMENT ON TABLE public.mess_meal_ratings IS
  'Per-item ratings (1-5 stars) submitted by Premium-Plus residents after a meal. Distinct from mess_feedback (meal-level dimensions). Aggregates feed fn_get_popular_items → chairperson insights dashboard. Tier gating + submission window enforced at service layer via platform_policies (mess.rating.premium_plus_only, mess.rating.window_hours).';
COMMENT ON COLUMN public.mess_meal_ratings.menu_id IS
  'FK to mess_menus.id — the specific (week, day, meal, tier) cell the resident ate at.';
COMMENT ON COLUMN public.mess_meal_ratings.item_text IS
  'Denormalized item string (Tamil or English) rated. Copied from mess_menus.items*[] at submission time so renames don''t orphan history.';
COMMENT ON COLUMN public.mess_meal_ratings.rating IS
  '1-5 star rating. CHECK constraint enforces range.';
COMMENT ON COLUMN public.mess_meal_ratings.comment IS
  'Optional 200-char comment. CHECK constraint enforces length.';

-- ---------------------------------------------------------------------------
-- 2) updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_mess_meal_ratings_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mess_meal_ratings_touch_updated_at
  ON public.mess_meal_ratings;
CREATE TRIGGER trg_mess_meal_ratings_touch_updated_at
  BEFORE UPDATE ON public.mess_meal_ratings
  FOR EACH ROW EXECUTE FUNCTION public.tg_mess_meal_ratings_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
-- INSERT: authenticated user submitting own row (profile_id = auth.uid()).
--         Service layer enforces premium_plus + window before calling insert.
-- SELECT: own rows OR super_admin/admin OR users with view permission scoped
--         to the institution.
-- UPDATE: own rows only (re-rate within window) OR super_admin/admin.
-- DELETE: super_admin/admin only.
-- ---------------------------------------------------------------------------
ALTER TABLE public.mess_meal_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mess_meal_ratings_insert ON public.mess_meal_ratings;
CREATE POLICY mess_meal_ratings_insert ON public.mess_meal_ratings
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND profile_id = auth.uid()
  );

DROP POLICY IF EXISTS mess_meal_ratings_select ON public.mess_meal_ratings;
CREATE POLICY mess_meal_ratings_select ON public.mess_meal_ratings
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR profile_id = auth.uid()
    OR (
      user_has_permission('campus_living.mess.feedback.view'::text)
      AND role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS mess_meal_ratings_update ON public.mess_meal_ratings;
CREATE POLICY mess_meal_ratings_update ON public.mess_meal_ratings
  FOR UPDATE USING (
    is_super_admin() OR is_admin() OR profile_id = auth.uid()
  ) WITH CHECK (
    is_super_admin() OR is_admin() OR profile_id = auth.uid()
  );

DROP POLICY IF EXISTS mess_meal_ratings_delete ON public.mess_meal_ratings;
CREATE POLICY mess_meal_ratings_delete ON public.mess_meal_ratings
  FOR DELETE USING (is_super_admin() OR is_admin());

-- ---------------------------------------------------------------------------
-- 4) Aggregate function — fn_get_popular_items
-- ---------------------------------------------------------------------------
-- Returns top-N popular items for the chairperson dashboard.
-- - p_institution_id: scope to one institution
-- - p_days_back: time window (e.g. 7, 30, 90)
-- - Joins mess_menu_item_library on case-insensitive name match (Tamil OR
--   English) for category enrichment. NULL category when no library match.
-- - SECURITY DEFINER so service-role reader passes RLS regardless of caller.
--   The wrapping service still passes institution_id explicitly; do not call
--   from authenticated clients without proper scoping.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_popular_items(
  p_institution_id uuid,
  p_days_back      int DEFAULT 30
)
RETURNS TABLE (
  item_text      text,
  avg_rating     numeric,
  total_ratings  bigint,
  category       text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH agg AS (
    SELECT
      r.item_text,
      ROUND(AVG(r.rating)::numeric, 2) AS avg_rating,
      COUNT(*)::bigint                 AS total_ratings
    FROM public.mess_meal_ratings r
    WHERE r.institution_id = p_institution_id
      AND r.rated_at >= (now() - make_interval(days => GREATEST(p_days_back, 1)))
    GROUP BY r.item_text
  )
  SELECT
    a.item_text,
    a.avg_rating,
    a.total_ratings,
    lib.category
  FROM agg a
  LEFT JOIN LATERAL (
    SELECT l.category
    FROM public.mess_menu_item_library l
    WHERE lower(trim(l.name_tamil)) = lower(trim(a.item_text))
       OR lower(trim(l.name_english)) = lower(trim(a.item_text))
    LIMIT 1
  ) lib ON true
  ORDER BY a.avg_rating DESC, a.total_ratings DESC;
$$;

COMMENT ON FUNCTION public.fn_get_popular_items(uuid, int) IS
  'Aggregates mess_meal_ratings by item_text for a given institution and time window. Joins mess_menu_item_library for category enrichment (case-insensitive Tamil/English match). Used by chairperson insights dashboard. SECURITY DEFINER — callers MUST pass institution_id explicitly.';

-- ---------------------------------------------------------------------------
-- 5) Policy rows — gate + window
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies (
  policy_key,
  scope_type, scope_id,
  value, data_type,
  description,
  ui_widget, ui_consequence, ui_category,
  is_system, is_active
) VALUES
  (
    'mess.rating.premium_plus_only',
    'global', NULL,
    'true'::jsonb, 'boolean',
    'Mess Rating: when true, only Premium-Plus tier residents may submit per-item ratings. Standard + Premium residents see menus but cannot rate. When false, all authenticated residents may rate.',
    'toggle',
    'true keeps rating a Premium-Plus perk (chairperson default); false opens rating to every authenticated resident.',
    'Mess — Rating',
    true, true
  ),
  (
    'mess.rating.window_hours',
    'global', NULL,
    '2'::jsonb, 'number',
    'Mess Rating: hours after a meal''s slot end during which a resident may submit ratings. Default 2 (lunch slot 13:00 → ratings allowed until 15:00 same day). After this window, the meal''s items are locked from new ratings.',
    'number',
    'Increasing this widens the rating window — residents can rate further after the meal. Decreasing tightens to "rate immediately or not at all".',
    'Mess — Rating',
    true, true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6) Verification — fail loudly if anything didn't land
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table_exists boolean;
  v_fn_exists boolean;
  v_policy_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mess_meal_ratings'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'mess_meal_ratings table did not get created';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fn_get_popular_items'
  ) INTO v_fn_exists;

  IF NOT v_fn_exists THEN
    RAISE EXCEPTION 'fn_get_popular_items did not get created';
  END IF;

  SELECT count(*) INTO v_policy_count
    FROM public.platform_policies
   WHERE policy_key LIKE 'mess.rating.%' AND scope_type = 'global';

  IF v_policy_count < 2 THEN
    RAISE EXCEPTION 'mess.rating.* policy seed failed: expected >= 2 rows, got %', v_policy_count;
  END IF;
END $$;
