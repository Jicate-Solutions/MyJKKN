-- ============================================================================
-- Sports Tournament v2 — knockout stage from pool standings (Director decision #7, 2026-06-23)
-- File: 20260623010000_sports_tournament_v2_pool_knockout.sql
--
-- v1 fn_generate_fixtures(pools_ko) generates only the per-pool round-robins. The
-- Director chose ORGANIZER-TRIGGERED knockout: after the group matches finish and the
-- coordinator has checked the standings, they press a button to build the knockout
-- bracket from the pool qualifiers. This RPC does that — top N per pool (config
-- qualifiers_per_pool, default 1), cross-seeded (all pool winners first, then runners-up),
-- then a standard seeded single-elimination with auto-byes + next-match advancement
-- wiring (same shape as fn_generate_fixtures' knockout). KO matches use round numbers
-- ABOVE the pool rounds so they sort after the groups, pool=NULL.
-- SECURITY DEFINER; REVOKE anon. Idempotent-ish: refuses if a KO stage already exists
-- unless p_regenerate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_generate_pool_knockout(
  p_division_id UUID,
  p_regenerate  BOOLEAN DEFAULT false
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id  UUID;
  v_format    TEXT;
  v_config    JSONB;
  v_per_pool  INTEGER;
  v_quals     UUID[];      -- qualifier entry ids, cross-seeded
  v_n         INTEGER;
  v_b         INTEGER;
  v_rounds    INTEGER;
  v_base      INTEGER;     -- round offset = max existing (pool) round
  v_order     INTEGER[];
  v_created   INTEGER := 0;
  v_round     INTEGER;
  v_count     INTEGER;
  j           INTEGER; i INTEGER;
  v_sa INTEGER; v_sb INTEGER; v_ea UUID; v_eb UUID;
  v_mid UUID; v_prev UUID[]; v_cur UUID[]; v_label TEXT;
  v_open INTEGER;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('sports.tournaments.manage')) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;

  SELECT event_id, format, config INTO v_event_id, v_format, v_config
  FROM tournament_divisions WHERE id = p_division_id;
  IF v_event_id IS NULL THEN RAISE EXCEPTION 'division not found'; END IF;
  IF v_format <> 'pools_ko' THEN RAISE EXCEPTION 'division is not a pools->knockout format'; END IF;

  -- a KO match is one with pool IS NULL; pool matches carry a pool label
  SELECT count(*) INTO v_open FROM tournament_matches WHERE division_id = p_division_id AND pool IS NULL;
  IF v_open > 0 THEN
    IF NOT p_regenerate THEN RAISE EXCEPTION 'knockout stage already generated (pass regenerate=true)'; END IF;
    DELETE FROM tournament_matches WHERE division_id = p_division_id AND pool IS NULL;
  END IF;

  -- guard: all pool matches must be decided before seeding the knockout
  IF EXISTS (
    SELECT 1 FROM tournament_matches
    WHERE division_id = p_division_id AND pool IS NOT NULL
      AND status NOT IN ('completed','walkover','disqualified','bye')
  ) THEN
    RAISE EXCEPTION 'finish all group matches before generating the knockout';
  END IF;

  v_per_pool := GREATEST(1, COALESCE((v_config->>'qualifiers_per_pool')::INTEGER, 1));
  v_base := COALESCE((SELECT max(round_no) FROM tournament_matches WHERE division_id = p_division_id AND pool IS NOT NULL), 0);

  -- qualifiers: rank within each pool by points, take top v_per_pool; cross-seed by
  -- (within-pool rank, then points) so pool winners are spread across the bracket.
  SELECT array_agg(entry_id ORDER BY pool_rank, points DESC, won DESC)
    INTO v_quals
  FROM (
    SELECT entry_id, pool, points, won,
           row_number() OVER (PARTITION BY pool ORDER BY points DESC, won DESC) AS pool_rank
    FROM tournament_standings
    WHERE division_id = p_division_id
  ) s
  WHERE s.pool_rank <= v_per_pool;

  v_n := COALESCE(array_length(v_quals, 1), 0);
  IF v_n < 2 THEN RAISE EXCEPTION 'need at least 2 qualifiers for a knockout (have %)', v_n; END IF;

  -- bracket size + seed-position order (top seeds spread apart)
  v_b := 1; WHILE v_b < v_n LOOP v_b := v_b * 2; END LOOP;
  v_rounds := 0; i := v_b; WHILE i > 1 LOOP v_rounds := v_rounds + 1; i := i / 2; END LOOP;
  v_order := ARRAY[1];
  WHILE array_length(v_order,1) < v_b LOOP
    DECLARE n2 INTEGER := array_length(v_order,1)*2 + 1; nxt INTEGER[] := ARRAY[]::INTEGER[];
    BEGIN FOREACH i IN ARRAY v_order LOOP nxt := nxt || i || (n2 - i); END LOOP; v_order := nxt; END;
  END LOOP;

  -- build rounds bottom-up (final first) so next_match_id wiring exists
  v_prev := NULL;
  FOR v_round IN REVERSE v_rounds..1 LOOP
    v_count := v_b / (2 ^ v_round)::INTEGER;
    v_cur := ARRAY[]::UUID[];
    v_label := CASE WHEN v_round=v_rounds THEN 'Final' WHEN v_round=v_rounds-1 THEN 'Semifinal'
                    WHEN v_round=v_rounds-2 THEN 'Quarterfinal' ELSE 'KO Round '||v_round END;
    FOR j IN 1..v_count LOOP
      v_ea := NULL; v_eb := NULL;
      IF v_round = 1 THEN
        v_sa := v_order[2*j-1]; v_sb := v_order[2*j];
        IF v_sa <= v_n THEN v_ea := v_quals[v_sa]; END IF;
        IF v_sb <= v_n THEN v_eb := v_quals[v_sb]; END IF;
      END IF;
      INSERT INTO tournament_matches (event_id, division_id, round_no, round_label, match_no, bracket_slot,
        side_a_entry_id, side_b_entry_id, next_match_id, next_slot, status)
      VALUES (v_event_id, p_division_id, v_base + v_round, v_label, j, j, v_ea, v_eb,
        CASE WHEN v_prev IS NOT NULL THEN v_prev[((j-1)/2)+1] ELSE NULL END,
        CASE WHEN v_prev IS NOT NULL THEN (CASE WHEN j%2=1 THEN 'a' ELSE 'b' END) ELSE NULL END,
        'pending')
      RETURNING id INTO v_mid;
      v_cur := v_cur || v_mid; v_created := v_created + 1;
    END LOOP;
    v_prev := v_cur;
  END LOOP;

  -- auto-advance round-1 byes
  FOR v_mid, v_ea, v_eb IN
    SELECT id, side_a_entry_id, side_b_entry_id FROM tournament_matches
    WHERE division_id = p_division_id AND pool IS NULL AND round_no = v_base + 1
      AND ((side_a_entry_id IS NULL) <> (side_b_entry_id IS NULL))
  LOOP
    DECLARE w UUID := COALESCE(v_ea, v_eb); nm UUID; ns TEXT;
    BEGIN
      UPDATE tournament_matches SET status='bye', winner_entry_id=w WHERE id=v_mid RETURNING next_match_id, next_slot INTO nm, ns;
      IF nm IS NOT NULL THEN
        IF ns='a' THEN UPDATE tournament_matches SET side_a_entry_id=w WHERE id=nm;
        ELSE            UPDATE tournament_matches SET side_b_entry_id=w WHERE id=nm; END IF;
      END IF;
    END;
  END LOOP;

  RETURN v_created;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_generate_pool_knockout(UUID, BOOLEAN) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_generate_pool_knockout(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
