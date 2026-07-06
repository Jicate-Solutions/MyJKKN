-- =====================================================================
-- Department-Instagram engagement loop — ADOPTION NUDGES (2026-07-06)
-- =====================================================================
-- The engagement loop shipped live (PRs #1818/#1827) but is SILENT: no rota
-- assignment ever pings the contributor, and no learner ever hears their post
-- earned real signal. A loop with no heartbeat sits at 0% adoption (the exact
-- failure mode of AI Pulse + the Events↔Resource loop in this project). These
-- two nudges are that heartbeat.
--
-- This migration adds ONLY:
--   1. reminded_at   — nudge #1 idempotency (one weekly reminder per rota row)
--   2. signal_notified_at — nudge #2 idempotency (one recognition per contribution)
--   3. fn_social_recent_posts_for_handle — lets a handle MANAGER attribute a
--      posted contribution to its actual IG post, so real-signal is truthful
--      (Director choice 2026-07-06: owner picks the post — accurate attribution).
-- Additive + nullable — safe on live data.
-- =====================================================================

-- 1. Nudge #1 idempotency ------------------------------------------------------
ALTER TABLE public.social_contributor_rota
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
COMMENT ON COLUMN public.social_contributor_rota.reminded_at IS
  'When the weekly "it''s your week to post" reminder was delivered for this rota row. NULL = not yet reminded. Set by /api/cron/social-nudges.';

-- 2. Nudge #2 idempotency ------------------------------------------------------
ALTER TABLE public.social_contributions
  ADD COLUMN IF NOT EXISTS signal_notified_at timestamptz;
COMMENT ON COLUMN public.social_contributions.signal_notified_at IS
  'When the "your post earned N real-signal" recognition was delivered. NULL = not yet (or the post has 0 real-signal so far — retried when metrics arrive). Set by /api/cron/social-nudges.';

-- 3. Owner post-attribution picker --------------------------------------------
-- Returns recent IG posts for a dept the caller MANAGES, so the owner console can
-- link a posted contribution to the exact ig_posts row it became. SECURITY DEFINER
-- (reads ig_posts across RLS) — so the manager gate is DUPLICATED INSIDE the body,
-- not left only on a policy (a DEFINER RPC bypasses table RLS).
CREATE OR REPLACE FUNCTION public.fn_social_recent_posts_for_handle(
  p_dept_account_id uuid,
  p_limit integer DEFAULT 12
)
RETURNS TABLE(post_id uuid, caption text, permalink text, media_type text, posted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT po.id, left(po.caption, 140), po.permalink, po.media_type, po.posted_at
  FROM public.ig_posts po
  JOIN public.social_dept_accounts sda ON sda.ig_account_id = po.account_id
  WHERE sda.id = p_dept_account_id
    AND public.fn_social_can_manage_handle(p_dept_account_id)   -- gate INSIDE the definer
  ORDER BY po.posted_at DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 12), 50));
$$;

-- Lock from anon (Supabase grants anon EXECUTE on every new function by default).
REVOKE EXECUTE ON FUNCTION public.fn_social_recent_posts_for_handle(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_recent_posts_for_handle(uuid, integer) TO authenticated;
