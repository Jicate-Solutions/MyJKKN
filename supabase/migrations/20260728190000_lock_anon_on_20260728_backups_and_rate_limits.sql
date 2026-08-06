-- 20260728190000_lock_anon_on_20260728_backups_and_rate_limits.sql
-- ============================================================================
-- APPLY STATUS: ALREADY APPLIED to production (kvizhngldtiuufknvehv) on
-- 2026-07-28 ~18:55 IST via the Management API, to close a LIVE exposure. This
-- file is the repository record of that apply, not a pending change. Every
-- statement below is idempotent, so re-running it is a no-op.
--
-- WHAT WAS EXPOSED
--   Three tables created earlier the same day by three separate migrations were
--   readable AND writable AND deletable by the public `anon` key that ships in
--   every page of https://www.jkkn.ai. Measured over HTTPS, not inferred:
--
--     GET /rest/v1/hr_leave_applications_backup_20260728   -> 206, 0-0/230
--     GET /rest/v1/ims_rls_policy_backup_20260728          -> 206, 0-0/112
--     GET /rest/v1/academic_years_dates_rollback_20260728  -> 206, 0-0/42
--
--   anon held SELECT, INSERT, UPDATE and DELETE on all three. The worst of them,
--   hr_leave_applications_backup_20260728, holds 230 team-member leave records
--   including employee_id, free-text `reason`, `documents`, `is_emergency` and
--   `rejection_reason` — leave reasons routinely carry medical and family detail.
--
--   Source migrations (all 2026-07-28):
--     20260728010000_hr_leave_applications_fresh_start_purge.sql
--     20260728040000_academic_years_default_jun1_mar31.sql
--     20260728103119_ims_cross_institution_store_grants.sql
--
--   Same root cause as 20260726180000: Supabase's ALTER DEFAULT PRIVILEGES grants
--   anon everything on a new public-schema table, and CREATE TABLE ... AS never
--   enables RLS. Nothing in the migrations asked for public access; it is the
--   default, and it has to be revoked explicitly every time.
--
-- ai_query_rate_limits is a DIFFERENT shape and is fixed differently below.
--   RLS was already ON there, so the catalog looked protected. It was not: a
--   PERMISSIVE policy named "System can manage rate limits" was written
--   FOR ALL, TO public, USING (true), which makes RLS a no-op and let PostgREST
--   serve all 14 rows to anon. The reassuring name is not the rule; the rule is
--   `TO public USING (true)`. That policy was never needed for system access —
--   service_role bypasses RLS entirely — so it granted access to nobody but
--   everybody else. Dropped. The correctly-scoped own-rows policy is kept.
--
-- SAFETY
--   No row is read, written or deleted here. Grants and RLS flags only. Verified
--   before applying that no application code references any of the four tables,
--   so no screen or route depends on the access being removed.
-- ============================================================================

-- --- 1. The three tables that were leaking -----------------------------------

REVOKE ALL ON TABLE public.hr_leave_applications_backup_20260728 FROM anon, PUBLIC;
ALTER TABLE public.hr_leave_applications_backup_20260728 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ims_rls_policy_backup_20260728 FROM anon, PUBLIC;
ALTER TABLE public.ims_rls_policy_backup_20260728 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.academic_years_dates_rollback_20260728 FROM anon, PUBLIC;
ALTER TABLE public.academic_years_dates_rollback_20260728 ENABLE ROW LEVEL SECURITY;

-- RLS is enabled with NO policy on purpose. These are one-off backup snapshots
-- with no reader; RLS-on-with-no-policy denies every role, while service_role
-- (which bypasses RLS) can still restore from them if a rollback is ever needed.

-- --- 2. ai_query_rate_limits: remove the policy that defeated RLS -------------

DROP POLICY IF EXISTS "System can manage rate limits" ON public.ai_query_rate_limits;

REVOKE ALL ON TABLE public.ai_query_rate_limits FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.ai_query_rate_limits TO authenticated;

-- The surviving policy, "Users can view their own rate limits"
-- (SELECT USING user_id = auth.uid()), is the intended rule and is left in place.
-- The GRANT above is what lets that policy still be reachable after the blanket
-- REVOKE; without it the policy would be correct but unusable.

-- ============================================================================
-- VERIFICATION (run after apply, in a SEPARATE call — the Management API wraps a
-- submitted batch in one transaction, so an in-batch check proves nothing):
--
--   SELECT c.relname, c.relrowsecurity,
--          has_table_privilege('anon', c.oid, 'SELECT') AS anon_sel
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relname IN
--     ('hr_leave_applications_backup_20260728','ims_rls_policy_backup_20260728',
--      'academic_years_dates_rollback_20260728','ai_query_rate_limits');
--
-- Observed after apply: relrowsecurity = true and anon_sel = false on all four;
-- row counts unchanged at 230 / 112 / 42 / 14. Re-probed over HTTPS with the
-- real anon key: all four reads returned 401, and a DELETE against
-- hr_leave_applications_backup_20260728 returned 401.
--
-- PREVENTION: scripts/ci/check-table-anon-revoke.mjs (extended in #2534) flags
-- all three of these migrations — both for the missing anon revoke and for the
-- missing ENABLE ROW LEVEL SECURITY. It merged after they were written, so it
-- did not get the chance to block them; it will block the next one.
-- ============================================================================
