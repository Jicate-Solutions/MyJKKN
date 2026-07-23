-- ============================================================================
-- Sports Tournament Conducting — PR5: athlete-profile loop (award achievements)
-- DRAFT (staged in /tmp) — finalized into the PR5 worktree once PR4 is on main.
-- On finalize, write verified health_sports_achievements for JKKN learners on the
-- placed entries (gold/silver/bronze) + set tournament_entries.final_rank.
-- Idempotent: re-running does not duplicate achievements.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_award_achievements(p_division_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_format     TEXT;
  v_sport      TEXT;
  v_level      TEXT;
  v_event_id   UUID;
  v_event_name TEXT;
  v_gold       UUID;
  v_silver     UUID;
  v_bronze     UUID[];
  v_written    INTEGER := 0;
  v_rank       INTEGER;
  v_entry      UUID;
  v_atype      TEXT;
  v_max_round  INTEGER;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('sports.tournaments.manage')) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;

  SELECT d.format, d.sport, COALESCE(d.level,'inter_college'), d.event_id, e.name
    INTO v_format, v_sport, v_level, v_event_id, v_event_name
  FROM tournament_divisions d JOIN events e ON e.id = d.event_id
  WHERE d.id = p_division_id;
  IF v_event_id IS NULL THEN RAISE EXCEPTION 'division not found'; END IF;

  -- ---- determine placements ----
  IF v_format = 'knockout' THEN
    SELECT max(round_no) INTO v_max_round FROM tournament_matches WHERE division_id = p_division_id;
    -- final: the (only) match in the top round, must be completed
    SELECT winner_entry_id,
           CASE WHEN winner_entry_id = side_a_entry_id THEN side_b_entry_id ELSE side_a_entry_id END
      INTO v_gold, v_silver
    FROM tournament_matches
    WHERE division_id = p_division_id AND round_no = v_max_round AND status = 'completed'
    LIMIT 1;
    IF v_gold IS NULL THEN
      RAISE EXCEPTION 'final not completed yet — cannot award';
    END IF;
    -- bronze: losers of the semifinal round (round = max-1), if any
    IF v_max_round > 1 THEN
      SELECT array_agg(CASE WHEN winner_entry_id = side_a_entry_id THEN side_b_entry_id ELSE side_a_entry_id END)
        INTO v_bronze
      FROM tournament_matches
      WHERE division_id = p_division_id AND round_no = v_max_round - 1 AND status = 'completed'
        AND winner_entry_id IS NOT NULL;
    END IF;
  ELSE
    -- league / round_robin / pools: top of standings
    SELECT array_agg(entry_id ORDER BY rn)
      INTO v_bronze  -- reuse as "ordered list"; split below
    FROM (
      SELECT entry_id, row_number() OVER (ORDER BY points DESC, won DESC) rn
      FROM tournament_standings WHERE division_id = p_division_id
    ) s WHERE rn <= 3;
    v_gold   := v_bronze[1];
    v_silver := v_bronze[2];
    v_bronze := CASE WHEN array_length(v_bronze,1) >= 3 THEN ARRAY[v_bronze[3]] ELSE NULL END;
    IF v_gold IS NULL THEN RAISE EXCEPTION 'no standings to award'; END IF;
  END IF;

  -- ---- writer: for an entry, insert achievements for each linked JKKN learner ----
  -- (individual: registration.learner_id; team: roster learner_ids). Idempotent.
  CREATE TEMP TABLE _award(entry_id UUID, atype TEXT, rnk INTEGER) ON COMMIT DROP;
  IF v_gold   IS NOT NULL THEN INSERT INTO _award VALUES (v_gold,'gold',1); END IF;
  IF v_silver IS NOT NULL THEN INSERT INTO _award VALUES (v_silver,'silver',2); END IF;
  IF v_bronze IS NOT NULL THEN
    INSERT INTO _award SELECT unnest(v_bronze), 'bronze', 3;
  END IF;

  FOR v_entry, v_atype, v_rank IN SELECT entry_id, atype, rnk FROM _award WHERE entry_id IS NOT NULL LOOP
    UPDATE tournament_entries SET final_rank = v_rank WHERE id = v_entry;

    INSERT INTO health_sports_achievements
      (learner_id, achievement_date, sport, event_name, event_level, achievement_type, description, verified, verified_by)
    SELECT l.learner_id, CURRENT_DATE, v_sport, v_event_name, v_level, v_atype,
           'Auto-awarded from conducted tournament', true, auth.uid()
    FROM (
      -- individual entrant's learner
      SELECT r.learner_id
      FROM tournament_entries te JOIN events_registrations r ON r.id = te.registration_id
      WHERE te.id = v_entry AND te.entry_type = 'individual' AND r.learner_id IS NOT NULL
      UNION
      -- team roster learners
      SELECT tm.learner_id
      FROM tournament_team_members tm
      WHERE tm.entry_id = v_entry AND tm.learner_id IS NOT NULL
    ) l
    WHERE NOT EXISTS (
      SELECT 1 FROM health_sports_achievements a
      WHERE a.learner_id = l.learner_id AND a.event_name = v_event_name
        AND a.sport = v_sport AND a.achievement_type = v_atype
    );
    GET DIAGNOSTICS v_rank = ROW_COUNT;
    v_written := v_written + v_rank;
  END LOOP;

  RETURN v_written;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_award_achievements(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_award_achievements(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
