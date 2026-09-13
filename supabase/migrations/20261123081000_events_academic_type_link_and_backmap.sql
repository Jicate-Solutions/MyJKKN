-- ============================================================================
-- Give an event a place to record WHAT KIND of academic activity it was, and
-- fill it in for the 55 events already on record — as guesses that say so.
--
-- 20261118093000 created public.event_academic_types. 20261121090000 fills it
-- with the twenty types from the SOP. Neither connected it to an event: there
-- is no column on public.events pointing at the catalogue, and no foreign key
-- anywhere references it. A catalogue nothing can be tagged with is furniture.
--
-- Two columns, not one. `academic_type_id` is the answer; `academic_type_source`
-- is who said so. The Director's ruling of 2026-09-08 was to back-fill the
-- existing events by reading across from their operational kind rather than
-- leaving the field blank — and he accepted, knowingly, that those are guesses.
-- The stamp is what keeps that acceptance visible: a row written by this
-- migration reads 'machine_inferred' forever until a human changes it, so the
-- guess can be found, sorted, counted and corrected. Without it, in six months
-- nobody can tell the inferred rows from the ones somebody actually chose.
--
-- The pairing CHECK makes the stamp non-optional. A future screen cannot set a
-- type and quietly omit the provenance, because the row will not save.
--
-- MAPPING. events.event_type carries nine operational values, which route an
-- event to its console. As of 2026-09-13 ALL NINE read across, and every one of
-- the 55 events on record can be tagged. Counts re-measured against production
-- today, not inherited from this file's first draft (it said 51 across the same
-- nine kinds; four events have been added since, none of them a new kind).
--
--   Cross-reads — a judgement about what the activity WAS:
--     lecture           (20) -> guest_lecture
--     sports_tournament (19) -> sports
--     sports             (1) -> sports
--     marathon           (1) -> sports        <- the loosest of the nine
--     induction          (5) -> orientation
--     cultural           (5) -> cultural
--
--   Name identities — the operational kind and the academic type are the same
--   word. 20261123080000 added these three types for exactly this reason, on
--   the Director's decision of 2026-09-09, so that they would stop being blanks:
--     convocation        (2) -> convocation
--     alumni             (1) -> alumni_meet
--     school_of_influence(1) -> school_of_influence
--                                             = 55 of 55 tagged, 0 left blank
--
-- WHEN THIS FILE WAS FIRST WRITTEN those last three were LEFT NULL on purpose,
-- because none of the twenty types then in the catalogue fitted them and an
-- honest blank beats a confident wrong answer. That reasoning has not been
-- overturned — it has been ANSWERED. The types now exist, so the blank is no
-- longer the honest option; it is just a missing value.
--
-- ALL fifty-five are stamped 'machine_inferred', the three name identities
-- included. A machine chose them and no human has reviewed them, which is
-- precisely what the stamp asserts; how STRONG an inference is and where it
-- CAME FROM are different questions, and this column answers the second one.
--
-- WHY THIS FILE CAME BACK. It first shipped as PR #3371, stacked on #3368.
-- When #3368 merged on 2026-09-11 its base branch was deleted and GitHub
-- auto-closed this PR two seconds later. That was not a review decision — it
-- was a casualty of the stack. The catalogue has been live and unusable ever
-- since: twenty-three types seeded, and no column anywhere able to hold one.
--
-- ORDER MATTERS, AND THE FIRST VERSION OF THIS FILE GOT IT WRONG. It reads the
-- catalogue by code, so it must run after BOTH seeds: 20261121090000 (the
-- twenty from the SOP) and 20261123080000 (convocation, alumni_meet,
-- school_of_influence). It was numbered 20261122090000, which sorts BETWEEN
-- them — so on any ordered replay (fresh env, db reset, CI, a new tenant) three
-- of its nine CASE arms would match no catalogue row, four events would stay
-- blank, and it would exit GREEN because untagged rows were only a NOTICE.
-- Production happened to be safe because 20261123080000 was already applied
-- there, which is exactly why a rehearsal against production could not catch
-- it: the rehearsal tested today's database, not the file's own contract.
-- Renumbered to 20261123081000, and §2a now asserts every mapped code RESOLVES
-- rather than asking whether the catalogue is merely non-empty.
--
-- NOT PUBLISHED TO ANON. public.marathon_events is an anon-readable view over
-- public.events. The live view enumerates its columns, so adding columns here
-- does not widen it. Do not rewrite that view as SELECT * — it would publish
-- every future events column to the open internet.
-- ============================================================================

-- ── 1. The link, and the provenance that must accompany it ──────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS academic_type_id uuid,
  ADD COLUMN IF NOT EXISTS academic_type_source text;

COMMENT ON COLUMN public.events.academic_type_id IS
  'What kind of academic activity this event was, from public.event_academic_types. Distinct from events.event_type, which is the operational kind that routes the event to its console.';

COMMENT ON COLUMN public.events.academic_type_source IS
  'Who decided academic_type_id. ''machine_inferred'' = read across from event_type by a migration and never reviewed; ''human_confirmed'' = a person chose it. A row cleared by a human is indistinguishable from one never set — see the note on the back-fill guard.';

-- Every constraint is created AND validated from the catalog, never from an
-- IF NOT EXISTS branch alone: a partial prior run that created a constraint but
-- died before VALIDATE would otherwise leave it NOT VALID forever, which is the
-- very re-run hazard this block exists to close.
DO $$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='events_academic_type_source_valid'
                    AND conrelid='public.events'::regclass) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_academic_type_source_valid
      CHECK (academic_type_source IN ('machine_inferred','human_confirmed')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='events_academic_type_needs_source'
                    AND conrelid='public.events'::regclass) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_academic_type_needs_source
      CHECK ((academic_type_id IS NULL) = (academic_type_source IS NULL)) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='events_academic_type_id_fkey'
                    AND conrelid='public.events'::regclass AND contype='f') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_academic_type_id_fkey
      FOREIGN KEY (academic_type_id)
      REFERENCES public.event_academic_types (id) ON DELETE RESTRICT;
  END IF;

  -- validate anything still NOT VALID, whoever created it
  FOR r IN SELECT conname FROM pg_constraint
            WHERE conrelid='public.events'::regclass
              AND convalidated = false
              AND conname IN ('events_academic_type_source_valid',
                              'events_academic_type_needs_source',
                              'events_academic_type_id_fkey')
  LOOP
    EXECUTE format('ALTER TABLE public.events VALIDATE CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_academic_type_id
  ON public.events (academic_type_id) WHERE academic_type_id IS NOT NULL;

-- ── 1b. A type belonging to another college can never be attached ───────────
-- The FK carries no tenant predicate, and event_academic_types permits a
-- per-college row (its unique index is scoped exactly so a college can add its
-- own). Without this, a writer at College A can point an event at College B's
-- private type and any join rendering the type name leaks B's catalogue label
-- through public.events. Not exploitable today — all 23 rows are cluster-wide —
-- which is the reason to close it BEFORE the first per-college type exists.
--
-- Installed before the back-fill so it validates this file's own writes.
--
-- ⚠️ BLAST RADIUS: this is a BEFORE INSERT OR UPDATE trigger on public.events,
--    a core table. It runs on EVERY events write. It returns immediately when
--    academic_type_id IS NULL, which is every row today.
--
-- SECURITY DEFINER: the guard must read the catalogue's true owner, not the
-- subset the caller's RLS exposes — a caller who cannot see the row would
-- otherwise read NULL and sail through.
CREATE OR REPLACE FUNCTION public.fn_events_academic_type_tenant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_owner uuid;
BEGIN
  IF NEW.academic_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.institution_id INTO v_owner
    FROM public.event_academic_types t WHERE t.id = NEW.academic_type_id;

  -- PL/pgSQL's FOUND, not a sentinel column. `SELECT x, true INTO a, b` sets
  -- BOTH targets to NULL when no row matches, so `IF NOT b` evaluates to NULL,
  -- the not-found branch never fires, and an unknown id falls straight through
  -- the owner test below. That was this guard's state until review round 4.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academic type % does not exist.', NEW.academic_type_id
      USING ERRCODE = '23503';
  END IF;

  IF v_owner IS NULL THEN            -- cluster-wide: available to every college
    RETURN NEW;
  END IF;

  -- An event belonging to nobody gets its own message: "belongs to another
  -- college" would be misleading for a row that belongs to none.
  IF NEW.institution_id IS NULL THEN
    RAISE EXCEPTION
      'This event has no institution, so a college-specific academic type cannot be attached to it. Set events.institution_id first, or use a cluster-wide type.'
      USING ERRCODE = '42501';
  END IF;

  IF v_owner <> NEW.institution_id THEN
    RAISE EXCEPTION
      'Academic type % belongs to another college and cannot be attached to this event.',
      NEW.academic_type_id USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.fn_events_academic_type_tenant_guard() IS
  'Refuses an events.academic_type_id that points at another college''s private academic type. SECURITY DEFINER so it reads the catalogue''s true owner rather than the caller''s RLS view. Granted to nobody: PostgreSQL checks EXECUTE on a trigger function at CREATE TRIGGER time, never when it fires.';

REVOKE EXECUTE ON FUNCTION public.fn_events_academic_type_tenant_guard() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_events_academic_type_tenant_guard ON public.events;
CREATE TRIGGER trg_events_academic_type_tenant_guard
  BEFORE INSERT OR UPDATE OF academic_type_id, institution_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fn_events_academic_type_tenant_guard();

-- ── 1c. …and the catalogue side, which the events trigger cannot see ────────
-- Guarding only public.events leaves the other direction open: re-scoping a
-- cluster-wide type (institution_id NULL -> College A) retroactively leaves
-- every other college's events pointing at A's now-private type, leaking its
-- label through any join. ON DELETE RESTRICT does not cover an UPDATE of that
-- column. So the scope of a type in use is frozen while anyone else references it.
CREATE OR REPLACE FUNCTION public.fn_event_academic_type_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn2$
DECLARE v_foreign integer;
BEGIN
  IF NEW.institution_id IS NOT DISTINCT FROM OLD.institution_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_foreign
    FROM public.events e
   WHERE e.academic_type_id = OLD.id
     AND (NEW.institution_id IS NOT NULL
          AND e.institution_id IS DISTINCT FROM NEW.institution_id);

  IF v_foreign > 0 THEN
    RAISE EXCEPTION
      'Cannot re-scope academic type % to a single college: % event(s) at other colleges already reference it, and the change would leave them pointing at another college''s private type.',
      OLD.id, v_foreign USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$fn2$;

COMMENT ON FUNCTION public.fn_event_academic_type_scope_guard() IS
  'Refuses narrowing an academic type''s institution_id while events at other colleges still reference it. The events-side trigger validates writes to events; this validates the catalogue moving under them.';

REVOKE EXECUTE ON FUNCTION public.fn_event_academic_type_scope_guard() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_event_academic_type_scope_guard ON public.event_academic_types;
CREATE TRIGGER trg_event_academic_type_scope_guard
  BEFORE UPDATE OF institution_id ON public.event_academic_types
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_academic_type_scope_guard();

-- ── 2. Everything else is ONE statement, and that is the point ──────────────
-- Three revisions of this file leaked state between statements and each leak
-- was a bug: a transaction-local GUC (gone under a per-statement applier), then
-- a session TEMP table (gone whenever a pooled connection routes a later
-- statement to a different backend — Supabase does not guarantee one backend
-- per statement, and the failure lands AFTER §1 has already added the columns).
--
-- So there is no shared state left to lose. The mapping is an inline VALUES
-- list, the guard, the back-fill and the report are one DO block, and the
-- nine pairs appear exactly once.
--
-- NO GLOBAL CURATED SKIP. An earlier revision skipped the whole back-fill if
-- ANY row anywhere carried 'human_confirmed'. That was a tenant-wide kill
-- switch thrown by a single row at one of the colleges — and permanently
-- suppressed the back-fill for colleges onboarded later, exiting green with
-- nothing done, which is the "no-op indistinguishable from success" outcome
-- this file exists to prevent. It was also redundant: `WHERE e.academic_type_id
-- IS NULL` already refuses to touch a row anyone has set.
--
-- WHAT IS STILL NOT PROTECTED, said plainly: the pairing CHECK forces a human
-- clearing a wrong guess to NULL BOTH columns, so a deliberate clear leaves no
-- marker and a replay re-imposes the guess. Detecting that needs a third source
-- value ('human_cleared') and a relaxed CHECK — a schema decision, not
-- something to smuggle in under a back-fill. Known gap, not an oversight.
DO $$
DECLARE
  v_missing  text;
  v_target   integer;
  v_written  integer;
  v_unmapped text;
BEGIN
  -- (a) every catalogue code this file maps onto must resolve. Nine operational
  --     kinds collapse onto SEVEN distinct codes (sports is the target of
  --     three). "Is the catalogue non-empty?" could not detect the failure it
  --     existed to prevent: 20 of 23 types passed it and under-tagged in silence.
  SELECT string_agg(DISTINCT m.code, ', ' ORDER BY m.code) INTO v_missing
    FROM (VALUES
            ('lecture','guest_lecture'),('induction','orientation'),
            ('cultural','cultural'),('sports_tournament','sports'),
            ('sports','sports'),('marathon','sports'),
            ('convocation','convocation'),('alumni','alumni_meet'),
            ('school_of_influence','school_of_influence')
         ) AS m(kind, code)
   WHERE NOT EXISTS (SELECT 1 FROM public.event_academic_types t
                      WHERE t.institution_id IS NULL AND lower(t.code) = m.code);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'These academic types are missing from the cluster-wide catalogue: %. This file maps events onto them, so running now would tag some events and leave others blank — indistinguishable from success. Apply 20261121090000 and 20261123080000 first.',
      v_missing;
  END IF;

  -- (b) back-fill, and count the target and the result IN THE SAME STATEMENT.
  --     Both CTEs read one snapshot, so an event inserted concurrently cannot
  --     make these disagree — an earlier revision re-scanned the live table
  --     afterwards and aborted on exactly that benign race.
  WITH m(kind, code) AS (VALUES
          ('lecture','guest_lecture'),('induction','orientation'),
          ('cultural','cultural'),('sports_tournament','sports'),
          ('sports','sports'),('marathon','sports'),
          ('convocation','convocation'),('alumni','alumni_meet'),
          ('school_of_influence','school_of_influence')),
       target AS (
         SELECT e.id FROM public.events e
           JOIN m ON m.kind = lower(e.event_type)
          WHERE e.academic_type_id IS NULL),
       upd AS (
         UPDATE public.events e
            SET academic_type_id     = t.id,
                academic_type_source = 'machine_inferred'
           FROM m
           JOIN public.event_academic_types t
             ON t.institution_id IS NULL AND lower(t.code) = m.code
          WHERE m.kind = lower(e.event_type)
            AND e.id IN (SELECT id FROM target)
         RETURNING e.id)
  SELECT (SELECT count(*) FROM target), (SELECT count(*) FROM upd)
    INTO v_target, v_written;

  -- (c) bounded end-state check: every row this run TARGETED was written.
  --     Scoped to the snapshot above, so it asserts only about what it wrote.
  IF v_written <> v_target THEN
    RAISE EXCEPTION
      'Targeted % event(s) of a mapped kind but wrote %. A catalogue code did not resolve, so the tagging is partial — inspect events.academic_type_id before re-running. (This file carries no transaction of its own: under a per-statement applier the columns, constraints and trigger from §1 are already durable.)',
      v_target, v_written;
  END IF;

  -- (d) report. coalesce because lower(NULL) IN (...) is NULL and an untyped
  --     event would otherwise escape the one report whose job is surfacing gaps.
  SELECT string_agg(DISTINCT coalesce(e.event_type, '(no event_type)'), ', ') INTO v_unmapped
    FROM public.events e
   WHERE e.academic_type_id IS NULL
     AND lower(coalesce(e.event_type,'')) NOT IN
         ('lecture','induction','cultural','sports_tournament','sports',
          'marathon','convocation','alumni','school_of_influence');

  RAISE NOTICE 'Academic types back-mapped: % event(s) tagged, every one stamped machine_inferred.', v_written;

  IF v_unmapped IS NOT NULL THEN
    RAISE NOTICE 'Left untagged — no mapping exists for their operational kind (not an error; add the kind when a type is agreed): %', v_unmapped;
  END IF;
END $$;
