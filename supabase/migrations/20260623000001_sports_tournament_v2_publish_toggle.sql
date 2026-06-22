-- ============================================================================
-- Sports Tournament v2 — "Show to public" publish toggle (Director decision #8, 2026-06-23)
-- File: 20260623000001_sports_tournament_v2_publish_toggle.sql
--
-- v1 (#1576) showed a tournament on the public scoreboard automatically once it was
-- past 'draft' and cross-JKKN/public. Director chose an EXPLICIT switch instead: the
-- public scoreboard appears ONLY when the organizer turns on events.config.public_scoreboard.
-- This CREATE OR REPLACE swaps the auto gate for the explicit flag. Additive (no schema
-- change — the flag lives in the existing events.config JSONB). Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_tournament_public_scoreboard(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event JSONB;
  v_result JSONB;
BEGIN
  -- expose ONLY tournaments the organizer has explicitly published (config.public_scoreboard=true),
  -- and never drafts/cancelled. (v2: replaced the auto is_public/scope gate with the explicit flag.)
  SELECT to_jsonb(x) INTO v_event FROM (
    SELECT e.id, e.name, e.start_date, e.end_date, e.venue, e.venue_text, e.status, e.scope, e.visibility
    FROM events e
    WHERE e.id = p_event_id
      AND e.event_type = 'sports_tournament'
      AND e.status NOT IN ('draft','cancelled')
      AND COALESCE((e.config->>'public_scoreboard')::boolean, false) = true
  ) x;
  IF v_event IS NULL THEN
    RETURN NULL;  -- not found, not a tournament, or not published → caller renders "not available"
  END IF;

  v_result := jsonb_build_object(
    'tournament', v_event,
    'divisions', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.sort_order) FROM (
        SELECT id, sport, gender, age_band, format, level, sort_order FROM tournament_divisions
        WHERE event_id = p_event_id AND is_active = true
      ) d
    ), '[]'::jsonb),
    'entries', COALESCE((
      SELECT jsonb_agg(to_jsonb(en)) FROM (
        SELECT id, division_id, entry_name, institution_name, is_external, seed, final_rank, status
        FROM tournament_entries WHERE event_id = p_event_id AND status <> 'withdrawn'
      ) en
    ), '[]'::jsonb),
    'matches', COALESCE((
      SELECT jsonb_agg(to_jsonb(mm) ORDER BY mm.division_id, mm.round_no, mm.match_no) FROM (
        SELECT m.id, m.division_id, m.round_no, m.round_label, m.match_no, m.pool,
               a.entry_name AS side_a_name, b.entry_name AS side_b_name,
               m.score_a, m.score_b, m.status, m.scheduled_at,
               w.entry_name AS winner_name
        FROM tournament_matches m
        LEFT JOIN tournament_entries a ON a.id = m.side_a_entry_id
        LEFT JOIN tournament_entries b ON b.id = m.side_b_entry_id
        LEFT JOIN tournament_entries w ON w.id = m.winner_entry_id
        WHERE m.event_id = p_event_id
      ) mm
    ), '[]'::jsonb),
    'standings', COALESCE((
      SELECT jsonb_agg(to_jsonb(st) ORDER BY st.division_id, st.points DESC, st.won DESC)
      FROM tournament_standings st
      WHERE st.division_id IN (SELECT id FROM tournament_divisions WHERE event_id = p_event_id)
    ), '[]'::jsonb)
  );
  RETURN v_result;
END;
$$;
-- still the deliberate public spectator read — explicit anon grant retained.
GRANT EXECUTE ON FUNCTION public.fn_tournament_public_scoreboard(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
