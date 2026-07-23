-- ============================================================================
-- Fresher Induction — Phase 1c: session authoring (event_sessions CRUD)
-- File: 20260627180000_induction_phase1c_session_authoring.sql
-- Date: 2026-06-27
-- Spec: specs/induction-program-module-2026-06-27.md
-- Adds: speaker_text col; ENABLES RLS on event_sessions (was OFF — authenticated
--   cross-tenant hole; tournament writes via service-role so unaffected); and 3
--   SECURITY DEFINER, anon-revoked, induction-scoped RPCs (list/upsert/delete).
-- Verified live: event_sessions RLS was disabled + only consumer is the tournament
--   matches route using the service-role client (RLS-bypassing).
-- ============================================================================

-- 1. speaker_text (free text: staff / external / department / student-group)
ALTER TABLE public.event_sessions ADD COLUMN IF NOT EXISTS speaker_text TEXT;

-- 2. Close the hole: enable RLS. Raw-table direct access = admins only;
--    induction access is via the DEFINER RPCs below; tournament uses service-role.
ALTER TABLE public.event_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_sessions_admin ON public.event_sessions;
CREATE POLICY event_sessions_admin ON public.event_sessions FOR ALL
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 3. fn_induction_list_sessions — coordinator (all) or enrolled student (their
--    batch + combined). RETURNS TABLE with every column cast to its declared
--    type (DEFINER RETURNS-TABLE discipline). Verify under authenticated render.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_list_sessions(p_event_id UUID)
RETURNS TABLE (
  id            UUID,
  day_number    INTEGER,
  session_order INTEGER,
  batch_id      UUID,
  batch_label   TEXT,
  start_at      TIMESTAMPTZ,
  end_at        TIMESTAMPTZ,
  title         TEXT,
  description   TEXT,
  venue_text    TEXT,
  speaker_text  TEXT,
  outcome_text  TEXT,
  resource_links JSONB,
  status        TEXT
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

-- ----------------------------------------------------------------------------
-- 4. fn_induction_upsert_session — insert (p_session_id NULL) or update.
--    Gated: induction.manage + institution access; event must be induction.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session(
  p_event_id      UUID,
  p_session_id    UUID,
  p_day_number    INTEGER,
  p_batch_id      UUID,
  p_start_at      TIMESTAMPTZ,
  p_end_at        TIMESTAMPTZ,
  p_title         TEXT,
  p_description   TEXT DEFAULT NULL,
  p_venue_text    TEXT DEFAULT NULL,
  p_speaker_text  TEXT DEFAULT NULL,
  p_outcome_text  TEXT DEFAULT NULL,
  p_resource_links JSONB DEFAULT '[]'::jsonb,
  p_session_order INTEGER DEFAULT 1
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst UUID;
  v_sid  UUID;
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

  IF p_session_id IS NULL THEN
    INSERT INTO public.event_sessions
      (event_id, title, description, start_at, end_at, day_number, session_order,
       venue_text, speaker_text, outcome_text, resource_links, batch_id, status, created_by)
    VALUES
      (p_event_id, btrim(p_title), p_description, p_start_at, p_end_at, p_day_number,
       COALESCE(p_session_order, 1), p_venue_text, p_speaker_text, p_outcome_text,
       COALESCE(p_resource_links, '[]'::jsonb), p_batch_id, 'scheduled', auth.uid())
    RETURNING id INTO v_sid;
  ELSE
    UPDATE public.event_sessions SET
      title = btrim(p_title), description = p_description,
      start_at = p_start_at, end_at = p_end_at, day_number = p_day_number,
      session_order = COALESCE(p_session_order, session_order),
      venue_text = p_venue_text, speaker_text = p_speaker_text,
      outcome_text = p_outcome_text,
      resource_links = COALESCE(p_resource_links, '[]'::jsonb),
      batch_id = p_batch_id, updated_at = now()
    WHERE id = p_session_id AND event_id = p_event_id
    RETURNING id INTO v_sid;
    IF v_sid IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: session not found for this induction'; END IF;
  END IF;
  RETURN v_sid;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_upsert_session(UUID,UUID,INTEGER,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_upsert_session(UUID,UUID,INTEGER,UUID,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. fn_induction_delete_session — gated delete (induction.manage + access).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_delete_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT ip.institution_id INTO v_inst
  FROM public.event_sessions s
  JOIN public.induction_programs ip ON ip.event_id = s.event_id
  WHERE s.id = p_session_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_delete_session: session not found / not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_delete_session: not authorized';
  END IF;
  DELETE FROM public.event_sessions WHERE id = p_session_id;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_delete_session(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_delete_session(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
