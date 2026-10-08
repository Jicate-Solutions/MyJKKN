-- Parent Portal: "sign out everywhere" marker for sliding parent sessions.
-- Added: 2026-10-01 - feat/parent-session-renews
--
-- The parent_session JWT now slides (re-issued daily, 400-day expiry) so a
-- parent using the installed app is never logged out. The server-side kill
-- switch reads this column on every parent request:
--   any token whose iat (issued-at, seconds) is AT OR BEFORE sessions_revoked_at
--   is rejected and its cookie cleared on the next request.
-- To sign a parent out of every device: UPDATE pp_parent_accounts
--   SET sessions_revoked_at = now() WHERE id = <account id>;
-- NULL (the default) = never revoked. No function, no policy, no RLS change.

ALTER TABLE public.pp_parent_accounts
  ADD COLUMN IF NOT EXISTS sessions_revoked_at timestamptz;

COMMENT ON COLUMN public.pp_parent_accounts.sessions_revoked_at IS
  'Sign out everywhere: parent_session tokens issued at or before this moment are rejected (lib/auth/parent-session-state.ts). NULL = never revoked.';
