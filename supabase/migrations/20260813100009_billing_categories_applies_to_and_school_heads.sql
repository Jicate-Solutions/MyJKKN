-- ============================================================================
-- 20260813100009 — billing_categories.applies_to + seed the school fee heads
-- ============================================================================
-- Design: docs/plans/2026-08-13-school-fee-structure-design.md §10 item 1
--
-- ############################################################################
-- # SAFETY CONTRACT — existing college / hostel / campus-living billing MUST  #
-- # be completely unaffected.                                                 #
-- #                                                                           #
-- #  * applies_to defaults to '{college}', so EVERY existing category keeps   #
-- #    exactly the meaning it has today.                                      #
-- #  * The default is a plain literal cast (immutable) → PG stores it as a    #
-- #    fast default in the catalog. No table rewrite.                         #
-- #  * NO existing category row is UPDATEd. Not one.                          #
-- #  * NO existing RLS policy, trigger, function or constraint is altered.    #
-- #    billing_enforce_once_per_learner and the collection_type CHECK are     #
-- #    untouched.                                                             #
-- #  * The new column is INERT until something reads it. No current college   #
-- #    query filters on applies_to, so college dropdowns behave identically   #
-- #    the moment this lands. Only the new school UI will filter on it.       #
-- ############################################################################
--
-- WHY seeding is in the same migration:
-- verified against the live database on 2026-08-13, NONE of the school fee
-- heads exist. billing_categories holds only college-shaped tuition rows
-- ('1 Year Tuition Fee' … '6 Year Tuition Fee') and has no 'Books & Notebooks',
-- 'ECA' or 'Skill Development' at all. Adding applies_to without the seed
-- would filter an empty set and Phase 4 would render a blank grid.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The scoping column
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_categories
  ADD COLUMN IF NOT EXISTS applies_to text[] NOT NULL DEFAULT '{college}'::text[];

-- billing_categories holds ~30 rows, so this CHECK validates instantly and
-- needs no NOT VALID / VALIDATE split (unlike billing_student_bills).
ALTER TABLE public.billing_categories
  DROP CONSTRAINT IF EXISTS billing_categories_applies_to_chk;

ALTER TABLE public.billing_categories
  ADD CONSTRAINT billing_categories_applies_to_chk
  CHECK (
    applies_to <@ ARRAY['college','school']::text[]
    AND array_length(applies_to, 1) >= 1
  );

COMMENT ON COLUMN public.billing_categories.applies_to IS
  'Which institution kinds may use this fee head. Defaults to {college} so every pre-existing category is unchanged. The school fee module filters on applies_to @> ''{school}''; college screens currently do not filter at all, so this column is inert for them. A head usable by both carries {college,school}.';

-- No index: the table has ~30 rows, so a GIN index on applies_to would never
-- be chosen by the planner and would only cost write time.


-- ---------------------------------------------------------------------------
-- 2. Seed the school fee heads
-- ---------------------------------------------------------------------------
-- Sourced from the two 2026-27 fee sheets:
--   JKKN Matric  → Tuition, Books & Notebooks, Uniform Kit, ECA, Skill Development
--   Nattraja CBSE → Books ("Book" column) + Tuition ("Term" column)
--
-- category_name carries UNIQUE (uq_billing_categories_name), so ON CONFLICT
-- makes this migration safely re-runnable.
--
-- Column defaults deliberately relied upon:
--   is_active           = true         (default)
--   visible_to_learners = true         (default) — parents must see these
--   collection_type     = 'management' (default) — institution revenue
--   once_per_learner    = false        (default) — heads recur per TERM, and
--                                      Books/Uniform are once per YEAR, not
--                                      once ever, so the flag must stay off
-- ---------------------------------------------------------------------------
INSERT INTO public.billing_categories (category_name, frequency, kind, applies_to, description)
VALUES
  ('Tuition Fee',       'yearly',   'tuition', '{school}'::text[],
   'School tuition, split across terms by the school fee plan.'),

  ('Books & Notebooks', 'yearly',   'other',   '{school}'::text[],
   'School books and notebooks. One-time per academic year, normally charged with Term I.'),

  ('Uniform Kit',       'yearly',   'other',   '{school}'::text[],
   'School uniform sets, shoes, bag, socks, ID card, diary and house uniform. One-time per academic year, normally charged with Term I.'),

  ('ECA',               'yearly',   'other',   '{school}'::text[],
   'Extra-curricular activities. Charged every term.'),

  ('Skill Development', 'yearly',   'tuition', '{school}'::text[],
   'Skill development component, charged alongside tuition in the terms where it applies.'),

  ('School Late Fee',   'one-time', 'penalty', '{school}'::text[],
   'Flat late fine on an overdue school term bill. Deliberately SEPARATE from the college ''Late Payment Charge'', which is driven by the percentage-based fn_late_charge_* engine and must not be mixed into school collection analytics.')
ON CONFLICT (category_name) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Verification (run manually after applying)
-- ---------------------------------------------------------------------------
--   -- 6 school heads, and nothing else changed:
--   SELECT category_name, kind, frequency, applies_to
--     FROM public.billing_categories
--    WHERE applies_to @> '{school}' ORDER BY category_name;
--
--   -- every pre-existing row still college-only:
--   SELECT count(*) FILTER (WHERE applies_to = '{college}')  AS college_only,
--          count(*) FILTER (WHERE applies_to @> '{school}')  AS school_capable,
--          count(*)                                          AS total
--     FROM public.billing_categories;
--
-- NOTE — 'Transport Fee' is currently {college}. School bus fees appear on
-- neither 2026-27 sheet, so it is deliberately NOT widened here. When a school
-- does need it, that is a one-line change:
--   UPDATE public.billing_categories
--      SET applies_to = '{college,school}'
--    WHERE category_name = 'Transport Fee';
-- ============================================================================
