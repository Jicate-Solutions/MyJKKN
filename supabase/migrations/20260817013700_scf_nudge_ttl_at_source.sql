-- ================================================================================
-- dashboard:scf_nudge — stamp a TTL at the point of emission. FORWARD-ONLY.
--
-- Created: 2026-08-10
-- Follows the pattern established by
--   supabase/migrations/20260816040000_notification_expiry_director_categories.sql
-- (applied to production 2026-08-10): expiry belongs on the generator, the read
-- path already honours it, and nothing is deleted.
--
-- --------------------------------------------------------------------------------
-- WHY
-- --------------------------------------------------------------------------------
-- Measured on production 2026-08-10, `notifications` rows created in the last 14
-- days with expires_at IS NULL, by category:
--
--   dashboard:scf_nudge                 17,162   <-- this file
--   dashboard:rescue                     1,445
--   dashboard:approval                     987
--   ai_pulse                               596
--   schools_network                        148
--   accreditation                           47
--   meetings:calendar-connect-needed        47
--   dashboard:escalation                    41
--   meetings:calendar-connect-weekly        37
--
-- scf_nudge is 84% of that total and ~1,226 rows/day, and it is STILL EMITTING:
-- the newest such row is 2026-08-10 07:15, which is the daily
-- `session-feedback-nudge` routine (cronExpr '13 7 * * *') landing its batch.
-- A sample row: idempotency_key 'scf-nudge:<userId>:2026-08-10',
-- title 'You have 4 classes to confirm', expires_at NULL.
--
-- The row qualifies for a TTL under the rule set in 20260816040000: the SAME
-- underlying fact is re-announced on a fixed cycle under a per-DAY idempotency
-- key ('scf-nudge:<recipient>:<YYYY-MM-DD>'), and the real work lives on a page
-- (/learners/class-feedback), not in the notification. Expiring yesterday's copy
-- hides nothing — today's run restates it for any learner who still has pending
-- in-window sessions.
--
-- It is in fact the STRONGEST case in the estate for a TTL, because the nudge
-- points at a window that closes on its own. The generator only selects sessions
-- whose two-sided feedback window is still open (Director, 2026-07-08:
-- `session_feedback.window_hours`, default 48). Once that window shuts, the
-- submit RPC rejects the confirmation — so a nudge that outlives the window is
-- not merely stale, it is a dead end that cannot be actioned at all.
--
-- --------------------------------------------------------------------------------
-- WHAT THIS FILE DOES *NOT* DO — no backfill, and no supersede
-- --------------------------------------------------------------------------------
-- It changes NOTHING about rows that already exist. The ~17,162 unexpired
-- scf_nudge rows (and every other category above) are left exactly as they are.
-- Clearing them is a separate, explicit Director decision — the last such
-- backfill (20260816040100, 43,775 rows) required one, and this file is not a
-- place to take that decision by implication.
--
-- ############################################################################
-- ##  DELIBERATE DIVERGENCE FROM 20260803070000 — READ THIS                 ##
-- ############################################################################
-- supabase/migrations/20260803070000_scf_nudge_expiry_and_supersede.sql already
-- carries a TTL for this function. It has never been applied to production —
-- that is precisely why prod is still emitting expires_at IS NULL rows today.
--
-- That file does TWO things. This one carries only the first:
--
--   1. expires_at on newly created rows.            <-- CARRIED (widened, below)
--   2. "Supersede-on-resend": an UPDATE that sets   <-- DELIBERATELY NOT CARRIED
--      expires_at = now() on EVERY dashboard:scf_nudge row not keyed to
--      CURRENT_DATE, executed at the top of every run.
--
-- (2) is a mass retroactive expiry wearing a generator's clothes. Its first run
-- on production would expire ~17,162 existing rows in one statement — the same
-- class of change as the 43,775-row backfill, but arriving through a cron
-- instead of through a migration anyone reviewed. Under the no-backfill
-- constraint this file is written to, that is not mine to trigger. If the
-- Director wants those rows cleared, that is a one-line decision to take
-- knowingly, not a side effect of switching the TTL on.
--
-- ORDERING, and why this file is deliberately NOT gated:
--   20260803070000 sorts BEFORE this file and carries no guard of its own. The
--   repo's only apply mechanism (.github/workflows/supabase-migration-apply.yml)
--   is a blanket `supabase db push` over a diverged ledger, so it WOULD run that
--   file. Because this file sorts after it and replaces the same function, the
--   supersede body is overwritten by this body in the same push — this file
--   DEFUSES that landmine rather than adding to it.
--
--   A RAISE-style gate here (as used by 20260816040000) would invert that: the
--   push would apply 20260803070000, then abort at this file, and production
--   would be left holding the supersede body — the exact mass expiry the
--   paragraph above refuses. So this file carries no gate, and is safe to apply
--   in any order as long as it is not applied BEFORE 20260803070000.
--
--   THE ONE UNSAFE PATH: hand-applying 20260803070000 ALONE, following its own
--   header. Do not. Apply this file instead — it supersedes that one entirely.
--
-- --------------------------------------------------------------------------------
-- THE TTL, AND WHY IT IS DERIVED RATHER THAN LITERAL
-- --------------------------------------------------------------------------------
-- 20260816040000 could hardcode 36h because every cadence behind it is pinned in
-- vercel.json, i.e. a cadence change and the TTL ship in the same deploy. That
-- does NOT hold here: `session-feedback-nudge` is not in vercel.json. It is a
-- dispatcher routine (lib/ai-routines/scf-session-feedback.ts) whose schedule
-- lives in `ai_routine_schedules` and is editable on /admin/ai-routines with no
-- deploy. A literal 36h would silently invert the moment somebody slowed the
-- routine to, say, twice a week: rows would die four days before their
-- replacement was due and the reminder would simply stop existing.
--
-- So the TTL is read from the routine's OWN dispatcher row, mirroring
-- staleThresholdMs() in lib/ai-routines/loop-governance.ts (the same derivation
-- app/api/cron/loop-watchdog/route.ts uses for the same reason):
--
--   cycle  = (largest cyclic gap between scheduled days) * 24h + 1h slack
--   ttl    = GREATEST( ceil(cycle * 1.5), 36h )
--
-- 1.5x absorbs a LATE run (up to half a cycle of slip still overlaps the
-- previous row) while capping the stack at 2 instead of letting it grow without
-- bound. It does NOT survive a fully SKIPPED cycle — that needs >= 2x — and the
-- accepted consequence is the same bounded under-count 20260816040000 accepted.
-- On today's daily cadence this resolves to 38h.
--
-- The 36h floor is the same number and the same argument as 20260816040000: a
-- TTL at exactly 1x the cadence kills the row at the moment its replacement is
-- due, so any slip at all empties the bell.
--
-- Missing dispatcher row, empty days_of_week, or a not-yet-applied
-- `ai_routine_schedules` table all fall back to "assume daily" — the same
-- default staleThresholdMs() takes, and the same one the floor covers anyway.
-- The derivation is computed ONCE per run into v_expires_at, so every row in a
-- batch carries an identical expiry.
-- ================================================================================

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
  -- 2026-08-10 expiry: derived TTL, see header.
  v_days         smallint[];
  v_max_gap      int := 1;      -- days between consecutive runs; 1 = daily
  v_ttl_hours    int;
  v_expires_at   timestamptz;
BEGIN
  -- Stable system identity for notifications.created_by (NOT NULL). Earliest
  -- super_admin; per-row COALESCE to the recipient guarantees non-null even if
  -- this is somehow NULL.
  SELECT p.id INTO v_system_actor
  FROM public.profiles p
  WHERE p.is_super_admin = true
  ORDER BY p.created_at ASC
  LIMIT 1;

  -- ── 2026-08-10 expiry: derive this run's TTL from our own cadence ──────
  -- Guarded on the table existing so a diverged ledger degrades to "daily"
  -- instead of raising and killing the nudge for every learner.
  IF to_regclass('public.ai_routine_schedules') IS NOT NULL THEN
    SELECT s.days_of_week INTO v_days
    FROM public.ai_routine_schedules s
    WHERE s.routine_id = 'session-feedback-nudge';
  END IF;

  IF v_days IS NOT NULL AND array_length(v_days, 1) IS NOT NULL THEN
    -- Largest cyclic gap between scheduled days (0=Sun..6=Sat), e.g. a
    -- Mon+Thu schedule yields 4. LEAD() wraps to the first day + 7.
    SELECT MAX(gap) INTO v_max_gap
    FROM (
      SELECT COALESCE(
               LEAD(dow) OVER (ORDER BY dow),
               MIN(dow)  OVER () + 7
             ) - dow AS gap
      FROM (SELECT DISTINCT unnest(v_days)::int AS dow) d
    ) g;
  END IF;
  v_max_gap := COALESCE(NULLIF(v_max_gap, 0), 1);

  -- cycle = gap*24h + 1h slack; ttl = max(cycle * 1.5, 36h). Daily -> 38h.
  v_ttl_hours  := GREATEST(CEIL((v_max_gap * 24 + 1) * 1.5)::int, 36);
  v_expires_at := NOW() + make_interval(hours => v_ttl_hours);

  -- NOTE: no supersede-on-resend UPDATE here, by design. See the header — that
  -- statement would retroactively expire ~17,162 existing rows on its first run,
  -- which is a Director decision, not a generator's business.

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
      -- 2026-08-10 expiry: honoured by liveNotificationOrFilter() in the bell /
      -- inbox / rollup read path. Admin/manage/stats reads deliberately do NOT
      -- apply it, so every row stays auditable at /notifications/admin.
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
      NOW(), NOW(), v_expires_at
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
  '2026-08-10: stamps expires_at on newly created rows, with the TTL DERIVED from this '
  'routine''s own ai_routine_schedules cadence (max cyclic day gap * 24h + 1h, * 1.5, '
  'floored at 36h; daily => 38h) so a no-deploy schedule edit cannot invert the margin. '
  'Forward-only: existing rows are untouched, and the supersede-on-resend UPDATE from '
  'the never-applied 20260803070000 is deliberately NOT carried — it would retroactively '
  'expire ~17,162 rows. Read path honours expires_at; admin surfaces still show lapsed rows.';

-- Lock down per CLAUDE.md: cron-only RPC → service_role, never anon/authenticated.
-- Re-asserted here because Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on
-- every new/replaced function to anon AND to authenticated.
REVOKE EXECUTE ON FUNCTION public.fn_scf_nudge_pending_learners(int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_scf_nudge_pending_learners(int) TO service_role;
