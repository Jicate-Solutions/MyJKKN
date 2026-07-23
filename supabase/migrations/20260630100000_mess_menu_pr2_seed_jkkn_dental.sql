-- ============================================================================
-- Mess Menu PR 2 — JKKN Dental seed (2 caterers + 56 weekly menu rows)
-- ============================================================================
-- Created: 2026-05-26
-- Spec: 2026-05-25 chairperson+Director interview; Director Tamil-sourcing
--       decision 2026-05-26 ("Agent OCR with needs-native-review label").
-- Builds on PR 1 (merged d350af255) — uses items_tamil/items_english/tier_key
-- on mess_menus, gender_served on mess_caterers.
--
-- Idempotent. Safe to re-apply. Uses WHERE NOT EXISTS (no unique constraints
-- on these tables beyond PK — verified via pg_constraint pre-flight).
--
-- ── Tamil items / OCR coverage ─────────────────────────────────────────────
-- The 2 chairperson photos (HOSTEL MENU CLASSIC + HOSTEL MENU PREMIUM-(1),
-- dated 25.05.2026, Kumarapalayam 638 183) were NOT directly readable as
-- image bytes in the agent's context — only a prose description of common
-- items appeared in the conversation. Per Director's "leave empty if you
-- can't OCR confidently" guidance and CLAUDE.md rule 24 (non-Latin character
-- corruption), every cell ships with items_tamil = '{}' (empty array).
--
-- This is the SAFE seed: it lays down the 56-cell scaffolding (7 days x
-- 4 meal slots x 2 tiers) with correct institution_id, caterer_id, tier_key,
-- meal_type, day_of_week. Director / native Tamil reader fills each cell
-- via the PR 4 admin UI.
--
-- The `items` legacy column (NOT NULL) is also set to '{}' — keeping it in
-- sync with items_tamil per PR 1's back-compat plan. Once Director fills
-- items_tamil via admin UI, the service layer (PR 3) keeps items mirrored.
--
-- The PR description carries the `needs-native-review` label.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Seed 2 caterers for JKKN Dental College and Hospital
-- ---------------------------------------------------------------------------
-- Director provided placeholder names — rename via /admin/mess/caterers
-- (PR 4) once final contracts are signed.

INSERT INTO public.mess_caterers (
  institution_id,
  name,
  owner_name,
  phone,
  contract_start_date,
  contract_end_date,
  billing_model,
  status,
  gender_served
)
SELECT
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  'Boys Hostel Caterer',
  'To Be Assigned',
  '0000000000',
  '2026-05-25'::date,
  '2027-05-24'::date,
  'fixed_monthly'::billing_model_enum,
  'active'::caterer_status_enum,
  'boys'
WHERE NOT EXISTS (
  SELECT 1 FROM public.mess_caterers
  WHERE institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
    AND name = 'Boys Hostel Caterer'
);

INSERT INTO public.mess_caterers (
  institution_id,
  name,
  owner_name,
  phone,
  contract_start_date,
  contract_end_date,
  billing_model,
  status,
  gender_served
)
SELECT
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  'Girls Hostel Caterer',
  'To Be Assigned',
  '0000000000',
  '2026-05-25'::date,
  '2027-05-24'::date,
  'fixed_monthly'::billing_model_enum,
  'active'::caterer_status_enum,
  'girls'
WHERE NOT EXISTS (
  SELECT 1 FROM public.mess_caterers
  WHERE institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
    AND name = 'Girls Hostel Caterer'
);

-- ---------------------------------------------------------------------------
-- 2) Seed 56 weekly menu rows (7 days x 4 meal slots x 2 tiers)
-- ---------------------------------------------------------------------------
-- Menu architecture is gender-shared (chairperson decision). The menu cell
-- is tier-scoped, not gender-scoped. We park caterer_id on the Boys Hostel
-- Caterer for now — gender-served caterer dispatch happens in the service
-- layer (PR 3) where the resident's gender is read and the matching caterer
-- is picked at display time.
--
-- week_start_date is computed from IST current Monday at apply-time, so
-- re-applying this migration on a later week regenerates rows for that
-- week. The WHERE NOT EXISTS keys on (institution_id, week_start_date,
-- day_of_week, meal_type, tier_key) — this is the natural unique tuple.

DO $$
DECLARE
  v_inst_id  uuid := 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5';
  v_cater_id uuid;
  v_monday   date;
  v_day      int;
  v_meal     meal_type_enum;
  v_tier     text;
  v_inserted int := 0;
  v_skipped  int := 0;
BEGIN
  -- Pick the Boys Hostel Caterer (gender-shared menu, gender_served handled
  -- in service layer at dispatch time).
  SELECT id INTO v_cater_id
    FROM public.mess_caterers
   WHERE institution_id = v_inst_id
     AND name = 'Boys Hostel Caterer'
   LIMIT 1;

  IF v_cater_id IS NULL THEN
    RAISE EXCEPTION 'Boys Hostel Caterer not found for institution %; seed step 1 failed', v_inst_id;
  END IF;

  -- Current week's Monday in IST (Asia/Kolkata). Avoids the UTC-vs-IST drift
  -- that would otherwise stamp Sunday-night-IST seeds as last-week's Monday.
  v_monday := date_trunc('week', (NOW() AT TIME ZONE 'Asia/Kolkata')::date)::date;

  FOR v_day IN 1..7 LOOP
    FOREACH v_meal IN ARRAY ARRAY['breakfast','lunch','tea','dinner']::meal_type_enum[] LOOP
      FOREACH v_tier IN ARRAY ARRAY['standard','premium'] LOOP

        IF NOT EXISTS (
          SELECT 1 FROM public.mess_menus
           WHERE institution_id  = v_inst_id
             AND week_start_date = v_monday
             AND day_of_week     = v_day
             AND meal_type       = v_meal
             AND tier_key        = v_tier
        ) THEN
          INSERT INTO public.mess_menus (
            institution_id,
            caterer_id,
            week_start_date,
            day_of_week,
            meal_type,
            items,
            items_tamil,
            items_english,
            tier_key,
            status
          ) VALUES (
            v_inst_id,
            v_cater_id,
            v_monday,
            v_day,
            v_meal,
            '{}'::text[],         -- legacy column, NOT NULL — kept empty
            '{}'::text[],         -- Tamil source — Director fills via admin UI
            NULL,                 -- English translation — Director fills later
            v_tier,
            'planned'::menu_status_enum
          );
          v_inserted := v_inserted + 1;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;

      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'mess_menus seed: inserted=%, skipped=% (week_start=%, caterer=%)',
    v_inserted, v_skipped, v_monday, v_cater_id;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_caterers      int;
  v_menus_total   int;
  v_menus_std     int;
  v_menus_prem    int;
  v_monday        date;
BEGIN
  v_monday := date_trunc('week', (NOW() AT TIME ZONE 'Asia/Kolkata')::date)::date;

  SELECT count(*) INTO v_caterers
    FROM public.mess_caterers
   WHERE institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid;

  IF v_caterers < 2 THEN
    RAISE EXCEPTION 'Caterer seed failed: expected >= 2 rows, got %', v_caterers;
  END IF;

  SELECT count(*) INTO v_menus_total
    FROM public.mess_menus
   WHERE institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
     AND week_start_date = v_monday
     AND tier_key IN ('standard','premium');

  SELECT count(*) INTO v_menus_std
    FROM public.mess_menus
   WHERE institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
     AND week_start_date = v_monday
     AND tier_key = 'standard';

  SELECT count(*) INTO v_menus_prem
    FROM public.mess_menus
   WHERE institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
     AND week_start_date = v_monday
     AND tier_key = 'premium';

  IF v_menus_total < 56 THEN
    RAISE EXCEPTION 'Menu seed failed: expected 56 rows for week %, got % (std=%, prem=%)',
      v_monday, v_menus_total, v_menus_std, v_menus_prem;
  END IF;

  RAISE NOTICE 'mess-menu PR2 seed verified: caterers=%, menu_rows=% (std=%, prem=%, week_start=%)',
    v_caterers, v_menus_total, v_menus_std, v_menus_prem, v_monday;
END $$;
