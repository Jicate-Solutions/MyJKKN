-- =====================================================================
-- SCF adoption nudge — expiry + supersede-on-resend
-- Created: 2026-07-26 (dated 20260803070000 so it sorts AFTER every existing
--   migration — notably 20260731020000_scf_hard_gate_enforcement_and_coupling.sql,
--   which also CREATE OR REPLACEs this function — so on a fresh replay THIS
--   definition wins instead of being clobbered.)
--
-- WHY: dashboard:scf_nudge is the ONLY one of the three cron broadcasters that
-- actually inflates the notification bell (it fans out user_notifications rows;
-- the two doctrines crons do not). At handoff it held 68,684 rows / 55,701
-- UNREAD, oldest 2026-06-24, because the RPC never set expires_at and never
-- retired yesterday's now-stale "you have N classes to confirm".
--
-- TWO changes vs the live definition (pulled from prod via pg_get_functiondef):
--   1. Supersede-on-resend — expire every scf nudge that is NOT from today
--      before creating today's. A prior-day nudge is stale by construction:
--      today's run re-creates a fresh, recomputed nudge for any learner still
--      holding pending in-window sessions, so this never drops a still-
--      actionable reminder. Expiring (not deleting) keeps the row auditable.
--   2. expires_at = NOW() + 24h on each created row — a daily-cadence TTL
--      backstop in case a day's cron is missed. The read path honors expires_at
--      as of 2026-07-26 (lib/services/notification/notification-service.ts), so
--      both the supersede and the TTL drop rows from the bell/badge count.
--
-- SECURITY DEFINER + service_role only (unchanged) → the supersede UPDATE runs
-- as the function owner, so no RLS UPDATE policy on notifications is required.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_nudge_pending_learners(p_lookback_days integer DEFAULT 14)
 RETURNS TABLE(learners_nudged integer, sessions_pending_total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_system_actor uuid;
  v_nudged       int := 0;
  v_pending_sum  bigint := 0;
BEGIN
  -- Stable system identity for notifications.created_by (NOT NULL). Earliest
  -- super_admin; per-row COALESCE to the recipient guarantees non-null even if
  -- this is somehow NULL.
  SELECT p.id INTO v_system_actor
  FROM public.profiles p
  WHERE p.is_super_admin = true
  ORDER BY p.created_at ASC
  LIMIT 1;

  -- ── Supersede-on-resend ──────────────────────────────────────────────
  -- Retire every scf nudge that is NOT from today (matched on the same
  -- CURRENT_DATE the idempotency_key below encodes). See header for why this is
  -- safe. Expiring, not deleting, so the row stays auditable; the read path
  -- honors expires_at, so the bell/badge drop immediately. The BEFORE UPDATE
  -- trigger set_timestamp_notifications maintains updated_at.
  UPDATE public.notifications
     SET expires_at = now()
   WHERE category = 'dashboard:scf_nudge'
     AND idempotency_key IS NOT NULL
     AND idempotency_key NOT LIKE '%:' || CURRENT_DATE::text
     AND (expires_at IS NULL OR expires_at > now());

  -- 1) Aggregate Present-but-unconfirmed sessions per DELIVERABLE learner.
  --    A learner is deliverable when their learners_profiles row maps to a
  --    profile_id (the bell recipient / user_notifications.user_id).
  WITH pending AS (
    SELECT
      (st.value ->> 'student_id')::uuid AS lp_id,
      sa.attendance_date,
      period.key                        AS period_id
    FROM public.student_attendance sa,
         jsonb_each(sa.attendance_data)                   AS period,
         jsonb_array_elements(period.value -> 'students') AS st
    WHERE sa.attendance_date >= (CURRENT_DATE - p_lookback_days)
      -- Two-sided 48h window (Director, 2026-07-08): only nudge for sessions whose
      -- window is still OPEN — a nudge toward a closed window is a dead end (the
      -- submit RPC now rejects it). On the daily 12:45 IST dispatcher slot this
      -- lands the nudge ~12–36h after class, inside the window by construction.
      AND now() <= (sa.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
            + make_interval(hours => public.fn_get_policy_int(
                'session_feedback.window_hours', 48, sa.institution_id))
      AND jsonb_typeof(sa.attendance_data) = 'object'
      AND st.value ->> 'status' = 'Present'
      AND (st.value ->> 'student_id') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id      = (st.value ->> 'student_id')::uuid
          AND f.attendance_date = sa.attendance_date
          AND f.period_id       = period.key
      )
  ),
  per_learner AS (
    SELECT
      lp.profile_id              AS recipient_id,
      COUNT(*)::int              AS pending_count
    FROM pending p
    JOIN public.learners_profiles lp
      ON lp.id = p.lp_id
     AND lp.profile_id IS NOT NULL
    GROUP BY lp.profile_id
  ),
  -- 2) Create ONE notifications row per learner (idempotent per learner per day).
  --    The WHERE NOT EXISTS guard below skips learners already nudged today, so
  --    only freshly-inserted rows are RETURNINGed — the user_notifications
  --    fan-out stays in lock-step (no orphan user_notifications, no dup).
  ins_notif AS (
    INSERT INTO public.notifications (
      id, title, body, url, icon,
      created_by, targeting,
      priority, category, kind,
      requires_acknowledgment, is_layer_0,
      idempotency_key, metadata,
      created_at, updated_at, expires_at
    )
    SELECT
      gen_random_uuid(),
      'You have ' || pl.pending_count || ' class' ||
        CASE WHEN pl.pending_count = 1 THEN '' ELSE 'es' END || ' to confirm',
      'Take 10 seconds to confirm you attended and rate how well you understood '
        || 'your recent class' || CASE WHEN pl.pending_count = 1 THEN '' ELSE 'es' END
        || '. Each class accepts feedback only for a short window after it ends — '
        || 'once the window closes, it can no longer be confirmed.',
      '/learners/class-feedback',
      'clipboard-check',
      COALESCE(v_system_actor, pl.recipient_id),
      jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(pl.recipient_id)),
      'normal',
      'dashboard:scf_nudge',
      'work_item',
      FALSE,                                   -- no blocking acknowledgment modal
      FALSE,
      'scf-nudge:' || pl.recipient_id::text || ':' || CURRENT_DATE::text,
      jsonb_build_object('pending_count', pl.pending_count, 'source', 'scf_adoption_nudge'),
      -- expires_at: daily-cadence TTL backstop. Supersede (above) is the primary
      -- retirement mechanism; this bounds staleness if a day's cron is missed.
      NOW(), NOW(), NOW() + interval '24 hours'
    FROM per_learner pl
    -- Idempotent per learner per day: skip learners already nudged today. (The
    -- partial unique index still backstops against races — a concurrent run that
    -- slips past this guard would raise a unique violation rather than dup.)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n2
      WHERE n2.idempotency_key =
        'scf-nudge:' || pl.recipient_id::text || ':' || CURRENT_DATE::text
    )
    RETURNING id, (targeting -> 'user_ids' ->> 0)::uuid AS recipient_id
  ),
  -- 3) Manual fan-out: one user_notifications row per freshly-created notification.
  ins_user AS (
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), n.id, n.recipient_id, NOW()
    FROM ins_notif n
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*)::int FROM ins_user),
    (SELECT COALESCE(SUM(pl.pending_count), 0)::bigint FROM per_learner pl)
  INTO v_nudged, v_pending_sum;

  RETURN QUERY SELECT v_nudged, v_pending_sum;
END;
$function$;

COMMENT ON FUNCTION public.fn_scf_nudge_pending_learners(int) IS
  'service_role only — called by the daily cron app/api/cron/session-feedback-nudge. '
  '2026-07-26: sets expires_at (NOW()+24h) on created rows and supersedes prior-day '
  'scf nudges (expires_at=now) so the notification bell no longer accumulates stale '
  'unread nudges. Read path honors expires_at.';

-- Lock down per CLAUDE.md: cron-only RPC → service_role, never anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.fn_scf_nudge_pending_learners(int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_scf_nudge_pending_learners(int) TO service_role;
