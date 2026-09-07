-- ============================================================================
-- Events · an institutional event number, and the classes an event is for
-- Created: 2026-09-07
-- FILE ONLY — NOT APPLIED TO ANY DATABASE. The operator applies it at merge.
-- ----------------------------------------------------------------------------
-- FOUR THINGS, ONE OF WHICH IS DELIBERATELY EMPTY
--
--   1. events.event_number — a per-college, per-academic-year sequence rendered
--      as `26-001`. Concurrency-safe by construction (a counter row, not
--      max()+1). Existing rows backfilled deterministically.
--   2. event_target_classes — the classes (sections) an event is actually for.
--      No such link has ever existed; events.target_audience is a free JSONB
--      blob that nothing in the Events module reads.
--   3. event_academic_types  — EMPTY catalogue, content is a Director decision.
--   4. event_impact_categories — EMPTY catalogue, ditto.
--
-- WHY events.event_type IS NOT THE ACADEMIC CATALOGUE
--   events.event_type carries nine OPERATIONAL values that decide which console
--   an event opens in (sports_tournament, lecture, induction, cultural,
--   convocation, sports, marathon, alumni, school_of_influence). Changing that
--   column's vocabulary would re-route live events. The academic classification
--   an IQAC report needs is a SECOND, orthogonal axis, so it gets its own table.
--
-- WHY event_categories IS NOT IT EITHER
--   public.event_categories is per-EVENT (it carries event_id NOT NULL) and its
--   live content is marathon race distances — "10 KM Run", "5km", "5 KM Run".
--   It is a within-one-event competition/race catalogue, not an institutional
--   type list. Verified against supabase/setup/01_tables.sql and the live rows.
--
-- 🛑 THE TWO CATALOGUES SHIP EMPTY ON PURPOSE — DO NOT SEED THEM
--   The academic event types and the outcome/impact categories are defined in a
--   JKKN IQAC SOP that is NOT in this repository. Inventing plausible entries
--   would silently become the institution's referenced catalogue and would then
--   be cited in accreditation evidence. Both tables therefore carry a table
--   COMMENT saying the content awaits Director confirmation, and this migration
--   contains ZERO INSERTs into either. Searched this repo for a 17-item academic
--   event-type list and a 10-item impact list: no such list exists anywhere in
--   the tree (sweep output is in the PR body).
--
-- WHAT "ACADEMIC YEAR" MEANS HERE — read before changing it
--   academic_years.is_active is NOT a single-current-year flag. The merged
--   migration 20260710120000_induction_mentorship_academic_year_lifecycle.sql
--   records, from a live survey, that 41 rows are "active" across 11 colleges.
--   So the year is resolved by DATE CONTAINMENT against that college's own
--   academic_years row (start_date .. end_date), which is the only reliable
--   reading. The same file records AY "2026-2027" ending 2027-05-31, i.e. the
--   JKKN academic year opens on 1 June — that is the fallback used when no
--   academic_years row covers the date.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. THE INSTITUTIONAL EVENT NUMBER
-- ────────────────────────────────────────────────────────────────────────────

-- 1a. Columns. `event_number` is GENERATED so the string and the parts can
--     never drift. lpad/`::text` are IMMUTABLE; to_char() is only STABLE
--     (locale-dependent) and would be rejected in a generated expression.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_number_year INTEGER,
  ADD COLUMN IF NOT EXISTS event_number_seq  INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'events'
       AND column_name = 'event_number'
  ) THEN
    ALTER TABLE public.events
      ADD COLUMN event_number TEXT
      GENERATED ALWAYS AS (
        CASE
          WHEN event_number_year IS NULL OR event_number_seq IS NULL THEN NULL
          ELSE lpad((event_number_year % 100)::text, 2, '0')
               || '-' || lpad(event_number_seq::text, 3, '0')
        END
      ) STORED;
  END IF;
END $$;

COMMENT ON COLUMN public.events.event_number_year IS
  'The calendar year in which this event''s academic year OPENS (2026 = AY 2026-2027). Half of the institutional event number. Frozen once assigned.';
COMMENT ON COLUMN public.events.event_number_seq IS
  'Position of this event within its college and academic year, from 1. Frozen once assigned. Gaps are possible and expected — a rolled-back create burns its number rather than handing it to somebody else.';
COMMENT ON COLUMN public.events.event_number IS
  'The institutional event number a coordinator quotes, e.g. 26-001: the academic year''s opening year (last two digits), a dash, then the sequence within that college and year. Generated — never write to it.';

-- The uniqueness the whole scheme rests on. Partial, because both halves are
-- NULL on a row whose number has not been assigned (nothing today, but a
-- service-role insert that sets them explicitly is allowed to leave them off).
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_institution_number
  ON public.events (institution_id, event_number_year, event_number_seq)
  WHERE event_number_year IS NOT NULL AND event_number_seq IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_event_number
  ON public.events (event_number)
  WHERE event_number IS NOT NULL;


-- 1b. The counter. This is what makes two coordinators pressing Create in the
--     same instant safe. `INSERT .. ON CONFLICT DO UPDATE .. RETURNING` takes a
--     row lock on the (college, year) counter row, so the second transaction
--     BLOCKS until the first commits and then reads the incremented value. A
--     naive `SELECT max(seq)+1` lets both read the same number and one of them
--     dies on the unique index — a create that fails for no reason the
--     coordinator can understand.
CREATE TABLE IF NOT EXISTS public.event_number_counters (
  institution_id UUID    NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  year_start     INTEGER NOT NULL,
  last_seq       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, year_start)
);

COMMENT ON TABLE public.event_number_counters IS
  'One row per college per academic year holding the last institutional event number handed out. Written only by fn_events_allocate_number(); never edit by hand — lowering last_seq hands out a number that is already on an event.';

REVOKE ALL ON public.event_number_counters FROM anon, PUBLIC;
ALTER TABLE public.event_number_counters ENABLE ROW LEVEL SECURITY;

-- Read-only to humans: the allocator is SECURITY DEFINER and does not need a
-- policy. Nobody gets INSERT/UPDATE/DELETE through PostgREST at all.
DROP POLICY IF EXISTS event_number_counters_select ON public.event_number_counters;
CREATE POLICY event_number_counters_select ON public.event_number_counters
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('events.view')
        AND public.role_has_institution_access(institution_id))
  );

GRANT SELECT ON public.event_number_counters TO authenticated;


-- 1c. Which academic year a date falls in, for one college.
--     SECURITY DEFINER because academic_years is RLS-gated and an event
--     coordinator is not guaranteed to be able to read their own college's
--     year rows; without it the resolver would silently return the fallback.
CREATE OR REPLACE FUNCTION public.fn_event_academic_year_start(
  p_institution_id UUID,
  p_on_date        DATE
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT EXTRACT(YEAR FROM ay.start_date)::int
        FROM public.academic_years ay
       WHERE ay.institution_id = p_institution_id
         AND p_on_date BETWEEN ay.start_date AND ay.end_date
       ORDER BY ay.start_date DESC
       LIMIT 1
    ),
    -- No academic_years row covers this date. The JKKN academic year opens on
    -- 1 June (AY 2026-2027 ends 2027-05-31, recorded live in
    -- 20260710120000_induction_mentorship_academic_year_lifecycle.sql), so
    -- June onwards belongs to the year opening in that calendar year.
    CASE WHEN EXTRACT(MONTH FROM p_on_date) >= 6
         THEN EXTRACT(YEAR FROM p_on_date)::int
         ELSE EXTRACT(YEAR FROM p_on_date)::int - 1
    END
  );
$$;

-- Narrowed after scripts/ci/check-secdef-anon-revoke.mjs flagged it: a
-- SECURITY DEFINER function reachable by every signed-in account with no
-- authorization check in its body. Nothing in the application calls it — this
-- phase adds no pages — and the only real caller is the BEFORE INSERT trigger,
-- which runs as the table owner and does not need a grant at all. So the grant
-- is narrowed rather than justified. `authenticated` is a member of PUBLIC, so
-- both are named; a later phase that needs it from a route should grant it
-- deliberately, with a guard in the body.
REVOKE EXECUTE ON FUNCTION public.fn_event_academic_year_start(UUID, DATE) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_academic_year_start(UUID, DATE) TO service_role;

COMMENT ON FUNCTION public.fn_event_academic_year_start(UUID, DATE) IS
  'The calendar year in which the college''s academic year covering p_on_date opens. Resolved by date containment against academic_years, NOT by is_active — is_active is true on 41 rows across 11 colleges and cannot identify a current year.';


-- 1d. The allocator. One number, atomically, per call.
CREATE OR REPLACE FUNCTION public.fn_events_allocate_number(
  p_institution_id UUID,
  p_year           INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  IF p_institution_id IS NULL OR p_year IS NULL THEN
    RAISE EXCEPTION 'fn_events_allocate_number: institution and year are both required'
      USING ERRCODE = '22004';
  END IF;

  INSERT INTO public.event_number_counters AS c (institution_id, year_start, last_seq)
  VALUES (p_institution_id, p_year, 1)
  ON CONFLICT (institution_id, year_start) DO UPDATE
    SET last_seq   = c.last_seq + 1,
        updated_at = now()
  RETURNING c.last_seq INTO v_seq;

  RETURN v_seq;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_events_allocate_number(UUID, INTEGER) FROM anon, PUBLIC;
-- Deliberately NOT granted to `authenticated`. The only legitimate caller is the
-- BEFORE INSERT trigger, which runs as the table owner. A signed-in caller who
-- could call this directly could burn numbers, or bump last_seq past every real
-- event and make the next genuine create jump.
GRANT  EXECUTE ON FUNCTION public.fn_events_allocate_number(UUID, INTEGER) TO service_role;

COMMENT ON FUNCTION public.fn_events_allocate_number(UUID, INTEGER) IS
  'Hands out the next institutional event number for a college and academic year. Atomic: the ON CONFLICT DO UPDATE row lock serialises concurrent creates, so two coordinators never receive the same number.';


-- 1e. Assign on insert; freeze thereafter.
CREATE OR REPLACE FUNCTION public.fn_events_stamp_event_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- An institutional number is quoted in letters, minutes and reports. Once
    -- issued it is not re-derivable from a later edit to the date or the
    -- college, so both halves are frozen. NULL -> value is allowed (a row that
    -- somehow escaped numbering can still be numbered).
    IF OLD.event_number_year IS NOT NULL THEN
      NEW.event_number_year := OLD.event_number_year;
    END IF;
    IF OLD.event_number_seq IS NOT NULL THEN
      NEW.event_number_seq := OLD.event_number_seq;
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  IF NEW.institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.event_number_year IS NOT NULL AND NEW.event_number_seq IS NOT NULL THEN
    RETURN NEW;  -- caller supplied both halves (backfill / data repair)
  END IF;

  v_year := COALESCE(
    NEW.event_number_year,
    public.fn_event_academic_year_start(
      NEW.institution_id,
      COALESCE(
        NEW.event_date,
        (NEW.start_date AT TIME ZONE 'Asia/Kolkata')::date,
        CURRENT_DATE
      )
    )
  );

  NEW.event_number_year := v_year;
  NEW.event_number_seq  := public.fn_events_allocate_number(NEW.institution_id, v_year);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_events_stamp_event_number() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_events_stamp_event_number ON public.events;
CREATE TRIGGER trg_events_stamp_event_number
  BEFORE INSERT OR UPDATE OF event_number_year, event_number_seq ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fn_events_stamp_event_number();


-- 1f. Backfill. Deterministic: created_at order inside each college and year,
--     with id as the tiebreak so a created_at tie cannot reshuffle on a re-run.
WITH resolved AS (
  SELECT
    e.id,
    e.institution_id,
    e.created_at,
    public.fn_event_academic_year_start(
      e.institution_id,
      COALESCE(e.event_date, (e.start_date AT TIME ZONE 'Asia/Kolkata')::date, e.created_at::date)
    ) AS year_start
  FROM public.events e
  WHERE e.event_number_seq IS NULL
     OR e.event_number_year IS NULL
),
numbered AS (
  SELECT
    r.id,
    r.year_start,
    ROW_NUMBER() OVER (
      PARTITION BY r.institution_id, r.year_start
      ORDER BY r.created_at, r.id
    ) AS seq
  FROM resolved r
)
UPDATE public.events e
   SET event_number_year = n.year_start,
       event_number_seq  = n.seq
  FROM numbered n
 WHERE e.id = n.id;

-- Seed the counters from what the backfill just wrote, so the next real create
-- continues the sequence instead of restarting at 1.
INSERT INTO public.event_number_counters (institution_id, year_start, last_seq)
SELECT e.institution_id, e.event_number_year, MAX(e.event_number_seq)
  FROM public.events e
 WHERE e.event_number_year IS NOT NULL
   AND e.event_number_seq  IS NOT NULL
 GROUP BY e.institution_id, e.event_number_year
ON CONFLICT (institution_id, year_start) DO UPDATE
  SET last_seq   = GREATEST(public.event_number_counters.last_seq, EXCLUDED.last_seq),
      updated_at = now();


-- ────────────────────────────────────────────────────────────────────────────
-- 2. THE CLASSES AN EVENT IS ACTUALLY FOR
-- ────────────────────────────────────────────────────────────────────────────
-- A class at JKKN is a `sections` row (institution -> degree -> department ->
-- programme -> semester -> section). This is the first link between an event and
-- one; events.target_audience is a free JSONB column that no Events code reads.
CREATE TABLE IF NOT EXISTS public.event_target_classes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES public.events(id)   ON DELETE CASCADE,
  section_id     UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES public.institutions(id),
  created_by     UUID REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_event_target_classes UNIQUE (event_id, section_id)
);

COMMENT ON TABLE public.event_target_classes IS
  'The classes an event is for — one row per (event, section). Says who the event is aimed at; it is NOT attendance and NOT a registration. A learner in a listed class is not enrolled by this row.';
COMMENT ON COLUMN public.event_target_classes.institution_id IS
  'The college. Stamped from the event by trg_event_target_classes_scope and required to match the section''s college — it carries the multi-tenant RLS, it is not a free field.';

CREATE INDEX IF NOT EXISTS idx_event_target_classes_event
  ON public.event_target_classes (event_id);
CREATE INDEX IF NOT EXISTS idx_event_target_classes_section
  ON public.event_target_classes (section_id);
CREATE INDEX IF NOT EXISTS idx_event_target_classes_institution
  ON public.event_target_classes (institution_id);

REVOKE ALL ON public.event_target_classes FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_target_classes TO authenticated;
ALTER TABLE public.event_target_classes ENABLE ROW LEVEL SECURITY;

-- Stamp + guard the tenant. Without this the RLS above is decorative: a caller
-- could send any institution_id they are allowed to see and attach a class from
-- one college to an event in another.
CREATE OR REPLACE FUNCTION public.fn_event_target_class_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_institution   UUID;
  v_section_institution UUID;
BEGIN
  SELECT e.institution_id INTO v_event_institution
    FROM public.events e WHERE e.id = NEW.event_id;

  SELECT s.institution_id INTO v_section_institution
    FROM public.sections s WHERE s.id = NEW.section_id;

  IF v_event_institution IS NULL THEN
    RAISE EXCEPTION 'event_target_classes: event % does not exist', NEW.event_id
      USING ERRCODE = '23503';
  END IF;

  NEW.institution_id := v_event_institution;

  IF v_section_institution IS DISTINCT FROM v_event_institution THEN
    RAISE EXCEPTION 'event_target_classes: class % belongs to a different college than event %',
      NEW.section_id, NEW.event_id
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_target_class_scope() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_event_target_classes_scope ON public.event_target_classes;
CREATE TRIGGER trg_event_target_classes_scope
  BEFORE INSERT OR UPDATE ON public.event_target_classes
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_target_class_scope();

-- RLS — the standard MyJKKN shape. No role name is named anywhere.
DROP POLICY IF EXISTS event_target_classes_select ON public.event_target_classes;
CREATE POLICY event_target_classes_select ON public.event_target_classes
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('events.view')
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS event_target_classes_insert ON public.event_target_classes;
CREATE POLICY event_target_classes_insert ON public.event_target_classes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('events.target_classes.manage')
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS event_target_classes_update ON public.event_target_classes;
CREATE POLICY event_target_classes_update ON public.event_target_classes
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('events.target_classes.manage')
        AND public.role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS event_target_classes_delete ON public.event_target_classes;
CREATE POLICY event_target_classes_delete ON public.event_target_classes
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('events.target_classes.manage')
        AND public.role_has_institution_access(institution_id))
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 3. TWO CATALOGUES THAT SHIP EMPTY
-- ────────────────────────────────────────────────────────────────────────────
-- 🛑 NO INSERT STATEMENT BELOW TOUCHES EITHER TABLE. See the header. The lists
--    live in a JKKN IQAC SOP that is not in this repository and confirming them
--    is a Director decision, not a developer's guess.

-- 3a. Academic event types — the classification an IQAC report asks for, kept
--     separate from events.event_type, which routes an event to its console.
CREATE TABLE IF NOT EXISTS public.event_academic_types (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE,
  code           TEXT    NOT NULL,
  label          TEXT    NOT NULL,
  description    TEXT,
  display_order  INTEGER NOT NULL DEFAULT 100,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_academic_types IS
  'EMPTY ON PURPOSE — the academic event-type list awaits Director confirmation against the JKKN IQAC SOP, which is not in this repository. Do not seed it from a guess: whatever lands here becomes the institution''s referenced catalogue and will be cited in accreditation evidence.';
COMMENT ON COLUMN public.event_academic_types.institution_id IS
  'NULL means the type is available to every college. A value scopes it to that one college.';
COMMENT ON COLUMN public.event_academic_types.code IS
  'Stable machine key. Unique per college (and once across the NULL/all-colleges scope), case-insensitively.';

-- Unique per scope, case-insensitively. A COALESCE'd expression index rather
-- than NULLS NOT DISTINCT so the constraint means the same thing on any
-- PostgreSQL the schema is ever restored onto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_academic_types_scope_code
  ON public.event_academic_types (
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(code)
  );

REVOKE ALL ON public.event_academic_types FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_academic_types TO authenticated;
ALTER TABLE public.event_academic_types ENABLE ROW LEVEL SECURITY;

-- A catalogue nobody can read is a dropdown that is always empty, so SELECT
-- rides the events view key and the all-colleges rows are readable by everyone
-- who can see events at all.
DROP POLICY IF EXISTS event_academic_types_select ON public.event_academic_types;
CREATE POLICY event_academic_types_select ON public.event_academic_types
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
      public.user_has_permission('events.view')
      AND (institution_id IS NULL OR public.role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS event_academic_types_write ON public.event_academic_types;
CREATE POLICY event_academic_types_write ON public.event_academic_types
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
      public.user_has_permission('events.catalogues.manage')
      AND (institution_id IS NULL OR public.role_has_institution_access(institution_id))
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_admin()
    OR (
      public.user_has_permission('events.catalogues.manage')
      AND (institution_id IS NULL OR public.role_has_institution_access(institution_id))
    )
  );


-- 3b. Outcome / impact categories — what an event is claimed to have changed.
--     Zero occurrences of any such taxonomy exist anywhere in this codebase.
CREATE TABLE IF NOT EXISTS public.event_impact_categories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE,
  code           TEXT    NOT NULL,
  label          TEXT    NOT NULL,
  description    TEXT,
  display_order  INTEGER NOT NULL DEFAULT 100,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.event_impact_categories IS
  'EMPTY ON PURPOSE — the outcome/impact taxonomy awaits Director confirmation against the JKKN IQAC SOP, which is not in this repository. Do not seed it from a guess: an invented impact category becomes an institutional claim about what an event changed for learners.';
COMMENT ON COLUMN public.event_impact_categories.institution_id IS
  'NULL means the category is available to every college. A value scopes it to that one college.';
COMMENT ON COLUMN public.event_impact_categories.code IS
  'Stable machine key. Unique per college (and once across the NULL/all-colleges scope), case-insensitively.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_impact_categories_scope_code
  ON public.event_impact_categories (
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(code)
  );

REVOKE ALL ON public.event_impact_categories FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_impact_categories TO authenticated;
ALTER TABLE public.event_impact_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_impact_categories_select ON public.event_impact_categories;
CREATE POLICY event_impact_categories_select ON public.event_impact_categories
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
      public.user_has_permission('events.view')
      AND (institution_id IS NULL OR public.role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS event_impact_categories_write ON public.event_impact_categories;
CREATE POLICY event_impact_categories_write ON public.event_impact_categories
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
      public.user_has_permission('events.catalogues.manage')
      AND (institution_id IS NULL OR public.role_has_institution_access(institution_id))
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_admin()
    OR (
      public.user_has_permission('events.catalogues.manage')
      AND (institution_id IS NULL OR public.role_has_institution_access(institution_id))
    )
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 4. END-STATE ASSERTIONS — raise, never notice
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'event_number_counters', 'event_target_classes',
    'event_academic_types', 'event_impact_categories'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%', t;
    END IF;

    -- Effective privilege, not the ACL string: anon is a member of PUBLIC, so an
    -- ACL can read as revoked while anon still holds the grant through PUBLIC.
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'anon can still SELECT public.%', t;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.fn_event_academic_year_start(uuid,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can still execute fn_event_academic_year_start';
  END IF;
  IF has_function_privilege('anon', 'public.fn_events_allocate_number(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can still execute fn_events_allocate_number';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_events_allocate_number(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute fn_events_allocate_number — it must be trigger-only';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_event_academic_year_start(uuid,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute fn_event_academic_year_start — it must be trigger-only';
  END IF;

  -- Every event carries a number, and no college/year pair reuses one.
  IF EXISTS (SELECT 1 FROM public.events WHERE event_number IS NULL) THEN
    RAISE EXCEPTION 'backfill left events without an institutional number';
  END IF;

  -- Both catalogues must still be empty. Seeding them here is the one thing
  -- this migration must never do.
  IF (SELECT count(*) FROM public.event_academic_types) <> 0 THEN
    RAISE EXCEPTION 'event_academic_types is not empty — its content is a Director decision';
  END IF;
  IF (SELECT count(*) FROM public.event_impact_categories) <> 0 THEN
    RAISE EXCEPTION 'event_impact_categories is not empty — its content is a Director decision';
  END IF;
END $$;
