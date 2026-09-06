-- ============================================================================
-- Sports Tournament — no-login PARTICIPANT RESULTS (Events/Tournament go-live, Section 3)
-- ----------------------------------------------------------------------------
-- fn_tournament_participant_results(p_code text) — the DELIBERATE public,
-- no-login personal-results read path for outside schools and players. Keyed by
-- the short 6-char access code that Section 1 will stamp onto each entry
-- (tournament_entries.access_code). It MUST also accept a tournament_entries.id
-- as a fallback so this ships and works BEFORE Section 1's access_code column
-- exists — the access-code branch is written with dynamic SQL guarded by a
-- catalog check, so the function neither fails to create nor errors at runtime
-- when the column is absent.
--
-- PII posture: returns ONLY the same non-sensitive fields the public scoreboard
-- already exposes (entry_name, institution_name, scores, standings, final_rank).
-- No events_registrations PII, no learner ids, no photos. Medals are DERIVED
-- from tournament_entries.final_rank (1=gold, 2=silver, 3=bronze) — the same
-- rank the public scoreboard already publishes — never from
-- health_sports_achievements (which is learner-PII).
--
-- EXPLICIT GRANT TO anon (the documented exception to the default
-- REVOKE-from-anon) — this is a no-login participant-results page. The short
-- access code IS the credential; it is not enumerable, and every field returned
-- is already public on the spectator scoreboard. Mirrors
-- fn_tournament_public_scoreboard (Sports Tournament PR4).
-- Created: 2026-07-26 (Events/Tournament go-live, Section 3). NOT YET APPLIED.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_tournament_participant_results(p_code text)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code        text := NULLIF(btrim(p_code), '');
  v_has_code    boolean := false;
  v_entry_id    uuid;
  v_event_id    uuid;
  v_division_id uuid;
  v_event       jsonb;
  v_division    jsonb;
  v_entry       jsonb;
  v_standing    jsonb;
  v_matches     jsonb;
  v_div_count   integer := 0;
  v_result      jsonb;
BEGIN
  IF v_code IS NULL THEN
    RETURN NULL;
  END IF;

  -- Has Section 1's access_code column landed yet?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'tournament_entries'
      AND column_name  = 'access_code'
  ) INTO v_has_code;

  -- (1) Primary path: resolve the entry by its 6-char access code.
  --     Dynamic SQL so the function still creates/runs when the column is absent.
  IF v_has_code THEN
    EXECUTE
      'SELECT id, event_id, division_id
         FROM public.tournament_entries
        WHERE access_code IS NOT NULL
          AND upper(access_code) = upper($1)
        LIMIT 1'
    INTO v_entry_id, v_event_id, v_division_id
    USING v_code;
  END IF;

  -- (2) Fallback path: accept a tournament_entries.id directly (works before the
  --     access_code column exists, and as a graceful fallback afterwards).
  IF v_entry_id IS NULL
     AND v_code ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id, event_id, division_id
      INTO v_entry_id, v_event_id, v_division_id
      FROM public.tournament_entries
     WHERE id = v_code::uuid
     LIMIT 1;
  END IF;

  IF v_entry_id IS NULL THEN
    RETURN NULL;  -- unknown code / id → caller renders "not found"
  END IF;

  -- Tournament context. The access code is the credential, so we do NOT require
  -- public visibility here; we only hide draft/cancelled tournaments.
  SELECT to_jsonb(x) INTO v_event FROM (
    SELECT e.id, e.name, e.start_date, e.end_date, e.venue, e.venue_text, e.status
    FROM events e
    WHERE e.id = v_event_id
      AND e.event_type = 'sports_tournament'
      AND e.status NOT IN ('draft', 'cancelled')
  ) x;
  IF v_event IS NULL THEN
    RETURN NULL;  -- tournament private/draft/cancelled → nothing to show
  END IF;

  -- Division the entry competes in.
  SELECT to_jsonb(d) INTO v_division FROM (
    SELECT id, sport, gender, age_band, format, level
    FROM tournament_divisions
    WHERE id = v_division_id
  ) d;

  -- The participant / team entry, with a DERIVED medal from final_rank.
  SELECT to_jsonb(en) INTO v_entry FROM (
    SELECT
      e.id,
      e.division_id,
      e.entry_type,
      e.entry_name,
      e.institution_name,
      e.is_external,
      e.seed,
      e.status,
      e.final_rank,
      CASE e.final_rank
        WHEN 1 THEN 'gold'
        WHEN 2 THEN 'silver'
        WHEN 3 THEN 'bronze'
        ELSE NULL
      END AS medal
    FROM tournament_entries e
    WHERE e.id = v_entry_id
  ) en;

  -- League/round-robin/pool standing for this entry (summed across pools if any).
  -- Zeroed row when the entry has no completed matches yet.
  SELECT jsonb_build_object(
    'played', COALESCE(SUM(played), 0),
    'won',    COALESCE(SUM(won), 0),
    'lost',   COALESCE(SUM(lost), 0),
    'drawn',  COALESCE(SUM(drawn), 0),
    'points', COALESCE(SUM(points), 0)
  ) INTO v_standing
  FROM tournament_standings
  WHERE entry_id = v_entry_id;

  -- How many entries share this division (for "Rank X of Y" context).
  SELECT count(*) INTO v_div_count
  FROM tournament_entries
  WHERE division_id = v_division_id AND status <> 'withdrawn';

  -- This entry's matches, from the participant's own perspective (my/opponent).
  SELECT COALESCE((
    SELECT jsonb_agg(to_jsonb(mm) ORDER BY mm.round_no, mm.match_no)
    FROM (
      SELECT
        m.id,
        m.division_id,
        m.round_no,
        m.round_label,
        m.match_no,
        m.pool,
        m.status,
        m.scheduled_at,
        m.sets,
        CASE WHEN m.side_a_entry_id = v_entry_id THEN a.entry_name ELSE b.entry_name END AS my_name,
        CASE WHEN m.side_a_entry_id = v_entry_id THEN b.entry_name ELSE a.entry_name END AS opponent_name,
        CASE WHEN m.side_a_entry_id = v_entry_id THEN m.score_a  ELSE m.score_b  END AS my_score,
        CASE WHEN m.side_a_entry_id = v_entry_id THEN m.score_b  ELSE m.score_a  END AS opponent_score,
        (m.status = 'completed' AND m.winner_entry_id = v_entry_id) AS won,
        (m.winner_entry_id IS NOT NULL AND m.winner_entry_id <> v_entry_id) AS lost,
        w.entry_name AS winner_name
      FROM tournament_matches m
      LEFT JOIN tournament_entries a ON a.id = m.side_a_entry_id
      LEFT JOIN tournament_entries b ON b.id = m.side_b_entry_id
      LEFT JOIN tournament_entries w ON w.id = m.winner_entry_id
      WHERE m.event_id = v_event_id
        AND (m.side_a_entry_id = v_entry_id OR m.side_b_entry_id = v_entry_id)
    ) mm
  ), '[]'::jsonb) INTO v_matches;

  v_result := jsonb_build_object(
    'tournament', v_event,
    'division',   v_division,
    'entry',      v_entry,
    'standing',   v_standing,
    'matches',    v_matches,
    'division_entry_count', v_div_count
  );
  RETURN v_result;
END;
$$;

-- DELIBERATE public, no-login participant-results read — the documented
-- exception to REVOKE-from-anon. The 6-char access code is the credential and
-- every field returned is already public on the spectator scoreboard.
GRANT EXECUTE ON FUNCTION public.fn_tournament_participant_results(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
