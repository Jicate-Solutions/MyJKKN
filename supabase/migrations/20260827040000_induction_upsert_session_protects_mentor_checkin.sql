-- ============================================================================
-- Fresher Induction — upsert_session must never reclassify a mentor check-in
-- File: 20260827040000_induction_upsert_session_protects_mentor_checkin.sql
-- Date: 2026-08-27
--
-- BUG introduced by 20260827030000 + the Registration checkbox: the session form
-- owns that checkbox, so it always sends p_kind explicitly ('registration' when
-- ticked, '' when not). fn_induction_list_sessions returns EVERY session of the
-- event — including the 10 live rows with kind = 'mentor_checkin' (monthly Senior
-- Peer Mentor check-ins, authored by fn_induction_create_training_session) — so a
-- coordinator opening one of those in the session list and pressing Save would
-- send p_kind = '' and silently clear it. The check-in would become an ordinary
-- session: counted in the attendance/feedback completion rollup and offered to
-- freshers, with nothing on screen to explain what changed.
--
-- Measured live 2026-08-18: 10 mentor_checkin rows on induction event
-- d0d995a9-8ab4-4ee8-a90b-e63f42a29d46, all reachable from that event's console.
--
-- FIX: `kind` is now WRITE-ONCE with respect to 'mentor_checkin'. This RPC could
-- already never SET that value (it rejects any kind other than 'registration');
-- now it can't CLEAR it either. The guard lives in the function rather than the
-- form because the form is not the only possible caller, and a silent data
-- reclassification must not depend on client discipline.
--
-- Only the UPDATE's `kind =` expression changes; the rest is 20260827030000's
-- definition verbatim.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session(
  p_event_id uuid,
  p_session_id uuid,
  p_day_number integer,
  p_batch_id uuid,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_title text,
  p_description text DEFAULT NULL::text,
  p_venue_text text DEFAULT NULL::text,
  p_speaker_text text DEFAULT NULL::text,
  p_outcome_text text DEFAULT NULL::text,
  p_resource_links jsonb DEFAULT '[]'::jsonb,
  p_session_order integer DEFAULT 1,
  p_venue_resource_id uuid DEFAULT NULL::uuid,
  p_kind text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst          UUID;
  v_sid           UUID;
  v_existing_res  UUID;
  v_existing_text TEXT;
  v_venue_text    TEXT;
  v_res_name      TEXT;
  v_res_status    TEXT;
  v_res_inst      UUID;
  v_res_is_venue  BOOLEAN;
  v_kind          TEXT;
BEGIN
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: not authorized';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'fn_induction_upsert_session: title required'; END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: end must be after start';
  END IF;
  IF p_batch_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.induction_batches b WHERE b.id = p_batch_id AND b.event_id = p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: batch does not belong to this induction';
  END IF;
  -- this RPC authors normal and registration sessions only. 'mentor_checkin'
  -- is owned by fn_induction_create_training_session and must not be settable here.
  v_kind := NULLIF(btrim(COALESCE(p_kind, '')), '');
  IF v_kind IS NOT NULL AND v_kind <> 'registration' THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: unsupported session kind %', v_kind;
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT es.venue_resource_id, es.venue_text
      INTO v_existing_res, v_existing_text
    FROM public.event_sessions es
    WHERE es.id = p_session_id AND es.event_id = p_event_id;
  END IF;

  IF p_venue_resource_id IS NULL THEN
    v_venue_text := NULL;
  ELSIF p_session_id IS NOT NULL AND p_venue_resource_id IS NOT DISTINCT FROM v_existing_res THEN
    v_venue_text := v_existing_text;
  ELSE
    SELECT r.name,
           r.status,
           r.institution_id,
           EXISTS (
             SELECT 1 FROM public.resource_parent_categories pc
             WHERE pc.id = r.parent_category_id
               AND lower(btrim(pc.name)) = 'spaces & venues'
           )
      INTO v_res_name, v_res_status, v_res_inst, v_res_is_venue
    FROM public.resources r
    WHERE r.id = p_venue_resource_id;

    IF v_res_name IS NULL THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: venue resource not found';
    END IF;
    IF NOT v_res_is_venue THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: resource is not a Spaces & Venues room';
    END IF;
    IF v_res_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: venue is not available';
    END IF;
    -- NOT touched: this gates whether the caller may use THIS VENUE (its own
    -- institution), an unrelated concern from "can this caller manage this induction."
    IF NOT (is_super_admin() OR is_admin() OR role_has_institution_access(v_res_inst)) THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: no access to that venue''s institution';
    END IF;
    v_venue_text := v_res_name;
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO public.event_sessions
      (event_id, title, description, start_at, end_at, day_number, session_order,
       venue_text, venue_resource_id, speaker_text, outcome_text, resource_links,
       batch_id, status, created_by, kind)
    VALUES
      (p_event_id, btrim(p_title), p_description, p_start_at, p_end_at, p_day_number,
       COALESCE(p_session_order, 1), v_venue_text, p_venue_resource_id, p_speaker_text,
       p_outcome_text, COALESCE(p_resource_links, '[]'::jsonb), p_batch_id, 'scheduled', auth.uid(),
       v_kind)
    RETURNING id INTO v_sid;
  ELSE
    UPDATE public.event_sessions SET
      title = btrim(p_title), description = p_description,
      start_at = p_start_at, end_at = p_end_at, day_number = p_day_number,
      session_order = COALESCE(p_session_order, session_order),
      venue_text = v_venue_text, venue_resource_id = p_venue_resource_id,
      speaker_text = p_speaker_text, outcome_text = p_outcome_text,
      resource_links = COALESCE(p_resource_links, '[]'::jsonb),
      -- CHANGED (this migration): a stored 'mentor_checkin' is immovable — the
      -- session form always sends p_kind, and clearing it here would silently
      -- turn a monthly mentor check-in into an ordinary induction session.
      -- Otherwise: p_kind NULL leaves kind untouched, '' clears it back to a
      -- normal session, 'registration' sets the desk.
      kind = CASE
               WHEN kind = 'mentor_checkin' THEN kind
               WHEN p_kind IS NULL          THEN kind
               ELSE v_kind
             END,
      batch_id = p_batch_id, updated_at = now()
    WHERE id = p_session_id AND event_id = p_event_id
    RETURNING id INTO v_sid;
    IF v_sid IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: session not found for this induction'; END IF;
  END IF;
  RETURN v_sid;
END $function$;

NOTIFY pgrst, 'reload schema';
