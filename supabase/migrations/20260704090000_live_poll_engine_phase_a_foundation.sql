-- 20260704090000_live_poll_engine_phase_a_foundation.sql
-- Phase A (foundation) of the Live Poll Engine generalization.
-- Spec: specs/live-poll-engine-generalization-2026-07-04.md
--
-- ADDITIVE + BEHAVIOR-PRESERVING. Adds a polymorphic context to the poll and two
-- dispatcher functions. NO existing RPC is rewired in this migration, so induction
-- poll behavior is byte-for-byte unchanged. The dispatchers exist so Phase B/C can
-- plug in the class / CDC-training / HR-training branches without touching the engine.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Polymorphic context on the poll. Existing rows are induction sessions;
--    backfill context_id = session_id. Adding a column with a constant default is a
--    metadata-only change (no table rewrite) on PG11+.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.induction_session_poll
  ADD COLUMN IF NOT EXISTS context_type text NOT NULL DEFAULT 'induction_session',
  ADD COLUMN IF NOT EXISTS context_id uuid;

UPDATE public.induction_session_poll SET context_id = session_id WHERE context_id IS NULL;
ALTER TABLE public.induction_session_poll ALTER COLUMN context_id SET NOT NULL;

ALTER TABLE public.induction_session_poll DROP CONSTRAINT IF EXISTS induction_session_poll_context_type_chk;
ALTER TABLE public.induction_session_poll ADD CONSTRAINT induction_session_poll_context_type_chk
  CHECK (context_type IN ('induction_session','class_session','cdc_training_session','hr_training_session'));

-- Backward-compat bridge: the existing induction upsert RPC inserts without a
-- context_id (it only knows session_id). This BEFORE-INSERT trigger fills it, so
-- context_id can be NOT NULL without rewiring any RPC. Future non-induction inserts
-- set context_id explicitly, so the trigger leaves them untouched. Only fires on
-- INSERT, so ON CONFLICT ... DO UPDATE on existing (already-backfilled) rows is safe.
CREATE OR REPLACE FUNCTION public.fn_live_poll_set_context()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.context_id IS NULL THEN NEW.context_id := NEW.session_id; END IF;
  IF NEW.context_type IS NULL THEN NEW.context_type := 'induction_session'; END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_live_poll_set_context ON public.induction_session_poll;
CREATE TRIGGER trg_live_poll_set_context BEFORE INSERT ON public.induction_session_poll
  FOR EACH ROW EXECUTE FUNCTION public.fn_live_poll_set_context();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Dispatcher — who can MANAGE a poll in a given context. Routes by context_type
--    to the per-context authority. Induction delegates to the existing resolver, so
--    the answer is identical to today for induction polls.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_live_poll_can_manage(p_context_type text, p_context_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_context_id IS NULL THEN RETURN false; END IF;
  CASE p_context_type
    WHEN 'induction_session' THEN
      RETURN public._fn_induction_can_manage_session_pulse(p_context_id);
    -- 'class_session'        -> Phase B (period facilitator)
    -- 'cdc_training_session' -> Phase C (trainer)
    -- 'hr_training_session'  -> Phase C (trainer)
    ELSE RETURN false;
  END CASE;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_can_manage(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_can_manage(text, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Dispatcher — who can ANSWER (is in the audience) for a given context. This is
--    context-keyed AUDIENCE MEMBERSHIP only; the poll-open/visibility check stays in
--    the calling RPC. Induction = learner enrolled in the event that owns the session
--    (same predicate the poll-keyed _fn_induction_learner_can_answer_poll uses).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_live_poll_can_answer(p_context_type text, p_context_id uuid, p_learner uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_context_id IS NULL OR p_learner IS NULL THEN RETURN false; END IF;
  CASE p_context_type
    WHEN 'induction_session' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.event_sessions es
        JOIN public.induction_enrollment ie ON ie.event_id = es.event_id AND ie.learner_id = p_learner
        WHERE es.id = p_context_id);
    -- 'class_session'        -> Phase B (section students)
    -- 'cdc_training_session' -> Phase C (cdc_training_enrollments)
    -- 'hr_training_session'  -> Phase C (hr_training_enrollments)
    ELSE RETURN false;
  END CASE;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_can_answer(text, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_can_answer(text, uuid, uuid) TO authenticated;
