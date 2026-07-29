-- Updated: 2026-07-25 - Learners Council polls: add the missing UPDATE policy so a poll
-- can leave draft.
--
-- Bug (BUG-004615, polls half): every poll a member creates stays a draft and can never be
-- posted (7 drafts, 0 ever active on production). The service already has the full lifecycle
-- (activatePoll draft->active, pausePoll, resumePoll, closePoll) and the UI has a Close
-- button -- but lc_polls has only SELECT and INSERT policies and NO UPDATE policy, so every
-- one of those transitions silently affects 0 rows. A poll therefore can never change state.
--
-- Fix: add an UPDATE policy. Authority matches the existing poll lifecycle, which was built
-- for the poll's creator to manage (activate / pause / resume / close): the creator may
-- update their own poll, and LC office bearers or a super admin may manage any poll. Anon
-- has no access (default-deny; no grant here).
--
-- Note: this is intentionally NOT the executive-only "submit" gate used for announcements.
-- Polls were designed as creator-run; if the Director later wants polls to require an office
-- bearer to publish (like announcements), tighten the created_by branch to fn_is_lc_executive().

DROP POLICY IF EXISTS lc_polls_update ON lc_polls;
CREATE POLICY lc_polls_update ON lc_polls
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR is_super_admin()
  OR fn_is_lc_executive()
)
WITH CHECK (
  created_by = auth.uid()
  OR is_super_admin()
  OR fn_is_lc_executive()
);
