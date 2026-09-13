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

-- ── 2. The mapping, defined ONCE ────────────────────────────────────────────
-- It used to live in three hand-maintained copies (the guard's array, the
-- UPDATE's CASE, the report's IN-lists). Adding a tenth kind to one of them
-- left the others wrong, reproducing the silent-partial-tag failure this file
-- was renumbered to prevent. A table is the single definition; §2b, §3 and §4
-- all read it. Dropped at the end of the migration.
-- NOT `ON COMMIT DROP`: under a per-statement applier this file has no
-- transaction of its own, so the table would be dropped the instant it was
-- created and §2a would fail on a missing relation — the same
-- cross-statement-state trap the GUC handshake fell into. A temp table
-- lives for the SESSION, which survives autocommit, and is dropped
-- explicitly at the end of this file.
DROP TABLE IF EXISTS _event_kind_mapping;
CREATE TEMP TABLE _event_kind_mapping (operational_kind text PRIMARY KEY, catalogue_code text NOT NULL);
INSERT INTO _event_kind_mapping VALUES
  ('lecture',             'guest_lecture'),
  ('induction',           'orientation'),
  ('cultural',            'cultural'),
  ('sports_tournament',   'sports'),
  ('sports',              'sports'),
  ('marathon',            'sports'),
  ('convocation',         'convocation'),
  ('alumni',              'alumni_meet'),
  ('school_of_influence', 'school_of_influence');

-- ── 2a. Refuse unless EVERY mapped code resolves ────────────────────────────
-- Nine operational kinds collapse onto SEVEN distinct catalogue codes (sports
-- is the target of three). "Is the catalogue non-empty?" was the wrong question
-- and could not detect the failure it existed to prevent: a catalogue holding
-- 20 of 23 types passed it and under-tagged four events in silence.
--
-- THIS IS THE FILE'S ONE GUARANTEE, and §4 therefore does not re-prove it.
-- Once every code resolves, the UPDATE below cannot leave a mapped kind blank.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(DISTINCT m.catalogue_code, ', ' ORDER BY m.catalogue_code) INTO v_missing
    FROM _event_kind_mapping m
   WHERE NOT EXISTS (SELECT 1 FROM public.event_academic_types t
                      WHERE t.institution_id IS NULL AND lower(t.code) = m.catalogue_code);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'These academic types are missing from the cluster-wide catalogue: %. This file maps events onto them, so running now would tag some events and leave others blank — indistinguishable from success. Apply 20261121090000 and 20261123080000 first.',
      v_missing;
  END IF;
END $$;

-- ── 2b. A type belonging to another college can never be attached ───────────
-- The FK carries no tenant predicate. event_academic_types allows a per-college
-- row (its unique index is scoped exactly so a college can add its own), so
-- without this a writer at College A can point an event at College B's private
-- type and any join rendering the type name leaks another college's catalogue
-- label through public.events. Not exploitable today — all 23 rows are
-- cluster-wide — which is the reason to close it BEFORE the first per-college
-- type exists rather than after.
--
-- Placed before the back-fill on purpose, so it validates this file's own
-- writes and so no data assertion can ever stand between the new columns and
-- their protection.
--
-- SECURITY DEFINER: the guard must read the catalogue's true owner, not the
-- subset the caller's RLS exposes. A caller who cannot see the row would
-- otherwise read NULL and sail through.
CREATE OR REPLACE FUNCTION public.fn_events_academic_type_tenant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_owner uuid; v_found boolean := false;
BEGIN
  IF NEW.academic_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.institution_id, true INTO v_owner, v_found
    FROM public.event_academic_types t WHERE t.id = NEW.academic_type_id;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Academic type % does not exist.', NEW.academic_type_id
      USING ERRCODE = '23503';
  END IF;

  -- NULL owner = cluster-wide, available to every college. Checked first so a
  -- cluster-wide type is never refused for an event with no institution.
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  -- An event that belongs to nobody gets its own message: saying a per-college
  -- type "belongs to another college" would be misleading for a row that
  -- belongs to none. Same discipline as the role_has_institution_access(NULL)
  -- guards elsewhere in this repo.
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

-- Granted to nobody: PostgreSQL checks EXECUTE on a trigger function at
-- CREATE TRIGGER time and never when the trigger fires.
REVOKE EXECUTE ON FUNCTION public.fn_events_academic_type_tenant_guard() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_events_academic_type_tenant_guard ON public.events;
CREATE TRIGGER trg_events_academic_type_tenant_guard
  BEFORE INSERT OR UPDATE OF academic_type_id, institution_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fn_events_academic_type_tenant_guard();

-- ── 3. Back-fill, and report. ONE block, because splitting them was a bug ───
-- An earlier revision put the skip in §3 and the assertion in §4 and passed a
-- flag between them through a transaction-local GUC. Under a per-statement
-- applier that setting is gone by the time §4 reads it; current_setting(...,
-- true) returns NULL, `NULL = 'true'` is NULL, `IF NOT v_ran` is neither true
-- nor false, the early RETURN is skipped — and the curated table aborts on the
-- very path the skip existed to protect. Cross-block state was the whole
-- defect; one block cannot disagree with itself.
--
-- §4 REPORTS, IT DOES NOT RE-ASSERT. §2a already guarantees every catalogue
-- code resolves, and given that, this UPDATE cannot leave a mapped kind blank.
-- An earlier revision re-proved it by scanning the whole live events table,
-- which (a) duplicated §2a's guarantee and (b) aborted the migration whenever a
-- concurrent insert landed mid-run — production is live and growing, so that
-- benign race was a real abort. What this block writes is what it speaks about.
--
-- WHAT THE CURATED GUARD DOES NOT PROTECT, stated plainly rather than implied:
-- the pairing CHECK forces a human clearing a wrong guess to NULL BOTH columns,
-- which leaves no marker at all. So a table whose ONLY human action was a
-- deliberate clear looks uncurated here and this back-fill will re-impose the
-- guess that was deleted. Detecting that needs a third source value
-- ('human_cleared') and a relaxed pairing CHECK — a schema decision, not
-- something to smuggle in under a back-fill. It is a known gap, not an
-- oversight.
DO $$
DECLARE
  v_curated  boolean;
  v_written  integer;
  v_unmapped text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.events WHERE academic_type_source = 'human_confirmed')
    INTO v_curated;

  IF v_curated THEN
    RAISE NOTICE 'Skipping back-fill: a human has confirmed at least one academic type, so this table is curated and a replay must not overwrite it.';
    RETURN;
  END IF;

  WITH written AS (
    UPDATE public.events e
       SET academic_type_id     = t.id,
           academic_type_source = 'machine_inferred'
      FROM _event_kind_mapping m
      JOIN public.event_academic_types t
        ON t.institution_id IS NULL AND lower(t.code) = m.catalogue_code
     WHERE e.academic_type_id IS NULL
       AND lower(e.event_type) = m.operational_kind
    RETURNING e.id
  )
  SELECT count(*) INTO v_written FROM written;

  -- coalesce, because lower(NULL) IN (...) is NULL and an untyped event would
  -- otherwise escape the one report whose job is surfacing gaps.
  SELECT string_agg(DISTINCT coalesce(e.event_type, '(no event_type)'), ', ') INTO v_unmapped
    FROM public.events e
   WHERE e.academic_type_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM _event_kind_mapping m
                      WHERE m.operational_kind = lower(e.event_type));

  RAISE NOTICE 'Academic types back-mapped: % event(s) tagged, every one stamped machine_inferred.', v_written;

  IF v_unmapped IS NOT NULL THEN
    RAISE NOTICE 'Left untagged — no mapping exists for their operational kind (not an error; add the kind to _event_kind_mapping when a type is agreed): %', v_unmapped;
  END IF;
END $$;

-- ── 4. Put the scaffolding away ─────────────────────────────────────────────
DROP TABLE IF EXISTS _event_kind_mapping;
