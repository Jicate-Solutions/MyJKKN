-- Reporter prompts reach people who never open My Bug Reports.
-- Date: 2026-09-16 (Director ruling by tap, 19:17: "Dashboard banner + a notification")
--
-- WHY
-- Both prompt kinds only ever showed on /my-bug-reports. Measured: 24 fix
-- prompts sent 15 Sep -> 1 viewed in 20 h; 396 still-open prompts sent
-- 16 Sep 14:28 -> 0 viewed in 2 h. The question was fine; nobody saw it.
--
-- WHAT (this file: the notification half; the dashboard banner is code)
-- CREATE OR REPLACE of fn_bug_stale_prompt_send, body = 20261224000000 (the
-- per-reporter cap) plus a fan-out after the send: one in-app notification
-- per reporter per send, idempotent per reporter per day, same shape and
-- category family as the fix-prompt notification the admin route raises.
-- Fix prompts already notify (route-side, 20260718180000 D1) — unchanged.
-- Everything else in the function — service-role gate, oldest-first, cap of
-- 3 open per reporter, total limit, 14-day expiry — unchanged.
--
-- REHEARSED ON PRODUCTION (undone): a send of N rows to K reporters inserts
-- exactly K notifications and K user_notifications rows; a second send in the
-- same minute inserts 0 more (idempotency); a reporter who got nothing sent
-- gets no notification.

CREATE OR REPLACE FUNCTION public.fn_bug_stale_prompt_send(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sent int := 0;
  v_notified int := 0;
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

  -- 2026-09-16 (reach): one in-app notification per reporter per send, so the
  -- question reaches people who never open My Bug Reports on their own
  -- (24 fix prompts sent 15 Sep: 1 viewed in 20 h; 396 still-open prompts sent
  -- 16 Sep 14:28: 0 viewed in 2 h). Same shape as the fix-prompt notification
  -- the admin route raises (category bug_reports:*, kind work_item, targeting
  -- one user). Idempotent per reporter per calendar day, so re-running send
  -- in the same day never doubles a nudge. created_by is the platform's
  -- system actor for cron-made notifications (COALESCE to the reporter if it
  -- is ever missing, as fn_scf_apply_weekly_escalation_digest does).
  WITH just_sent AS (
    SELECT DISTINCT r.reporter_user_id, count(*) OVER (PARTITION BY r.reporter_user_id) AS n
      FROM public.bug_fix_feedback_requests r
     WHERE r.kind = 'still_open' AND r.status = 'sent'
       AND r.sent_at >= now() - interval '1 minute'
  ),
  ins_notif AS (
    INSERT INTO public.notifications
      (id, title, body, url, icon, created_by, targeting, priority, category, kind,
       requires_acknowledgment, is_layer_0, idempotency_key, metadata, created_at, updated_at)
    SELECT gen_random_uuid(),
           CASE WHEN js.n = 1 THEN 'Is your old bug report still happening?'
                ELSE js.n::text || ' of your old bug reports — still happening?' END,
           'Nobody else can tell us whether an old report still matters. Open My Bug Reports and tap "No, it works now" or "Yes, still happening". It takes a moment and keeps the list honest.',
           '/my-bug-reports',
           'message-circle-question',
           COALESCE((SELECT id FROM public.profiles WHERE email = 'boobalan.a@jkkn.ac.in' LIMIT 1), js.reporter_user_id),
           jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(js.reporter_user_id)),
           'normal',
           'bug_reports:still_open',
           'work_item',
           FALSE, FALSE,
           'bug-still-open:' || js.reporter_user_id::text || ':' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'),
           jsonb_build_object('source', 'bug_still_open_prompt', 'prompts', js.n),
           now(), now()
      FROM just_sent js
     WHERE NOT EXISTS (
       SELECT 1 FROM public.notifications n2
        WHERE n2.idempotency_key = 'bug-still-open:' || js.reporter_user_id::text || ':' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'))
    RETURNING id, (targeting -> 'user_ids' ->> 0)::uuid AS recipient_id
  ),
  ins_user AS (
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), n.id, n.recipient_id, now() FROM ins_notif n
    RETURNING 1
  )
  SELECT count(*) INTO v_notified FROM ins_user;

  RETURN jsonb_build_object('success', true, 'sent', v_sent, 'notified', v_notified);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_stale_prompt_send(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_stale_prompt_send(integer) TO service_role;
