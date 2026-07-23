-- Migration: AI Assistant pilot polish — feedback flag, own-history, drain health
-- Date: 2026-07-12
-- Additive + safe. All access is via auth.uid()-scoped SECURITY DEFINER RPCs;
-- anon is revoked on every one. Supports pilot decisions:
--   #4 "looks wrong" flag → log for admin review (no user-facing alert)
--   #7 each user can see their OWN past questions
--   #5 admin offline banner (reads a heartbeat the Windows chat drain stamps)

-- ---------------------------------------------------------------------------
-- 1) "Looks wrong" feedback (decision #4). Table is locked; all access via RPC.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_query_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     uuid NOT NULL REFERENCES public.ai_jobs(id) ON DELETE CASCADE,
  flagged_by uuid NOT NULL,               -- auth.uid() of the flagger (no cross-schema FK)
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_query_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_query_feedback FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS ix_ai_query_feedback_created ON public.ai_query_feedback (created_at DESC);

-- Flag YOUR OWN answer as looks-wrong (can only flag a job you requested).
CREATE OR REPLACE FUNCTION public.fn_ai_flag_answer(p_job_id uuid, p_note text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_jobs WHERE id = p_job_id AND requested_by = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not your answer');
  END IF;
  INSERT INTO public.ai_query_feedback (job_id, flagged_by, note)
  VALUES (p_job_id, v_uid, NULLIF(btrim(COALESCE(p_note, '')), ''));
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_flag_answer(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_flag_answer(uuid, text) TO authenticated, service_role;

-- Admin review of flags (decision #19: restricted to top admins). Super-admin only.
CREATE OR REPLACE FUNCTION public.fn_ai_feedback_list(p_limit int DEFAULT 50)
 RETURNS TABLE(id uuid, job_id uuid, flagged_by uuid, flagger_email text, note text,
               question text, answer text, created_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT f.id, f.job_id, f.flagged_by, u.email::text, f.note,
         j.payload->>'message', j.result->>'answer', f.created_at
  FROM public.ai_query_feedback f
  JOIN public.ai_jobs j ON j.id = f.job_id
  LEFT JOIN auth.users u ON u.id = f.flagged_by
  ORDER BY f.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_feedback_list(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_feedback_list(int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Own chat history (decision #7). Requester-scoped; a user sees only their own.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_my_chat_history(p_limit int DEFAULT 20)
 RETURNS TABLE(id uuid, question text, answer text, status text, asked_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT j.id, j.payload->>'message', j.result->>'answer', j.status, j.requested_at
  FROM public.ai_jobs j
  WHERE j.requested_by = v_uid AND j.job_type = 'ai_query.chat'
  ORDER BY j.requested_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_my_chat_history(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_my_chat_history(int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Chat-drain health for the admin offline banner (decision #5).
-- Reads a heartbeat the Windows chat drain stamps each cycle
-- (ai_routine_schedules.routine_id = 'maxlane:chat-drain').
-- online: true = fresh (<3 min), false = stale (drain down), null = never stamped
-- yet (banner stays INERT so there is no false "offline" before the heartbeat exists).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_chat_drain_health()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_last timestamptz;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT last_fired_at INTO v_last FROM public.ai_routine_schedules WHERE routine_id = 'maxlane:chat-drain';
  IF v_last IS NULL THEN RETURN jsonb_build_object('online', NULL, 'last_seen', NULL); END IF;
  RETURN jsonb_build_object('online', v_last > now() - interval '3 minutes', 'last_seen', v_last);
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_chat_drain_health() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_chat_drain_health() TO authenticated, service_role;
