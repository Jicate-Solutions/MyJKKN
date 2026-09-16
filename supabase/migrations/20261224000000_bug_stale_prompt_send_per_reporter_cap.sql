-- "Is this still happening?" prompts — at most 3 open per reporter (E4).
-- Date: 2026-09-16, follow-up to 20261223000000.
--
-- WHY
-- The first send (14:28 today) found one learner with 65 old reports queued and
-- another with 40. fn_bug_stale_prompt_send took rows oldest-first with only a
-- total limit, so a single call would have put 65 questions in front of one
-- person. The fix-check prompts already carry this rule (E4, 20260718180000:
-- "a reporter never has more than 3 open prompts at once; the rest queue").
-- Wave 1 was therefore sent by hand with the cap; this puts the cap into the
-- function so every later wave has it.
--
-- WHAT
-- CREATE OR REPLACE of fn_bug_stale_prompt_send, body from the LIVE definition
-- with the pick rewritten: count each reporter's OPEN still-open prompts
-- (sent/delivered, unexpired), rank their queued rows oldest-first, and send
-- only while open + rank <= 3. Everything else — service-role gate, 14-day
-- expiry, oldest-first, total limit — unchanged. Grants re-stated as live.
--
-- REHEARSED ON PRODUCTION (undone): with 181 queued rows all belonging to
-- reporters who already hold 3 open prompts, a call sends 0; after answering
-- one of a reporter's open prompts in the same transaction, the next call
-- sends exactly 1 to that reporter and 0 to anyone else.

CREATE OR REPLACE FUNCTION public.fn_bug_stale_prompt_send(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sent int := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'service role only');
  END IF;

  -- 2026-09-16 (cap): E4 for still-open prompts — a reporter never has more
  -- than 3 OPEN prompts of this kind at once. One learner has 65 old reports;
  -- without this, one send would put 65 questions in front of them. Rows past
  -- the cap stay pending_send and go out on later calls as answers free slots.
  WITH open_now AS (
    SELECT reporter_user_id, count(*) AS n
      FROM public.bug_fix_feedback_requests
     WHERE kind = 'still_open'
       AND status IN ('sent', 'delivered')
       AND expires_at > now()
     GROUP BY reporter_user_id
  ),
  ranked AS (
    SELECT r.id,
           row_number() OVER (PARTITION BY r.reporter_user_id
                              ORDER BY r.created_at ASC, r.id) AS rn,
           COALESCE(o.n, 0) AS already_open
      FROM public.bug_fix_feedback_requests r
      LEFT JOIN open_now o ON o.reporter_user_id = r.reporter_user_id
     WHERE r.kind = 'still_open' AND r.status = 'pending_send'
  ),
  pick AS (
    SELECT id
      FROM ranked
     WHERE already_open + rn <= 3
     ORDER BY rn, id
     LIMIT GREATEST(p_limit, 0)
  ),
  upd AS (
    UPDATE public.bug_fix_feedback_requests r
       SET status = 'sent',
           sent_at = now(),
           expires_at = now() + interval '14 days',
           updated_at = now()
      FROM pick
     WHERE r.id = pick.id
    RETURNING 1
  )
  SELECT count(*) INTO v_sent FROM upd;

  RETURN jsonb_build_object('success', true, 'sent', v_sent);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_stale_prompt_send(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_stale_prompt_send(integer) TO service_role;
