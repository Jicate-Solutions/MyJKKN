-- 20260629120000_induction_session_venue_resource.sql
-- Induction sessions: STRICT resource-only venue.
--
-- Lets a coordinator pick a session's venue from the canonical Resource
-- Management "Spaces & Venues" registry instead of typing it free-text. The
-- chosen resource id is written to event_sessions.venue_resource_id and
-- venue_text is auto-filled SERVER-SIDE from the resource's real name, so the
-- stored display name can never drift from the registry and there is NO
-- free-text path.
--
-- VENUE SCOPE = INSTITUTION-SCOPED (the coordinator's own institution).
-- The resources SELECT RLS (policy "resources_select_institution") restricts an
-- authenticated browser client to rooms of the caller's own profile.institution_id,
-- so the reused VenueRoomPicker naturally surfaces the coordinator's college's
-- rooms — which is the induction's college in the normal case (a college runs its
-- own induction). The write guard therefore mirrors the canonical cross-tenant
-- pattern (and fn_induction_set_session_speakers): the chosen resource must be a
-- real, AVAILABLE "Spaces & Venues" room AND role_has_institution_access() of its
-- institution must hold (super/admin bypass). True cross-campus venue selection
-- would require a deliberate, Director-approved widening of the resources SELECT
-- RLS and is intentionally OUT OF SCOPE here.
--
-- Why DROP then CREATE (not plain CREATE OR REPLACE):
--   * fn_induction_upsert_session gains a 14th parameter (p_venue_resource_id).
--     Adding a parameter creates a NEW overload — both signatures would coexist
--     and PostgREST cannot disambiguate a named call that omits it. Drop the old
--     13-arg signature first so exactly one function remains.
--   * fn_induction_list_sessions gains a return column (venue_resource_id).
--     Postgres forbids changing a function's return type via CREATE OR REPLACE.
-- Both functions are re-locked from anon afterwards (Supabase default-grants
-- anon EXECUTE on every new public function).
--
-- Deploy-window note: p_venue_resource_id is DEFAULTed only so the overload
-- resolves cleanly for the currently deployed code (which omits it) until the
-- matching UI ships. p_venue_text is now IGNORED, so any free-text venue written
-- by the OLD UI between this migration applying and the new code deploying is
-- coerced to NULL — apply this migration and deploy the matching code in the same
-- change window to avoid a brief free-text-venue gap.

-- ============================================================================
-- 1. fn_induction_upsert_session — add p_venue_resource_id (STRICT venue write)
-- ============================================================================
DROP FUNCTION IF EXISTS public.fn_induction_upsert_session(
  UUID, UUID, INTEGER, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER);

CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session(
  p_event_id          UUID,
  p_session_id        UUID,
  p_day_number        INTEGER,
  p_batch_id          UUID,
  p_start_at          TIMESTAMPTZ,
  p_end_at            TIMESTAMPTZ,
  p_title             TEXT,
  p_description       TEXT  DEFAULT NULL,
  p_venue_text        TEXT  DEFAULT NULL,   -- IGNORED: venue_text is derived from the chosen room
  p_speaker_text      TEXT  DEFAULT NULL,
  p_outcome_text      TEXT  DEFAULT NULL,
  p_resource_links    JSONB DEFAULT '[]'::jsonb,
  p_session_order     INTEGER DEFAULT 1,
  p_venue_resource_id UUID  DEFAULT NULL    -- STRICT: the only way to set a venue
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
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

  -- On update, read the currently-stored venue so we only re-validate when the
  -- room actually CHANGES. (Otherwise a saved room that later goes to maintenance
  -- / is deleted would block unrelated edits like fixing the title or time.)
  IF p_session_id IS NOT NULL THEN
    SELECT es.venue_resource_id, es.venue_text
      INTO v_existing_res, v_existing_text
    FROM public.event_sessions es
    WHERE es.id = p_session_id AND es.event_id = p_event_id;
  END IF;

  -- STRICT venue resolution.
  IF p_venue_resource_id IS NULL THEN
    v_venue_text := NULL;                                   -- cleared / none (no free text)
  ELSIF p_session_id IS NOT NULL AND p_venue_resource_id IS NOT DISTINCT FROM v_existing_res THEN
    v_venue_text := v_existing_text;                        -- room unchanged → keep stored name, skip re-validation
  ELSE
    -- Newly set or changed room: it must be a real, AVAILABLE "Spaces & Venues"
    -- room in an institution the caller can access. venue_text is derived from
    -- the registry name (authoritative; no free-text path).
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
    IF NOT (is_super_admin() OR is_admin() OR role_has_institution_access(v_res_inst)) THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: no access to that venue''s institution';
    END IF;
    v_venue_text := v_res_name;                             -- authoritative display name
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO public.event_sessions
      (event_id, title, description, start_at, end_at, day_number, session_order,
       venue_text, venue_resource_id, speaker_text, outcome_text, resource_links,
       batch_id, status, created_by)
    VALUES
      (p_event_id, btrim(p_title), p_description, p_start_at, p_end_at, p_day_number,
       COALESCE(p_session_order, 1), v_venue_text, p_venue_resource_id, p_speaker_text,
       p_outcome_text, COALESCE(p_resource_links, '[]'::jsonb), p_batch_id, 'scheduled', auth.uid())
    RETURNING id INTO v_sid;
  ELSE
    UPDATE public.event_sessions SET
      title = btrim(p_title), description = p_description,
      start_at = p_start_at, end_at = p_end_at, day_number = p_day_number,
      session_order = COALESCE(p_session_order, session_order),
      venue_text = v_venue_text, venue_resource_id = p_venue_resource_id,
      speaker_text = p_speaker_text, outcome_text = p_outcome_text,
      resource_links = COALESCE(p_resource_links, '[]'::jsonb),
      batch_id = p_batch_id, updated_at = now()
    WHERE id = p_session_id AND event_id = p_event_id
    RETURNING id INTO v_sid;
    IF v_sid IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: session not found for this induction'; END IF;
  END IF;
  RETURN v_sid;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_upsert_session(
  UUID, UUID, INTEGER, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, UUID)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_upsert_session(
  UUID, UUID, INTEGER, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, UUID)
  TO authenticated;

-- ============================================================================
-- 2. fn_induction_list_sessions — return venue_resource_id (for edit pre-fill)
-- ============================================================================
DROP FUNCTION IF EXISTS public.fn_induction_list_sessions(UUID);

CREATE OR REPLACE FUNCTION public.fn_induction_list_sessions(p_event_id UUID)
RETURNS TABLE (
  id                UUID,
  day_number        INTEGER,
  session_order     INTEGER,
  batch_id          UUID,
  batch_label       TEXT,
  start_at          TIMESTAMPTZ,
  end_at            TIMESTAMPTZ,
  title             TEXT,
  description       TEXT,
  venue_text        TEXT,
  venue_resource_id UUID,
  speaker_text      TEXT,
  outcome_text      TEXT,
  resource_links    JSONB,
  status            TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst UUID;
  v_is_coordinator BOOLEAN;
  v_my_learner UUID;
  v_my_batch UUID;
  v_enrolled BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_list_sessions: not authenticated'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_list_sessions: not an induction event'; END IF;

  v_is_coordinator := is_super_admin() OR is_admin()
    OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst));

  v_my_learner := get_my_learner_id();
  SELECT true, ie.batch_id INTO v_enrolled, v_my_batch
  FROM public.induction_enrollment ie
  WHERE ie.event_id = p_event_id AND ie.learner_id = v_my_learner;

  IF NOT v_is_coordinator AND NOT COALESCE(v_enrolled, false) THEN
    RAISE EXCEPTION 'fn_induction_list_sessions: not authorized';
  END IF;

  RETURN QUERY
  SELECT s.id::uuid, s.day_number::integer, s.session_order::integer,
         s.batch_id::uuid, b.label::text,
         s.start_at, s.end_at,
         s.title::text, s.description::text, s.venue_text::text,
         s.venue_resource_id::uuid,
         s.speaker_text::text, s.outcome_text::text,
         COALESCE(s.resource_links, '[]'::jsonb), s.status::text
  FROM public.event_sessions s
  LEFT JOIN public.induction_batches b ON b.id = s.batch_id
  WHERE s.event_id = p_event_id
    -- students only see their batch's sessions + combined (batch_id NULL)
    AND (v_is_coordinator OR s.batch_id IS NULL OR s.batch_id = v_my_batch)
  ORDER BY s.day_number NULLS LAST, s.start_at NULLS LAST, s.session_order;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_list_sessions(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_list_sessions(UUID) TO authenticated;
