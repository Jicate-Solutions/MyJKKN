-- ============================================================================
-- Mess Menu PR 1 — Schema extensions for bilingual + tier-aware weekly menu
-- ============================================================================
-- Created: 2026-05-25
-- Spec: chairperson + Director interview locked 2026-05-25
-- Architectural decisions (D1-D5 in original spec, confirmed by Director):
--   D1: EXTEND existing mess_caterers + mess_menus in place (no parallel tables)
--   D2: REUSE existing 3-tier ladder (standard | premium | premium_plus). NO
--       parallel mess_tier column. Menu rows carry tier_key directly.
--   D3: ALTER meal_type_enum ADD VALUE 'tea' (safe-additive; existing 'snacks'
--       rows untouched).
--   D4: ADD items_tamil text[] + items_english text[] to mess_menus. Keep
--       existing items text[] as legacy / locale-unspecified column.
--   D5: ADD tier_key to mess_menus (not to caterers — menu is tier-scoped,
--       caterer is gender-scoped). ADD gender_served to mess_caterers.
--
-- Companion: 6 platform_policies rows for runtime-tweakable mess knobs.
--   Pattern source: 20260516131805_seed_premium_platform_policies.sql.
--   Unique-index shape: (policy_key, scope_type, COALESCE(scope_id, '00...')).
--
-- Idempotent. Safe to re-apply.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Enum extension — add 'tea' meal slot
-- ---------------------------------------------------------------------------
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block. This
-- statement is applied standalone via the Supabase Management API in the
-- apply-and-probe loop. Postgres ignores the second invocation when IF NOT
-- EXISTS is set, so re-running this migration is safe.

ALTER TYPE meal_type_enum ADD VALUE IF NOT EXISTS 'tea';

-- ---------------------------------------------------------------------------
-- 2) mess_menus — add bilingual + tier columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.mess_menus
  ADD COLUMN IF NOT EXISTS items_tamil   text[]    NULL,
  ADD COLUMN IF NOT EXISTS items_english text[]    NULL,
  ADD COLUMN IF NOT EXISTS tier_key      text      NULL;

-- Tier-key CHECK constraint (separate ADD CONSTRAINT for idempotency).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mess_menus_tier_key_check'
  ) THEN
    ALTER TABLE public.mess_menus
      ADD CONSTRAINT mess_menus_tier_key_check
      CHECK (tier_key IS NULL OR tier_key IN ('standard', 'premium', 'premium_plus'));
  END IF;
END $$;

COMMENT ON COLUMN public.mess_menus.items_tamil IS
  'Tamil menu items for this (week, day, meal, tier) cell. Source-authoritative when chairperson uploads Tamil-only menu (per mess.menu.source_locale=ta policy). Director can fill items_english later via admin UI.';
COMMENT ON COLUMN public.mess_menus.items_english IS
  'English translation of items_tamil. NULL is valid until Director enters translation. Display layer falls back to items_tamil when this is NULL and viewer locale is en.';
COMMENT ON COLUMN public.mess_menus.tier_key IS
  'References the canonical hostel_tier_policy.tier_key ladder (standard | premium | premium_plus). NULL = menu applies to all tiers (default). Non-NULL = tier-specific menu cell. Reuses the hostel tier vocabulary instead of inventing a parallel CLASSIC/PREMIUM enum (Director decision 2026-05-25).';

-- Index for fast tier-scoped weekly reads (admin grid + resident viewer)
CREATE INDEX IF NOT EXISTS idx_mess_menus_inst_week_tier
  ON public.mess_menus (institution_id, week_start_date, tier_key);

-- ---------------------------------------------------------------------------
-- 3) mess_caterers — add gender_served column
-- ---------------------------------------------------------------------------
ALTER TABLE public.mess_caterers
  ADD COLUMN IF NOT EXISTS gender_served text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mess_caterers_gender_served_check'
  ) THEN
    ALTER TABLE public.mess_caterers
      ADD CONSTRAINT mess_caterers_gender_served_check
      CHECK (gender_served IS NULL OR gender_served IN ('boys', 'girls', 'both'));
  END IF;
END $$;

COMMENT ON COLUMN public.mess_caterers.gender_served IS
  'Which resident gender this caterer cooks for. boys | girls | both. NULL during transition; new JKKN Dental seeds use boys/girls. Existing pre-2026-05-25 caterer rows can be back-filled to ''both'' via admin UI.';

-- ---------------------------------------------------------------------------
-- 4) platform_policies — 6 mess.menu.* runtime knobs
-- ---------------------------------------------------------------------------
-- Pattern: scope_type='global', scope_id=NULL. Director-edit via admin UI at
-- /admin/mess/policies (built in PR 4). All keys are advisory until a service
-- reads them; this seed only establishes the row + UI metadata.

INSERT INTO public.platform_policies (
  policy_key,
  scope_type, scope_id,
  value, data_type,
  description,
  ui_widget, ui_consequence, ui_category,
  is_system, is_active
) VALUES
  (
    'mess.menu.edit_cutoff_minutes',
    'global', NULL,
    '120'::jsonb, 'number',
    'Mess Menu: minutes after a meal''s start time during which the menu cell for the current week is locked from edits. Default 120 (2 hours). Edits to next week''s menu are always allowed.',
    'number',
    'Increasing this widens the lockout window — staff can edit a meal''s menu further into the past. Decreasing tightens the freeze.',
    'Mess — Timing',
    true, true
  ),
  (
    'mess.menu.seed_size_default',
    'global', NULL,
    '48'::jsonb, 'number',
    'Mess Menu: chairperson''s minimum-viable seed size when initializing a new institution''s weekly menu (7 days x 4 meals x ~1.7 items/cell). Advisory; admin UI uses this to suggest "you have N of M items filled".',
    'number',
    'Lowering this lets admins ship a sparser menu without warnings; raising it nudges them to fill more cells before publishing.',
    'Mess — Seeding',
    true, true
  ),
  (
    'mess.menu.image_source',
    'global', NULL,
    '"photos"'::jsonb, 'string',
    'Mess Menu: where item-illustration images come from. photos = uploaded by chairperson (preferred — evidence-grade). ai_generated = LLM-rendered fallback. none = no images, text-only menu.',
    'dropdown',
    'photos requires uploads but stays auditable; ai_generated saves effort but is non-evidentiary; none is fastest but text-only.',
    'Mess — Media',
    true, true
  ),
  (
    'mess.menu.source_locale',
    'global', NULL,
    '"ta"'::jsonb, 'string',
    'Mess Menu: which locale is source-authoritative when both items_tamil and items_english are present. ta = Tamil wins (current chairperson photos are Tamil-only). en = English wins.',
    'dropdown',
    'When set to ta, admin UI shows Tamil as the primary editor and English as optional translation. Flip to en after Director completes English translations.',
    'Mess — Locale',
    true, true
  ),
  (
    'mess.menu.tier_crossing_allowed',
    'global', NULL,
    'false'::jsonb, 'boolean',
    'Mess Menu: whether a resident may eat at a tier different from their assigned hostel tier (e.g. standard resident eating PREMIUM menu). Default false — tier-fixed enforcement.',
    'toggle',
    'true relaxes the rule (any resident eats any tier menu); false enforces tier-fixed (chairperson default).',
    'Mess — Access',
    true, true
  ),
  (
    'mess.menu.fee_model',
    'global', NULL,
    '"bundled"'::jsonb, 'string',
    'Mess Menu: how monthly mess fee is structured. bundled = single per-month price per tier (chairperson default). per_meal = each meal billed separately. per_day = daily-rate billing (existing mess_billing_periods substrate).',
    'dropdown',
    'bundled is simplest for chairperson and residents; per_meal/per_day unlock granular billing but require attendance scans on every meal.',
    'Mess — Billing',
    true, true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ui_options for the two dropdowns and one toggle (kept separate from VALUES
-- block to keep the INSERT shape clean; UPDATE-only for rows that already
-- exist by ON CONFLICT path).
UPDATE public.platform_policies
SET ui_options = '[{"value":"photos","label":"Uploaded photos (chairperson)"},{"value":"ai_generated","label":"AI generated"},{"value":"none","label":"No images"}]'::jsonb
WHERE policy_key = 'mess.menu.image_source'
  AND scope_type = 'global'
  AND scope_id IS NULL
  AND ui_options IS NULL;

UPDATE public.platform_policies
SET ui_options = '[{"value":"ta","label":"Tamil"},{"value":"en","label":"English"}]'::jsonb
WHERE policy_key = 'mess.menu.source_locale'
  AND scope_type = 'global'
  AND scope_id IS NULL
  AND ui_options IS NULL;

UPDATE public.platform_policies
SET ui_options = '[{"value":"bundled","label":"Bundled per month"},{"value":"per_meal","label":"Per meal"},{"value":"per_day","label":"Per day"}]'::jsonb
WHERE policy_key = 'mess.menu.fee_model'
  AND scope_type = 'global'
  AND scope_id IS NULL
  AND ui_options IS NULL;

-- ---------------------------------------------------------------------------
-- 5) Verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_policies integer;
  v_menus_cols integer;
  v_cater_cols integer;
BEGIN
  SELECT count(*) INTO v_policies
    FROM public.platform_policies
   WHERE policy_key LIKE 'mess.menu.%' AND scope_type = 'global';

  IF v_policies < 6 THEN
    RAISE EXCEPTION 'Mess menu policy seed failed: expected >= 6 rows, got %', v_policies;
  END IF;

  SELECT count(*) INTO v_menus_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'mess_menus'
     AND column_name IN ('items_tamil', 'items_english', 'tier_key');

  IF v_menus_cols < 3 THEN
    RAISE EXCEPTION 'mess_menus extension failed: expected 3 new cols, got %', v_menus_cols;
  END IF;

  SELECT count(*) INTO v_cater_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'mess_caterers'
     AND column_name = 'gender_served';

  IF v_cater_cols < 1 THEN
    RAISE EXCEPTION 'mess_caterers extension failed: gender_served column missing';
  END IF;

  RAISE NOTICE 'mess-menu PR1 schema extensions verified: policies=%, menus_new_cols=%, caterers_new_cols=%',
    v_policies, v_menus_cols, v_cater_cols;
END $$;
