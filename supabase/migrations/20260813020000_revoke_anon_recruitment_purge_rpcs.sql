-- Close the last two anon-executable SECURITY DEFINER functions
--
-- The `Live anon-exposure sweep` workflow has been RED on `main` for many
-- commits — not because of any one PR, but because two functions from
-- 20260810170000_hr_recruitment_purge_rejected_applicant.sql shipped without the
-- REVOKE that CLAUDE.md makes mandatory for every new SECDEF RPC. A repo-wide
-- red gate makes every PR's status meaningless, so it gets its own hotfix rather
-- than riding along with a feature.
--
--   fn_clear_recruitment_purge_drive_ref(uuid)              [SECDEF, WRITES]
--   fn_purge_rejected_recruitment_applicant(uuid, uuid)     [SECDEF, WRITES]
--
-- Why "anon can execute" was true even though nobody granted anon anything:
-- the live ACL on both reads
--
--     =X/postgres  postgres=X/postgres  authenticated=X/postgres  service_role=X/postgres
--      ^^^^^^^^^^
--
-- and that leading `=X/` IS the grant to PUBLIC. PostgreSQL grants EXECUTE to
-- PUBLIC by default on every new function, and `anon` inherits it. So `anon`
-- holds no grant of its OWN — which is exactly why `REVOKE ... FROM anon` alone
-- would succeed, change nothing, and report success. **The PUBLIC in the REVOKE
-- below is the load-bearing half.**
--
-- Exposure, stated honestly: both functions DO guard themselves —
--   IF NOT (SELECT public.is_super_admin()) THEN RAISE EXCEPTION ... 42501
-- so an anonymous caller is refused today and no data was reachable. This is
-- defence in depth, not an incident: a SECDEF function runs as its OWNER and
-- bypasses RLS entirely, so that one IF is the only thing standing between an
-- anonymous caller and a permanent purge of applicant records. The gate exists
-- so that guard is never the last line.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.fn_clear_recruitment_purge_drive_ref(uuid)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_clear_recruitment_purge_drive_ref(uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_purge_rejected_recruitment_applicant(uuid, uuid)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_purge_rejected_recruitment_applicant(uuid, uuid)
  TO authenticated;

COMMIT;

-- ROLLBACK (restores the default-PUBLIC state — only if something depended on it)
--   GRANT EXECUTE ON FUNCTION public.fn_clear_recruitment_purge_drive_ref(uuid) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.fn_purge_rejected_recruitment_applicant(uuid, uuid) TO PUBLIC;
--
-- VERIFY (in a SEPARATE call — the Management API wraps a batch in one
-- transaction, so a check inside the apply proves nothing). The ACL must no
-- longer begin with a bare `=X/`:
--   SELECT p.proname, array_to_string(p.proacl,' ') AS acl
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('fn_clear_recruitment_purge_drive_ref',
--                        'fn_purge_rejected_recruitment_applicant');
--
-- Then re-run the gate itself — objects verifying is not the same as the sweep
-- passing:
--   node scripts/ci/check-anon-exposure-live.mjs
