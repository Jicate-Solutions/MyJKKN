-- =============================================================================
-- 20260623190500_scf_adoption_nudge.sql
-- Post-Class Feedback (SCF) → ADOPTION NUDGE engine.
-- Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md (adoption follow-up)
-- =============================================================================
-- PROBLEM: the 10-sec post-class feedback feature (/learners/class-feedback) is
-- live but organic adoption is ~0 (5 rows, 1 learner as of 2026-06-23). Learners
-- don't know they have sessions waiting to confirm. This migration adds the
-- in-app NUDGE: a daily, service-role-only RPC that, for every learner who was
-- marked Present in a session but has NOT yet given feedback (i.e. their
-- attendance is "present-pending"), drops ONE in-app bell notification
-- "You have N class(es) to confirm" linking to /learners/class-feedback.
--
-- IN-APP ONLY. No email / WhatsApp. The cron route
-- app/api/cron/session-feedback-nudge calls this via service role.
--
-- GROUND TRUTH (re-verified against live prod 2026-06-23):
--   * attendance is a faculty-owned JSONB blob on
--     student_attendance.attendance_data, keyed by period_id; each period holds
--     students[]{student_id,status,...}. We NEVER mutate it.
--   * "pending" = a learner is status='Present' in a period AND no session_feedback
--     row exists for (student_id, attendance_date, period_id). This generalizes
--     fn_scf_pending_for_learner (which scopes to auth.uid()) to ALL learners.
--   * IDENTITY MAPPING (the delivery hop):
--       blob students[].student_id  ==  learners_profiles.id
--       learners_profiles.profile_id ==  profiles.id == auth user id
--                                    ==  user_notifications.user_id
--     So to deliver to a learner we join the blob student_id ->
--     learners_profiles -> profile_id, and that profile_id is the bell recipient.
--
-- NOTIFICATION MECHANISM (discovered, not guessed — 2026-06-23):
--   There is NO fan-out trigger on `notifications` (only a delete-guard and a
--   set_timestamp trigger). Server-side notification delivery is a MANUAL
--   two-table insert: one `notifications` row + one `user_notifications` row per
--   recipient. This mirrors the canonical fn_create_dashboard_work_item engine
--   (which powers the "Attendance not marked today" work items). We follow it
--   exactly: kind='work_item', requires_acknowledgment=FALSE (no blocking ack
--   modal), category='dashboard:scf_nudge', targeting={type:'user',user_ids:[..]}.
--
-- IDEMPOTENCY: `notifications.idempotency_key` has a UNIQUE *partial* index
--   (idx_notifications_idempotency WHERE key IS NOT NULL). A partial index is NOT
--   a usable ON CONFLICT target without a matching inference predicate, so — like
--   the canonical fn_create_dashboard_work_item engine — we de-dup with a
--   WHERE NOT EXISTS guard against today's key instead. We key each nudge as
--   'scf-nudge:' || <learner profile_id> || ':' || CURRENT_DATE, so re-running the
--   cron the same day creates no duplicates. (user_notifications is only inserted
--   for the notifications rows actually created this run — see the CTE chain.)
--
-- created_by (system identity): a notifications.created_by is NOT NULL. This is a
--   system-generated nudge, so we resolve a stable system identity at runtime —
--   the earliest super_admin (profiles.is_super_admin) — and fall back to the
--   recipient's own profile_id if somehow no super_admin exists (mirrors
--   fn_create_dashboard_work_item, which sets created_by = the target user). The
--   value is COALESCEd per-row so the NOT NULL constraint can never be violated.
--
-- This migration is ADDITIVE + SAFE: one new SECURITY DEFINER function, locked to
-- service_role. It does NOT touch student_attendance, session_feedback, or any
-- existing RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_nudge_pending_learners(
  p_lookback_days int DEFAULT 14
)
RETURNS TABLE(learners_nudged int, sessions_pending_total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      'You have ' || pl.pending_count || ' class' ||
        CASE WHEN pl.pending_count = 1 THEN '' ELSE 'es' END || ' to confirm',
      'Take 10 seconds to confirm you attended and rate how well you understood '
        || 'your recent class' || CASE WHEN pl.pending_count = 1 THEN '' ELSE 'es' END
        || '. Your attendance stays "present-pending" until you confirm.',
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
      NOW(), NOW()
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
$$;

COMMENT ON FUNCTION public.fn_scf_nudge_pending_learners(int) IS
  'SCF adoption nudge: for every learner Present-but-unconfirmed in the last '
  'p_lookback_days, creates ONE in-app bell notification (notifications + '
  'user_notifications, mirroring fn_create_dashboard_work_item) linking to '
  '/learners/class-feedback. Idempotent per learner per day via idempotency_key. '
  'service_role only — called by the daily cron app/api/cron/session-feedback-nudge.';

-- Locked to the cron (service role) only — no end user calls this.
REVOKE EXECUTE ON FUNCTION public.fn_scf_nudge_pending_learners(int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_scf_nudge_pending_learners(int) TO service_role;
