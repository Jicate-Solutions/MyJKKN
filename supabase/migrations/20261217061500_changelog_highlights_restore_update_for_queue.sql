-- Restore UPDATE on changelog_highlights for `authenticated`.
--
-- 20261217060000 revoked UPDATE and DELETE from authenticated on every changelog
-- table, on the stated assumption that "super-admin takedowns go through the
-- service role too". That assumption was WRONG. The approval queue at
-- app/api/whats-new/highlights/route.ts writes as the signed-in super admin
-- through createClient() — the user's own session — gated by the RLS policy
-- changelog_highlights_manage (FOR ALL TO authenticated, permission-checked).
--
-- A policy grants nothing on its own; it narrows a table privilege that must
-- already exist. With the privilege gone, every Approve / Hide / Restore on the
-- queue failed with 42501 from 05:12 IST until 06:15 IST on 2026-09-15. That is
-- the only human control on ~450 unreviewed AI write-ups. Caught by an
-- adversarial sweep within the hour; GRANT applied live at 06:15, this file
-- records it so the ledger tells the truth.
--
-- DELETE stays revoked on every changelog table. The queue never deletes —
-- a takedown is an UPDATE to status = 'skipped'.

GRANT UPDATE ON public.changelog_highlights TO authenticated;

DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.changelog_highlights', 'UPDATE') THEN
    RAISE EXCEPTION 'the approval queue cannot write — UPDATE missing on changelog_highlights';
  END IF;
  IF has_table_privilege('authenticated', 'public.changelog_highlights', 'DELETE')
     OR has_table_privilege('authenticated', 'public.changelog_entries', 'DELETE')
     OR has_table_privilege('authenticated', 'public.changelog_entries', 'UPDATE') THEN
    RAISE EXCEPTION 'a destructive grant came back that 20261217060000 removed';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
