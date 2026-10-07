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
--   * every change is written to tournament_match_side_edits;
--   * concurrency: one division's bracket edits are serialised (advisory lock,
--     taken before any row lock so a bye fill and an edit of its next match
--     cannot deadlock), and the caller states the side's occupant it saw
--     (p_expected_entry_id, NULL = empty). If someone changed it meanwhile the
--     call is refused instead of silently overwriting their placement.
-- Same permission as fn_generate_fixtures / fn_record_result: super admin,
-- admin, sports.tournaments.manage, or an in-charge of the tournament.

CREATE TABLE IF NOT EXISTS public.tournament_match_side_edits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  division_id   uuid NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  match_id      uuid REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  slot          text NOT NULL CHECK (slot IN ('a', 'b')),
  kind          text NOT NULL CHECK (kind IN ('replace', 'fill_bye')),
  old_entry_id  uuid REFERENCES public.tournament_entries(id) ON DELETE SET NULL,
  new_entry_id  uuid REFERENCES public.tournament_entries(id) ON DELETE SET NULL,
  edited_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_at     timestamptz NOT NULL DEFAULT now(),
  -- Snapshots: Regenerate deletes the division's matches, and the trail must
  -- still say what was swapped for what.
  match_label     text,
  old_entry_name  text,
  new_entry_name  text
);
-- The first hand-applied version (2026-10-06) cascaded match / new entry
-- deletes and had no snapshots; bring an existing table in line.
ALTER TABLE public.tournament_match_side_edits
  ADD COLUMN IF NOT EXISTS match_label text,
  ADD COLUMN IF NOT EXISTS old_entry_name text,
  ADD COLUMN IF NOT EXISTS new_entry_name text,
  ALTER COLUMN match_id DROP NOT NULL,
  ALTER COLUMN new_entry_id DROP NOT NULL;
ALTER TABLE public.tournament_match_side_edits
  DROP CONSTRAINT IF EXISTS tournament_match_side_edits_match_id_fkey,
  DROP CONSTRAINT IF EXISTS tournament_match_side_edits_new_entry_id_fkey;
ALTER TABLE public.tournament_match_side_edits
  ADD CONSTRAINT tournament_match_side_edits_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  ADD CONSTRAINT tournament_match_side_edits_new_entry_id_fkey
    FOREIGN KEY (new_entry_id) REFERENCES public.tournament_entries(id) ON DELETE SET NULL;
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

-- An earlier 3-argument version was applied by hand on 2026-10-06; replace it.
DROP FUNCTION IF EXISTS public.fn_tournament_set_match_side(uuid, text, uuid);

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

REVOKE EXECUTE ON FUNCTION public.fn_tournament_set_match_side(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tournament_set_match_side(uuid, text, uuid, uuid) TO authenticated;

-- Spot entries are idempotent per dialog: the client sends one request key per
-- form, so a double click, a second tab of the same form or a retry after a lost
-- response can never create a second entry (and a second paid fee record).
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_registrations_spot_request_key
  ON public.events_registrations ((custom_data->'spot_entry'->>'request_key'))
  WHERE source = 'tournament_spot' AND (custom_data->'spot_entry'->>'request_key') IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- Spot entry, in one transaction. The API (/spot-entry) validates the request
-- and division eligibility and the fee, then calls this with the service role;
-- it is NOT granted to signed-in users, so nobody can skip those checks by
-- calling it directly. Under the same per-division lock as bracket edits it:
--   * returns the entry already made for this request_key (double click / retry);
--   * refuses a learner who already has an active entry in the division (two
--     organisers adding the same person at once);
--   * writes the registration, the entry (with a unique access code) and the
--     roster together, so a paid registration can never be left without its entry.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tournament_add_spot_entry(
  p_actor uuid,
  p_event_id uuid,
  p_division_id uuid,
  p_request_key text,
  p_entry_type text,
  p_entry_name text,
  p_learner_id uuid,
  p_is_external boolean,
  p_institution_id uuid,
  p_institution_name text,
  p_phone text,
  p_age integer,
  p_gender text,
  p_members jsonb,
  p_fee numeric,
  p_payment_reference text,
  p_custom_data jsonb,
  p_notes text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reg_id   uuid;
  v_entry_id uuid;
  v_code     text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
BEGIN
  IF p_actor IS NULL OR p_request_key IS NULL OR btrim(p_request_key) = '' THEN
    RAISE EXCEPTION 'actor and request_key are required';
  END IF;
  IF p_entry_type NOT IN ('individual', 'team') THEN RAISE EXCEPTION 'invalid entry type'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tournament_divisions WHERE id = p_division_id AND event_id = p_event_id) THEN
    RAISE EXCEPTION 'division not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tournament_bracket:' || p_division_id::text));

  -- Same submission again: hand back what it made.
  SELECT r.id INTO v_reg_id FROM events_registrations r
   WHERE r.event_id = p_event_id AND r.source = 'tournament_spot'
     AND r.custom_data->'spot_entry'->>'request_key' = p_request_key;
  IF v_reg_id IS NOT NULL THEN
    SELECT e.id, e.access_code INTO v_entry_id, v_code FROM tournament_entries e WHERE e.registration_id = v_reg_id;
    RETURN jsonb_build_object('entry_id', v_entry_id, 'access_code', v_code, 'duplicate', true);
  END IF;

  IF p_learner_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM tournament_entries e
         LEFT JOIN events_registrations r ON r.id = e.registration_id
        WHERE e.division_id = p_division_id AND e.status IN ('registered', 'confirmed')
          AND (e.captain_learner_id = p_learner_id OR r.learner_id = p_learner_id)) THEN
    RAISE EXCEPTION 'learner_already_entered';
  END IF;

  INSERT INTO events_registrations
    (event_id, category_id, participant_type, participant_name, participant_phone,
     participant_age, participant_gender, learner_id, institution_id, institution_name,
     status, payment_status, payment_amount, payment_method, payment_reference,
     source, registered_by, custom_data)
  VALUES
    (p_event_id, NULL, CASE WHEN p_is_external THEN 'external' ELSE 'internal' END, p_entry_name, p_phone,
     p_age, p_gender, CASE WHEN p_entry_type = 'individual' THEN p_learner_id END,
     CASE WHEN p_is_external THEN NULL ELSE p_institution_id END, p_institution_name,
     'registered', CASE WHEN p_fee > 0 THEN 'paid' ELSE 'not_required' END, COALESCE(p_fee, 0),
     CASE WHEN p_fee > 0 THEN 'offline' END, CASE WHEN p_fee > 0 THEN p_payment_reference END,
     'tournament_spot', p_actor,
     COALESCE(p_custom_data, '{}'::jsonb)
       || jsonb_build_object('spot_entry',
            COALESCE(p_custom_data->'spot_entry', '{}'::jsonb) || jsonb_build_object('request_key', p_request_key)))
  RETURNING id INTO v_reg_id;

  FOR attempt IN 1..8 LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO tournament_entries
        (event_id, division_id, registration_id, entry_type, entry_name, institution_id,
         institution_name, is_external, captain_learner_id, status, notes, access_code)
      VALUES
        (p_event_id, p_division_id, v_reg_id, p_entry_type, p_entry_name,
         CASE WHEN p_is_external THEN NULL ELSE p_institution_id END, p_institution_name, COALESCE(p_is_external, false),
         CASE WHEN p_entry_type = 'team' THEN p_learner_id END, 'registered', p_notes, v_code)
      RETURNING id INTO v_entry_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF attempt = 8 THEN RAISE; END IF;   -- access code taken: try another
    END;
  END LOOP;

  IF p_entry_type = 'team' AND jsonb_typeof(p_members) = 'array' THEN
    INSERT INTO tournament_team_members (entry_id, learner_id, member_name, jersey_no, role)
    SELECT v_entry_id, NULL, btrim(m->>'member_name'), NULLIF(btrim(m->>'jersey_no'), ''),
           COALESCE(NULLIF(m->>'role', ''), 'player')
      FROM jsonb_array_elements(p_members) m
     WHERE COALESCE(btrim(m->>'member_name'), '') <> '';
  END IF;

  RETURN jsonb_build_object('entry_id', v_entry_id, 'access_code', v_code, 'duplicate', false);
END; $$;

REVOKE EXECUTE ON FUNCTION public.fn_tournament_add_spot_entry(
  uuid, uuid, uuid, text, text, text, uuid, boolean, uuid, text, text, integer, text, jsonb, numeric, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tournament_add_spot_entry(
  uuid, uuid, uuid, text, text, text, uuid, boolean, uuid, text, text, integer, text, jsonb, numeric, text, jsonb, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
