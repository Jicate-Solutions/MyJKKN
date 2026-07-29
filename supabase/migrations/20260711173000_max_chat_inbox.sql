-- =====================================================================
-- Max-lane chat INBOX — finished answers wait for the seat owner
-- Migration: 2026-07-11 (revised same day after deep-review consensus:
-- stamp-on-read was at-MOST-once; delivery is now acknowledged by the
-- CLIENT after render, making the pipeline at-LEAST-once — a lost
-- response re-shows the answer on the next load instead of losing it.)
-- =====================================================================
-- Director edge-case decision (interview r2, 2026-07-11): if the tab/phone
-- dies while a Max answer is being generated, the answer must NOT be lost.
-- The runner already persists the answer on the queue row (status='done');
-- this adds a delivery stamp + a requester-scoped READ-ONLY inbox that the
-- chat page reads on load, and an explicit ACK the client sends only AFTER
-- the answer has actually rendered (live deliveries ack the same way via
-- the POST response's max_request_id).

ALTER TABLE public.max_lane_chat_requests
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- ── RPC: read my undelivered finished answers (authenticated, own rows) ───────
-- PURE READ (idempotent — safe behind GET, prefetch, retries): stamping
-- happens only via fn_max_chat_ack after the client has rendered. Empty
-- answers are filtered exactly like the live path; ORDER BY is preserved
-- because this is a plain SELECT. LIMIT 20 is a per-load page, not a cap:
-- un-acked rows simply surface again on the next load.
CREATE OR REPLACE FUNCTION public.fn_max_chat_inbox()
RETURNS TABLE (id uuid, message text, answer text, completed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT q.id, q.message, q.answer, q.completed_at
    FROM public.max_lane_chat_requests q
   WHERE q.requested_by = auth.uid()
     AND q.status = 'done'
     AND q.delivered_at IS NULL
     AND q.completed_at > now() - interval '24 hours'
     AND COALESCE(btrim(q.answer), '') <> ''
   ORDER BY q.completed_at
   LIMIT 20;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_chat_inbox() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_chat_inbox() TO authenticated;

-- ── RPC: client acknowledges RENDERED answers (authenticated, own rows) ───────
-- Called after the messages are actually on screen — for inbox restores AND
-- for live Max deliveries (the POST response carries max_request_id). A lost
-- ack only means the answer shows once more on the next load (duplicate
-- beats loss for a "must-not-lose" feature).
CREATE OR REPLACE FUNCTION public.fn_max_chat_ack(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.max_lane_chat_requests
     SET delivered_at = now()
   WHERE id = ANY(p_ids)
     AND requested_by = auth.uid()
     AND delivered_at IS NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_max_chat_ack(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_chat_ack(uuid[]) TO authenticated;

-- Superseded by fn_max_chat_ack (server-side stamping contradicted the
-- render-then-ack model).
DROP FUNCTION IF EXISTS public.fn_max_chat_mark_delivered(uuid);

NOTIFY pgrst, 'reload schema';
