-- Tournament divisions: sport, category and format are fixed once results have
-- EVER been recorded.
--
-- Incident (BALAM-2K26, 8 Oct 2026): a women's Chess knockout division held 7
-- matches with recorded results. Its sport was then changed to
-- "Athletics - 400 m" through the tournament Edit dialog, the chess matches
-- were later deleted, and 29 chess players were left sitting in a 400 m
-- division. The edit is a direct table UPDATE guarded only by RLS, so a
-- check in the dialog alone could be bypassed; this trigger is the backstop.
--
-- "Recorded result" is the same predicate fn_tournament_set_fixture_mode uses
-- (20271007170000_tournament_manual_fixtures.sql): a match whose status is
-- completed, walkover or disqualified — plus, for heats divisions, a heat
-- entry with a place, a mark or a DNS/DNF/DQ.
--
-- "Ever" (deep review, round 4): looking only at the results that exist now
-- let an organiser roll a result back to pending, or delete the matches, and
-- then change the sport. Organisers must still be able to correct a wrong
-- score, so rollbacks and deletes stay allowed; instead, the first time a
-- division gets a recorded result it is marked in
-- tournament_division_result_marks, and the result path never removes the
-- mark. The lock holds while a result exists OR a mark exists.
--
-- Data written by this migration: the backfill at the end inserts one mark for
-- every division that has a recorded result today. Nothing else is changed.
-- Other division fields (level, age band, entry fee, max teams, config) stay
-- editable.
--
-- Director rulings (9 Oct 2026, honest mistakes; re-confirmed 9 Oct 23:31):
-- a SUPER ADMIN may still make the change, and every such override is
-- recorded (who, when, old and new values) in
-- tournament_division_lock_overrides. Nobody else can.

-- ── override record ─────────────────────────────────────────────────────────
-- The record must outlive the division: deleting the division after an
-- override is exactly the incident pattern. division_id becomes NULL when the
-- division goes; event_id (no FK) and the old/new sport, category and format
-- stay as the copy of what the division was.
CREATE TABLE IF NOT EXISTS public.tournament_division_lock_overrides (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id uuid        REFERENCES public.tournament_divisions(id) ON DELETE SET NULL,
  event_id    uuid        NOT NULL,
  changed_by  uuid,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  old_sport   text,
  new_sport   text,
  old_gender  text,
  new_gender  text,
  old_format  text,
  new_format  text
);
CREATE INDEX IF NOT EXISTS idx_tournament_division_lock_overrides_division
  ON public.tournament_division_lock_overrides(division_id);
CREATE INDEX IF NOT EXISTS idx_tournament_division_lock_overrides_event
  ON public.tournament_division_lock_overrides(event_id);

ALTER TABLE public.tournament_division_lock_overrides ENABLE ROW LEVEL SECURITY;
-- Written only by the trigger below (as definer); read by super admins only.
REVOKE ALL ON public.tournament_division_lock_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tournament_division_lock_overrides TO authenticated;
DROP POLICY IF EXISTS tournament_division_lock_overrides_select
  ON public.tournament_division_lock_overrides;
CREATE POLICY tournament_division_lock_overrides_select
  ON public.tournament_division_lock_overrides
  FOR SELECT TO authenticated
  USING (COALESCE(public.is_super_admin(), false));

-- ── "this division has had a result" marks ──────────────────────────────────
-- One row per division, written only by the result trigger below (as
-- definer) and by the backfill. No client policy of any kind: nobody reads or
-- writes it through the API. Deleting the division removes its mark, which is
-- fine — there is nothing left to change the sport of.
CREATE TABLE IF NOT EXISTS public.tournament_division_result_marks (
  division_id       uuid        PRIMARY KEY
                                REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  first_recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tournament_division_result_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tournament_division_result_marks FROM PUBLIC, anon, authenticated;

-- ── the lock ────────────────────────────────────────────────────────────────
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
     AND (EXISTS (SELECT 1 FROM tournament_division_result_marks
                   WHERE division_id = OLD.id)
          OR EXISTS (SELECT 1 FROM tournament_matches
                      WHERE division_id = OLD.id
                        AND status IN ('completed', 'walkover', 'disqualified'))
          -- Heats divisions (athletics, swimming) keep results per runner.
          OR EXISTS (SELECT 1 FROM tournament_heat_entries
                      WHERE division_id = OLD.id
                        AND (position IS NOT NULL OR mark_value IS NOT NULL
                             OR result_status <> 'ok'))) THEN
    -- auth.uid() / is_super_admin() still describe the caller inside a
    -- SECURITY DEFINER trigger (they read the request's JWT claims).
    IF COALESCE(public.is_super_admin(), false) THEN
      INSERT INTO tournament_division_lock_overrides
        (division_id, event_id, changed_by, changed_at,
         old_sport, new_sport, old_gender, new_gender, old_format, new_format)
      VALUES
        (OLD.id, OLD.event_id, auth.uid(), now(),
         OLD.sport, NEW.sport, OLD.gender, NEW.gender, OLD.format, NEW.format);
      RETURN NEW;
    END IF;
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

-- ── result path: mark the division, and serialise with an edit ─────────────
-- When a match or heat entry ENTERS a recorded state (an insert that is
-- already recorded, or an update from not-recorded to recorded), the trigger
--   1. takes FOR SHARE on the division row. That conflicts with the row lock
--      an UPDATE of the division takes, so a first result and a sport change
--      committing together serialise: an edit waiting on a result re-checks
--      after the result commits and is refused; a result waiting on an edit
--      is recorded against the already-changed division.
--   2. inserts the division's mark (ON CONFLICT DO NOTHING). Nothing on the
--      result path ever UPDATEs tournament_divisions, so two recorders that
--      both hold FOR SHARE never wait to upgrade it.
-- Writes that do not enter a recorded state (score corrections on an
-- already-recorded match, scheduling, side changes, rollbacks) take no
-- division lock at all.
--
-- Lock order, checked against the repo on 10 Oct 2026:
-- * Result writers lock the match / heat-entry row first (a BEFORE ROW
--   trigger runs after that row is locked), then the division FOR SHARE, then
--   insert the mark. Writers: fn_record_result (RPC, called from
--   lib/api/events/tournament/handlers/matches-match-result.ts),
--   fn_tournament_manual_match_save and fn_tournament_set_match_side (both
--   take the tournament_bracket advisory lock first), fn_finalize_heats, and
--   the direct heat-entry result UPDATEs in
--   lib/api/events/tournament/handlers/heats-heat.ts (one row per statement).
--   The direct match UPDATE in matches-match.ts only sets 'scheduled'.
-- * The only runtime writers of tournament_divisions rows are the Edit dialog
--   (one UPDATE statement; the lock trigger only reads matches and heat
--   entries) and fn_tournament_set_fixture_mode. Its 'manual' branch updates
--   matches BEFORE the division (same order as a result writer). Its 'auto'
--   branch updates the division and then fn_generate_fixtures deletes the
--   division's matches: division before match. A result entering 'completed'
--   on a still-pending match of that same division at that same moment is the
--   one interleaving that can deadlock; PostgreSQL's deadlock detector then
--   aborts one of the two with an error, and nothing commits half-done.
--   Before this migration that interleaving silently deleted the new result.
-- * The one-off UPDATE in 20261010090000_tournament_heats.sql is migration
--   data, not a runtime path. fn_generate_fixtures / fn_generate_pool_knockout
--   read the division without a row lock; byes use status 'bye', which is not
--   a recorded result.

CREATE OR REPLACE FUNCTION public.fn_tournament_result_lock_division()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now boolean;
  v_was boolean := false;
BEGIN
  -- Separate branches: each table's columns are only read on that table.
  IF TG_TABLE_NAME = 'tournament_matches' THEN
    v_now := NEW.status IN ('completed', 'walkover', 'disqualified');
    IF TG_OP = 'UPDATE' THEN
      v_was := OLD.status IN ('completed', 'walkover', 'disqualified');
    END IF;
  ELSE
    v_now := NEW.position IS NOT NULL OR NEW.mark_value IS NOT NULL
             OR NEW.result_status <> 'ok';
    IF TG_OP = 'UPDATE' THEN
      v_was := OLD.position IS NOT NULL OR OLD.mark_value IS NOT NULL
               OR OLD.result_status <> 'ok';
    END IF;
  END IF;
  IF COALESCE(v_now, false) AND NOT COALESCE(v_was, false) THEN
    PERFORM 1 FROM tournament_divisions WHERE id = NEW.division_id FOR SHARE;
    INSERT INTO tournament_division_result_marks (division_id)
    VALUES (NEW.division_id)
    ON CONFLICT (division_id) DO NOTHING;
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

-- ── backfill: divisions that already have results ───────────────────────────
-- After the triggers, so a result recorded while this runs is marked either
-- way. first_recorded_at is the migration time for these rows.
INSERT INTO public.tournament_division_result_marks (division_id)
SELECT division_id FROM public.tournament_matches
 WHERE status IN ('completed', 'walkover', 'disqualified')
UNION
SELECT division_id FROM public.tournament_heat_entries
 WHERE position IS NOT NULL OR mark_value IS NOT NULL OR result_status <> 'ok'
ON CONFLICT (division_id) DO NOTHING;
