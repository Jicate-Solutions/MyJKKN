-- Updated: 2026-07-25 - Fix Learners Council chat: infinite recursion in RLS.
--
-- Bug (BUG-005068): creating or opening a chat channel fails with
-- "infinite recursion detected in policy for relation lc_chat_members".
--
-- Cause: lc_chat_members_select decides "may I read this membership row?" by running
--   EXISTS (SELECT 1 FROM lc_chat_members cm WHERE cm.channel_id = lc_chat_members.channel_id ...)
-- i.e. it queries lc_chat_members from inside the policy ON lc_chat_members. Evaluating that
-- subquery re-invokes the same policy, forever (Postgres 42P17). And because
-- lc_chat_channels_select and lc_chat_messages_select each subquery lc_chat_members, the
-- recursion also breaks reading channels and messages. A channel INSERT succeeds, but the
-- .select() that returns the new row trips the recursive read -> the whole create fails, so
-- to the user "the channel was not created". Result: 0 channels exist on production.
--
-- Fix: a SECURITY DEFINER helper answers the membership question with a query that runs as
-- the function owner and therefore bypasses RLS -- so it never re-triggers the policy. All
-- three SELECT policies (and the message INSERT check) call the helper instead of
-- subquerying lc_chat_members directly. Read-only membership check; no data changes.

-- ============================================================================
-- 1. MEMBERSHIP HELPER (bypasses RLS -> breaks the recursion)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_is_lc_chat_member(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM lc_chat_members
    WHERE channel_id = p_channel_id
      AND user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_lc_chat_member(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_lc_chat_member(uuid) TO authenticated;

-- ============================================================================
-- 2. REWRITE THE SELF-REFERENTIAL POLICY (the actual recursion)
-- ============================================================================
DROP POLICY IF EXISTS lc_chat_members_select ON lc_chat_members;
CREATE POLICY lc_chat_members_select ON lc_chat_members
FOR SELECT TO authenticated
USING (
  -- your own membership rows are always visible, plus any row in a channel you belong to
  user_id = auth.uid()
  OR fn_is_lc_chat_member(channel_id)
);

-- ============================================================================
-- 3. POINT THE DEPENDENT READS AT THE HELPER TOO
--    (their subqueries on lc_chat_members were inheriting the recursion)
-- ============================================================================
DROP POLICY IF EXISTS lc_chat_channels_select ON lc_chat_channels;
CREATE POLICY lc_chat_channels_select ON lc_chat_channels
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR fn_is_lc_chat_member(id)
);

DROP POLICY IF EXISTS lc_chat_messages_select ON lc_chat_messages;
CREATE POLICY lc_chat_messages_select ON lc_chat_messages
FOR SELECT TO authenticated
USING ( fn_is_lc_chat_member(channel_id) );

DROP POLICY IF EXISTS lc_chat_messages_insert ON lc_chat_messages;
CREATE POLICY lc_chat_messages_insert ON lc_chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND fn_is_lc_chat_member(channel_id)
);

-- Note: lc_chat_channels_insert (created_by = auth.uid()) and lc_chat_members_insert are
-- left unchanged -- they do not subquery lc_chat_members and are not part of the recursion.
