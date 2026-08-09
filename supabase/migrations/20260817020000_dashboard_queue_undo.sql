-- ============================================================================
-- Dashboard v2 — an undo window over the Decision Queue's terminal actions
-- Date: 2026-08-09
-- PR:   #2940
--
-- WHY
--   Six buttons on a Decision Queue card are final: Approve, Reject, Close lead
--   (all three route to fn_dashboard_queue_action), Mark resolved, Acknowledge
--   and False alarm. Each is one tap, and on a 387px phone Approve and Reject
--   sit about 10px apart. The previous round put a confirm dialog in front of
--   three of them. The Director chose the other shape: keep every final action
--   at ONE tap and give it an undo afterwards. Confirm-before AND undo-after
--   together is double friction.
--
--   fn_dashboard_queue_action has no reverse. Its enum is
--   ('approve','reject','delegate','snooze','acknowledge','false_alarm'), and
--   both its `p_action NOT IN (...)` guard and its terminal-write block would
--   need special-casing to carry an 'undo' value. A separate function keeps the
--   reversal auditable and leaves the forward path's hot code path alone.
--
-- WHAT THE FORWARD ACTION WRITES (verified against the live production
-- definition of fn_dashboard_queue_action on kvizhngldtiuufknvehv, 2026-08-09)
--   user_notifications.acknowledged_at = NOW()            ← removes it from the queue
--   notifications.acted_by             = auth.uid()
--   notifications.idempotency_key      = COALESCE(new, existing)
--   notifications.updated_at           = NOW()            (also via BEFORE UPDATE trigger)
--   notifications.metadata            |= { dashboard_action, dashboard_action_note,
--                                          dashboard_action_at }
--   and, for false_alarm on a 'dashboard:anomaly' notification ONLY:
--   notifications.expires_at           = NOW() + 24 hours
--
--   NOTE the brief for this change described the expires_at write as
--   unconditional. It is not — it is gated on v_notif.category =
--   'dashboard:anomaly'. The undo below reverses only what was actually
--   written, so the gate does not need to be re-stated there: the stashed key
--   is present if and only if the overwrite happened.
--
-- THE expires_at PROBLEM, AND WHAT THIS MIGRATION DOES ABOUT IT
--   The forward action OVERWRITES expires_at. The prior value is read into
--   v_notif before the write but never persisted, so after the fact it is
--   simply gone — not recoverable from the row, from updated_at, or from
--   anywhere else in the schema. Guessing it (NULL? +24h? the notification's
--   original TTL?) would silently corrupt the 24h-silence semantics.
--
--   So Part 1 below makes it recoverable going forward: at the moment of the
--   overwrite, the forward action now records the value it is about to destroy
--   as metadata->'dashboard_prior_expires_at'. This is an additive one-key
--   change inside the existing false_alarm branch. It does NOT touch the
--   `p_action NOT IN (...)` guard and does not restructure the terminal-write
--   block — the rest of the body is a verbatim copy of the live definition.
--
--   Consequence, stated plainly: a false_alarm performed BEFORE this migration
--   is applied has no stashed value, and its undo restores acknowledged_at and
--   acted_by but leaves expires_at at NOW()+24h. fn_dashboard_queue_undo
--   returns expires_at_restored:false in that case so the caller can say so
--   rather than imply a full reversal. Measured on production 2026-08-09:
--   59 false_alarm rows exist all-time, 0 carry the key, and 0 rows anywhere
--   are inside a 60s undo window — so the unrecoverable set is bounded to
--   false_alarms taken in the ~60 seconds spanning the deploy itself.
--
-- SAFETY MODEL OF THE UNDO — it refuses rather than corrupts:
--   * caller must own the user_notifications row (user_id = auth.uid())
--   * bounded window: 60s server-side, though the UI only offers ~8s. The gap
--     is deliberate, so network latency never turns a legitimate undo into a
--     "too late". The window parameter is clamped server-side to [1s, 60s] —
--     a caller cannot widen its own authorisation.
--   * the row must not have been acted on again since (acknowledged_at and
--     metadata->>'dashboard_action_at' must still agree)
--   * notifications.acted_by must be the caller's own stamp
--   * only the four terminal actions are reversible; snooze never sets
--     acknowledged_at, and delegate is refused on purpose (it also fanned a row
--     out to somebody else's queue — retracting that is a different operation)
--   * idempotent: undoing an already-undone row returns ok:true, not an error
--   * SECURITY DEFINER with explicit search_path, and anon/PUBLIC revoked
--
-- DOWNSTREAM CONSUMERS OF user_notifications.acknowledged_at (all checked;
-- none depend on it being monotonic — grep receipts in the PR body):
--   fn_dashboard_queue_list        filters IS NULL  → item returns. Intended.
--   fn_dashboard_queue_action      IS NOT NULL guard → item is actionable again.
--                                  Intended: that is what makes a re-do work.
--   fn_dashboard_queue_escalate    IS NULL + escalated_at IS NULL → an undone
--                                  item is genuinely unhandled again, so being
--                                  re-eligible is correct; escalated_at still
--                                  blocks double-escalation. Its separate CoS
--                                  path writes counselor_sla_strikes, which an
--                                  undo does NOT retract — but that path only
--                                  touches rows older than 1 hour belonging to
--                                  the Chief of Staff, and this undo is capped
--                                  at 60 seconds, so the two cannot overlap.
--   fn_dashboard_activity_feed     IS NOT NULL, ordered by it → an undone act
--                                  drops out of "team activity". Correct: it
--                                  did not happen.
--   pending-decision / pending-approval counters (02_functions.sql:7466, 8157)
--   and every .is('acknowledged_at', null) API filter → plain counts, they
--                                  self-heal by going back up. Correct.
--   idx_user_notifications_unack (partial, WHERE acknowledged_at IS NULL) →
--                                  ordinary index maintenance, no semantics.
--
--   No re-notification: user_notifications' only non-delete trigger is
--   trg_notify_push_on_queue_insert, AFTER INSERT only (verified on production
--   via pg_trigger.tgtype). This undo is an UPDATE, so undoing does not fire a
--   second push to the user's phone.
--
-- IDEMPOTENT / RE-RUNNABLE: both statements are CREATE OR REPLACE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1 — make the false_alarm silence reversible.
-- Verbatim copy of the live definition, plus one stashed key in the
-- false_alarm branch. Nothing else in the body changes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_dashboard_queue_action(
  p_user_notification_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL,
  p_delegate_to UUID DEFAULT NULL,
  p_snooze_minutes INT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_un user_notifications;
  v_notif notifications;
  v_already_processed BOOLEAN := FALSE;
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

-- Pre-existing function, but it is (re)defined in this migration, so the
-- "new SECURITY DEFINER functions lock anon" CI guard inspects it. The revoke
-- is also a genuine tightening: Supabase's default privileges grant EXECUTE to
-- anon on every new function, and this one was only ever GRANTed to
-- authenticated. It returns not_authenticated to an anonymous caller anyway,
-- so nothing legitimate loses access.
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_queue_action(UUID, TEXT, TEXT, UUID, INT, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_dashboard_queue_action(UUID, TEXT, TEXT, UUID, INT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- PART 2 — the reversal.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_dashboard_queue_undo(
  p_user_notification_id UUID,
  p_window_seconds INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_un user_notifications;
  v_notif notifications;
  v_action TEXT;
  v_window INTERVAL;
  v_acted_at TIMESTAMPTZ;
  v_restored_expires BOOLEAN := FALSE;
  v_expires_recoverable BOOLEAN := TRUE;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;

  -- Clamp to [1s, 60s]. A caller passing 86400 does not get a day-long undo.
  v_window := (LEAST(GREATEST(COALESCE(p_window_seconds, 60), 1), 60)::text || ' seconds')::interval;

  SELECT * INTO v_un FROM user_notifications
    WHERE id = p_user_notification_id AND user_id = v_user
    FOR UPDATE;

  IF v_un.id IS NULL THEN
    -- Covers both "no such row" and "not yours". Deliberately one message: a
    -- distinct "not yours" would confirm the row exists to a prober.
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_found_or_not_owned');
  END IF;

  -- Idempotent. Already back in the queue → nothing to do, and that is success,
  -- not an error. A double-tapped Undo must not show the reader a failure.
  IF v_un.acknowledged_at IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'idempotent', TRUE, 'action', 'undo');
  END IF;

  IF v_un.acknowledged_at < NOW() - v_window THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'undo_window_expired',
      'acknowledged_at', v_un.acknowledged_at);
  END IF;

  SELECT * INTO v_notif FROM notifications WHERE id = v_un.notification_id FOR UPDATE;
  IF v_notif.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'notification_missing');
  END IF;

  v_action := v_notif.metadata->>'dashboard_action';

  -- Only the four terminal Decision Queue actions are reversible here.
  -- Everything else that writes acknowledged_at — the escalation cron's CoS
  -- timeout, fn_rescue_broadcast_claim, a delegate — leaves no
  -- dashboard_action, or leaves one this list excludes, and is refused.
  IF v_action IS NULL OR v_action NOT IN ('approve','reject','acknowledge','false_alarm') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_an_undoable_action',
      'action', v_action);
  END IF;

  -- Never clear somebody else's stamp. notifications is the shared row and
  -- user_notifications is the per-user fan-out, so in principle two people can
  -- hold rows against one notification. (Measured on production 2026-08-09: 0
  -- terminally-acted notifications are fanned out to more than one user — so
  -- this is a guard against a shape that exists rather than one that bites
  -- today.)
  IF v_notif.acted_by IS DISTINCT FROM v_user THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'acted_by_another_user');
  END IF;

  -- "Not acted on again since." The forward action stamps acknowledged_at and
  -- dashboard_action_at from the same NOW() inside one transaction, so they are
  -- equal. If a later write moved one and not the other, this undo would be
  -- reversing an act it cannot see; refuse instead. 2s of slack, not 0, because
  -- equality on a jsonb round-trip is not something to bet a refusal on.
  v_acted_at := (v_notif.metadata->>'dashboard_action_at')::timestamptz;
  IF v_acted_at IS NULL
     OR abs(extract(epoch FROM (v_acted_at - v_un.acknowledged_at))) > 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'superseded');
  END IF;

  -- 1) The per-user terminal marker. This is the write that puts the card back:
  --    fn_dashboard_queue_list selects WHERE acknowledged_at IS NULL.
  UPDATE user_notifications
    SET acknowledged_at = NULL
    WHERE id = p_user_notification_id;

  -- 2) The shared-row stamps.
  --    acted_by MUST go back to NULL. fn_dashboard_queue_action's idempotency
  --    guard is "a notification with this key exists AND acted_by IS NOT NULL";
  --    leaving it set would make the reader's next attempt at the same action
  --    return ok:true/idempotent:true without doing anything — a success that
  --    never happened.
  --    idempotency_key is deliberately left alone: the forward action only
  --    COALESCEs into it, so the value may predate this action and is not ours
  --    to clear. Nulling acted_by already disarms the guard.
  --    updated_at is likewise not restored — the row WAS touched, and
  --    set_timestamp_notifications (BEFORE UPDATE) will bump it regardless.
  --    The undo is recorded rather than erased without trace.
  UPDATE notifications
    SET acted_by = NULL,
        metadata = (COALESCE(metadata, '{}'::jsonb)
                      - 'dashboard_action'::text
                      - 'dashboard_action_note'::text
                      - 'dashboard_action_at'::text)
                   || jsonb_build_object(
                        'dashboard_undone_action', v_action,
                        'dashboard_undone_at', NOW(),
                        'dashboard_undone_by', v_user
                      )
    WHERE id = v_un.notification_id;

  -- 3) false_alarm also silenced the notification for 24h. Put back exactly
  --    what it overwrote — never a guess. The key is present only when the
  --    overwrite actually happened (it is written in the same statement), so
  --    its absence means either "not an anomaly, nothing was overwritten" or
  --    "acted before this migration shipped". Both are reported honestly as
  --    expires_at_restored:false.
  -- jsonb_exists(), not the `?` operator: `?` is a bind placeholder to several
  -- drivers and migration runners, and this file must survive whichever one
  -- applies it.
  IF v_action = 'false_alarm' THEN
    IF jsonb_exists(COALESCE(v_notif.metadata, '{}'::jsonb), 'dashboard_prior_expires_at') THEN
      UPDATE notifications
        SET expires_at = (v_notif.metadata->>'dashboard_prior_expires_at')::timestamptz,
            metadata = COALESCE(metadata, '{}'::jsonb) - 'dashboard_prior_expires_at'::text
        WHERE id = v_un.notification_id;
      v_restored_expires := TRUE;
    ELSIF v_notif.category = 'dashboard:anomaly' THEN
      -- The silence was applied but its predecessor was never recorded.
      v_expires_recoverable := FALSE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'action', 'undo',
    'undone_action', v_action,
    'expires_at_restored', v_restored_expires,
    'expires_at_recoverable', v_expires_recoverable
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_dashboard_queue_undo(UUID, INT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_dashboard_queue_undo(UUID, INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_dashboard_queue_undo(UUID, INT) IS
  'Dashboard v2 — reverses one terminal fn_dashboard_queue_action (approve/reject/acknowledge/false_alarm) within a server-clamped 60s window. Restores user_notifications.acknowledged_at to NULL, clears notifications.acted_by and the dashboard_action_* metadata, and restores the pre-silence expires_at for false_alarm when it was recorded. Refuses on: another user''s row, another user''s stamp, an expired window, a superseded row, or a non-terminal action. Idempotent. PR #2940.';
