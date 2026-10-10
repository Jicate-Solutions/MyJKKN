-- Review follow-ups for #4304 (tournament results lock) and #4311 (cultural
-- event winners), plus a column allowlist on events_registrations.
--
-- Every function replaced here was compared line by line with the LIVE body
-- (pg_proc.prosrc, 10 Oct 2026) before editing; each keeps its live text and
-- grants apart from the change described next to it.
--
-- 1. #4304 r4 LOW 1 — a recorded match or heat entry MOVED to another division
--    now marks (and FOR SHARE locks) the new division too.
-- 2. #4304 r4 LOW 2 — both #4304 SECURITY DEFINER functions resolve tables with
--    search_path = public, pg_temp (a session temp table can no longer shadow
--    tournament_matches or the marks table).
-- 3. #4304 r4 LOW 3 — the "this division has had a result" marks become
--    readable to whoever can read the division, so the Edit dialog can show
--    the lock (or the super-admin override notice) after a rollback.
-- 4. Fixture mode vs the first result (desk question, 10 Oct). Not a logical
--    deadlock: fn_record_result never asks for a fixture mode, and
--    fn_tournament_set_fixture_mode only refuses once a result exists. It WAS
--    a lock-order hazard: fn_record_result locked the match row and only then
--    (in the #4304 trigger) the division FOR SHARE, while the mode switch
--    checked for results BEFORE taking any lock and then updated the division
--    and deleted its matches. A result that took the division FOR SHARE first
--    therefore made the switch wait, then the switch went on with its stale
--    "no results" check and deleted the just-recorded match; the other order
--    deadlocked. Both now take the DIVISION row first: fn_record_result FOR
--    SHARE before it reads the match, the mode switch FOR UPDATE before its
--    results check. Whichever comes second waits and then sees the first one's
--    committed state (the switch is refused, or the result finds its match
--    gone).
-- 5. #4311 r7 LOW 5 — documented: a deleted event's winner history is readable
--    by super admins only.
-- 6. #4311 r10 LOW 1 — fn_set_event_registration_ranks accepts an optional
--    expected_rank per change and refuses (40001, the route's 409 "reload")
--    when the row no longer holds it, so a stale dialog cannot wipe a place
--    someone else just moved.
-- 7. events_registrations column ALLOWLIST (desk, 10 Oct; pre-existing hole).
--    Live UPDATE policies (events_reg_committee_member_update,
--    events_reg_scoped_update) admit committee members and the registrant on
--    their own row to the whole row, so they could rewrite payment, certificate
--    or status, or re-point profile_id. See section 7 for who may change what.

-- ---------------------------------------------------------------------------
-- 1 + 2. Result path marks the division a recorded row ends up in
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tournament_result_lock_division()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  -- Entering a recorded state, or (r4 LOW 1) a recorded row moving to another
  -- division: the division it ends up in is marked either way.
  IF COALESCE(v_now, false)
     AND (NOT COALESCE(v_was, false)
          OR (TG_OP = 'UPDATE' AND NEW.division_id IS DISTINCT FROM OLD.division_id)) THEN
    PERFORM 1 FROM public.tournament_divisions WHERE id = NEW.division_id FOR SHARE;
    INSERT INTO public.tournament_division_result_marks (division_id)
    VALUES (NEW.division_id)
    ON CONFLICT (division_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.fn_tournament_result_lock_division() FROM PUBLIC, anon, authenticated;

-- The edit-side lock keeps its body; only its search_path changes.
ALTER FUNCTION public.fn_tournament_division_results_lock() SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 3. Marks readable alongside the division
-- ---------------------------------------------------------------------------
-- A mark says only "this division has had a result". It is visible exactly
-- when the caller's own RLS on tournament_divisions shows the division.
-- Still no client INSERT / UPDATE / DELETE: the result trigger (as definer)
-- is the only writer.
GRANT SELECT ON public.tournament_division_result_marks TO authenticated;
DROP POLICY IF EXISTS tournament_division_result_marks_select
  ON public.tournament_division_result_marks;
CREATE POLICY tournament_division_result_marks_select
  ON public.tournament_division_result_marks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournament_divisions d
                  WHERE d.id = tournament_division_result_marks.division_id));

-- ---------------------------------------------------------------------------
-- 4a. fn_record_result: division row first
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_record_result(p_match_id uuid, p_status text, p_winner_entry_id uuid DEFAULT NULL::uuid, p_score_a integer DEFAULT NULL::integer, p_score_b integer DEFAULT NULL::integer, p_sets jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS tournament_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_match  public.tournament_matches;
  v_winner UUID;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('sports.tournaments.manage') OR fn_is_event_incharge((SELECT tm.event_id FROM tournament_matches tm WHERE tm.id = p_match_id))) THEN
    RAISE EXCEPTION 'permission denied: sports.tournaments.manage required';
  END IF;
  IF p_status NOT IN ('completed','walkover','disqualified') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  -- Division row FIRST (20271010180000), the same order
  -- fn_tournament_set_fixture_mode takes (division, then its matches). A
  -- fixture-mode switch in flight finishes first, and the match is then read
  -- fresh below (gone if the switch redrew the bracket); a switch that comes
  -- second waits for this result and then refuses.
  PERFORM 1 FROM tournament_divisions
   WHERE id = (SELECT tm.division_id FROM tournament_matches tm WHERE tm.id = p_match_id)
   FOR SHARE;

  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'match not found'; END IF;

  -- resolve the winner
  v_winner := p_winner_entry_id;
  IF p_status = 'completed' THEN
    IF v_winner IS NULL THEN RAISE EXCEPTION 'winner required for a completed match'; END IF;
  END IF;
  -- winner (if given) must be one of the two sides
  IF v_winner IS NOT NULL
     AND v_winner <> COALESCE(v_match.side_a_entry_id,'00000000-0000-0000-0000-000000000000'::uuid)
     AND v_winner <> COALESCE(v_match.side_b_entry_id,'00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'winner must be one of the match sides';
  END IF;

  UPDATE tournament_matches SET
    status            = p_status,
    winner_entry_id   = v_winner,
    score_a           = p_score_a,
    score_b           = p_score_b,
    sets              = p_sets,
    result_notes      = p_notes,
    result_entered_by = auth.uid(),
    result_entered_at = now()
  WHERE id = p_match_id
  RETURNING * INTO v_match;

  -- knockout advancement: push the winner into the next match's slot
  IF v_winner IS NOT NULL AND v_match.next_match_id IS NOT NULL THEN
    IF v_match.next_slot = 'a' THEN
      UPDATE tournament_matches SET side_a_entry_id = v_winner WHERE id = v_match.next_match_id;
    ELSIF v_match.next_slot = 'b' THEN
      UPDATE tournament_matches SET side_b_entry_id = v_winner WHERE id = v_match.next_match_id;
    END IF;
  END IF;

  RETURN v_match;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_record_result(uuid, text, uuid, integer, integer, jsonb, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_record_result(uuid, text, uuid, integer, integer, jsonb, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4b. fn_tournament_set_fixture_mode: lock the division before the check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tournament_set_fixture_mode(p_division_id uuid, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
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

  -- Division row before the results check (20271010180000): a result being
  -- recorded holds it FOR SHARE (fn_record_result), so this waits for that
  -- result to commit and the check below then sees it.
  PERFORM 1 FROM tournament_divisions WHERE id = p_division_id FOR UPDATE;

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
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_tournament_set_fixture_mode(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_tournament_set_fixture_mode(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Winner history of a deleted event
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.event_winner_rank_changes IS
  'Every change of events_registrations.final_rank, from any write path, with who made it (NULL for service-role / direct sessions). A placed row moved between events or forms logs a clear where it was and a set where it went; deleting a placed row logs a clear. Written only by trg_events_registrations_final_rank_history. BUG-006273. Read access follows fn_can_record_event_winners(event_id); once the event itself is deleted only a super admin can still read its rows (intended: the creator, in-charge and institution checks need the events row).';

-- ---------------------------------------------------------------------------
-- 6. Winners save: optional expected_rank per change
-- ---------------------------------------------------------------------------
-- p_changes: [{"registration_id": "<uuid>", "final_rank": 1|2|3|null,
--              "expected_rank": 1|2|3|null (optional)}, ...]
CREATE OR REPLACE FUNCTION public.fn_set_event_registration_ranks(p_event_id uuid, p_changes jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type text;
  v_bad integer;
  v_total integer;
  v_found integer;
  v_ids uuid[];
  v_forms uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.fn_can_record_event_winners(p_event_id), false) THEN
    RAISE EXCEPTION 'Only the event''s creator, its in-charge or an administrator can record winners.'
      USING ERRCODE = '42501';
  END IF;

  SELECT e.event_type INTO v_type FROM public.events e WHERE e.id = p_event_id;
  IF v_type IS DISTINCT FROM 'cultural' THEN
    RAISE EXCEPTION 'Winners can be recorded here only for cultural events.'
      USING ERRCODE = '22023';
  END IF;

  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'Changes must be a list.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad
  FROM jsonb_array_elements(p_changes) x
  WHERE jsonb_typeof(x) <> 'object'
     OR NOT (x ? 'registration_id')
     OR NOT (x ? 'final_rank')
     OR (x->>'registration_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR (jsonb_typeof(x->'final_rank') <> 'null'
         AND (jsonb_typeof(x->'final_rank') <> 'number'
              OR (x->>'final_rank') !~ '^[1-3]$'))
     -- expected_rank is optional; when present it is a place or null.
     OR (x ? 'expected_rank'
         AND jsonb_typeof(x->'expected_rank') <> 'null'
         AND (jsonb_typeof(x->'expected_rank') <> 'number'
              OR (x->>'expected_rank') !~ '^[1-3]$'));
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Each change needs a registration and a place of 1, 2, 3 or none.'
      USING ERRCODE = '22023';
  END IF;

  -- LOCKING, in the same order as a form DELETE (form row, then its
  -- registrations — see fn_event_registration_forms_winner_guard), so the two
  -- paths queue instead of deadlocking:
  --   1. read the listed rows and their forms, without a lock;
  --   2. lock those forms FOR SHARE, in id order (a form delete in flight
  --      either finishes first or waits for this save);
  --   3. lock the rows FOR UPDATE, in id order (overlapping saves queue);
  --   4. re-check, on the locked rows, that every one is still in this event
  --      and still on the form read in step 1 — before any write;
  --   5. re-check, on the locked rows, the place each one held when the
  --      screen was loaded (expected_rank), when the caller sent it.
  SELECT count(DISTINCT (x->>'registration_id')::uuid) INTO v_total
  FROM jsonb_array_elements(p_changes) AS t(x);

  -- 1.
  SELECT array_agg(r.id ORDER BY r.id), array_agg(r.form_id ORDER BY r.id)
    INTO v_ids, v_forms
  FROM public.events_registrations r
  WHERE r.id IN (SELECT (x->>'registration_id')::uuid FROM jsonb_array_elements(p_changes) AS t(x));

  -- 2.
  PERFORM 1
  FROM public.event_registration_forms f
  WHERE f.id = ANY (v_forms)
  ORDER BY f.id
  FOR SHARE OF f;

  -- 3.
  PERFORM 1
  FROM public.events_registrations r
  WHERE r.id = ANY (v_ids)
  ORDER BY r.id
  FOR UPDATE OF r;

  -- 4. (a new statement: it sees anything committed while we waited)
  SELECT count(*) INTO v_found
  FROM public.events_registrations r
  WHERE r.id = ANY (v_ids)
    AND r.event_id = p_event_id
    AND r.form_id IS NOT DISTINCT FROM v_forms[array_position(v_ids, r.id)];
  IF COALESCE(v_found, 0) <> v_total THEN
    RAISE EXCEPTION 'A registration in the list does not belong to this event.'
      USING ERRCODE = '22023';
  END IF;

  -- 5. A stale screen (#4311 r10 LOW 1): someone else changed this row's place
  --    after the dialog loaded. 40001 = the route's 409 "reload and try again".
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_changes) AS t(x)
    JOIN public.events_registrations r ON r.id = (x->>'registration_id')::uuid
    WHERE x ? 'expected_rank'
      AND r.final_rank IS DISTINCT FROM NULLIF(x->>'expected_rank', '')::smallint
  ) THEN
    RAISE EXCEPTION 'The winners changed after this screen was loaded. Reload and try again.'
      USING ERRCODE = '40001';
  END IF;

  -- Pass 1: empty the places that must be emptied — a row being cleared, or a
  -- row whose current place another listed row is taking (a swap or a cycle).
  -- A plain move to a free place is left to pass 2, so its history is one row.
  WITH ch AS (
    SELECT DISTINCT ON ((x->>'registration_id')::uuid)
           (x->>'registration_id')::uuid AS reg_id,
           NULLIF(x->>'final_rank', '')::smallint AS rank
    FROM jsonb_array_elements(p_changes) WITH ORDINALITY AS t(x, ord)
    ORDER BY (x->>'registration_id')::uuid, ord DESC
  )
  UPDATE public.events_registrations r
     SET final_rank = NULL
    FROM ch
   WHERE r.id = ch.reg_id
     AND r.event_id = p_event_id
     AND r.final_rank IS NOT NULL
     AND r.final_rank IS DISTINCT FROM ch.rank
     AND (ch.rank IS NULL
          OR EXISTS (
               SELECT 1
               FROM ch c2
               JOIN public.events_registrations r2 ON r2.id = c2.reg_id
               WHERE c2.reg_id <> ch.reg_id
                 AND c2.rank = r.final_rank
                 -- same set only: a row in another form wanting the same
                 -- place number does not need this one emptied
                 AND COALESCE(r2.form_id, '00000000-0000-0000-0000-000000000000'::uuid)
                   = COALESCE(r.form_id, '00000000-0000-0000-0000-000000000000'::uuid)));

  -- Pass 2: fill the new places.
  WITH ch AS (
    SELECT DISTINCT ON ((x->>'registration_id')::uuid)
           (x->>'registration_id')::uuid AS reg_id,
           NULLIF(x->>'final_rank', '')::smallint AS rank
    FROM jsonb_array_elements(p_changes) WITH ORDINALITY AS t(x, ord)
    ORDER BY (x->>'registration_id')::uuid, ord DESC
  )
  UPDATE public.events_registrations r
     SET final_rank = ch.rank
    FROM ch
   WHERE r.id = ch.reg_id
     AND r.event_id = p_event_id
     AND ch.rank IS NOT NULL
     AND r.final_rank IS DISTINCT FROM ch.rank;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_set_event_registration_ranks(uuid, jsonb) FROM anon, PUBLIC, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_set_event_registration_ranks(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. events_registrations column allowlist
-- ---------------------------------------------------------------------------
-- WHO IS JUDGED: only a client's OWN statement — current_user is anon or
-- authenticated. The function is SECURITY INVOKER on purpose: a statement run
-- inside a SECURITY DEFINER function (fn_set_event_registration_ranks,
-- fn_soi_confirm_acceptance, fn_soi_reject_application, the waitlist
-- functions) runs as that function's owner, as do service-role writes
-- (payments, webhooks, QR, refunds) and the ON DELETE SET NULL of form_id.
-- Those paths make their own authority checks and stay untouched.
--
-- MANAGERS may change anything (final_rank stays with the winners guard):
-- the same helpers the UPDATE policies use —
--   events_reg_admin_update:  is_super_admin() or get_current_user_role() in
--                             (super_admin, admin, administrator, event_coordinator);
--   events_reg_scoped_update: fn_is_event_incharge(event_id) or
--                             fn_is_event_creator(event_id), on the event the
--                             row is in AND on the one it is moved to.
--
-- EVERYONE ELSE the policies let in:
--   * an event committee member (events_reg_committee_member_update;
--     fn_is_event_committee_member) may change only the columns the event ops
--     screens write on their own session:
--       check-in   status, checked_in, checked_in_at, checked_in_by
--                  (lib/services/events/shared/event-ops-service.ts:116, :177)
--       t-shirt    tshirt_collected, tshirt_collected_at, tshirt_collected_by
--                  (event-ops-service.ts:116; event-kit-service.ts:143)
--       certificate certificate_issued, certificate_issued_at, certificate_issued_by
--                  (event-ops-service.ts:116)
--       stalls     stall_id (lib/services/events/marathon/marathon-stall-service.ts:220, :256)
--     and status only as a check-in move: into 'checked_in' from an active
--     status, or 'checked_in' back to 'registered' (the undo);
--   * the registrant on their own row (events_reg_scoped_update by
--     profile_id): no app path writes as the registrant, so nothing but
--     updated_at.
-- Any column not listed, including any added later, is frozen for them —
-- payment_*, certificate links aside from the three above, custom_data,
-- profile_id, event_id, form_id, participant details.
--
-- DELETE is not guarded here: no DELETE policy exists on the table, so no
-- client can delete a registration (the one app delete is a service-role
-- rollback in lib/api/events/tournament/handlers/public-register.ts:278).
CREATE OR REPLACE FUNCTION public.fn_events_registrations_column_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_ops CONSTANT text[] := ARRAY[
    'status', 'checked_in', 'checked_in_at', 'checked_in_by',
    'tshirt_collected', 'tshirt_collected_at', 'tshirt_collected_by',
    'certificate_issued', 'certificate_issued_at', 'certificate_issued_by',
    'stall_id', 'updated_at'
  ];
  c_own CONSTANT text[] := ARRAY['updated_at'];
  c_active CONSTANT text[] := ARRAY['registered', 'confirmed', 'pending'];
  v_allowed text[];
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(public.is_super_admin(), false)
     OR COALESCE(public.get_current_user_role() = ANY (ARRAY['super_admin', 'admin', 'administrator', 'event_coordinator']), false)
     OR ((COALESCE(public.fn_is_event_incharge(OLD.event_id), false)
          OR COALESCE(public.fn_is_event_creator(OLD.event_id), false))
         AND (NEW.event_id IS NOT DISTINCT FROM OLD.event_id
              OR COALESCE(public.fn_is_event_incharge(NEW.event_id), false)
              OR COALESCE(public.fn_is_event_creator(NEW.event_id), false))) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(public.fn_is_event_committee_member(OLD.event_id), false) THEN
    v_allowed := c_ops;
  ELSE
    v_allowed := c_own;
  END IF;

  IF (to_jsonb(NEW) - v_allowed - 'final_rank') IS DISTINCT FROM (to_jsonb(OLD) - v_allowed - 'final_rank') THEN
    RAISE EXCEPTION 'Only the event''s organisers or an administrator can change these registration details.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT ((NEW.status = 'checked_in' AND OLD.status = ANY (c_active))
              OR (OLD.status = 'checked_in' AND NEW.status = 'registered')) THEN
    RAISE EXCEPTION 'Event volunteers can only check a participant in or undo a check-in; ask the organisers for other status changes.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only. (A trigger function's EXECUTE right is not checked when the
-- trigger fires, so this does not stop the trigger.)
REVOKE EXECUTE ON FUNCTION public.fn_events_registrations_column_allowlist() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_events_registrations_column_allowlist ON public.events_registrations;
CREATE TRIGGER trg_events_registrations_column_allowlist
  -- Every UPDATE (no column list): the allowlist must also cover columns
  -- added later.
  BEFORE UPDATE ON public.events_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_events_registrations_column_allowlist();

-- ---------------------------------------------------------------------------
-- 8. Self-check
-- ---------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgname = 'trg_events_registrations_column_allowlist'
      AND t.tgrelid = 'public.events_registrations'::regclass
      AND NOT t.tgisinternal
      AND cardinality(t.tgattr::int2[]) = 0
      AND (t.tgtype & 16) <> 0
  ) THEN
    RAISE EXCEPTION 'column allowlist trigger missing or limited to some columns';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_events_registrations_column_allowlist()'::regprocedure) THEN
    RAISE EXCEPTION 'the allowlist must run as the invoker (it tells client statements apart by current_user)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid IN ('public.fn_tournament_result_lock_division()'::regprocedure,
                  'public.fn_tournament_division_results_lock()'::regprocedure)
      AND NOT (proconfig @> ARRAY['search_path=public, pg_temp'])
  ) THEN
    RAISE EXCEPTION '#4304 functions still lack pg_temp in their search_path';
  END IF;
  IF has_function_privilege('anon', 'public.fn_record_result(uuid, text, uuid, integer, integer, jsonb, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_tournament_set_fixture_mode(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_set_event_registration_ranks(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute a replaced function';
  END IF;
END
$assert$;
