-- Tournament in-charges can read their own tournament's matches, entries and
-- rosters. Created 2026-10-07.
--
-- BALAM-2K26 (2026-10-07): the in-charge who created the tournament got
-- "Match not found for this tournament" recording a Volleyball result. Every
-- fixture API route first checks, through the caller's own session (RLS), that
-- the match belongs to the event. tournament_matches' SELECT policy admits only
-- super admins, admins and sports.tournaments.view holders; an in-charge without
-- that permission — appointed per event in events.config->'incharges' — is not
-- in it, so the row is invisible and the route answers 404, although the
-- result function itself (SECURITY DEFINER, fn_is_event_incharge) would accept him.
--
-- tournament_divisions already has tournament_divisions_incharge_all. These add
-- the matching READ access, scoped to the in-charge's own event, on the other
-- tournament tables. Writes are unchanged: they go through the SECURITY DEFINER
-- functions, which check the in-charge themselves.

DROP POLICY IF EXISTS tournament_matches_incharge_read ON public.tournament_matches;
CREATE POLICY tournament_matches_incharge_read ON public.tournament_matches
  FOR SELECT TO authenticated
  USING (fn_is_event_incharge(event_id));

DROP POLICY IF EXISTS tournament_entries_incharge_read ON public.tournament_entries;
CREATE POLICY tournament_entries_incharge_read ON public.tournament_entries
  FOR SELECT TO authenticated
  USING (fn_is_event_incharge(event_id));

DROP POLICY IF EXISTS tournament_team_members_incharge_read ON public.tournament_team_members;
CREATE POLICY tournament_team_members_incharge_read ON public.tournament_team_members
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournament_entries te
                  WHERE te.id = tournament_team_members.entry_id
                    AND fn_is_event_incharge(te.event_id)));
