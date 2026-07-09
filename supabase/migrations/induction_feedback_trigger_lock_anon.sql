-- Lock anon/PUBLIC on the induction feedback→completion trigger function (2026-07-09)
-- =====================================================================
-- Follow-up to induction_multipath_completion_option2.sql (PR #1918).
-- fn_induction_completion_on_feedback() is a SECURITY DEFINER *trigger* function:
-- it returns `trigger`, and Postgres refuses direct calls to trigger functions, so
-- there is no real RPC exposure to anon. But the repo standard + the "New SECURITY
-- DEFINER functions lock anon" CI gate require every new SECURITY DEFINER function to
-- explicitly revoke anon/PUBLIC (Supabase's default ALTER DEFAULT PRIVILEGES grants
-- EXECUTE to anon on every new function). This asserts the standard belt-and-suspenders.
--
-- Trigger firing is unaffected: the trigger system invokes the function regardless of
-- the EXECUTE ACL. Verified on prod 2026-07-09 (rolled-back txn: an incomplete fresher
-- pushed to 100% feedback still flips outcome_complete=true after this revoke).
-- Already applied to prod via Management API; this PR is the migration record.

REVOKE EXECUTE ON FUNCTION public.fn_induction_completion_on_feedback() FROM anon, PUBLIC;
