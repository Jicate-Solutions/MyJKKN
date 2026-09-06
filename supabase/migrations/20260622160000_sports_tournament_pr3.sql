-- ============================================================================
-- Sports Tournament Conducting — PR3: fixtures/bracket engine + matches
-- DRAFT (staged in /tmp) — finalized into the PR3 worktree once PR2 is on main.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tournament_matches — a single fixture in a division
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                 UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  division_id              UUID        NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  round_no                 INTEGER     NOT NULL,
  round_label              TEXT,
  match_no                 INTEGER     NOT NULL,            -- display order within division
  bracket_slot             INTEGER,                         -- position within the round (knockout wiring)
  pool                     TEXT,                            -- pool/group label (round_robin / pools_ko)
  side_a_entry_id          UUID        REFERENCES public.tournament_entries(id) ON DELETE SET NULL,
  side_b_entry_id          UUID        REFERENCES public.tournament_entries(id) ON DELETE SET NULL,
  next_match_id            UUID        REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  next_slot                TEXT,                            -- 'a' | 'b' — slot the winner fills in next_match
  scheduled_at             TIMESTAMPTZ,
  session_id               UUID        REFERENCES public.event_sessions(id) ON DELETE SET NULL,
  resource_reservation_id  UUID        REFERENCES public.resource_reservations(id) ON DELETE SET NULL,
  official_human_role_id   UUID        REFERENCES public.event_human_roles(id) ON DELETE SET NULL,
  status                   TEXT        NOT NULL DEFAULT 'pending',
  winner_entry_id          UUID        REFERENCES public.tournament_entries(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tournament_matches_status_check
    CHECK (status IN ('pending','scheduled','completed','walkover','disqualified','bye')),
  CONSTRAINT tournament_matches_next_slot_check
    CHECK (next_slot IS NULL OR next_slot IN ('a','b'))
);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_division ON public.tournament_matches(division_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_event    ON public.tournament_matches(event_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round    ON public.tournament_matches(division_id, round_no, match_no);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_next     ON public.tournament_matches(next_match_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS trg_tournament_matches_updated_at ON public.tournament_matches;
    CREATE TRIGGER trg_tournament_matches_updated_at BEFORE UPDATE ON public.tournament_matches
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tournament_matches_select" ON public.tournament_matches;
CREATE POLICY "tournament_matches_select" ON public.tournament_matches FOR SELECT USING (
  is_super_admin() OR is_admin() OR (
    user_has_permission('sports.tournaments.view')
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = tournament_matches.event_id
      AND (e.scope='all_jkkn' OR e.visibility IN ('all_jkkn','public') OR role_has_institution_access(e.institution_id)))
  )
);
DROP POLICY IF EXISTS "tournament_matches_write" ON public.tournament_matches;
CREATE POLICY "tournament_matches_write" ON public.tournament_matches FOR ALL USING (
  is_super_admin() OR is_admin() OR (
    user_has_permission('sports.tournaments.manage')
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = tournament_matches.event_id
      AND (e.scope='all_jkkn' OR role_has_institution_access(e.institution_id)))
  )
) WITH CHECK (
  is_super_admin() OR is_admin() OR (
    user_has_permission('sports.tournaments.manage')
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = tournament_matches.event_id
      AND (e.scope='all_jkkn' OR role_has_institution_access(e.institution_id)))
  )
);

-- ----------------------------------------------------------------------------
-- 2. fn_generate_fixtures — build the bracket/schedule for a division.
--    Formats: knockout (seeded, auto-bye to top seeds), round_robin, league
--    (== round_robin fixtures), pools_ko (pool round-robins; KO stage generated
--    later once pool standings exist — manual progression per Director decision #4).
--    SECURITY DEFINER; locked from anon.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_generate_fixtures(
  p_division_id UUID,
  p_regenerate  BOOLEAN DEFAULT false
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('sports.tournaments.manage')) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
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
$$;

REVOKE EXECUTE ON FUNCTION public.fn_generate_fixtures(UUID, BOOLEAN) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_generate_fixtures(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
