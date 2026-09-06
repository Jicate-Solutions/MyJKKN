-- =====================================================================
-- ⛔ DO NOT AUTO-APPLY — ONE-TIME, USER-GATED DATA BACKFILL ⛔
-- =====================================================================
-- Created: 2026-07-26. This file is shipped in the PR but is INTENTIONALLY
-- NOT applied. It mutates ~170K rows across every affected user's inbox, so it
-- must only be run manually via the Supabase Management API AFTER explicit
-- sign-off from the user. Deploy ships CODE, not migrations, so merging +
-- deploying this PR does NOT run this file.
--
-- Ordering: run this AFTER the read-path change is deployed
-- (lib/services/notification/notification-service.ts honors expires_at) and,
-- ideally, before the first post-deploy scf cron run — that makes the RPC's
-- first supersede a tiny delta instead of a ~68K sweep.
--
-- WHAT IT DOES: stamps expires_at = now() on the accumulated stale broadcast
-- rows so the read path (which now filters expired rows) drops them from the
-- bell/badge counts. It does NOT delete anything — rows stay auditable.
--
--   1. dashboard:scf_nudge (THE bell lever): prior-day nudges only. Today's
--      nudges are still actionable (their feedback window may be open), so they
--      are preserved. This is what drops the ~55.7K unread scf backlog.
--   2. doctrines:friday-reflection / doctrines:sunday-wrap: all remaining
--      un-expired rows. These carry ZERO user_notifications (never entered the
--      bell), so this is pure `notifications`-table hygiene — 104K write-only
--      rows accumulated since 2026-04-24. No bell/badge effect; bounds the table.
--
-- VALIDATION: dry-run counts confirmed via BEGIN..ROLLBACK on prod 2026-07-26.
-- =====================================================================

-- 1) scf_nudge — prior-day, still-unexpired (preserves today's actionable nudges)
UPDATE public.notifications
   SET expires_at = now()
 WHERE category = 'dashboard:scf_nudge'
   AND expires_at IS NULL
   AND created_at < CURRENT_DATE;

-- 2) doctrines weekly cards — all remaining unexpired (invisible bloat cleanup)
UPDATE public.notifications
   SET expires_at = now()
 WHERE category IN ('doctrines:friday-reflection', 'doctrines:sunday-wrap')
   AND expires_at IS NULL;
