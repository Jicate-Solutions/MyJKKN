-- Tournament divisions: sport, category and format are fixed once results exist.
--
-- Incident (BALAM-2K26, 8 Oct 2026): a women's Chess knockout division held 7
-- matches with recorded results. Its sport was then changed to
-- "Athletics - 400 m" through the tournament Edit dialog, the chess matches
-- were later deleted, and 29 chess players were left sitting in a 400 m
-- division. The edit is a direct table UPDATE guarded only by RLS, so a
-- check in the dialog alone could be bypassed; this trigger is the backstop.
--
-- "Has recorded results" is the same predicate fn_tournament_set_fixture_mode
-- uses (20271007170000_tournament_manual_fixtures.sql): any match in the
-- division whose status is completed, walkover or disqualified — plus, for
-- heats divisions, any heat entry with a place, a mark or a DNS/DNF/DQ.
--
-- No data is changed. Other division fields (level, age band, entry fee,
-- max teams, config) stay editable.

CREATE OR REPLACE FUNCTION public.fn_tournament_division_results_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.sport IS DISTINCT FROM OLD.sport
      OR NEW.gender IS DISTINCT FROM OLD.gender
      OR NEW.format IS DISTINCT FROM OLD.format)
     AND (EXISTS (SELECT 1 FROM tournament_matches
                   WHERE division_id = OLD.id
                     AND status IN ('completed', 'walkover', 'disqualified'))
          -- Heats divisions (athletics, swimming) keep results per runner.
          OR EXISTS (SELECT 1 FROM tournament_heat_entries
                      WHERE division_id = OLD.id
                        AND (position IS NOT NULL OR mark_value IS NOT NULL
                             OR result_status <> 'ok'))) THEN
    RAISE EXCEPTION 'This division already has recorded results; its sport, category or format cannot change. Add a new division instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

-- Trigger-only: nobody calls it directly.
REVOKE EXECUTE ON FUNCTION public.fn_tournament_division_results_lock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tournament_division_results_lock ON public.tournament_divisions;
CREATE TRIGGER trg_tournament_division_results_lock
  BEFORE UPDATE OF sport, gender, format ON public.tournament_divisions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_tournament_division_results_lock();

-- ── Race: a first result and a division edit committing together ───────────
-- Without this, a result committed while a sport change is in flight is not
-- yet visible to the trigger above, and both succeed. Whatever writes a
-- recorded result (fn_record_result, the manual-match and heats paths, and
-- the direct heat-entry writes in the API) first takes FOR SHARE on the
-- division row. That conflicts with the row lock an UPDATE of the division
-- takes, so the two serialise: a division edit waiting on a result re-checks
-- after the result commits and is refused; a result waiting on a division
-- edit is recorded against the already-changed division.
-- A trigger on the two result tables covers every writer without editing any
-- of the result-recording functions.

CREATE OR REPLACE FUNCTION public.fn_tournament_result_lock_division()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result boolean;
BEGIN
  -- Separate branches: each table's columns are only read on that table.
  IF TG_TABLE_NAME = 'tournament_matches' THEN
    v_result := NEW.status IN ('completed', 'walkover', 'disqualified');
  ELSE
    v_result := NEW.position IS NOT NULL OR NEW.mark_value IS NOT NULL
                OR NEW.result_status <> 'ok';
  END IF;
  IF v_result THEN
    PERFORM 1 FROM tournament_divisions WHERE id = NEW.division_id FOR SHARE;
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.fn_tournament_result_lock_division() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tournament_match_result_lock_division ON public.tournament_matches;
CREATE TRIGGER trg_tournament_match_result_lock_division
  BEFORE INSERT OR UPDATE ON public.tournament_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_tournament_result_lock_division();

DROP TRIGGER IF EXISTS trg_tournament_heat_result_lock_division ON public.tournament_heat_entries;
CREATE TRIGGER trg_tournament_heat_result_lock_division
  BEFORE INSERT OR UPDATE ON public.tournament_heat_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_tournament_result_lock_division();
