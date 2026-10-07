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
-- Switching back to auto ('auto') clears the mode and regenerates the bracket
-- in one transaction; both directions are refused once results exist. While a
-- division is manual, fn_generate_fixtures / fn_generate_pool_knockout /
-- fn_tournament_set_match_side refuse it (server-side, not just hidden buttons).

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
-- An earlier text-returning version was applied by hand on 2026-10-07.
DROP FUNCTION IF EXISTS public.fn_tournament_set_fixture_mode(uuid, text);

CREATE OR REPLACE FUNCTION public.fn_tournament_set_fixture_mode(p_division_id uuid, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_created integer;
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

  -- Either way round, recorded results would be thrown away or left unlinked.
  IF EXISTS (SELECT 1 FROM tournament_matches
              WHERE division_id = p_division_id
                AND status IN ('completed', 'walkover', 'disqualified')) THEN
    RAISE EXCEPTION 'results are already recorded in this division, so its fixture mode cannot change';
  END IF;

  IF p_mode = 'manual' THEN
    -- Keep the drawn matches as a starting point, without automatic advancement.
    UPDATE tournament_matches SET next_match_id = NULL, next_slot = NULL
     WHERE division_id = p_division_id;
    -- Later-round slots only existed to receive winners: TBD vs TBD, and a
    -- match holding just a bye winner pushed forward. Unlinked they would sit
    -- there for ever, and an unfinished "Final" would be the highest round
    -- fn_award_achievements reads. The organiser adds real later rounds by hand.
    DELETE FROM tournament_matches
     WHERE division_id = p_division_id
       AND status IN ('pending', 'scheduled')
       AND (side_a_entry_id IS NULL OR side_b_entry_id IS NULL);
    UPDATE tournament_divisions
       SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('fixture_mode', 'manual')
     WHERE id = p_division_id;
    RETURN jsonb_build_object('mode', 'manual');
  END IF;

  -- Back to auto: end manual mode and draw a fresh bracket in ONE transaction,
  -- so a draw that fails (e.g. fewer than 2 entries) leaves the division manual.
  UPDATE tournament_divisions
     SET config = COALESCE(config, '{}'::jsonb) - 'fixture_mode'
   WHERE id = p_division_id;
  PERFORM set_config('app.tournament_fixture_mode_switch', 'on', true);
  v_created := fn_generate_fixtures(p_division_id, true);
  PERFORM set_config('app.tournament_fixture_mode_switch', 'off', true);
  RETURN jsonb_build_object('mode', 'auto', 'matches_created', v_created);
END; $$;

-- ── the generators refuse a manual division (live bodies, verbatim + guard) ─
CREATE OR REPLACE FUNCTION public.fn_generate_fixtures(p_division_id uuid, p_regenerate boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id   UUID;
  v_format     TEXT;
  v_config     JSONB;
  v_entries    UUID[];
  v_n          INTEGER;
  v_b          INTEGER;        -- bracket size (next power of 2)
  v_rounds     INTEGER;
  v_order      INTEGER[];      -- seed-number order by bracket position
  v_created    INTEGER := 0;
  v_existing   INTEGER;
  i            INTEGER;
  j            INTEGER;
  v_round      INTEGER;
  v_count_in_round INTEGER;
  v_seed_a     INTEGER;
  v_seed_b     INTEGER;
  v_ea         UUID;
  v_eb         UUID;
  v_match_id   UUID;
  v_prev_ids   UUID[];
  v_cur_ids    UUID[];
  v_pool_size  INTEGER;
  v_pool_count INTEGER;
  v_pool       TEXT;
  v_label      TEXT;
  a INTEGER; b2 INTEGER;
  v_round_label TEXT;
BEGIN
  -- permission: only managers (and admins) may generate fixtures
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('sports.tournaments.manage') OR fn_is_event_incharge((SELECT td.event_id FROM tournament_divisions td WHERE td.id = p_division_id))) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;

  -- Manual fixtures (20271007170000): a manual division is never redrawn behind
  -- the organiser's back — only fn_tournament_set_fixture_mode('auto') may, in
  -- the same transaction that ends manual mode.
  IF COALESCE((SELECT td.config->>'fixture_mode' FROM tournament_divisions td WHERE td.id = p_division_id), '') = 'manual'
     AND COALESCE(current_setting('app.tournament_fixture_mode_switch', true), '') <> 'on' THEN
    RAISE EXCEPTION 'this division uses manual fixtures; use "Auto-generate instead" to draw it';
  END IF;

  SELECT event_id, format, config INTO v_event_id, v_format, v_config
  FROM tournament_divisions WHERE id = p_division_id;
  IF v_event_id IS NULL THEN RAISE EXCEPTION 'division not found'; END IF;

  SELECT count(*) INTO v_existing FROM tournament_matches WHERE division_id = p_division_id;
  IF v_existing > 0 THEN
    IF NOT p_regenerate THEN
      RAISE EXCEPTION 'fixtures already exist for this division (pass regenerate=true to rebuild)';
    END IF;
    DELETE FROM tournament_matches WHERE division_id = p_division_id;
  END IF;

  -- active entries, seeded (NULL seeds last, then by registration order)
  SELECT array_agg(id ORDER BY seed NULLS LAST, created_at)
    INTO v_entries
  FROM tournament_entries
  WHERE division_id = p_division_id AND status IN ('registered','confirmed');
  v_n := COALESCE(array_length(v_entries, 1), 0);
  IF v_n < 2 THEN RAISE EXCEPTION 'need at least 2 active entries to generate fixtures (have %)', v_n; END IF;

  -- ===================== KNOCKOUT =====================
  IF v_format = 'knockout' THEN
    v_b := 1; WHILE v_b < v_n LOOP v_b := v_b * 2; END LOOP;   -- next power of 2
    v_rounds := 0; i := v_b; WHILE i > 1 LOOP v_rounds := v_rounds + 1; i := i / 2; END LOOP;

    -- seed-position order (top seeds spread apart): grow [1] -> interleave
    v_order := ARRAY[1];
    WHILE array_length(v_order, 1) < v_b LOOP
      DECLARE n2 INTEGER := array_length(v_order,1)*2 + 1; nxt INTEGER[] := ARRAY[]::INTEGER[];
      BEGIN
        FOREACH i IN ARRAY v_order LOOP nxt := nxt || i || (n2 - i); END LOOP;
        v_order := nxt;
      END;
    END LOOP;

    -- create later rounds first (so next_match_id wiring exists), bottom-up.
    -- We build round = v_rounds (final, 1 match) down to round 1.
    v_prev_ids := NULL;  -- ids of the round just created (the "next" round for the round below)
    FOR v_round IN REVERSE v_rounds..1 LOOP
      v_count_in_round := v_b / (2 ^ v_round)::INTEGER;   -- matches in this round
      v_cur_ids := ARRAY[]::UUID[];
      v_round_label := CASE
        WHEN v_round = v_rounds THEN 'Final'
        WHEN v_round = v_rounds - 1 THEN 'Semifinal'
        WHEN v_round = v_rounds - 2 THEN 'Quarterfinal'
        ELSE 'Round ' || v_round END;
      FOR j IN 1..v_count_in_round LOOP
        v_ea := NULL; v_eb := NULL;
        IF v_round = 1 THEN
          v_seed_a := v_order[2*j - 1]; v_seed_b := v_order[2*j];
          IF v_seed_a <= v_n THEN v_ea := v_entries[v_seed_a]; END IF;
          IF v_seed_b <= v_n THEN v_eb := v_entries[v_seed_b]; END IF;
        END IF;
        INSERT INTO tournament_matches (event_id, division_id, round_no, round_label, match_no, bracket_slot,
          side_a_entry_id, side_b_entry_id, next_match_id, next_slot, status)
        VALUES (v_event_id, p_division_id, v_round, v_round_label, j, j,
          v_ea, v_eb,
          CASE WHEN v_prev_ids IS NOT NULL THEN v_prev_ids[((j-1)/2)+1] ELSE NULL END,
          CASE WHEN v_prev_ids IS NOT NULL THEN (CASE WHEN j % 2 = 1 THEN 'a' ELSE 'b' END) ELSE NULL END,
          'pending')
        RETURNING id INTO v_match_id;
        v_cur_ids := v_cur_ids || v_match_id;
        v_created := v_created + 1;
      END LOOP;
      v_prev_ids := v_cur_ids;
    END LOOP;

    -- auto-advance byes in round 1: one side filled, the other NULL.
    FOR v_match_id, v_ea, v_eb IN
      SELECT id, side_a_entry_id, side_b_entry_id FROM tournament_matches
      WHERE division_id = p_division_id AND round_no = 1
        AND ((side_a_entry_id IS NULL) <> (side_b_entry_id IS NULL))
    LOOP
      DECLARE w UUID := COALESCE(v_ea, v_eb); nm UUID; ns TEXT;
      BEGIN
        UPDATE tournament_matches SET status='bye', winner_entry_id=w WHERE id=v_match_id
          RETURNING next_match_id, next_slot INTO nm, ns;
        IF nm IS NOT NULL THEN
          IF ns='a' THEN UPDATE tournament_matches SET side_a_entry_id=w WHERE id=nm;
          ELSE            UPDATE tournament_matches SET side_b_entry_id=w WHERE id=nm; END IF;
        END IF;
      END;
    END LOOP;

  -- ===================== ROUND ROBIN / LEAGUE =====================
  ELSIF v_format IN ('round_robin','league') THEN
    -- circle method; if odd, a virtual bye (NULL) sits out each round
    DECLARE
      m INTEGER := v_n; arr INTEGER[]; r INTEGER; k INTEGER; top INTEGER; bot INTEGER;
    BEGIN
      IF m % 2 = 1 THEN m := m + 1; END IF;  -- add phantom slot for odd counts
      arr := ARRAY(SELECT g FROM generate_series(1, m) g);   -- 1..m (m may be n+1; slot m = phantom)
      FOR r IN 1..(m-1) LOOP
        FOR k IN 1..(m/2) LOOP
          top := arr[k]; bot := arr[m - k + 1];
          v_ea := CASE WHEN top <= v_n THEN v_entries[top] ELSE NULL END;
          v_eb := CASE WHEN bot <= v_n THEN v_entries[bot] ELSE NULL END;
          IF v_ea IS NOT NULL AND v_eb IS NOT NULL THEN   -- skip phantom-bye pairings
            INSERT INTO tournament_matches (event_id, division_id, round_no, round_label, match_no, side_a_entry_id, side_b_entry_id, status)
            VALUES (v_event_id, p_division_id, r, 'Round '||r, v_created+1, v_ea, v_eb, 'scheduled');
            v_created := v_created + 1;
          END IF;
        END LOOP;
        -- rotate (keep arr[1] fixed, rotate the rest)
        arr := ARRAY[arr[1]] || arr[m] || arr[2:m-1];
      END LOOP;
    END;

  -- ===================== POOLS -> KNOCKOUT (pool stage only for v1) =====================
  ELSIF v_format = 'pools_ko' THEN
    v_pool_size := GREATEST(2, COALESCE((v_config->>'pool_size')::INTEGER, 4));
    v_pool_count := CEIL(v_n::NUMERIC / v_pool_size)::INTEGER;
    -- round-robin within each pool (snake seeding into pools)
    DECLARE pool_members UUID[]; p INTEGER; idx INTEGER; mm INTEGER; rr INTEGER; kk INTEGER;
            parr INTEGER[]; pa UUID; pb UUID; ptop INTEGER; pbot INTEGER;
    BEGIN
      FOR p IN 1..v_pool_count LOOP
        v_pool := chr(64 + p);  -- 'A','B',...
        pool_members := ARRAY[]::UUID[];
        idx := p;
        WHILE idx <= v_n LOOP pool_members := pool_members || v_entries[idx]; idx := idx + v_pool_count; END LOOP; -- snake
        mm := COALESCE(array_length(pool_members,1),0);
        IF mm >= 2 THEN
          DECLARE mm2 INTEGER := mm; BEGIN
            IF mm2 % 2 = 1 THEN mm2 := mm2 + 1; END IF;
            parr := ARRAY(SELECT g FROM generate_series(1, mm2) g);
            FOR rr IN 1..(mm2-1) LOOP
              FOR kk IN 1..(mm2/2) LOOP
                ptop := parr[kk]; pbot := parr[mm2 - kk + 1];
                pa := CASE WHEN ptop <= mm THEN pool_members[ptop] ELSE NULL END;
                pb := CASE WHEN pbot <= mm THEN pool_members[pbot] ELSE NULL END;
                IF pa IS NOT NULL AND pb IS NOT NULL THEN
                  INSERT INTO tournament_matches (event_id, division_id, round_no, round_label, match_no, pool, side_a_entry_id, side_b_entry_id, status)
                  VALUES (v_event_id, p_division_id, rr, 'Pool '||v_pool||' · R'||rr, v_created+1, v_pool, pa, pb, 'scheduled');
                  v_created := v_created + 1;
                END IF;
              END LOOP;
              parr := ARRAY[parr[1]] || parr[mm2] || parr[2:mm2-1];
            END LOOP;
          END;
        END IF;
      END LOOP;
    END;
  ELSE
    RAISE EXCEPTION 'unsupported format: %', v_format;
  END IF;

  RETURN v_created;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_generate_pool_knockout(p_division_id uuid, p_regenerate boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('sports.tournaments.manage') OR fn_is_event_incharge((SELECT td.event_id FROM tournament_divisions td WHERE td.id = p_division_id))) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;

  -- Manual fixtures (20271007170000): a manual division is never redrawn behind
  -- the organiser's back — only fn_tournament_set_fixture_mode('auto') may, in
  -- the same transaction that ends manual mode.
  IF COALESCE((SELECT td.config->>'fixture_mode' FROM tournament_divisions td WHERE td.id = p_division_id), '') = 'manual'
     AND COALESCE(current_setting('app.tournament_fixture_mode_switch', true), '') <> 'on' THEN
    RAISE EXCEPTION 'this division uses manual fixtures; use "Auto-generate instead" to draw it';
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
$function$;

-- ── side edits (20271007120000) refuse a manual division ───────────────────
CREATE OR REPLACE FUNCTION public.fn_tournament_set_match_side(
  p_match_id uuid, p_slot text, p_entry_id uuid, p_expected_entry_id uuid
) RETURNS public.tournament_matches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match   public.tournament_matches;
  v_next    public.tournament_matches;
  v_format  text;
  v_entry   public.tournament_entries;
  v_old     uuid;
  v_kind    text;
  v_div     uuid;
  v_holder  uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('sports.tournaments.manage')
          OR fn_is_event_incharge((SELECT tm.event_id FROM tournament_matches tm WHERE tm.id = p_match_id))) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;
  IF p_slot IS NULL OR p_slot NOT IN ('a', 'b') THEN RAISE EXCEPTION 'slot must be a or b'; END IF;

  SELECT division_id INTO v_div FROM tournament_matches WHERE id = p_match_id;
  IF v_div IS NULL THEN RAISE EXCEPTION 'match not found'; END IF;
  -- One bracket edit per division at a time; before any row lock (see header).
  PERFORM pg_advisory_xact_lock(hashtext('tournament_bracket:' || v_div::text));

  -- A manual division edits whole matches (fn_tournament_manual_match_save).
  IF COALESCE((SELECT td.config->>'fixture_mode' FROM tournament_divisions td WHERE td.id = v_div), '') = 'manual' THEN
    RAISE EXCEPTION 'this division uses manual fixtures; edit the match instead';
  END IF;

  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id FOR UPDATE;

  SELECT format INTO v_format FROM tournament_divisions WHERE id = v_match.division_id;
  IF v_format IS DISTINCT FROM 'knockout' THEN
    RAISE EXCEPTION 'changing a fixture is only supported for knockout divisions';
  END IF;

  IF EXISTS (SELECT 1 FROM tournament_matches f
              WHERE f.next_match_id = v_match.id AND f.next_slot = p_slot) THEN
    RAISE EXCEPTION 'this side is decided by an earlier match; change that match''s result instead';
  END IF;

  SELECT * INTO v_entry FROM tournament_entries
   WHERE id = p_entry_id AND division_id = v_match.division_id
     AND status IN ('registered', 'confirmed')
   FOR SHARE;
  IF v_entry.id IS NULL THEN RAISE EXCEPTION 'that entry is not an active entry of this division'; END IF;

  IF EXISTS (SELECT 1 FROM tournament_matches x
              WHERE x.division_id = v_match.division_id
                AND (x.side_a_entry_id = p_entry_id OR x.side_b_entry_id = p_entry_id)) THEN
    RAISE EXCEPTION '% is already in this bracket', v_entry.entry_name;
  END IF;

  v_old := CASE p_slot WHEN 'a' THEN v_match.side_a_entry_id ELSE v_match.side_b_entry_id END;
  IF v_old IS DISTINCT FROM p_expected_entry_id THEN
    RAISE EXCEPTION 'this match was changed by someone else just now; reload and try again';
  END IF;

  IF v_match.status IN ('pending', 'scheduled') AND v_match.winner_entry_id IS NULL THEN
    v_kind := 'replace';
    UPDATE tournament_matches
       SET side_a_entry_id = CASE WHEN p_slot = 'a' THEN p_entry_id ELSE side_a_entry_id END,
           side_b_entry_id = CASE WHEN p_slot = 'b' THEN p_entry_id ELSE side_b_entry_id END
     WHERE id = v_match.id
    RETURNING * INTO v_match;

  ELSIF v_match.status = 'bye' THEN
    IF v_old IS NOT NULL THEN
      RAISE EXCEPTION 'pick the empty side of the bye';
    END IF;
    v_kind := 'fill_bye';
    -- The lone entry the bye advanced (winner_entry_id is set by the generator;
    -- fall back to the occupied side if an older bye left it empty).
    v_holder := COALESCE(v_match.winner_entry_id, v_match.side_a_entry_id, v_match.side_b_entry_id);
    -- Undo the bye's push of its lone entry into the next match.
    IF v_match.next_match_id IS NOT NULL THEN
      SELECT * INTO v_next FROM tournament_matches WHERE id = v_match.next_match_id FOR UPDATE;
      IF v_next.status NOT IN ('pending', 'scheduled') OR v_next.winner_entry_id IS NOT NULL THEN
        RAISE EXCEPTION 'the next match already has a result, so this bye can no longer be filled';
      END IF;
      UPDATE tournament_matches
         SET side_a_entry_id = CASE WHEN v_match.next_slot = 'a' AND side_a_entry_id = v_holder
                                    THEN NULL ELSE side_a_entry_id END,
             side_b_entry_id = CASE WHEN v_match.next_slot = 'b' AND side_b_entry_id = v_holder
                                    THEN NULL ELSE side_b_entry_id END
       WHERE id = v_next.id;
    END IF;
    UPDATE tournament_matches
       SET side_a_entry_id = CASE WHEN p_slot = 'a' THEN p_entry_id ELSE side_a_entry_id END,
           side_b_entry_id = CASE WHEN p_slot = 'b' THEN p_entry_id ELSE side_b_entry_id END,
           status = 'pending',
           winner_entry_id = NULL
     WHERE id = v_match.id
    RETURNING * INTO v_match;

  ELSE
    RAISE EXCEPTION 'this match already has a result, so its sides cannot be changed';
  END IF;

  -- An entry swapped out and no longer anywhere in the bracket is out of it.
  IF v_old IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM tournament_matches x
        WHERE x.division_id = v_match.division_id
          AND (x.side_a_entry_id = v_old OR x.side_b_entry_id = v_old)) THEN
    UPDATE tournament_entries
       SET status = 'withdrawn',
           notes = concat_ws(' · ', NULLIF(btrim(notes), ''),
                             'Replaced in the fixture by ' || v_entry.entry_name || ' on '
                               || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY'))
     WHERE id = v_old AND status IN ('registered', 'confirmed');
  END IF;

  INSERT INTO tournament_match_side_edits
    (event_id, division_id, match_id, slot, kind, old_entry_id, new_entry_id, edited_by,
     match_label, old_entry_name, new_entry_name)
  VALUES (v_match.event_id, v_match.division_id, v_match.id, p_slot, v_kind, v_old, p_entry_id, auth.uid(),
          concat_ws(' · ', v_match.round_label, 'match ' || v_match.match_no),
          (SELECT entry_name FROM tournament_entries WHERE id = v_old),
          v_entry.entry_name);

  RETURN v_match;
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
  v_prev_round integer;
  v_prev_label text;
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
    v_prev_round := v_match.round_no;
    v_prev_label := v_match.round_label;
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

  -- Moving a match to another round or renaming it (e.g. to the medal-deciding
  -- "Final") changes nothing on the sides, so record it separately.
  IF p_match_id IS NOT NULL AND v_old_a = p_side_a AND v_old_b = p_side_b THEN
    INSERT INTO tournament_match_side_edits
      (event_id, division_id, match_id, slot, kind, old_entry_id, new_entry_id, edited_by,
       match_label, old_entry_name, new_entry_name)
    SELECT v_match.event_id, p_division_id, v_match.id, 'a', 'manual_set', p_side_a, p_side_a, auth.uid(),
           concat_ws(' · ', v_label, 'match ' || v_match.match_no) || ' (round / name changed)',
           v_name_a, v_name_a
     WHERE v_prev_round IS DISTINCT FROM p_round_no OR v_prev_label IS DISTINCT FROM v_label;
  END IF;

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
REVOKE EXECUTE ON FUNCTION public.fn_generate_fixtures(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_generate_pool_knockout(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_tournament_manual_match_save(uuid, uuid, integer, text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_tournament_manual_match_delete(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tournament_set_fixture_mode(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tournament_manual_match_save(uuid, uuid, integer, text, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tournament_manual_match_delete(uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
