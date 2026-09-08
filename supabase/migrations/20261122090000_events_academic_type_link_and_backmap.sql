-- ============================================================================
-- Give an event a place to record WHAT KIND of academic activity it was, and
-- fill it in for the 51 events already on record — as guesses that say so.
--
-- 20261118093000 created public.event_academic_types. 20261121090000 fills it
-- with the twenty types from the SOP. Neither connected it to an event: there
-- is no column on public.events pointing at the catalogue, and no foreign key
-- anywhere references it. A catalogue nothing can be tagged with is furniture.
--
-- Two columns, not one. `academic_type_id` is the answer; `academic_type_source`
-- is who said so. The Director's ruling of 2026-09-08 was to back-fill the 51
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
-- event to its console. Six read across to an academic type:
--
--     lecture           (17) -> guest_lecture
--     sports_tournament (18) -> sports
--     sports             (1) -> sports
--     marathon           (1) -> sports
--     induction          (5) -> orientation
--     cultural           (5) -> cultural            = 47 events tagged
--
-- Three do not, and are LEFT NULL on purpose:
--
--     convocation        (2)
--     alumni             (1)
--     school_of_influence(1)                        =  4 events untagged
--
-- None of the twenty types fits a convocation, an alumni meet or a School of
-- Influence batch. Forcing one would put a false statement into accreditation
-- evidence; an empty field is an honest gap that a coordinator can fill from
-- the screen. An honest blank beats a confident wrong answer.
--
-- ORDER MATTERS. This migration reads the catalogue by code, so it must run
-- AFTER 20261121090000 seeds it. It refuses to run against an empty catalogue
-- rather than silently tagging nothing — a no-op here would look identical to
-- success and would leave all 51 events blank with no error to notice.
--
-- NOT PUBLISHED TO ANON. public.marathon_events is an anon-readable view over
-- public.events. The live view enumerates its columns, so adding columns here
-- does not widen it. Do not rewrite that view as SELECT * — it would publish
-- every future events column to the open internet.
-- ============================================================================

-- ── 1. The link, and the provenance that must accompany it ──────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS academic_type_id uuid
    REFERENCES public.event_academic_types (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS academic_type_source text;

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

-- ── 2. Refuse to run against an empty catalogue ─────────────────────────────
DO $$
DECLARE v_types integer;
BEGIN
  SELECT count(*) INTO v_types
    FROM public.event_academic_types
   WHERE institution_id IS NULL;

  IF v_types = 0 THEN
    RAISE EXCEPTION
      'The academic event-type catalogue is empty, so nothing can be mapped. Apply 20261121090000_events_seed_academic_types_and_impact_categories.sql first. Refusing rather than tagging zero events, which would be indistinguishable from success.';
  END IF;
END $$;

-- ── 3. Read the operational kind across, and say that a machine did it ──────
UPDATE public.events e
   SET academic_type_id     = t.id,
       academic_type_source = 'machine_inferred'
  FROM public.event_academic_types t
 WHERE t.institution_id IS NULL
   AND e.academic_type_id IS NULL
   AND t.code = CASE e.event_type
                  WHEN 'lecture'           THEN 'guest_lecture'
                  WHEN 'induction'         THEN 'orientation'
                  WHEN 'cultural'          THEN 'cultural'
                  WHEN 'sports_tournament' THEN 'sports'
                  WHEN 'sports'            THEN 'sports'
                  WHEN 'marathon'          THEN 'sports'
                  ELSE NULL
                END;

-- ── 4. Report what happened, and fail if the stamp ever went missing ────────
DO $$
DECLARE
  v_total    integer;
  v_tagged   integer;
  v_untagged integer;
  v_unstamped integer;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE academic_type_id IS NOT NULL),
         count(*) FILTER (WHERE academic_type_id IS NULL),
         count(*) FILTER (WHERE academic_type_id IS NOT NULL
                            AND academic_type_source IS DISTINCT FROM 'machine_inferred'
                            AND academic_type_source IS DISTINCT FROM 'human_confirmed')
    INTO v_total, v_tagged, v_untagged, v_unstamped
    FROM public.events;

  IF v_unstamped > 0 THEN
    RAISE EXCEPTION
      '% event(s) carry an academic type with no usable provenance stamp. Nothing has been committed.', v_unstamped;
  END IF;

  RAISE NOTICE
    'Academic types back-mapped: % of % events tagged (machine-inferred), % left blank because no type in the catalogue fits their operational kind.',
    v_tagged, v_total, v_untagged;
END $$;
