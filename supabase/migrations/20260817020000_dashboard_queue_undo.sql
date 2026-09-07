-- ============================================================================
-- Dashboard v2 — an undo window over the Decision Queue's terminal actions
-- Date: 2026-08-09
-- PR:   #2940
--
-- ############################################################################
-- # APPLY ORDER — THIS FILE FIRST, THEN MERGE PR #2940. NOT THE OTHER WAY.   #
-- #                                                                          #
-- # The PR ships an Undo button on all six terminal Decision Queue actions.  #
-- # That button calls fn_dashboard_queue_undo, which is CREATED HERE. Merge  #
-- # the code first and every Undo tap hits a function that does not exist.   #
-- # (The client degrades honestly rather than throwing — it says the undo is #
-- # unavailable — but the feature is simply absent until this runs.)         #
-- #                                                                          #
-- # PART 3 is the load-bearing half of the ordering. It closes a hazard the  #
-- # undo CREATES: without it, one undo by the Chief of Staff earns them an   #
-- # automatic SLA strike on the next */15 cron tick. Do not apply Parts 1-2  #
-- # without Part 3 — that is why all three live in ONE file.                 #
-- #                                                                          #
-- # Applied by the Director, against production, before the merge.           #
-- ############################################################################
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
--   fn_dashboard_queue_escalate    Step 1 (IS NULL + escalated_at IS NULL) → an
--                                  undone item is genuinely unhandled again, so
--                                  being re-eligible is correct; escalated_at
--                                  still blocks double-escalation.
--                                  Step 2 is the hazard, and PART 3 below fixes
--                                  it. See the correction immediately after
--                                  this list.
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
-- CORRECTION — AN EARLIER REVISION OF THIS FILE CLAIMED THE OPPOSITE
--   It said of fn_dashboard_queue_escalate's Chief-of-Staff path: "that path
--   only touches rows older than 1 hour belonging to the Chief of Staff, and
--   this undo is capped at 60 seconds, so the two cannot overlap." That is
--   FALSE, and it is false for a specific reason worth stating: Step 2 measures
--   `un.created_at`, the age of the ROW, not the age of the action. Read live
--   on kvizhngldtiuufknvehv 2026-08-09:
--
--       AND un.acknowledged_at IS NULL
--       AND un.created_at < NOW() - INTERVAL '1 hour'
--
--   An undo sets acknowledged_at back to NULL and does not touch created_at. So
--   undoing a row that is ALREADY older than an hour satisfies both predicates
--   in the same instant. The 60-second undo cap is irrelevant — it bounds when
--   the undo may happen, not how old the row is. The next */15 cron tick then
--   force-acknowledges the item and writes a 'cos_unreachable' strike against
--   the Chief of Staff: a fault recorded for the act of correcting a mis-tap.
--
--   Measured read-only on production 2026-08-09, before this migration:
--     CoS = d28a9913-5606-42cc-8fd0-6b27317c4d30
--     Step 2 matches right now ............................. 0  (dormant)
--     CoS dashboard rows ................................. 143
--     …unacknowledged .................................... 0   ← why it is dormant
--     …older than 1 hour AND already acknowledged ........ 143 ← an undo on ANY
--                                                              one of these arms
--                                                              Step 2 immediately
--     counselor_sla_strikes rows ......................... 143 (newest 2026-07-30)
--
--   Step 2 is dormant, not broken. PART 3 keeps it dormant once undo exists.
--
--   Note also that migration 20260817000100 (applied; ledger confirms, and the
--   live body carries it) guarded Step 1 ONLY, with
--   `n.created_at >= COALESCE(v_cfg.escalation_start_at, NOW())`. Step 2 never
--   received a guard. Part 3 reproduces Step 1 verbatim, including that cutoff.
--
-- IDEMPOTENT / RE-RUNNABLE: every statement is CREATE OR REPLACE.
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
-- ci:allow-secdef-authenticated Called by the dashboard server action
-- (app/(routes)/dashboard/_actions/queue-actions.ts) on the signed-in user's own session, so
-- authenticated is required. Authority is OWNERSHIP, not role: the function selects the target
-- FROM user_notifications WHERE id = p_user_notification_id AND user_id = auth.uid() FOR UPDATE
-- and returns not_found_or_not_owned otherwise, so a caller can only ever act on their own
-- queue row. The gate does not count auth.uid() as a guard by design; this is that documented case.
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

  -- Two call sites outside the Decision Queue post a terminal action through
  -- fn_dashboard_queue_action as a side-effect of work this undo cannot
  -- reverse (app/(routes)/dashboard/_actions/rescue-actions.ts):
  --   initiateRescueBroadcast → 'approve'     once the alert has reached the
  --                                           counselling team
  --   claimRescueBroadcast    → 'acknowledge' once the lead is assigned in
  --                                           admission_leads
  -- Un-acknowledging either would put the card back and imply the work had not
  -- happened, while the alert stays sent and the lead stays assigned. No button
  -- offers it — but this RPC is callable directly by any authenticated user, so
  -- refuse here rather than rely on the absence of a button. Both are
  -- identifiable by the distinctive idempotency keys those call sites mint.
  -- (LIKE against a NULL key yields NULL, so an unkeyed row is unaffected.)
  IF v_notif.idempotency_key LIKE '%:broadcast:initiated'
     OR v_notif.idempotency_key LIKE '%:claim:attempted' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_an_undoable_action',
      'action', v_action, 'reason', 'rescue_side_effect');
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
-- ci:allow-secdef-authenticated Same ownership model as fn_dashboard_queue_action above, called
-- from the same dashboard server action on the user's own session. Scoped by user_id = auth.uid()
-- FOR UPDATE with a single deliberate not_found_or_not_owned message so a prober cannot confirm a
-- row exists, and the undo window is clamped to [1s, 60s] regardless of what the caller passes.
GRANT  EXECUTE ON FUNCTION public.fn_dashboard_queue_undo(UUID, INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_dashboard_queue_undo(UUID, INT) IS
  'Dashboard v2 — reverses one terminal fn_dashboard_queue_action (approve/reject/acknowledge/false_alarm) within a server-clamped 60s window. Restores user_notifications.acknowledged_at to NULL, clears notifications.acted_by and the dashboard_action_* metadata, and restores the pre-silence expires_at for false_alarm when it was recorded. Refuses on: another user''s row, another user''s stamp, an expired window, a superseded row, or a non-terminal action. Idempotent. PR #2940.';

-- ----------------------------------------------------------------------------
-- PART 3 — an undo must not earn the Chief of Staff an SLA strike.
--
-- THIS IS NOT A SEPARATE CONCERN AND IT IS NOT IN A SEPARATE FILE ON PURPOSE.
-- Parts 1-2 create the hazard; Part 3 removes it. Shipping either alone would
-- be shipping half a change: apply 1-2 without 3 and the first Chief-of-Staff
-- undo is punished by the cron 15 minutes later.
--
-- WHAT STEP 2 IS ACTUALLY ASKING
--   "Has the Chief of Staff been sitting on this for an hour without acting?"
--   It answers that with un.created_at, which is a fair proxy only while
--   acknowledged_at moves in one direction. The undo makes it move back, and
--   the proxy stops answering the question asked: after an undo the honest
--   answer is "no — they acted, then corrected it, seconds ago".
--
-- THE FIX, AND ITS EXACT LIMITS
--   Take the LATER of (row created, row undone) as the age basis. One undo
--   therefore buys exactly one fresh hour, restarting the same clock rather
--   than widening it. Specifically NOT done:
--     * Step 1 is reproduced VERBATIM, cutoff and all. 20260817000100 is
--       applied in production and nothing here may weaken it.
--     * No new exemption, no "skip the CoS", no longer threshold. A genuinely
--       ignored item still escalates, one hour after the undo.
--     * counselor_sla_strikes is not touched. Strikes already written stand;
--       this only stops a NEW one being written for an undo.
--
-- WHERE THE UNDO TIMESTAMP COMES FROM
--   fn_dashboard_queue_undo (Part 2) writes metadata.dashboard_undone_at onto
--   the shared notifications row. Step 2 already JOINs that row, so no new join
--   and no schema change. It is read through fn_dashboard_undone_at below
--   rather than cast inline: notifications.metadata is writable by any admin
--   (RLS policy notifications_update_admins), a bare
--   (metadata->>'dashboard_undone_at')::timestamptz throws on a malformed
--   value, and a throw inside this CTE would kill the whole */15 escalation
--   cron for everyone. PostgreSQL 15.6 here — pg_input_is_valid() is 16+, so a
--   plpgsql EXCEPTION block is the available throw-proof cast.
--
-- KNOWN, ACCEPTED IMPRECISION
--   dashboard_undone_at lives on the shared notifications row while the age
--   test is per-user. If two people ever hold user_notifications rows against
--   one notification, a Director's undo would also give the CoS's row a fresh
--   hour. Measured 2026-08-09: 0 terminally-acted notifications are fanned out
--   to more than one user, so this shape does not exist in production today —
--   and its failure mode is a strike delayed by up to an hour, never a strike
--   wrongly written.
-- ----------------------------------------------------------------------------

-- Throw-proof reader for the undo stamp. Pure (no table access), so NOT
-- SECURITY DEFINER — it runs with the caller's own rights and can see nothing
-- the caller could not. Locked from anon/PUBLIC regardless: its only caller is
-- fn_dashboard_queue_escalate, which is SECURITY DEFINER and executes it as the
-- owner.
-- STABLE, not IMMUTABLE. text::timestamptz is timezone-dependent when the
-- string carries no UTC offset, so the result is a function of the TimeZone GUC
-- as well as the argument. Demonstrated on PostgreSQL 16.14:
--   '2026-08-09T12:00:00'        TimeZone=UTC -> 12:00:00+00
--                                TimeZone=IST -> 12:00:00+05:30   (5.5h apart)
--   '2026-08-09T12:00:00+00:00'  both         -> the same instant
-- to_jsonb(NOW()) always writes the offset form, so every value THIS code
-- writes is safe — but notifications.metadata is admin-writable (RLS policy
-- notifications_update_admins), so a naive string can appear. IMMUTABLE would
-- license the planner to constant-fold a value that is not constant.
-- Deliberately left at the default PARALLEL UNSAFE: a plpgsql EXCEPTION clause
-- opens a subtransaction on every entry to the block, and a subtransaction
-- inside a parallel worker errors with "cannot start subtransactions during a
-- parallel operation". Step 2's CTE is data-modifying and therefore never
-- parallelised anyway, so this costs nothing here and stops the helper being a
-- trap for a future caller.
CREATE OR REPLACE FUNCTION public.fn_dashboard_undone_at(p_metadata JSONB)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
BEGIN
  IF p_metadata IS NULL
     OR jsonb_typeof(p_metadata -> 'dashboard_undone_at') IS DISTINCT FROM 'string' THEN
    RETURN NULL;
  END IF;
  RETURN (p_metadata ->> 'dashboard_undone_at')::timestamptz;
EXCEPTION WHEN others THEN
  -- A junk value means "no usable undo stamp", not "stop the cron".
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_dashboard_undone_at(JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_dashboard_undone_at(JSONB) TO service_role;

COMMENT ON FUNCTION public.fn_dashboard_undone_at(JSONB) IS
  'Reads notifications.metadata->>''dashboard_undone_at'' as a timestamptz, returning NULL instead of throwing on a missing, non-string or unparseable value. Exists so fn_dashboard_queue_escalate cannot be killed by one malformed metadata value. PR #2940.';

-- Verbatim copy of the live definition on kvizhngldtiuufknvehv (read via
-- pg_get_functiondef 2026-08-09, which already includes migration
-- 20260817000100's Step 1 cutoff), with ONE change: the Step 2 age basis.
CREATE OR REPLACE FUNCTION public.fn_dashboard_queue_escalate(p_cos_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- UNCHANGED. The escalation_start_at cutoff below is migration 20260817000100,
  -- applied in production; it is reproduced here exactly and must stay exact.
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
  --
  -- THE ONLY CHANGE IN THIS FUNCTION (PR #2940). Was:
  --     AND un.created_at < NOW() - INTERVAL '1 hour'
  -- which is the age of the ROW. fn_dashboard_queue_undo sets acknowledged_at
  -- back to NULL without touching created_at, so undoing an already-old row
  -- satisfied both predicates at once and the next tick wrote a strike for the
  -- undo itself. The age basis is now the later of (created, undone): one undo
  -- restarts the same one-hour clock and buys nothing more.
  WITH cos_overdue AS (
    SELECT un.id, un.notification_id
    FROM user_notifications un
    JOIN notifications n ON n.id = un.notification_id
    WHERE un.user_id = v_cos_user_id
      AND un.acknowledged_at IS NULL
      AND GREATEST(
            un.created_at,
            COALESCE(fn_dashboard_undone_at(n.metadata), un.created_at)
          ) < NOW() - INTERVAL '1 hour'
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

-- Grants reproduced from the live ACL read 2026-08-09
-- ({postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}).
-- CREATE OR REPLACE preserves privileges, so these are belt-and-braces plus the
-- explicit anon lock the secdef CI guard looks for. `authenticated` is kept
-- because production already grants it — this PR does not widen or narrow who
-- may call the escalation.
-- Locked to service_role only. The function takes a caller-supplied p_cos_user_id that
-- overrides the configured Chief of Staff, performs platform-wide escalation writes and
-- inserts counselor_sla_strikes, and contains no caller-authority check. Its only caller is
-- app/api/dashboard/cron/queue-escalate/route.ts, which uses the service-role key behind
-- CRON_SECRET -- so no authenticated path needs it. Matches fn_dashboard_undone_at above.
REVOKE EXECUTE ON FUNCTION public.fn_dashboard_queue_escalate(UUID) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_dashboard_queue_escalate(UUID) TO service_role;
