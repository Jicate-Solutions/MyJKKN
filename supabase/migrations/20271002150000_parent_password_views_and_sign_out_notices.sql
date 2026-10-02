-- ============================================================================
-- Migration: 20271002150000_parent_password_views_and_sign_out_notices
-- Purpose:   Two ADD_ONLY tables for PR #4169 ("Sign out of all devices").
--
-- Director rulings, 2 Oct 2026:
--   A. A parent's saved starting password may be seen by SUPER ADMINS ONLY.
--   B. Every view is recorded: who viewed, which parent account, and when.
--   C. Once the parent has changed their own password, the admin sees only
--      "Changed by parent" (decided on the server; no value is stored here).
--   D. When an admin signs someone else out of all devices, that person sees
--      "An admin signed you out of all devices on <date>." the next time they
--      sign in, once.
--
-- 1. pp_parent_password_views — one row per "Show password" click.
--    WHO WRITES: only the service role, from
--    app/api/academic/parent-portal/users/show-password/route.ts, which checks
--    profiles.is_super_admin on the server and refuses to return a value if the
--    row cannot be written. No INSERT / UPDATE / DELETE for `authenticated`.
--    WHO READS: super admins only (deliberately NOT is_admin(): ruling A).
--    The table never stores a password, only the outcome.
--
-- 2. sign_out_notices — one row per admin sign-out of someone else.
--    Exactly one of user_id (a team member or learner, Supabase login) or
--    parent_account_id (a parent, parent_session login) is set.
--    WHO WRITES: only the service role, from
--    app/(routes)/users/[id]/_actions/revoke-user-sessions.ts and
--    app/api/academic/parent-portal/users/sign-out-everywhere/route.ts.
--    A self sign-out writes nothing.
--    WHO READS: the person themself (user_id = auth.uid()). They may UPDATE
--    only the seen_at column (column-level grant: a row rule cannot pin
--    columns). Parent rows have no policy at all: parents do not use Supabase
--    Auth, so their notice is read and marked seen by
--    app/api/parent/sign-out-notice/route.ts with the service role, scoped to
--    the verified parent_session token's own account.
--
-- anon and PUBLIC have no access to either table. No functions are added.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. pp_parent_password_views
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pp_parent_password_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.pp_parent_accounts(id) ON DELETE CASCADE,
  viewed_by   UUID NOT NULL,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result      TEXT NOT NULL CHECK (result IN ('shown', 'changed_by_parent')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pp_parent_password_views_account
  ON public.pp_parent_password_views (account_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_parent_password_views_viewer
  ON public.pp_parent_password_views (viewed_by, viewed_at DESC);

COMMENT ON TABLE public.pp_parent_password_views IS
  'One row per super-admin "Show password" click on a parent account (Director ruling 2026-10-02). Stores the outcome, never the password. Written by the service role only.';

-- ---------------------------------------------------------------------------
-- 2. sign_out_notices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sign_out_notices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_account_id  UUID NULL REFERENCES public.pp_parent_accounts(id) ON DELETE CASCADE,
  signed_out_by      UUID NOT NULL,
  signed_out_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at            TIMESTAMPTZ NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sign_out_notices_one_target CHECK (num_nonnulls(user_id, parent_account_id) = 1)
);
CREATE INDEX IF NOT EXISTS idx_sign_out_notices_user_unseen
  ON public.sign_out_notices (user_id) WHERE seen_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sign_out_notices_parent_unseen
  ON public.sign_out_notices (parent_account_id) WHERE seen_at IS NULL;

COMMENT ON TABLE public.sign_out_notices IS
  'An admin signed this person out of all devices; shown once after their next sign-in (Director ruling 2026-10-02). Written by the service role only.';

DROP TRIGGER IF EXISTS trg_pp_parent_password_views_updated_at ON public.pp_parent_password_views;
CREATE TRIGGER trg_pp_parent_password_views_updated_at
  BEFORE UPDATE ON public.pp_parent_password_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sign_out_notices_updated_at ON public.sign_out_notices;
CREATE TRIGGER trg_sign_out_notices_updated_at
  BEFORE UPDATE ON public.sign_out_notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Row security and grants
-- ---------------------------------------------------------------------------
ALTER TABLE public.pp_parent_password_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sign_out_notices         ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant ALL on every new table to anon and
-- authenticated; take that back before granting the narrow set.
REVOKE ALL ON TABLE public.pp_parent_password_views FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.sign_out_notices         FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.pp_parent_password_views FROM authenticated;
REVOKE ALL ON TABLE public.sign_out_notices         FROM authenticated;

GRANT SELECT ON TABLE public.pp_parent_password_views TO authenticated;
GRANT SELECT ON TABLE public.sign_out_notices         TO authenticated;
GRANT UPDATE (seen_at) ON TABLE public.sign_out_notices TO authenticated;

GRANT ALL ON TABLE public.pp_parent_password_views TO service_role;
GRANT ALL ON TABLE public.sign_out_notices         TO service_role;

-- Password views: super admins only (ruling A — not is_admin()).
DROP POLICY IF EXISTS pp_parent_password_views_select ON public.pp_parent_password_views;
CREATE POLICY pp_parent_password_views_select ON public.pp_parent_password_views
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Sign-out notices: the person themself, own rows only.
DROP POLICY IF EXISTS sign_out_notices_select_own ON public.sign_out_notices;
CREATE POLICY sign_out_notices_select_own ON public.sign_out_notices
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS sign_out_notices_update_own ON public.sign_out_notices;
CREATE POLICY sign_out_notices_update_own ON public.sign_out_notices
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
