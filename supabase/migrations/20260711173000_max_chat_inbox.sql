-- =====================================================================
-- Max-lane chat INBOX — finished answers wait for the seat owner
-- Migration: 2026-07-11
-- =====================================================================
-- Director edge-case decision (interview r2, 2026-07-11): if the tab/phone
-- dies while a Max answer is being generated, the answer must NOT be lost.
-- The runner already persists the answer on the queue row (status='done');
-- this adds a delivery stamp + a requester-scoped "inbox" that the chat
-- page drains on load. Rows the route delivered live are stamped by
-- fn_max_chat_mark_delivered so the inbox never re-shows them.

ALTER TABLE public.max_lane_chat_requests
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- ── RPC: drain my undelivered finished answers (authenticated, own rows) ──────
-- Atomic read-and-stamp: the UPDATE..RETURNING both marks and returns, so two
-- concurrent tabs can't both show the same "while you were away" answer
-- (FOR UPDATE SKIP LOCKED on the picker).
CREATE OR REPLACE FUNCTION public.fn_max_chat_inbox()
RETURNS TABLE (id uuid, message text, answer text, completed_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  UPDATE public.max_lane_chat_requests r
     SET delivered_at = now()
   WHERE r.id IN (
     SELECT q.id FROM public.max_lane_chat_requests q
      WHERE q.requested_by = auth.uid()
        AND q.status = 'done'
        AND q.delivered_at IS NULL
        AND q.completed_at > now() - interval '24 hours'
      ORDER BY q.completed_at
      LIMIT 5
      FOR UPDATE SKIP LOCKED
   )
  RETURNING r.id, r.message, r.answer, r.completed_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_chat_inbox() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_chat_inbox() TO authenticated;

-- ── RPC: route stamps a live-delivered answer (authenticated, own rows) ───────
CREATE OR REPLACE FUNCTION public.fn_max_chat_mark_delivered(p_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.max_lane_chat_requests
     SET delivered_at = now()
   WHERE id = p_id
     AND requested_by = auth.uid()
     AND delivered_at IS NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_chat_mark_delivered(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_chat_mark_delivered(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
