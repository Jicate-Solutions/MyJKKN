-- ============================================================================
-- Induction — restore the event-coordinator clause on the speaker write path
-- File: 20260909020000_induction_set_session_speakers_restore_coordinator.sql
--
-- THE DEFECT (reported: JKKN College of Pharmacy, "Fresher Induction - 2026 -
-- Pharmacy", event 91c0d6e9-…; measured on production)
--   The induction's appointed coordinators — MRS. KOWSALYA M (role `hod`) and
--   MR. ESWARAMOORTHI M (role `faculty`) — could add a session but could NOT
--   assign its facilitator. Saving raised
--       fn_induction_set_session_speakers: not authorized
--   which the dialog surfaces as "Couldn't save session: …" AFTER the session
--   row itself has already been written — so the session appears in the list
--   with no resource person against it and no obvious reason why.
--
-- WHY
--   Neither `hod` nor `faculty` carries induction.manage; only `induction_lead`
--   does. An appointed coordinator's authority comes from
--   fn_induction_is_event_coordinator(event_id), which
--   20260730130000_induction_coordinator_retrofit_sessions.sql OR'd into this
--   function's gate along with five siblings.
--
--   20260826020000_induction_guest_speakers.sql then rewrote this function to
--   route guest identities. It rebuilt the gate from the PRE-retrofit text and
--   the coordinator clause was lost — the one function of the six where that
--   happened (the 2026-08-17 / 08-26 / 08-27 migrations all carried it forward
--   correctly for session_roster, mark_attendance, upsert_session and
--   recompute_completion).
--
--   The evidence is unambiguous: ESWARAMOORTHI wrote three speaker rows himself
--   on 2026-08-19, and across the WHOLE cluster not one event_session_speakers
--   row has been written since 2026-08-26. Everyone without induction.manage
--   has been locked out of the speaker write path since that migration landed.
--
-- THE FIX
--   ONE line: the gate regains `OR public.fn_induction_is_event_coordinator(
--   v_event)`. The body below is otherwise the live 20260826020000 definition
--   verbatim — guest routing, the cross-tenant row filter, replace-set
--   semantics, the signature and every grant are untouched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_set_session_speakers(
  p_session_id   uuid,
  p_profile_ids  uuid[],
  p_source_label text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst    uuid;
  v_event   uuid;   -- ADDED: needed by the coordinator check
  v_ids     uuid[];
  v_people  integer;
  v_guests  integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not authenticated';
  END IF;
  SELECT es.event_id, ip.institution_id INTO v_event, v_inst   -- ADDED: es.event_id
  FROM public.event_sessions es
  JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not an induction session';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- RESTORED
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not authorized';
  END IF;

  v_ids := COALESCE(p_profile_ids, ARRAY[]::uuid[]);

  DELETE FROM public.event_session_speakers WHERE session_id = p_session_id;

  -- Account-holders. Unchanged rule: only users the caller can actually reach,
  -- so a coordinator cannot link a person from an institution they have no
  -- access to (cross-tenant link injection).
  INSERT INTO public.event_session_speakers (session_id, profile_id, source_label, created_by)
  SELECT p_session_id, sid, p_source_label, auth.uid()
  FROM unnest(v_ids) AS sid
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = sid
                AND (is_super_admin() OR is_admin() OR role_has_institution_access(p.institution_id)))
  ON CONFLICT (session_id, profile_id) DO NOTHING;
  GET DIAGNOSTICS v_people = ROW_COUNT;

  -- Guests. Cluster-wide by decision D11, so there is no institution test here;
  -- authority to write came from the induction gate above. An id that is a
  -- profile is never treated as a guest.
  INSERT INTO public.event_session_speakers (session_id, guest_speaker_id, source_label, created_by)
  SELECT p_session_id, sid, p_source_label, auth.uid()
  FROM unnest(v_ids) AS sid
  WHERE EXISTS (SELECT 1 FROM public.event_guest_speakers g WHERE g.id = sid)
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = sid)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_guests = ROW_COUNT;

  RETURN v_people + v_guests;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_set_session_speakers(uuid, uuid[], text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_set_session_speakers(uuid, uuid[], text) TO authenticated;

NOTIFY pgrst, 'reload schema';
