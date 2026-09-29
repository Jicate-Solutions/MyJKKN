-- ─── Events — tell "deleted" apart from "no access"; drop dead favourites ───
-- 2026-09-18 · BUG-006065
--
-- A student in-charge opened a tournament from an old link and got "Tournament
-- not found, or you don't have access to it", and reported it as an access bug
-- after being assigned. The tournament (d19689cc…) had been deleted: a super
-- admin re-created it on 2026-09-05 as b0189465… (where he IS in-charge) and
-- removed the old one. RLS makes a deleted row and a hidden row look identical
-- to the client, so the page could only say both at once.
--
-- 1. fn_event_exists(id) answers the one question the page cannot: does this
--    event id exist at all? It reveals existence of an id the caller already
--    holds, nothing about the row. The detail page calls it only after its own
--    read came back empty, and then says "deleted" or "no access" precisely.
--
-- 2. Deleting an event now removes page favourites that point into it, and the
--    favourites already pointing at deleted events are removed once. A starred
--    link to a deleted event is how this user kept landing on the dead page.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: fn_event_exists takes an event id
-- and returns only whether a row with that id exists.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

CREATE OR REPLACE FUNCTION public.fn_event_exists(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_event_exists(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_exists(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_event_exists(uuid) IS
  'Does an event with this id exist? Existence only — lets a detail page say "deleted" instead of "not found or no access" when RLS hides the row.';

-- Favourites store paths like /events/tournament/<id>[/sub-page][?query].
CREATE OR REPLACE FUNCTION public.fn_events_drop_dead_favorites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_page_favorites f
   WHERE f.page_path LIKE '/events/%' || OLD.id::text || '%';
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_events_drop_dead_favorites() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_events_drop_dead_favorites ON public.events;
CREATE TRIGGER trg_events_drop_dead_favorites
  AFTER DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fn_events_drop_dead_favorites();

-- One-time sweep: favourites already pointing at an event id that is gone.
DELETE FROM public.user_page_favorites f
 WHERE f.page_path ~ '^/events/[^/]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
   AND NOT EXISTS (
     SELECT 1 FROM public.events e
      WHERE e.id = substring(f.page_path FROM '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')::uuid
   );

NOTIFY pgrst, 'reload schema';
