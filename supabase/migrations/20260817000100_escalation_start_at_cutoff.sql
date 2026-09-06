-- Queue escalation: switch it on, but only for items created from now on.
--
-- fn_dashboard_queue_escalate has been a silent no-op since 2026-04-23: it
-- required notifications.requires_acknowledgment = TRUE, while
-- fn_create_dashboard_work_item deliberately writes that flag FALSE. Same root
-- cause as 20260817000000 (the counters).
--
-- Removing the flag alone was measured against production and rejected: the
-- first run would have fanned 9,087 backlog items (oldest 107 days) onto the
-- single configured Chief of Staff, then written 9,087 counselor_sla_strikes
-- rows against that one person an hour later — into a table holding 143 rows.
--
-- So this migration pairs the flag removal with a floor. dashboard_config
-- .escalation_start_at is set to the moment escalation was switched on, and
-- only items created at or after it are ever eligible. The pre-existing
-- backlog is permanently out of scope; escalation behaves normally for
-- everything created from here.
--
-- COALESCE(..., NOW()) is the safe default: if the column is ever NULL,
-- nothing escalates rather than everything.
--
-- Verified on production immediately after apply: the eligible CTE returns 0
-- rows; counselor_sla_strikes still 143; escalated user_notifications still 757.

ALTER TABLE public.dashboard_config
  ADD COLUMN IF NOT EXISTS escalation_start_at timestamptz;

COMMENT ON COLUMN public.dashboard_config.escalation_start_at IS
  'Queue escalation only considers items created at or after this moment. Set when escalation was switched on (2026-08-09) so the pre-existing backlog is never fanned onto the Chief of Staff. NULL means escalate nothing.';

UPDATE public.dashboard_config
   SET escalation_start_at = COALESCE(escalation_start_at, NOW())
 WHERE scope = 'global';

CREATE OR REPLACE FUNCTION public.fn_dashboard_queue_escalate(p_cos_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_escalated_count INT := 0;
  v_returned_count INT := 0;
  v_cfg dashboard_config;
  v_threshold INTERVAL;
  v_cos_user_id UUID;
BEGIN
  SELECT * INTO v_cfg FROM dashboard_config WHERE scope = 'global' LIMIT 1;
  v_threshold := (v_cfg.queue_escalation_hours || ' hours')::interval;

  -- Resolve CoS: caller override > dashboard_config > NULL (no-op)
  v_cos_user_id := COALESCE(p_cos_user_id, v_cfg.chief_of_staff_user_id);

  IF v_cos_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'escalated', 0,
      'returned', 0,
      'message', 'No Chief of Staff configured — escalation disabled (spec §15 Q1)'
    );
  END IF;

  -- Step 1: Director's unacked items past threshold → fan out to CoS
  WITH eligible AS (
    SELECT un.id, un.notification_id
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    JOIN profiles p ON p.id = un.user_id
    WHERE p.is_super_admin = TRUE
      AND un.acknowledged_at IS NULL
      AND un.escalated_at IS NULL
      AND n.category LIKE 'dashboard:%'
      AND n.created_at < NOW() - v_threshold
      AND n.created_at >= COALESCE(v_cfg.escalation_start_at, NOW())
  ),
  escalated AS (
    UPDATE user_notifications un
      SET escalated_at = NOW(),
          escalation_level = COALESCE(escalation_level, 0) + 1
      WHERE un.id IN (SELECT id FROM eligible)
      RETURNING un.notification_id
  ),
  cos_fanout AS (
    INSERT INTO user_notifications (notification_id, user_id, created_at)
    SELECT notification_id, v_cos_user_id, NOW()
    FROM escalated
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_escalated_count FROM cos_fanout;

  -- Step 2: CoS items past 1h without action → auto-ack + strike
  WITH cos_overdue AS (
    SELECT un.id, un.notification_id
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE un.user_id = v_cos_user_id
      AND un.acknowledged_at IS NULL
      AND un.created_at < NOW() - INTERVAL '1 hour'
      AND n.category LIKE 'dashboard:%'
  ),
  cos_ack AS (
    UPDATE user_notifications un
      SET acknowledged_at = NOW()
      WHERE un.id IN (SELECT id FROM cos_overdue)
      RETURNING un.notification_id
  ),
  strike_log AS (
    INSERT INTO counselor_sla_strikes (counselor_id, strike_type, context, auto_expires_at, institution_id)
    SELECT v_cos_user_id, 'cos_unreachable',
           jsonb_build_object('notification_id', notification_id, 'reason', 'cos_2h_timeout'),
           NOW() + (v_cfg.strike_expiry_days || ' days')::interval,
           COALESCE(
             (SELECT institution_id FROM profiles WHERE id = v_cos_user_id),
             (SELECT id FROM institutions LIMIT 1)
           )
    FROM cos_ack
    RETURNING id
  )
  SELECT COUNT(*) INTO v_returned_count FROM strike_log;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'escalated', v_escalated_count,
    'returned', v_returned_count,
    'threshold_hours', v_cfg.queue_escalation_hours,
    'cos_user_id', v_cos_user_id,
    'source', CASE WHEN p_cos_user_id IS NOT NULL THEN 'override' ELSE 'dashboard_config' END,
    'ran_at', NOW()
  );
END;
$function$;

-- Lock the redefined function from anon/PUBLIC explicitly. CREATE OR REPLACE
-- preserves whatever grants already exist, and production already had only
-- authenticated + service_role (verified: has_function_privilege anon = false).
-- Stating it here anyway so the migration is correct on a fresh database, where
-- Postgres would otherwise grant EXECUTE to PUBLIC by default.
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_queue_escalate(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_dashboard_queue_escalate(uuid) TO authenticated, service_role;
