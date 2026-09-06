-- ============================================================================
-- 20260812000000 — the lapse ledger accepts writes only from its own function
-- ============================================================================
-- 20260810140000 created public.gemba_official_lapse_notices with RLS on and a
-- read policy, and correctly revoked anon. It did NOT revoke the Supabase
-- default grant to `authenticated`, so a signed-in client still holds
-- INSERT/UPDATE/DELETE on the table directly.
--
-- Nothing is exposed by that today: RLS carries a SELECT policy and there is no
-- INSERT/UPDATE/DELETE policy, so writes are denied by policy. But a GRANT that
-- RLS happens to mask is not the same as a GRANT that was withdrawn — one added
-- permissive policy turns it into a real write path. The sibling table
-- ss_case_studies (20260809011500) locked this correctly; this brings the
-- ledger into line with it.
--
-- Note the order: REVOKE first, THEN grant SELECT. Granting SELECT on top of an
-- existing arwdDxt is a no-op that only LOOKS restrictive.
-- ============================================================================
-- RENAME-SAFE: 20260810150000 -> 20260812000000 — the ledger row for
--   20260810150000 belongs to `create_leadership_booking_pages`, a different
--   lane's migration, so this file never claimed that version in production.
--   This file's own effect was verified UNAPPLIED at rename time:
--   has_table_privilege('authenticated','public.gemba_official_lapse_notices',
--   'INSERT') still returned true. Renumbered to a version confirmed free in
--   BOTH the ledger and the tree, and above both maxima.
--
--   Why the marker is here at all: the rename gate fails closed when it cannot
--   reach production ("no-credentials"), which is not the same as a positive
--   finding that the source was applied. This records the answer it could not
--   obtain, for whoever hits that gate next.

REVOKE ALL ON TABLE public.gemba_official_lapse_notices FROM anon, PUBLIC, authenticated;
GRANT  SELECT ON TABLE public.gemba_official_lapse_notices TO authenticated;

COMMENT ON TABLE public.gemba_official_lapse_notices IS
  'Dedupe ledger for official-status lapse notices. Readable by authenticated '
  '(RLS-scoped); written ONLY by fn_gemba_official_lapse_notify (SECURITY '
  'DEFINER). No direct write grant exists — do not re-add one.';
