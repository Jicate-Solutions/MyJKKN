-- =============================================================================
-- Guard the DELEGATE TARGET on fn_dashboard_queue_action
-- =============================================================================
-- The function's ownership lock (user_id = auth.uid() ... FOR UPDATE) controls WHICH
-- notification a caller may delegate. Nothing controlled WHOM they could delegate it to:
-- p_delegate_to was written straight into user_notifications.user_id, so any signed-in
-- user could push one of their own queue items into an arbitrary person's dashboard --
-- including a deactivated account or a UUID belonging to nobody.
--
-- Found 2026-08-31 while pushing PR #2940 through the SECURITY DEFINER authz gate. The
-- gate flags only unguarded functions, so it did not flag this: the function IS guarded,
-- just on the wrong axis.
--
-- Not a disclosure path -- a caller can only forward rows they already own, so nothing
-- flows TO them. The harm is that an SLA-tracked item can be made to appear in a
-- stranger's queue.
--
-- This migration is a pure ADDITION to the live definition: rebuilt from
-- pg_get_functiondef() as read from production, with 31 lines of guard inserted and
-- zero lines removed, so no existing behaviour changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_dashboard_queue_action(p_user_notification_id uuid, p_action text, p_note text DEFAULT NULL::text, p_delegate_to uuid DEFAULT NULL::uuid, p_snooze_minutes integer DEFAULT NULL::integer, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_un user_notifications;
  v_notif notifications;
  v_already_processed BOOLEAN := FALSE;
  v_caller_inst UUID;
  v_caller_super BOOLEAN := FALSE;
  v_target profiles;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;

  IF p_action NOT IN ('approve','reject','delegate','snooze','acknowledge','false_alarm') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_action');
  END IF;

  -- Idempotency check: if a notification with this key exists and was acted on, return success
  IF p_idempotency_key IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM notifications
      WHERE idempotency_key = p_idempotency_key
        AND acted_by IS NOT NULL
    ) INTO v_already_processed;

    IF v_already_processed THEN
      RETURN jsonb_build_object('ok', TRUE, 'idempotent', TRUE, 'action', p_action);
    END IF;
  END IF;

  -- Lock the user_notification row for update
  SELECT * INTO v_un FROM user_notifications
    WHERE id = p_user_notification_id AND user_id = v_user
    FOR UPDATE;

  IF v_un.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found_or_not_owned');
  END IF;

  IF v_un.acknowledged_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'idempotent', TRUE, 'already_acknowledged_at', v_un.acknowledged_at);
  END IF;

  SELECT * INTO v_notif FROM notifications WHERE id = v_un.notification_id;

  -- Handle snooze (doesn't mark acknowledged — defers reappearance)
  IF p_action = 'snooze' THEN
    UPDATE user_notifications
      SET created_at = NOW() + (COALESCE(p_snooze_minutes, 120) || ' minutes')::interval
      WHERE id = p_user_notification_id;
    RETURN jsonb_build_object('ok', TRUE, 'action', 'snooze', 'resumes_at', NOW() + (COALESCE(p_snooze_minutes, 120) || ' minutes')::interval);
  END IF;

  -- Handle delegate (reassigns to another user)
  IF p_action = 'delegate' AND p_delegate_to IS NOT NULL THEN
    -- Guard the DELEGATE TARGET. The ownership lock above controls WHICH notification the
    -- caller may delegate; before this guard nothing controlled WHOM they could delegate it
    -- to, so p_delegate_to was written straight into user_notifications.user_id. Any signed-in
    -- user could push one of their own queue items into an arbitrary person's dashboard.
    SELECT * INTO v_target FROM profiles WHERE id = p_delegate_to;

    IF v_target.id IS NULL OR COALESCE(v_target.is_active, FALSE) = FALSE THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'delegate_target_invalid');
    END IF;

    IF p_delegate_to = v_user THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'delegate_target_is_self');
    END IF;

    SELECT institution_id, COALESCE(is_super_admin, FALSE)
      INTO v_caller_inst, v_caller_super
      FROM profiles WHERE id = v_user;

    -- Super-admins delegate anywhere. Everyone else stays inside their own institution.
    -- When the CALLER has no institution_id (9 of 565 active staff at the time of writing)
    -- there is nothing to scope against, so exists-and-active is the whole check for them
    -- rather than locking those people out of delegating at all.
    IF NOT v_caller_super
       AND v_caller_inst IS NOT NULL
       AND v_target.institution_id IS DISTINCT FROM v_caller_inst THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'delegate_target_out_of_scope');
    END IF;

    UPDATE notifications
      SET acted_by = v_user,
          idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
          updated_at = NOW()
      WHERE id = v_un.notification_id;

    -- Fan-out to delegate
    INSERT INTO user_notifications (notification_id, user_id, created_at)
      VALUES (v_un.notification_id, p_delegate_to, NOW())
      ON CONFLICT DO NOTHING;

    -- Mark original as acknowledged (delegated)
    UPDATE user_notifications
      SET acknowledged_at = NOW()
      WHERE id = p_user_notification_id;

    RETURN jsonb_build_object('ok', TRUE, 'action', 'delegate', 'delegated_to', p_delegate_to);
  END IF;

  -- All terminal actions: approve/reject/acknowledge/false_alarm → mark acknowledged
  UPDATE user_notifications
    SET acknowledged_at = NOW()
    WHERE id = p_user_notification_id;

  UPDATE notifications
    SET acted_by = v_user,
        idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'dashboard_action', p_action,
          'dashboard_action_note', p_note,
          'dashboard_action_at', NOW()
        )
    WHERE id = v_un.notification_id;

  -- If action is 'false_alarm' on anomaly, flag for 24h silence (Round 2.5 behavior)
  IF p_action = 'false_alarm' AND v_notif.category = 'dashboard:anomaly' THEN
    UPDATE notifications
      SET expires_at = NOW() + INTERVAL '24 hours',
          -- 2026-08-09 (PR #2940) — the ONLY change to this function.
          -- Record the value this statement is about to destroy, so
          -- fn_dashboard_queue_undo can put it back instead of guessing.
          -- v_notif was read before any write above, so v_notif.expires_at is
          -- the pre-action value. jsonb_build_object with a NULL argument
          -- stores JSON null and the key is still PRESENT to jsonb_exists(),
          -- so an originally-NULL expires_at round-trips as NULL and is
          -- distinguishable from "never recorded".
          metadata = COALESCE(metadata, '{}'::jsonb)
                     || jsonb_build_object('dashboard_prior_expires_at', v_notif.expires_at)
      WHERE id = v_un.notification_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'action', p_action,
    'acknowledged_at', NOW(),
    'note', p_note
  );
END;
$function$;

-- Grants unchanged from the live state. The annotation is carried forward because the
-- authz gate is PR-scoped: this PR re-adds the function, so the hatch must travel with it.
-- ci:allow-secdef-authenticated Called by the dashboard server action
-- (app/(routes)/dashboard/_actions/queue-actions.ts) on the signed-in user's own session, so
-- authenticated is required. Authority is OWNERSHIP, not role: the function selects the target
-- FROM user_notifications WHERE id = p_user_notification_id AND user_id = auth.uid() FOR UPDATE
-- and returns not_found_or_not_owned otherwise. As of this migration the delegate TARGET is
-- also guarded (active profile, not self, same institution unless super-admin).
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_queue_action(UUID, TEXT, TEXT, UUID, INT, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_dashboard_queue_action(UUID, TEXT, TEXT, UUID, INT, TEXT) TO authenticated, service_role;
