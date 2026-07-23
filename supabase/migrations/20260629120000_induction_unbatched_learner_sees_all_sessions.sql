-- ============================================================================
-- Induction: an UNBATCHED enrolled learner must see the full schedule
-- Date: 2026-06-29
-- Spec: specs/pre-onboarding-induction-access-2026-06-29.md
--
-- Bug: fn_induction_list_sessions filtered student rows with
--   (s.batch_id IS NULL OR s.batch_id = v_my_batch)
-- When a learner has no batch assigned (v_my_batch IS NULL) — e.g. auto-enrolled
-- but not yet split — `s.batch_id = NULL` is never true, so EVERY batch-specific
-- session is hidden. With a batch-split schedule (days 2-9 are batch A/B specific),
-- the learner only saw the combined days (1, 6, part of 9) — "not all days".
--
-- Fix: when the learner is unbatched, show ALL sessions (the whole schedule).
-- Once they ARE assigned a batch, they narrow to combined + their batch as before.
-- One-line change to the WHERE clause (added `v_my_batch IS NULL`); rebuilt from
-- the live definition.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_induction_list_sessions(p_event_id uuid)
 RETURNS TABLE(id uuid, day_number integer, session_order integer, batch_id uuid, batch_label text, start_at timestamp with time zone, end_at timestamp with time zone, title text, description text, venue_text text, venue_resource_id uuid, speaker_text text, outcome_text text, resource_links jsonb, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- coordinator: all; batched learner: combined + their batch; UNBATCHED
    -- learner (v_my_batch IS NULL): the whole schedule, so no day disappears.
    AND (v_is_coordinator OR v_my_batch IS NULL OR s.batch_id IS NULL OR s.batch_id = v_my_batch)
  ORDER BY s.day_number NULLS LAST, s.start_at NULLS LAST, s.session_order;
END $function$;
