-- Sports tournaments — whoever creates one is its in-charge (BUG-006222,
-- Director's ruling 29 Sep 2026)
--
-- WHY. BUG-006222: two CAS team members could not edit their own Kabaddi
-- tournament. It had no in-charge, and creating an event does not by itself let
-- you edit it: events_tournament_editor_update needs a sports permission, and
-- events_incharge_update needs your id in config->'incharges'. (That tournament
-- was fixed by hand on 28 Sep 12:13 — both are in-charges now.)
--
-- THE DIRECTOR'S ANSWERS (Bugs desk interview, 29 Sep, by tap):
--   · the creator of a tournament becomes its in-charge automatically;
--   · old tournaments too, where the creator is known;
--   · a creator who later leaves keeps the entry — a switched-off account cannot
--     sign in, so the entry grants nothing, and nobody is removed automatically.
--
-- WHAT THIS DOES.
--   1. A BEFORE INSERT trigger on events: for a sports_tournament with a
--      created_by, it appends {name, member_id} for the creator to
--      config->'incharges' unless that member is already listed. Same element
--      shape the Add In-charge button writes and fn_is_event_incharge reads.
--   2. A backfill for existing tournaments with a known creator and an EMPTY
--      roster (never re-adds a creator someone removed). On 30 Sep this
--      touches ONE tournament: 13 of the 14 without an in-charge were created in
--      June/July before created_by was recorded, so there is no creator to add.
--
-- NOT CHANGED. Only sports_tournament rows. No permission, policy or
-- fn_guard_event_privileged_fields change: that guard only checks UPDATEs made by
-- a signed-in user, and it already lets a creator change the roster.
--
-- Additive: no DROP, DELETE or TRUNCATE.

CREATE OR REPLACE FUNCTION public.fn_tournament_creator_incharge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name   text;
  v_roster jsonb;
BEGIN
  IF NEW.event_type IS DISTINCT FROM 'sports_tournament' OR NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  v_roster := CASE WHEN jsonb_typeof(NEW.config->'incharges') = 'array'
                   THEN NEW.config->'incharges' ELSE '[]'::jsonb END;

  IF v_roster @> jsonb_build_array(jsonb_build_object('member_id', NEW.created_by::text)) THEN
    RETURN NEW;
  END IF;

  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id = NEW.created_by;

  NEW.config := jsonb_set(
    COALESCE(NEW.config, '{}'::jsonb),
    '{incharges}',
    v_roster || jsonb_build_array(jsonb_build_object(
                  'name', COALESCE(v_name, ''),
                  'member_id', NEW.created_by::text
                ))
  );
  RETURN NEW;
END;
$function$;

-- A trigger function, never called directly.
REVOKE EXECUTE ON FUNCTION public.fn_tournament_creator_incharge() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_events_tournament_creator_incharge ON public.events;
CREATE TRIGGER trg_events_tournament_creator_incharge
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fn_tournament_creator_incharge();

-- Backfill: existing tournaments with a known creator and NO in-charge at all.
-- Only empty rosters: a tournament that has in-charges but not its creator may
-- have had the creator removed on purpose, and this must not undo that.
UPDATE public.events e
   SET config = jsonb_set(
         COALESCE(e.config, '{}'::jsonb),
         '{incharges}',
         jsonb_build_array(jsonb_build_object(
           'name', COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = e.created_by), ''),
           'member_id', e.created_by::text
         ))
       )
 WHERE e.event_type = 'sports_tournament'
   AND e.created_by IS NOT NULL
   AND (jsonb_typeof(e.config->'incharges') IS DISTINCT FROM 'array'
        OR jsonb_array_length(e.config->'incharges') = 0);

-- Assert: no tournament with a known creator is left with an empty roster.
DO $tournament_creator_incharge_assert$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.event_type = 'sports_tournament'
       AND e.created_by IS NOT NULL
       AND (jsonb_typeof(e.config->'incharges') IS DISTINCT FROM 'array'
            OR jsonb_array_length(e.config->'incharges') = 0)
  ) THEN
    RAISE EXCEPTION 'a tournament with a known creator still has no in-charge';
  END IF;

  IF has_function_privilege('anon', 'public.fn_tournament_creator_incharge()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_tournament_creator_incharge';
  END IF;
END
$tournament_creator_incharge_assert$;
