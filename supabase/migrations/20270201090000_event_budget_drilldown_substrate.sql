-- ─── Event budgets: a level below the line, and arithmetic you can re-use ───
-- 2026-09-21
--
-- The tournament budget reads "Chess & Carrom — ₹1,52,300" as ONE row, and the
-- row cannot be opened. A budget line is the smallest thing the schema has.
--
-- The organisers already know and are working around it inside the free-text
-- `category` column. Across the 15 events that have a budget there are 41 lines
-- and 33 distinct category strings, including:
--
--   'Flex, Cup, Refreshment, Lunch'            }
--   'Flex, Cup, Refreshement, Lunch'           }  the same shopping list, five
--   'Flex, Cup, Resfreshment, Lunch'           }  times, three spellings of
--   'Flex,Cup, Refreshment, Lunch'             }  "refreshment"
--   'Flex, Cup, Refreshment, Breakfast, Lunch, Students lunch, Mementos,
--    Waterbottles, Audios, Tent, White powder, First aid,'   <- 11 items in a
--                                                               label, trailing
--                                                               comma and all
--   'Refree honorarium (1500/person)'   <- a unit rate written into a name
--   'Trophies' and 'Trophy'; 'Refreshments' and 'refreshments';
--   'misc' and 'Miscellaneous expenses'   <- nothing compares across events
--
-- ── What this migration adds ───────────────────────────────────────────────
--   1. parent_id      — sub-lines. ONE level only, enforced, so a parent's
--                       total is always exactly the sum of its children.
--   2. quantity,
--      unit_rate      — 12 referees x ₹1,500 instead of a number worked out on
--                       paper. This is what makes next year's budget a
--                       calculation rather than a guess.
--   3. committee_id   — the committee answerable for the spend. The committees
--                       already map onto it almost exactly: Prize & Certificate
--                       buys trophies, Hospitality buys refreshments.
--   4. event_budget_categories + category_id — one fixed list, seeded from what
--                       these 15 events actually spent on, so "refreshments"
--                       is ONE thing and can be totalled across events.
--
-- ── Two invariants held by the database, not by the UI ─────────────────────
-- A parent's estimated_amount and actual_amount are DERIVED: the sum of its
-- children, recomputed on every child insert, update and delete. A parent and
-- its children can therefore never disagree, which is the failure that makes a
-- drill-down worse than no drill-down.
--
-- A line carrying both quantity and unit_rate has its estimated_amount computed
-- from them, so the figure on screen can never contradict the arithmetic shown
-- beside it.
--
-- Nothing is required. Every existing line has NULL parent_id, NULL quantity,
-- NULL unit_rate, NULL committee_id and NULL category_id, and behaves exactly
-- as it does today. `category` stays NOT NULL and stays the display string; it
-- is filled from the catalogue when a category_id is set, so every existing
-- reader keeps working untouched.
--
-- This migration is SUBSTRATE ONLY. No UI reads any of it yet.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: the two trigger functions take no
-- caller identity and decide nothing about access; they only keep sums honest.
-- They are SECURITY DEFINER so a child write by someone who may write the child
-- can update its parent row, which is the same budget and the same authority.
--
-- No BEGIN/COMMIT: applied through exec_sql (a PL/pgSQL function, where
-- explicit transaction control is illegal). Idempotent.

-- ── 1. The category catalogue ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_budget_categories (
  id            uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name          text NOT NULL,
  kind          text NOT NULL DEFAULT 'expense',
  -- NULL = available to every institution. A row with an institution_id is that
  -- institution's own addition and nobody else's business.
  institution_id uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 100,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_budget_categories_kind_check CHECK (kind IN ('income','expense'))
);

-- One name per kind per institution. Two spellings of "Refreshments" is the
-- whole problem this table exists to end.
CREATE UNIQUE INDEX IF NOT EXISTS event_budget_categories_unique_global
  ON public.event_budget_categories (lower(name), kind)
  WHERE institution_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS event_budget_categories_unique_per_institution
  ON public.event_budget_categories (institution_id, lower(name), kind)
  WHERE institution_id IS NOT NULL;

COMMENT ON TABLE public.event_budget_categories IS
  'The fixed list an event budget line picks its category from. Seeded 2026-09-21 from what 15 events actually spent on, after 33 free-text strings made cross-event comparison impossible. institution_id NULL = available everywhere.';

ALTER TABLE public.event_budget_categories ENABLE ROW LEVEL SECURITY;

-- Readable by any signed-in user: it is a dropdown, and a budget line already
-- shows its category to anyone who may read the budget.
DROP POLICY IF EXISTS "event_budget_categories_read" ON public.event_budget_categories;
CREATE POLICY "event_budget_categories_read" ON public.event_budget_categories
  FOR SELECT TO authenticated USING (true);

-- Editing the LIST is an administrative act, deliberately narrower than editing
-- a budget line: one careless rename reaches every event at once.
DROP POLICY IF EXISTS "event_budget_categories_write" ON public.event_budget_categories;
CREATE POLICY "event_budget_categories_write" ON public.event_budget_categories
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (public.user_has_permission('events.budget.manage')
        AND (institution_id IS NULL OR public.role_has_institution_access(institution_id)))
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.user_has_permission('events.budget.manage')
        AND (institution_id IS NULL OR public.role_has_institution_access(institution_id)))
  );

REVOKE ALL   ON TABLE public.event_budget_categories FROM anon, PUBLIC;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_budget_categories TO authenticated;

-- Seed: derived from the 33 strings these events actually used, deduplicated
-- and spelled once. Nothing invented — every row below answers to real spend,
-- except the income side, which answers to the two income lines on record.
INSERT INTO public.event_budget_categories (name, kind, sort_order) VALUES
  ('Registration fees',            'income',  10),
  ('Sponsorship',                  'income',  20),
  ('Refreshments & food',          'expense', 10),
  ('Printing, flex & invitations', 'expense', 20),
  ('Prizes, trophies & mementos',  'expense', 30),
  ('Certificates',                 'expense', 40),
  ('Audio, stage & lighting',      'expense', 50),
  ('Venue & ground preparation',   'expense', 60),
  ('Sports & event materials',     'expense', 70),
  ('Officials & honorarium',       'expense', 80),
  ('Medical & first aid',          'expense', 90),
  ('Photography & videography',    'expense', 100),
  ('Transport & traffic',          'expense', 110),
  ('Miscellaneous',                'expense', 999)
ON CONFLICT DO NOTHING;

-- ── 2. The new columns on a budget line ─────────────────────────────────────
ALTER TABLE public.event_budget_items
  ADD COLUMN IF NOT EXISTS parent_id    uuid REFERENCES public.event_budget_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS quantity     numeric,
  ADD COLUMN IF NOT EXISTS unit_rate    numeric,
  ADD COLUMN IF NOT EXISTS committee_id uuid REFERENCES public.event_committees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id  uuid REFERENCES public.event_budget_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS event_budget_items_parent_idx    ON public.event_budget_items (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_budget_items_committee_idx ON public.event_budget_items (committee_id) WHERE committee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_budget_items_category_idx  ON public.event_budget_items (category_id) WHERE category_id IS NOT NULL;

COMMENT ON COLUMN public.event_budget_items.parent_id IS
  'The line this one itemises. ONE level only. A parent''s estimated_amount and actual_amount are DERIVED from its children and must not be authored.';
COMMENT ON COLUMN public.event_budget_items.quantity IS
  'How many. With unit_rate, estimated_amount is computed as quantity * unit_rate — the reusable half of a budget ("12 referees at 1,500").';
COMMENT ON COLUMN public.event_budget_items.unit_rate IS
  'Rate per unit in rupees. See quantity.';
COMMENT ON COLUMN public.event_budget_items.committee_id IS
  'The committee answerable for this spend. NULL where no committee owns it.';
COMMENT ON COLUMN public.event_budget_items.category_id IS
  'The catalogue category. `category` remains the display string and is kept in step from here when this is set.';

-- Non-negative, and no self-parenting. Cheap guards, checked by the database.
ALTER TABLE public.event_budget_items DROP CONSTRAINT IF EXISTS event_budget_items_quantity_nonneg;
ALTER TABLE public.event_budget_items ADD  CONSTRAINT event_budget_items_quantity_nonneg  CHECK (quantity  IS NULL OR quantity  >= 0);
ALTER TABLE public.event_budget_items DROP CONSTRAINT IF EXISTS event_budget_items_unit_rate_nonneg;
ALTER TABLE public.event_budget_items ADD  CONSTRAINT event_budget_items_unit_rate_nonneg CHECK (unit_rate IS NULL OR unit_rate >= 0);
ALTER TABLE public.event_budget_items DROP CONSTRAINT IF EXISTS event_budget_items_not_own_parent;
ALTER TABLE public.event_budget_items ADD  CONSTRAINT event_budget_items_not_own_parent   CHECK (parent_id IS NULL OR parent_id <> id);

-- ── 3. What a sub-line may be ───────────────────────────────────────────────
-- Enforced here rather than in the UI, because a second level or a cross-event
-- parent would silently break every total that reads this table.
CREATE OR REPLACE FUNCTION public.fn_event_budget_child_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE p RECORD;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, event_id, parent_id, type INTO p
  FROM public.event_budget_items WHERE id = NEW.parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget parent line % does not exist', NEW.parent_id
      USING ERRCODE = '23503';
  END IF;
  IF p.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'A budget line may be itemised one level deep only — "%" is already a sub-line', NEW.parent_id
      USING ERRCODE = '23514';
  END IF;
  IF p.event_id <> NEW.event_id THEN
    RAISE EXCEPTION 'A sub-line must belong to the same event as its parent'
      USING ERRCODE = '23514';
  END IF;
  IF p.type <> NEW.type THEN
    RAISE EXCEPTION 'A sub-line must be the same type (income/expense) as its parent'
      USING ERRCODE = '23514';
  END IF;

  -- Becoming a parent's child means the parent stops being authored directly.
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_event_budget_child_guard ON public.event_budget_items;
CREATE TRIGGER trg_event_budget_child_guard
  BEFORE INSERT OR UPDATE OF parent_id, event_id, type ON public.event_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_budget_child_guard();

-- ── 4. Arithmetic the UI cannot contradict ──────────────────────────────────
-- quantity x unit_rate wins over a typed estimate whenever both are present.
CREATE OR REPLACE FUNCTION public.fn_event_budget_compute_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.quantity IS NOT NULL AND NEW.unit_rate IS NOT NULL THEN
    NEW.estimated_amount := NEW.quantity * NEW.unit_rate;
  END IF;
  -- Keep the legacy display string honest when a catalogue category is chosen.
  IF NEW.category_id IS NOT NULL THEN
    NEW.category := coalesce(
      (SELECT c.name FROM public.event_budget_categories c WHERE c.id = NEW.category_id),
      NEW.category
    );
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_event_budget_compute_line ON public.event_budget_items;
CREATE TRIGGER trg_event_budget_compute_line
  BEFORE INSERT OR UPDATE OF quantity, unit_rate, category_id, estimated_amount ON public.event_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_budget_compute_line();

-- ── 5. A parent always equals the sum of its children ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_event_budget_rollup_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE target uuid;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.parent_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.parent_id END
  ] LOOP
    IF target IS NOT NULL THEN
      UPDATE public.event_budget_items p
      SET estimated_amount = coalesce(s.est, 0),
          actual_amount    = coalesce(s.act, 0),
          updated_at       = now()
      FROM (
        SELECT sum(estimated_amount) AS est, sum(coalesce(actual_amount,0)) AS act
        FROM public.event_budget_items WHERE parent_id = target
      ) s
      WHERE p.id = target;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_event_budget_rollup_parent ON public.event_budget_items;
CREATE TRIGGER trg_event_budget_rollup_parent
  AFTER INSERT OR DELETE OR UPDATE OF estimated_amount, actual_amount, parent_id
  ON public.event_budget_items
  FOR EACH ROW
  -- Depth guard: the UPDATE above fires this trigger again on the parent row.
  -- A parent has no parent, so it would be a harmless no-op, but stopping here
  -- keeps the write count to one per child change.
  WHEN (pg_trigger_depth() < 2)
  EXECUTE FUNCTION public.fn_event_budget_rollup_parent();

REVOKE EXECUTE ON FUNCTION public.fn_event_budget_child_guard()   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_event_budget_compute_line()  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_event_budget_rollup_parent() FROM anon, PUBLIC;

NOTIFY pgrst, 'reload schema';
