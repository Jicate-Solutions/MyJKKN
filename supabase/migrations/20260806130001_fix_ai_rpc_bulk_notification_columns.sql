-- Migration: Fix ai_rpc_bulk_notification — write to the REAL notifications columns
-- Created: 2026-07-28
-- Twin of ai_rpc_send_notification (see 20260806130000): same bug. The body did
--   INSERT INTO notifications (title, message, type, priority, created_by)
-- but the live table has (title, body, category, targeting NOT NULL, priority,
-- created_by, ...). Columns message/type do not exist and required targeting was
-- never supplied, so every bulk send failed silently — and this is the exact RPC
-- ai_rpc_send_notification tells callers to use for > 50 recipients. Also removed
-- the dead ai_rpc_accessible_scope() call (function no longer exists).
-- Fix: map p_message -> body, p_type -> category, supply the per-user targeting
-- shape. Preserves the auth.uid() pin, the notifications.bulk permission check,
-- the 500/day limit, and increment_ai_bulk_action_count.
-- Verified on prod 2026-07-28: a real bulk send lands correct columns in
-- notifications + user_notifications; anon cannot execute.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ai_rpc_bulk_notification(
  p_user_id uuid,
  p_recipient_ids uuid[],
  p_title text,
  p_message text,
  p_type text DEFAULT 'info'::text,
  p_priority text DEFAULT 'normal'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_notification_id UUID;
  v_recipient_count INTEGER;
  v_daily_count INTEGER;
BEGIN
  -- [authz-guard 2026-07-12] pin identity to auth.uid() (confused-deputy fix; ignores caller-supplied p_user_id)
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'Sign in required.'));
  END IF;
  p_user_id := auth.uid();

  -- Check permission
  IF NOT ai_rpc_validate_permission(p_user_id, 'notifications.bulk') THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'PERMISSION_DENIED',
        'message', 'You do not have permission to send bulk notifications.'));
  END IF;

  -- Check daily limit
  SELECT COALESCE(bulk_action_count, 0) INTO v_daily_count
  FROM ai_query_rate_limits
  WHERE user_id = p_user_id;

  IF v_daily_count + array_length(p_recipient_ids, 1) > 500 THEN
    RETURN jsonb_build_object('success', false,
      'error', jsonb_build_object('code', 'BULK_LIMIT_EXCEEDED',
        'message', 'Daily bulk action limit (500) would be exceeded. You have used ' || v_daily_count || ' today.'));
  END IF;

  -- Create notification using the REAL columns.
  -- p_message -> body ; p_type -> category ; targeting is required (per-user shape).
  INSERT INTO public.notifications (title, body, category, targeting, priority, created_by)
  VALUES (
    p_title,
    p_message,
    COALESCE(NULLIF(btrim(p_type), ''), 'general'),
    jsonb_build_object('type', 'user', 'user_ids', to_jsonb(p_recipient_ids)),
    COALESCE(NULLIF(btrim(p_priority), ''), 'normal'),
    p_user_id
  )
  RETURNING id INTO v_notification_id;

  -- Fan out to each recipient's inbox
  INSERT INTO public.user_notifications (notification_id, user_id)
  SELECT v_notification_id, unnest(p_recipient_ids);

  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;

  -- Update bulk action count
  PERFORM increment_ai_bulk_action_count(p_user_id, v_recipient_count);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Bulk notification sent to ' || v_recipient_count || ' recipient(s).',
    'affected_count', v_recipient_count,
    'notification_id', v_notification_id
  );
END;
$function$;

-- Anon-lock the replaced RPC.
REVOKE EXECUTE ON FUNCTION public.ai_rpc_bulk_notification(uuid, uuid[], text, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_rpc_bulk_notification(uuid, uuid[], text, text, text, text) TO authenticated;
