-- Migration: 20260807190000_revoke_anon_billing_analytics_rpcs.sql
-- Date:      2026-07-30
-- Severity:  LIVE production exposure on a money path. Fix-only, no behaviour change.
--
-- WHAT IS OPEN RIGHT NOW
--   Two SECURITY DEFINER billing RPCs are executable by the `anon` role on
--   production. Because they are SECURITY DEFINER they run as their owner and
--   bypass RLS entirely, so the permission check inside each body is the only
--   thing standing between an unauthenticated caller and institution-wide
--   revenue aggregates:
--
--     public.get_billing_analytics_by_category(p_institution_ids uuid[])
--     public.get_billing_collection_split(p_institution_ids uuid[],
--                                         p_date_from date, p_date_to date)
--
--   Measured on production before writing this migration:
--     has_function_privilege('anon', oid, 'EXECUTE') = true   for BOTH
--     proacl = {=X/postgres, postgres=X/postgres,
--               authenticated=X/postgres, service_role=X/postgres}
--
--   The leading `=X/postgres` entry (empty grantee) IS the PUBLIC grant. `anon`
--   is a member of PUBLIC, so it reaches EXECUTE through PUBLIC.
--
-- WHY THE EXISTING REVOKE DID NOT CLOSE IT
--   Migration `20260801012000_billing_collection_split_rpcs.sql` ends each
--   function with:
--
--     REVOKE ALL ON FUNCTION public.<fn>(...) FROM anon;
--
--   That revokes only the DIRECT grant to `anon`. It leaves the PUBLIC grant
--   untouched, and `anon` inherits EXECUTE from PUBLIC — so the revoke was a
--   no-op and both functions stayed open. This is precisely the trap the
--   CLAUDE.md rule "Lock new RPCs from anon" and migration
--   `20260605191101_revoke_platform_rpcs_anon_access.sql` (which revoked
--   `FROM anon, PUBLIC` across 155 platform RPCs) exist to prevent.
--
--   `get_billing_analytics_by_category` was in fact already locked by that
--   2026-06-05 sweep. `20260801012000` then did `DROP FUNCTION ... ; CREATE
--   FUNCTION ...` to change its RETURNS TABLE column set, which reset the ACL
--   back to Postgres/Supabase defaults — reopening a hole that had been closed.
--   A `CREATE OR REPLACE` preserves grants; a DROP + CREATE does not.
--
-- CONFIRMED NOT INTENTIONALLY PUBLIC
--   Neither function carries a comment documenting deliberate anon access (the
--   audit-trail signal this repo requires for genuinely-public RPCs such as the
--   community/caste reads on the unauthenticated admission landing page). The
--   only call site in the codebase is
--   `lib/services/billing/analytics/billing-analytics-service.ts`, an
--   authenticated billing analytics service. There is no unauthenticated caller.
--
-- WHAT THIS MIGRATION DOES
--   Removes anon/PUBLIC EXECUTE and re-asserts the two grants that already
--   exist, so the end state is spelled out explicitly rather than inherited from
--   a Supabase default. The ONLY privileges removed are anon and PUBLIC:
--   `authenticated` and `service_role` are unchanged, and the `postgres` owner
--   grant is untouched. No function is defined, dropped or replaced here, so
--   there is zero behaviour change for any legitimate caller.
--
--   Idempotent — REVOKE and GRANT are both no-ops once the state is correct.
--
--   Timestamped after 20260801012000 on purpose: on a from-scratch replay this
--   must run AFTER the migration that reopened the grant, or the hole returns.
--
-- TIER: TIER-3 (privilege/auth change). Rehearsed on production inside
--       BEGIN … ROLLBACK via the Management API before this PR was opened;
--       NOT applied. Apply is the repository owner's call.

-- get_billing_analytics_by_category(uuid[])
REVOKE EXECUTE ON FUNCTION public.get_billing_analytics_by_category(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_analytics_by_category(uuid[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_billing_analytics_by_category(uuid[]) TO service_role;

-- get_billing_collection_split(uuid[], date, date)
REVOKE EXECUTE ON FUNCTION public.get_billing_collection_split(uuid[], date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_collection_split(uuid[], date, date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_billing_collection_split(uuid[], date, date) TO service_role;
