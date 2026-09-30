-- Tournament RPCs honour the per-event in-charge (BUG-006222).
--
-- The Tournament In-charge model (2026-07) grants full control to
-- sports.tournaments.manage holders OR the event's in-charges: useTournamentAccess
-- shows them the controls and canManageTournament() lets them through every API
-- route. But the four RPCs those routes call on the user's SESSION client still
-- checked only admin / sports.tournaments.manage, so an in-charge got the buttons
-- and then "permission denied: sports.tournaments.manage required" on generating
-- fixtures, building the knockout, recording a result or awarding medals.
--
-- Each guard gains one arm: fn_is_event_incharge(<the tournament of this
-- division/match>). fn_is_event_incharge(NULL) is false, so an unknown id still
-- falls through to the existing "not found" errors. Only the guard line is
-- rewritten (replace() on the live definition); bodies, SECURITY DEFINER,
-- search_path and ACLs are untouched.

DO $$
DECLARE
  v_old text := 'IF NOT (is_super_admin() OR is_admin() OR user_has_permission(''sports.tournaments.manage'')) THEN';
  v_div text := 'IF NOT (is_super_admin() OR is_admin() OR user_has_permission(''sports.tournaments.manage'')'
             || ' OR fn_is_event_incharge((SELECT td.event_id FROM tournament_divisions td WHERE td.id = p_division_id))) THEN';
  v_mat text := 'IF NOT (is_super_admin() OR is_admin() OR user_has_permission(''sports.tournaments.manage'')'
             || ' OR fn_is_event_incharge((SELECT tm.event_id FROM tournament_matches tm WHERE tm.id = p_match_id))) THEN';
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('fn_generate_fixtures','fn_generate_pool_knockout','fn_award_achievements','fn_record_result')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('fn_is_event_incharge' IN v_def) > 0 THEN
      CONTINUE; -- already applied
    END IF;
    v_new := replace(v_def, v_old,
                     CASE WHEN r.proname = 'fn_record_result' THEN v_mat ELSE v_div END);
    IF v_new = v_def THEN
      RAISE EXCEPTION 'guard not found in % — definition drifted, not patching', r.proname;
    END IF;
    EXECUTE v_new;
  END LOOP;
END $$;
