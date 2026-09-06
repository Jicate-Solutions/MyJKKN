-- ============================================================================
-- Sports Tournament Conducting — PR4: results + standings + public scoreboard
-- DRAFT (staged in /tmp) — finalized into the PR4 worktree once PR3 is on main.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. result columns on tournament_matches (additive)
-- ----------------------------------------------------------------------------
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS score_a           INTEGER,
  ADD COLUMN IF NOT EXISTS score_b           INTEGER,
  ADD COLUMN IF NOT EXISTS sets              JSONB,
  ADD COLUMN IF NOT EXISTS result_notes      TEXT,
  ADD COLUMN IF NOT EXISTS result_entered_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS result_entered_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 2. fn_record_result — record a match result and advance the knockout winner.
--    status: completed | walkover | disqualified. For 'completed' a winner is
--    required (ties are decided on-ground then recorded — Director decision #8).
--    For 'walkover' the present side wins; for 'disqualified' the OTHER side wins.
--    On a knockout match (next_match_id set) the winner propagates to the next slot.
--    SECURITY DEFINER; locked from anon.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_record_result(
  p_match_id        UUID,
  p_status          TEXT,
  p_winner_entry_id UUID DEFAULT NULL,
  p_score_a         INTEGER DEFAULT NULL,
  p_score_b         INTEGER DEFAULT NULL,
  p_sets            JSONB DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL
)
RETURNS public.tournament_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match  public.tournament_matches;
  v_winner UUID;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('sports.tournaments.manage')) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;
  IF p_status NOT IN ('completed','walkover','disqualified') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'match not found'; END IF;

  -- resolve the winner
  v_winner := p_winner_entry_id;
  IF p_status = 'completed' THEN
    IF v_winner IS NULL THEN RAISE EXCEPTION 'winner required for a completed match'; END IF;
  END IF;
  -- winner (if given) must be one of the two sides
  IF v_winner IS NOT NULL
     AND v_winner <> COALESCE(v_match.side_a_entry_id,'00000000-0000-0000-0000-000000000000'::uuid)
     AND v_winner <> COALESCE(v_match.side_b_entry_id,'00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'winner must be one of the match sides';
  END IF;

  UPDATE tournament_matches SET
    status            = p_status,
    winner_entry_id   = v_winner,
    score_a           = p_score_a,
    score_b           = p_score_b,
    sets              = p_sets,
    result_notes      = p_notes,
    result_entered_by = auth.uid(),
    result_entered_at = now()
  WHERE id = p_match_id
  RETURNING * INTO v_match;

  -- knockout advancement: push the winner into the next match's slot
  IF v_winner IS NOT NULL AND v_match.next_match_id IS NOT NULL THEN
    IF v_match.next_slot = 'a' THEN
      UPDATE tournament_matches SET side_a_entry_id = v_winner WHERE id = v_match.next_match_id;
    ELSIF v_match.next_slot = 'b' THEN
      UPDATE tournament_matches SET side_b_entry_id = v_winner WHERE id = v_match.next_match_id;
    END IF;
  END IF;

  RETURN v_match;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_record_result(UUID,TEXT,UUID,INTEGER,INTEGER,JSONB,TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_record_result(UUID,TEXT,UUID,INTEGER,INTEGER,JSONB,TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. tournament_standings VIEW — W/L/D/points per entry per division.
--    Points: win=3, draw=1 (completed match with NULL winner), loss=0.
--    Counts completed/walkover/disqualified matches. Knockouts rarely use this
--    (they advance); it is the league/round-robin/pool table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.tournament_standings AS
WITH played AS (
  SELECT m.division_id, m.pool, s.entry_id,
         (m.winner_entry_id = s.entry_id) AS won,
         (m.winner_entry_id IS NOT NULL AND m.winner_entry_id <> s.entry_id) AS lost,
         (m.status = 'completed' AND m.winner_entry_id IS NULL) AS drawn
  FROM tournament_matches m
  CROSS JOIN LATERAL (VALUES (m.side_a_entry_id), (m.side_b_entry_id)) AS s(entry_id)
  WHERE s.entry_id IS NOT NULL
    AND m.status IN ('completed','walkover','disqualified')
)
SELECT
  e.division_id,
  p.pool,
  e.id AS entry_id,
  e.entry_name,
  e.institution_name,
  count(*) FILTER (WHERE p.entry_id IS NOT NULL)                           AS played,
  count(*) FILTER (WHERE p.won)                                            AS won,
  count(*) FILTER (WHERE p.lost)                                           AS lost,
  count(*) FILTER (WHERE p.drawn)                                          AS drawn,
  (count(*) FILTER (WHERE p.won) * 3 + count(*) FILTER (WHERE p.drawn))    AS points
FROM tournament_entries e
LEFT JOIN played p ON p.entry_id = e.id
WHERE e.status IN ('registered','confirmed','disqualified')
GROUP BY e.division_id, p.pool, e.id, e.entry_name, e.institution_name;

-- ----------------------------------------------------------------------------
-- 4. fn_tournament_public_scoreboard — the DELIBERATE public read path.
--    Returns ONLY non-sensitive fields (names, scores, bracket, standings) for a
--    tournament that is public/cross-JKKN. EXPLICIT GRANT TO anon (documented
--    exception to the default REVOKE — this is the no-login spectator scoreboard,
--    Director decision #6). Never exposes events_registrations PII.
-- ----------------------------------------------------------------------------
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
  -- only expose tournaments that are explicitly public or cross-JKKN, and not draft/cancelled
  SELECT to_jsonb(x) INTO v_event FROM (
    SELECT e.id, e.name, e.start_date, e.end_date, e.venue, e.venue_text, e.status, e.scope, e.visibility
    FROM events e
    WHERE e.id = p_event_id
      AND e.event_type = 'sports_tournament'
      AND e.status NOT IN ('draft','cancelled')
      AND (e.is_public = true OR e.visibility IN ('public','all_jkkn') OR e.scope = 'all_jkkn')
  ) x;
  IF v_event IS NULL THEN
    RETURN NULL;  -- not found or not public → caller renders "not available"
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
-- DELIBERATE public spectator read — the documented exception to REVOKE-from-anon.
GRANT EXECUTE ON FUNCTION public.fn_tournament_public_scoreboard(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
