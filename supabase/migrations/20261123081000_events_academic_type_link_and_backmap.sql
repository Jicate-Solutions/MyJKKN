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
-- Renumbered to 20261123081000, and §2 now asserts every mapped code RESOLVES
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

-- The FK is created separately and verified by catalog. Inlining it on
-- ADD COLUMN IF NOT EXISTS silently skips the constraint — and ON DELETE
-- RESTRICT with it — whenever the column already exists from a partial run,
-- which is the one case where you most need it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'events_academic_type_id_fkey'
       AND conrelid = 'public.events'::regclass
       AND contype  = 'f'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_academic_type_id_fkey
      FOREIGN KEY (academic_type_id)
      REFERENCES public.event_academic_types (id) ON DELETE RESTRICT;
  END IF;
END $$;

COMMENT ON COLUMN public.events.academic_type_id IS
  'What kind of academic activity this event was, from public.event_academic_types. Distinct from events.event_type, which is the operational kind that routes the event to its console.';

COMMENT ON COLUMN public.events.academic_type_source IS
  'Who decided academic_type_id. ''machine_inferred'' = read across from event_type by a migration and never reviewed; ''human_confirmed'' = a person chose it. Never leave this blank while academic_type_id is set.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'events_academic_type_source_valid'
       AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_academic_type_source_valid
      CHECK (academic_type_source IN ('machine_inferred', 'human_confirmed'))
      NOT VALID;
    ALTER TABLE public.events VALIDATE CONSTRAINT events_academic_type_source_valid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'events_academic_type_needs_source'
       AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_academic_type_needs_source
      CHECK ((academic_type_id IS NULL) = (academic_type_source IS NULL))
      NOT VALID;
    ALTER TABLE public.events VALIDATE CONSTRAINT events_academic_type_needs_source;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_academic_type_id
  ON public.events (academic_type_id)
  WHERE academic_type_id IS NOT NULL;

-- ── 2. Refuse unless EVERY mapped code resolves ─────────────────────────────
-- "Is the catalogue non-empty?" is the wrong question and cannot detect the
-- failure it exists to prevent: a catalogue holding 20 of the 23 types — the
-- exact state an out-of-order replay produces — passes it and under-tags four
-- events in silence. Name the nine codes this file maps to and require all of
-- them, compared the way the catalogue's own unique index defines identity.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(c, ', ' ORDER BY c) INTO v_missing
    FROM unnest(ARRAY[
           'guest_lecture','orientation','cultural','sports',
           'convocation','alumni_meet','school_of_influence'
         ]) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.event_academic_types t
      WHERE t.institution_id IS NULL
        AND lower(t.code) = c);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'These academic types are missing from the cluster-wide catalogue: %. This file maps events onto them, so running now would tag some events and silently leave others blank — indistinguishable from success. Apply 20261121090000 and 20261123080000 first.',
      v_missing;
  END IF;
END $$;

-- ── 2b. A type belonging to another college can never be attached ──────────
-- The FK alone carries no tenant predicate. event_academic_types allows a
-- per-college row (institution_id NOT NULL) — the unique index is scoped
-- exactly so a college can add its own — so without this, a writer at College A
-- can point an event at College B's private type, and any join rendering the
-- type name leaks another college's catalogue label through public.events.
-- Not exploitable today (all 23 rows are cluster-wide), which is the whole
-- reason to close it now rather than after the first per-college type exists.
--
-- SECURITY DEFINER on purpose: the guard must read the catalogue's true owner,
-- not the subset the caller's RLS lets them see. A caller who cannot see the
-- row would otherwise read NULL and sail through the check.
CREATE OR REPLACE FUNCTION public.fn_events_academic_type_tenant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_owner uuid; v_found boolean;
BEGIN
  IF NEW.academic_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.institution_id, true INTO v_owner, v_found
    FROM public.event_academic_types t
   WHERE t.id = NEW.academic_type_id;

  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'Academic type % does not exist.', NEW.academic_type_id
      USING ERRCODE = '23503';
  END IF;

  -- NULL owner = cluster-wide, available to every college.
  IF v_owner IS NOT NULL AND v_owner IS DISTINCT FROM NEW.institution_id THEN
    RAISE EXCEPTION
      'Academic type % belongs to another college and cannot be attached to this event.',
      NEW.academic_type_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$fn$;

-- Granted to nobody: PostgreSQL checks EXECUTE on a trigger function at
-- CREATE TRIGGER time and never when the trigger fires, so no role needs it.
REVOKE EXECUTE ON FUNCTION public.fn_events_academic_type_tenant_guard() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_events_academic_type_tenant_guard ON public.events;
CREATE TRIGGER trg_events_academic_type_tenant_guard
  BEFORE INSERT OR UPDATE OF academic_type_id, institution_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fn_events_academic_type_tenant_guard();

-- ── 3. Read the operational kind across, and say that a machine did it ──────
-- Compared with lower() on BOTH sides, because the catalogue's uniqueness is
-- `scope + lower(code)` — that index, not the literal spelling, is what defines
-- code identity. The seed was transcribed "in the PDF's own wording", so a type
-- landing as 'Sports' would match zero rows here and leave those events blank
-- with no error. Same exposure for any non-lowercase events.event_type.
--
-- A HUMAN'S DELIBERATE BLANK IS NOT AN EMPTY SLOT. The pairing CHECK forces
-- both columns to NULL together, so someone clearing a wrong guess leaves a row
-- that looks exactly like one never filled. On a re-apply this UPDATE would
-- re-impose the same wrong guess over their decision. Guarded: if any human has
-- confirmed anything on this table, the table has been curated and this
-- one-shot back-fill stays out of it.
DO $$
DECLARE v_curated boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.events
                  WHERE academic_type_source = 'human_confirmed')
    INTO v_curated;

  IF v_curated THEN
    RAISE NOTICE 'Skipping back-fill: a human has already confirmed at least one academic type, so this table is curated and a replay must not overwrite it.';
    PERFORM set_config('myjkkn.events_backmap_ran', 'false', true);
    RETURN;
  END IF;

  PERFORM set_config('myjkkn.events_backmap_ran', 'true', true);

UPDATE public.events e
   SET academic_type_id     = t.id,
       academic_type_source = 'machine_inferred'
  FROM public.event_academic_types t
 WHERE t.institution_id IS NULL
   AND e.academic_type_id IS NULL
   AND lower(t.code) = CASE lower(e.event_type)
                  WHEN 'lecture'           THEN 'guest_lecture'
                  WHEN 'induction'         THEN 'orientation'
                  WHEN 'cultural'          THEN 'cultural'
                  WHEN 'sports_tournament' THEN 'sports'
                  WHEN 'sports'            THEN 'sports'
                  WHEN 'marathon'          THEN 'sports'
                  WHEN 'convocation'        THEN 'convocation'
                  WHEN 'alumni'             THEN 'alumni_meet'
                  WHEN 'school_of_influence' THEN 'school_of_influence'
                  ELSE NULL
                END;
END $$;

-- ── 4. Report, and assert only what this file actually promised ────────────
-- TWO ways an earlier draft of this block was wrong, both found in review:
--
--   (a) It contradicted §3. §3 deliberately skips a curated table; §4 then
--       raised on any untagged row. One human-cleared event and the migration
--       could never replay again — the skip and the assertion disagreed about
--       what "blank" means.
--
--   (b) "No event is untagged" is not this file's promise and would brick on a
--       tenth operational kind. events.event_type is not frozen; a kind this
--       CASE does not name is a gap to REPORT, not a failure to abort on. What
--       this file actually promises is narrower and checkable: every event whose
--       kind IS mapped came out tagged. That is the claim, so that is the
--       assertion.
DO $$
DECLARE
  v_total      integer;
  v_tagged     integer;
  v_mapped_blank integer;
  v_unmapped   text;
  v_ran        boolean;
BEGIN
  v_ran := current_setting('myjkkn.events_backmap_ran', true) = 'true';

  IF NOT v_ran THEN
    RAISE NOTICE 'Back-fill was skipped (table already curated by a human); making no completeness assertion over rows this run did not write.';
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE academic_type_id IS NOT NULL)
    INTO v_total, v_tagged
    FROM public.events;

  -- the assertion: a MAPPED kind that came out blank means a code did not resolve
  SELECT count(*) INTO v_mapped_blank
    FROM public.events
   WHERE academic_type_id IS NULL
     AND lower(event_type) IN ('lecture','induction','cultural','sports_tournament',
                               'sports','marathon','convocation','alumni','school_of_influence');

  -- informational: kinds this file does not name yet
  SELECT string_agg(DISTINCT event_type, ', ') INTO v_unmapped
    FROM public.events
   WHERE academic_type_id IS NULL
     AND lower(event_type) NOT IN ('lecture','induction','cultural','sports_tournament',
                                   'sports','marathon','convocation','alumni','school_of_influence');

  IF v_mapped_blank > 0 THEN
    RAISE EXCEPTION
      '% event(s) carry an operational kind this migration maps, yet came out with no academic type. A mapped code did not resolve, so the tagging is partial and indistinguishable from success. Nothing has been committed.',
      v_mapped_blank;
  END IF;

  IF v_unmapped IS NOT NULL THEN
    RAISE NOTICE
      'Left untagged because no mapping exists for their operational kind (not an error — add them to the CASE and to the §2 guard when a type is agreed): %',
      v_unmapped;
  END IF;

  RAISE NOTICE 'Academic types back-mapped: % of % events tagged, every one stamped machine_inferred.',
    v_tagged, v_total;
END $$;

