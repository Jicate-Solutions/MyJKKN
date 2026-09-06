-- ============================================================================
-- Fresher Induction — a session resource person can read the speaker links of
-- ALL sessions in their event (not just their own rows)
-- File: 20260702151000_induction_speakers_read_co_speakers.sql | Date: 2026-07-02
--
-- The detail page now shows each session's linked resource persons on the
-- session card. ess_select only allowed self-rows / induction.view holders, so
-- a pure resource person would see only their own name and no co-speakers.
-- Additive SELECT policy; writes stay RPC-only.
-- ============================================================================

-- Is the given session part of an event where the caller is a credited speaker?
-- SECURITY DEFINER so the RLS policy below can traverse event_sessions (whose
-- own RLS is admin-only) without recursion.
CREATE OR REPLACE FUNCTION public.fn_induction_session_in_my_speaker_event(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_sessions es
    JOIN public.event_sessions mine ON mine.event_id = es.event_id
    JOIN public.event_session_speakers sp ON sp.session_id = mine.id AND sp.profile_id = auth.uid()
    WHERE es.id = p_session_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_in_my_speaker_event(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_in_my_speaker_event(uuid) TO authenticated;

DROP POLICY IF EXISTS ess_event_speaker_read ON public.event_session_speakers;
CREATE POLICY ess_event_speaker_read ON public.event_session_speakers
  FOR SELECT TO authenticated
  USING (public.fn_induction_session_in_my_speaker_event(session_id));
