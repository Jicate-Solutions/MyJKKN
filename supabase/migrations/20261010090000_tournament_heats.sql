-- ============================================================================
-- Tournament HEATS — group fixtures for athletics-style sports (2026-10-10)
-- ----------------------------------------------------------------------------
-- Knockout / round-robin fixtures are strictly 1 vs 1 (tournament_matches has
-- side_a / side_b). Athletics, Shot Put, Long Jump, Swimming have 5-10 athletes
-- in ONE round, ranked by position / mark. Those get their own tables instead
-- of bending tournament_matches:
--   tournament_heats         one heat (group) in a division
--   tournament_heat_entries  an entry inside a heat + its result (position, mark)
-- plus the new division format 'heats' and fn_finalize_heats() which ranks the
-- division, stamps tournament_entries.final_rank and awards top-3 achievements
-- (fn_award_achievements only understands knockout / standings).
-- Access mirrors tournament_matches + the in-charge policy
-- (20260801001000_tournament_incharge_access.sql).
-- ============================================================================

-- 1. allow format = 'heats' -------------------------------------------------
ALTER TABLE public.tournament_divisions DROP CONSTRAINT IF EXISTS tournament_divisions_format_check;
ALTER TABLE public.tournament_divisions
  ADD CONSTRAINT tournament_divisions_format_check
  CHECK (format IN ('knockout', 'round_robin', 'league', 'pools_ko', 'heats'));

-- 1b. existing divisions of athletics-style sports -> heats --------------------
-- Only untouched ones: still the default 'knockout' and no 1-vs-1 matches
-- generated yet, so nothing already conducted is reshaped.
UPDATE public.tournament_divisions d
SET format = 'heats'
WHERE (d.sport IN ('Athletics', 'Swimming') OR d.sport LIKE 'Athletics - %')
  AND d.format = 'knockout'
  AND NOT EXISTS (SELECT 1 FROM public.tournament_matches m WHERE m.division_id = d.id);

-- 2. tournament_heats -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_heats (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  division_id  UUID        NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  heat_no      INTEGER     NOT NULL,
  label        TEXT,
  scheduled_at TIMESTAMPTZ,
  venue_text   TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tournament_heats_status_check CHECK (status IN ('pending','scheduled','completed')),
  CONSTRAINT tournament_heats_division_heat_no_key UNIQUE (division_id, heat_no)
);
CREATE INDEX IF NOT EXISTS idx_tournament_heats_event ON public.tournament_heats(event_id);

-- 3. tournament_heat_entries -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_heat_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  heat_id       UUID        NOT NULL REFERENCES public.tournament_heats(id) ON DELETE CASCADE,
  event_id      UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  division_id   UUID        NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  entry_id      UUID        NOT NULL REFERENCES public.tournament_entries(id) ON DELETE CASCADE,
  lane_no       INTEGER,
  position      INTEGER,                       -- finishing place inside the heat
  mark          TEXT,                          -- display value, e.g. "11.82s" / "7.45m"
  mark_value    NUMERIC,                       -- numeric value used for ranking
  result_status TEXT        NOT NULL DEFAULT 'ok',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tournament_heat_entries_status_check CHECK (result_status IN ('ok','dns','dnf','dq')),
  -- an entry runs in exactly one heat per division
  CONSTRAINT tournament_heat_entries_division_entry_key UNIQUE (division_id, entry_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_heat_entries_heat  ON public.tournament_heat_entries(heat_id);
CREATE INDEX IF NOT EXISTS idx_tournament_heat_entries_event ON public.tournament_heat_entries(event_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS trg_tournament_heats_updated_at ON public.tournament_heats;
    CREATE TRIGGER trg_tournament_heats_updated_at BEFORE UPDATE ON public.tournament_heats
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 3b. lock anon: Supabase grants new tables to anon by default; RLS is not a substitute.
REVOKE ALL ON TABLE public.tournament_heats        FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.tournament_heat_entries FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_heats        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tournament_heat_entries TO authenticated;

-- 4. RLS --------------------------------------------------------------------
ALTER TABLE public.tournament_heats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_heat_entries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tournament_heats', 'tournament_heat_entries'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (
        is_super_admin() OR is_admin()
        OR fn_is_event_incharge(event_id)
        OR fn_is_event_committee_member(event_id)
        OR (
          user_has_permission('sports.tournaments.view')
          AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = %I.event_id
            AND (e.scope = 'all_jkkn' OR e.visibility IN ('all_jkkn','public') OR role_has_institution_access(e.institution_id)))
        )
      )$p$, t, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_write" ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY "%s_write" ON public.%I FOR ALL USING (
        is_super_admin() OR is_admin()
        OR fn_is_event_incharge(event_id)
        OR (
          user_has_permission('sports.tournaments.manage')
          AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = %I.event_id
            AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id)))
        )
      ) WITH CHECK (
        is_super_admin() OR is_admin()
        OR fn_is_event_incharge(event_id)
        OR (
          user_has_permission('sports.tournaments.manage')
          AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = %I.event_id
            AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id)))
        )
      )$p$, t, t, t, t);
  END LOOP;
END $$;

-- 5. fn_finalize_heats ------------------------------------------------------
-- Ranks every 'ok' athlete in the division, stamps tournament_entries.final_rank
-- and awards gold / silver / bronze to the linked JKKN learners (same writer
-- shape as fn_award_achievements). Ranking: by mark_value when every ranked
-- athlete has one (p_higher_better picks the direction — distance vs time),
-- otherwise by finishing position, then heat number. Idempotent.
CREATE OR REPLACE FUNCTION public.fn_finalize_heats(
  p_division_id   UUID,
  p_higher_better BOOLEAN DEFAULT false
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id   UUID;
  v_sport      TEXT;
  v_level      TEXT;
  v_event_name TEXT;
  v_all_marks  BOOLEAN;
  v_written    INTEGER := 0;
  v_rows       INTEGER;
  r            RECORD;
BEGIN
  SELECT d.event_id, d.sport, COALESCE(d.level, 'inter_college'), e.name
    INTO v_event_id, v_sport, v_level, v_event_name
  FROM tournament_divisions d JOIN events e ON e.id = d.event_id
  WHERE d.id = p_division_id AND d.format = 'heats';
  IF v_event_id IS NULL THEN RAISE EXCEPTION 'heats division not found'; END IF;

  IF NOT (is_super_admin() OR is_admin() OR fn_is_event_incharge(v_event_id)
          OR user_has_permission('sports.tournaments.manage')) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tournament_heat_entries
    WHERE division_id = p_division_id AND result_status = 'ok'
      AND (position IS NOT NULL OR mark_value IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'no results recorded yet — cannot finalize';
  END IF;

  SELECT bool_and(mark_value IS NOT NULL) INTO v_all_marks
  FROM tournament_heat_entries WHERE division_id = p_division_id AND result_status = 'ok';

  UPDATE tournament_entries SET final_rank = NULL WHERE division_id = p_division_id;

  FOR r IN
    SELECT he.entry_id,
           row_number() OVER (
             ORDER BY
               CASE WHEN v_all_marks AND p_higher_better     THEN he.mark_value END DESC NULLS LAST,
               CASE WHEN v_all_marks AND NOT p_higher_better THEN he.mark_value END ASC  NULLS LAST,
               he.position NULLS LAST,
               h.heat_no
           ) AS rnk
    FROM tournament_heat_entries he
    JOIN tournament_heats h ON h.id = he.heat_id
    WHERE he.division_id = p_division_id AND he.result_status = 'ok'
  LOOP
    UPDATE tournament_entries SET final_rank = r.rnk WHERE id = r.entry_id;

    IF r.rnk <= 3 THEN
      INSERT INTO health_sports_achievements
        (learner_id, achievement_date, sport, event_name, event_level, achievement_type, description, verified, verified_by)
      SELECT l.learner_id, CURRENT_DATE, v_sport, v_event_name, v_level,
             CASE r.rnk WHEN 1 THEN 'gold' WHEN 2 THEN 'silver' ELSE 'bronze' END,
             'Auto-awarded from conducted tournament', true, auth.uid()
      FROM (
        SELECT reg.learner_id
        FROM tournament_entries te JOIN events_registrations reg ON reg.id = te.registration_id
        WHERE te.id = r.entry_id AND te.entry_type = 'individual' AND reg.learner_id IS NOT NULL
        UNION
        SELECT tm.learner_id
        FROM tournament_team_members tm
        WHERE tm.entry_id = r.entry_id AND tm.learner_id IS NOT NULL
      ) l
      WHERE NOT EXISTS (
        SELECT 1 FROM health_sports_achievements a
        WHERE a.learner_id = l.learner_id AND a.event_name = v_event_name
          AND a.sport = v_sport
          AND a.achievement_type = CASE r.rnk WHEN 1 THEN 'gold' WHEN 2 THEN 'silver' ELSE 'bronze' END
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_written := v_written + v_rows;
    END IF;
  END LOOP;

  RETURN v_written;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_finalize_heats(UUID, BOOLEAN) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_finalize_heats(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
