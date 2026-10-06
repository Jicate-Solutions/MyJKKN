-- Tournament fixtures: put a different entry into an unplayed knockout slot, or
-- fill a bye with a late (spot) entry. Created 2026-10-06.
--
-- Until now a generated bracket could only be thrown away whole (Regenerate,
-- which deletes every match and result of the division). Organisers asked for
-- three things: replace a no-show team, add a spot registration, and give a
-- late entry a bracket place. Spot entries are created by the API
-- (/api/events/tournament/[eventId]/spot-entry); this function places them.
--
-- fn_tournament_set_match_side(match, slot, entry):
--   * knockout divisions only — a league / pool entry plays many matches, so
--     swapping it in one match would leave the others inconsistent;
--   * the slot must not be fed by an earlier match (later-round sides come from
--     results; change the result there instead) — in practice round 1;
--   * the match has no result yet (pending / scheduled), OR it is a bye whose
--     empty side is being filled. A bye already pushed its lone entry into the
--     next match; that push is undone, and refused once the next match is decided;
--   * the new entry is an active entry of the same division and is not already
--     anywhere in the bracket;
--   * an entry taken out of the bracket by the swap is marked withdrawn;
--   * every change is written to tournament_match_side_edits.
-- Same permission as fn_generate_fixtures / fn_record_result: super admin,
-- admin, sports.tournaments.manage, or an in-charge of the tournament.

CREATE TABLE IF NOT EXISTS public.tournament_match_side_edits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  division_id   uuid NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  match_id      uuid NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  slot          text NOT NULL CHECK (slot IN ('a', 'b')),
  kind          text NOT NULL CHECK (kind IN ('replace', 'fill_bye')),
  old_entry_id  uuid REFERENCES public.tournament_entries(id) ON DELETE SET NULL,
  new_entry_id  uuid NOT NULL REFERENCES public.tournament_entries(id) ON DELETE CASCADE,
  edited_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tournament_match_side_edits_match
  ON public.tournament_match_side_edits (match_id, edited_at);
CREATE INDEX IF NOT EXISTS idx_tournament_match_side_edits_event
  ON public.tournament_match_side_edits (event_id);

ALTER TABLE public.tournament_match_side_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tournament_match_side_edits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tournament_match_side_edits TO authenticated;
GRANT ALL ON TABLE public.tournament_match_side_edits TO service_role;
DROP POLICY IF EXISTS tournament_match_side_edits_select ON public.tournament_match_side_edits;
CREATE POLICY tournament_match_side_edits_select ON public.tournament_match_side_edits
  FOR SELECT TO authenticated USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('sports.tournaments.manage'))
    OR fn_is_event_incharge(tournament_match_side_edits.event_id));

CREATE OR REPLACE FUNCTION public.fn_tournament_set_match_side(
  p_match_id uuid, p_slot text, p_entry_id uuid
) RETURNS public.tournament_matches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_match   public.tournament_matches;
  v_next    public.tournament_matches;
  v_format  text;
  v_entry   public.tournament_entries;
  v_old     uuid;
  v_kind    text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('sports.tournaments.manage')
          OR fn_is_event_incharge((SELECT tm.event_id FROM tournament_matches tm WHERE tm.id = p_match_id))) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;
  IF p_slot IS NULL OR p_slot NOT IN ('a', 'b') THEN RAISE EXCEPTION 'slot must be a or b'; END IF;

  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id FOR UPDATE;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'match not found'; END IF;

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
     AND status IN ('registered', 'confirmed');
  IF v_entry.id IS NULL THEN RAISE EXCEPTION 'that entry is not an active entry of this division'; END IF;

  IF EXISTS (SELECT 1 FROM tournament_matches x
              WHERE x.division_id = v_match.division_id
                AND (x.side_a_entry_id = p_entry_id OR x.side_b_entry_id = p_entry_id)) THEN
    RAISE EXCEPTION '% is already in this bracket', v_entry.entry_name;
  END IF;

  v_old := CASE p_slot WHEN 'a' THEN v_match.side_a_entry_id ELSE v_match.side_b_entry_id END;

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
    -- Undo the bye's push of its lone entry into the next match.
    IF v_match.next_match_id IS NOT NULL THEN
      SELECT * INTO v_next FROM tournament_matches WHERE id = v_match.next_match_id FOR UPDATE;
      IF v_next.status NOT IN ('pending', 'scheduled') OR v_next.winner_entry_id IS NOT NULL THEN
        RAISE EXCEPTION 'the next match already has a result, so this bye can no longer be filled';
      END IF;
      UPDATE tournament_matches
         SET side_a_entry_id = CASE WHEN v_match.next_slot = 'a' AND side_a_entry_id = v_match.winner_entry_id
                                    THEN NULL ELSE side_a_entry_id END,
             side_b_entry_id = CASE WHEN v_match.next_slot = 'b' AND side_b_entry_id = v_match.winner_entry_id
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
    (event_id, division_id, match_id, slot, kind, old_entry_id, new_entry_id, edited_by)
  VALUES (v_match.event_id, v_match.division_id, v_match.id, p_slot, v_kind, v_old, p_entry_id, auth.uid());

  RETURN v_match;
END; $$;

REVOKE EXECUTE ON FUNCTION public.fn_tournament_set_match_side(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tournament_set_match_side(uuid, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
