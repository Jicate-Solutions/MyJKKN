-- Tournament fixtures: manual mode — the in-charge builds every round by hand.
-- Created 2026-10-07. Follows 20271007120000_tournament_fixture_edit_side_and_fill_bye.
--
-- Auto mode (fn_generate_fixtures) draws the whole bracket and pushes each
-- winner into the next match. Organisers asked to set the fixtures themselves
-- instead: who plays whom in every round, including the quarterfinals,
-- semifinal and final. A division in manual mode (tournament_divisions.config
-- ->> 'fixture_mode' = 'manual'):
--   * keeps any matches already generated as a starting point, but with the
--     next-match links removed — winners no longer advance on their own;
--   * gets matches added, edited and deleted by the organiser through the
--     functions below, round by round;
--   * still records results with fn_record_result and awards with
--     fn_award_achievements (knockout: the highest round is the final, the
--     round before it gives bronze to its losers).
-- Rules for every manual change:
--   * same permission as the other fixture functions (super admin, admin,
--     sports.tournaments.manage, or an in-charge of the tournament);
--   * switching to manual is refused once any match in the division has a
--     result (a draw half played cannot be re-linked by hand safely);
--   * only a match without a result may be edited or deleted;
--   * both sides are active entries of the division, different from each other,
--     and neither already plays another match in the same round;
--   * the caller states the sides it saw (expected_*), so a concurrent edit is
--     refused instead of overwritten; edits share the per-division advisory
--     lock with the other bracket functions;
--   * every change is written to tournament_match_side_edits.
-- Switching back to auto ('auto') only clears the mode; the API then
-- regenerates the bracket (fn_generate_fixtures with regenerate).

ALTER TABLE public.tournament_match_side_edits
  DROP CONSTRAINT IF EXISTS tournament_match_side_edits_kind_check;
ALTER TABLE public.tournament_match_side_edits
  ADD CONSTRAINT tournament_match_side_edits_kind_check
    CHECK (kind IN ('replace', 'fill_bye', 'manual_set', 'manual_delete'));

-- Shared permission check for the manual fixture functions.
CREATE OR REPLACE FUNCTION public.fn_tournament_can_manage_division(p_division_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
      OR COALESCE(user_has_permission('sports.tournaments.manage'), false)
      OR COALESCE(fn_is_event_incharge((SELECT td.event_id FROM tournament_divisions td WHERE td.id = p_division_id)), false);
$$;
REVOKE EXECUTE ON FUNCTION public.fn_tournament_can_manage_division(uuid) FROM PUBLIC, anon, authenticated;

-- ── switch a division between auto and manual fixtures ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_tournament_set_fixture_mode(p_division_id uuid, p_mode text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT fn_tournament_can_manage_division(p_division_id) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;
  IF p_mode NOT IN ('manual', 'auto') THEN RAISE EXCEPTION 'mode must be manual or auto'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tournament_divisions WHERE id = p_division_id) THEN
    RAISE EXCEPTION 'division not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_bracket:' || p_division_id::text));

  IF p_mode = 'manual' THEN
    IF EXISTS (SELECT 1 FROM tournament_matches
                WHERE division_id = p_division_id
                  AND status IN ('completed', 'walkover', 'disqualified')) THEN
      RAISE EXCEPTION 'results are already recorded in this division, so it cannot switch to manual fixtures';
    END IF;
    -- Keep the drawn matches as a starting point, without automatic advancement.
    UPDATE tournament_matches SET next_match_id = NULL, next_slot = NULL
     WHERE division_id = p_division_id;
    -- Later-round placeholders (TBD vs TBD) only existed to receive winners.
    -- Without links they would sit there forever, and an empty "Final" would be
    -- the highest round fn_award_achievements reads. The organiser adds real
    -- later-round matches by hand.
    DELETE FROM tournament_matches
     WHERE division_id = p_division_id
       AND side_a_entry_id IS NULL AND side_b_entry_id IS NULL
       AND status IN ('pending', 'scheduled');
    UPDATE tournament_divisions
       SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('fixture_mode', 'manual')
     WHERE id = p_division_id;
  ELSE
    UPDATE tournament_divisions
       SET config = COALESCE(config, '{}'::jsonb) - 'fixture_mode'
     WHERE id = p_division_id;
  END IF;
  RETURN p_mode;
END; $$;

-- ── add or edit one match (manual mode) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tournament_manual_match_save(
  p_division_id uuid,
  p_match_id uuid,            -- NULL = add a new match
  p_round_no integer,
  p_round_label text,
  p_side_a uuid,
  p_side_b uuid,
  p_expected_side_a uuid,     -- edit only: the sides the caller saw
  p_expected_side_b uuid
) RETURNS public.tournament_matches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_div     public.tournament_divisions;
  v_match   public.tournament_matches;
  v_label   text;
  v_name_a  text;
  v_name_b  text;
  v_old_a   uuid;
  v_old_b   uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT fn_tournament_can_manage_division(p_division_id) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_bracket:' || p_division_id::text));

  SELECT * INTO v_div FROM tournament_divisions WHERE id = p_division_id;
  IF v_div.id IS NULL THEN RAISE EXCEPTION 'division not found'; END IF;
  IF COALESCE(v_div.config->>'fixture_mode', '') <> 'manual' THEN
    RAISE EXCEPTION 'switch this division to manual fixtures first';
  END IF;

  IF p_round_no IS NULL OR p_round_no < 1 OR p_round_no > 20 THEN
    RAISE EXCEPTION 'round must be between 1 and 20';
  END IF;
  v_label := NULLIF(left(btrim(COALESCE(p_round_label, '')), 40), '');
  v_label := COALESCE(v_label, 'Round ' || p_round_no);

  IF p_side_a IS NULL OR p_side_b IS NULL THEN RAISE EXCEPTION 'pick both sides'; END IF;
  IF p_side_a = p_side_b THEN RAISE EXCEPTION 'a match needs two different entries'; END IF;

  SELECT entry_name INTO v_name_a FROM tournament_entries
   WHERE id = p_side_a AND division_id = p_division_id AND status IN ('registered', 'confirmed') FOR SHARE;
  SELECT entry_name INTO v_name_b FROM tournament_entries
   WHERE id = p_side_b AND division_id = p_division_id AND status IN ('registered', 'confirmed') FOR SHARE;
  IF v_name_a IS NULL OR v_name_b IS NULL THEN
    RAISE EXCEPTION 'both sides must be active entries of this division';
  END IF;

  IF p_match_id IS NOT NULL THEN
    SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id AND division_id = p_division_id FOR UPDATE;
    IF v_match.id IS NULL THEN RAISE EXCEPTION 'match not found'; END IF;
    IF NOT (v_match.status IN ('pending', 'scheduled', 'bye')
            AND (v_match.status = 'bye' OR v_match.winner_entry_id IS NULL)) THEN
      RAISE EXCEPTION 'this match already has a result, so it cannot be changed';
    END IF;
    IF v_match.side_a_entry_id IS DISTINCT FROM p_expected_side_a
       OR v_match.side_b_entry_id IS DISTINCT FROM p_expected_side_b THEN
      RAISE EXCEPTION 'this match was changed by someone else just now; reload and try again';
    END IF;
    v_old_a := v_match.side_a_entry_id;
    v_old_b := v_match.side_b_entry_id;
  END IF;

  -- One match per entry per round.
  IF EXISTS (SELECT 1 FROM tournament_matches x
              WHERE x.division_id = p_division_id AND x.round_no = p_round_no
                AND x.id IS DISTINCT FROM p_match_id
                AND (x.side_a_entry_id IN (p_side_a, p_side_b) OR x.side_b_entry_id IN (p_side_a, p_side_b))) THEN
    RAISE EXCEPTION 'one of these entries already plays another match in % — pick someone else', v_label;
  END IF;

  IF p_match_id IS NULL THEN
    INSERT INTO tournament_matches
      (event_id, division_id, round_no, round_label, match_no, side_a_entry_id, side_b_entry_id, status)
    VALUES
      (v_div.event_id, p_division_id, p_round_no, v_label,
       COALESCE((SELECT max(match_no) FROM tournament_matches WHERE division_id = p_division_id AND round_no = p_round_no), 0) + 1,
       p_side_a, p_side_b, 'pending')
    RETURNING * INTO v_match;
  ELSE
    UPDATE tournament_matches
       SET round_no = p_round_no,
           round_label = v_label,
           -- Moving to another round puts it last in that round.
           match_no = CASE WHEN round_no = p_round_no THEN match_no
                           ELSE COALESCE((SELECT max(x.match_no) FROM tournament_matches x
                                           WHERE x.division_id = p_division_id AND x.round_no = p_round_no), 0) + 1 END,
           side_a_entry_id = p_side_a,
           side_b_entry_id = p_side_b,
           status = CASE WHEN status = 'bye' THEN 'pending' ELSE status END,
           winner_entry_id = NULL,
           next_match_id = NULL,
           next_slot = NULL
     WHERE id = p_match_id
    RETURNING * INTO v_match;
  END IF;

  INSERT INTO tournament_match_side_edits
    (event_id, division_id, match_id, slot, kind, old_entry_id, new_entry_id, edited_by,
     match_label, old_entry_name, new_entry_name)
  SELECT v_match.event_id, p_division_id, v_match.id, s.slot, 'manual_set', s.old_id, s.new_id, auth.uid(),
         concat_ws(' · ', v_label, 'match ' || v_match.match_no),
         (SELECT entry_name FROM tournament_entries WHERE id = s.old_id), s.new_name
    FROM (VALUES ('a', v_old_a, p_side_a, v_name_a), ('b', v_old_b, p_side_b, v_name_b)) AS s(slot, old_id, new_id, new_name)
   WHERE s.old_id IS DISTINCT FROM s.new_id;

  RETURN v_match;
END; $$;

-- ── delete one match without a result (manual mode) ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tournament_manual_match_delete(
  p_match_id uuid, p_expected_side_a uuid, p_expected_side_b uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_div   uuid;
  v_match public.tournament_matches;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT division_id INTO v_div FROM tournament_matches WHERE id = p_match_id;
  IF v_div IS NULL THEN RAISE EXCEPTION 'match not found'; END IF;
  IF NOT fn_tournament_can_manage_division(v_div) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_bracket:' || v_div::text));

  IF COALESCE((SELECT config->>'fixture_mode' FROM tournament_divisions WHERE id = v_div), '') <> 'manual' THEN
    RAISE EXCEPTION 'switch this division to manual fixtures first';
  END IF;

  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF v_match.status NOT IN ('pending', 'scheduled', 'bye')
     OR (v_match.status <> 'bye' AND v_match.winner_entry_id IS NOT NULL) THEN
    RAISE EXCEPTION 'this match already has a result, so it cannot be deleted';
  END IF;
  IF v_match.side_a_entry_id IS DISTINCT FROM p_expected_side_a
     OR v_match.side_b_entry_id IS DISTINCT FROM p_expected_side_b THEN
    RAISE EXCEPTION 'this match was changed by someone else just now; reload and try again';
  END IF;

  -- Recorded before the delete; the audit FK to the match is ON DELETE SET NULL.
  INSERT INTO tournament_match_side_edits
    (event_id, division_id, match_id, slot, kind, old_entry_id, new_entry_id, edited_by,
     match_label, old_entry_name, new_entry_name)
  SELECT v_match.event_id, v_div, v_match.id, s.slot, 'manual_delete', s.old_id, NULL, auth.uid(),
         concat_ws(' · ', v_match.round_label, 'match ' || v_match.match_no),
         (SELECT entry_name FROM tournament_entries WHERE id = s.old_id), NULL
    FROM (VALUES ('a', v_match.side_a_entry_id), ('b', v_match.side_b_entry_id)) AS s(slot, old_id)
   WHERE s.old_id IS NOT NULL;

  DELETE FROM tournament_matches WHERE id = p_match_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.fn_tournament_set_fixture_mode(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_tournament_manual_match_save(uuid, uuid, integer, text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_tournament_manual_match_delete(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tournament_set_fixture_mode(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tournament_manual_match_save(uuid, uuid, integer, text, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tournament_manual_match_delete(uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
