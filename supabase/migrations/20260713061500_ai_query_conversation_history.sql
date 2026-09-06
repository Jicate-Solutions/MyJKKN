-- Migration: AI Assistant — full conversation history (click a past chat to
-- reopen the whole thread and continue it).
-- Date: 2026-07-13
--
-- Background: chat questions are ai_jobs rows (job_type='ai_query.chat') whose
-- payload.conversation_id groups a multi-turn thread. Historically the FIRST turn
-- of every conversation was enqueued with conversation_id = null (the client only
-- learned the id from the response), so most past questions are ungrouped one-shots.
--
-- This migration:
--   1) Backfills every null conversation_id to the job's own id, so each old
--      one-shot becomes a self-contained 1-turn conversation that can be reopened
--      (and grouping/continuation logic can assume conversation_id is never null).
--   2) Adds two auth.uid()-scoped SECURITY DEFINER RPCs:
--      - fn_ai_my_conversations : the caller's conversation list (one row/thread)
--      - fn_ai_conversation_turns: all turns of ONE of the caller's conversations
--   Both pin auth.uid() and filter requested_by = auth.uid() (no IDOR: passing
--   another user's conversation_id returns nothing). anon EXECUTE revoked.

-- ---------------------------------------------------------------------------
-- 1) Backfill: null conversation_id -> job id (make old one-shots 1-turn threads)
-- ---------------------------------------------------------------------------
UPDATE public.ai_jobs
SET payload = jsonb_set(payload, '{conversation_id}', to_jsonb(id::text), true)
WHERE job_type = 'ai_query.chat'
  AND (payload->>'conversation_id') IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Conversation list (one row per thread), newest activity first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_my_conversations(p_limit int DEFAULT 30)
 RETURNS TABLE(conversation_id uuid, title text, turn_count bigint,
               last_at timestamptz, last_status text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  WITH mine AS (
    SELECT (j.payload->>'conversation_id')::uuid AS cid,
           j.payload->>'message'                 AS q,
           j.status,
           j.requested_at
    FROM public.ai_jobs j
    WHERE j.requested_by = v_uid
      AND j.job_type = 'ai_query.chat'
      AND (j.payload->>'conversation_id') IS NOT NULL
  )
  SELECT m.cid,
         (array_agg(m.q      ORDER BY m.requested_at ASC))[1]  AS title,
         count(*)::bigint                                       AS turn_count,
         max(m.requested_at)                                    AS last_at,
         (array_agg(m.status ORDER BY m.requested_at DESC))[1]  AS last_status
  FROM mine m
  GROUP BY m.cid
  ORDER BY max(m.requested_at) DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_my_conversations(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_my_conversations(int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) All turns of ONE of the caller's conversations, oldest-first.
--    IDOR-safe: filters requested_by = auth.uid(), so a spoofed conversation_id
--    belonging to someone else simply returns zero rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_conversation_turns(p_conversation_id uuid)
 RETURNS TABLE(id uuid, question text, answer text, status text, asked_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT j.id,
         j.payload->>'message' AS question,
         j.result->>'answer'   AS answer,
         j.status,
         j.requested_at        AS asked_at
  FROM public.ai_jobs j
  WHERE j.requested_by = v_uid
    AND j.job_type = 'ai_query.chat'
    AND (j.payload->>'conversation_id')::uuid = p_conversation_id
  ORDER BY j.requested_at ASC
  LIMIT 200;
END; $$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_conversation_turns(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_conversation_turns(uuid) TO authenticated, service_role;
