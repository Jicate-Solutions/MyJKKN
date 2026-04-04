-- ============================================================================
-- FIX: Remove duplicate RLS policies on admission_leads
-- Date: 2026-04-04
--
-- Problem: There were TWO functionally identical SELECT, UPDATE, and DELETE
-- policies on admission_leads. PostgreSQL ORs all policies together, but
-- still evaluates each one's subqueries per row. Each policy cascades into
-- profiles (5,638 rows) and user_roles (with its own RLS → profiles again).
-- This created thousands of nested subquery evaluations even for 131 rows,
-- causing statement timeouts (error 57014) on the leads list page.
--
-- Root cause: The "Users can ..." policies were older duplicates of the
-- "leads_..." policies. We keep the "leads_..." versions which use the more
-- efficient auth_institution_id() function (STABLE, cacheable by planner).
--
-- Before: 9 policies (4 duplicates)
-- After:  6 policies (1 per operation + expo team variants)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view leads in their institution" ON admission_leads;
DROP POLICY IF EXISTS "Users can update leads in their institution" ON admission_leads;
DROP POLICY IF EXISTS "Users can delete leads in their institution" ON admission_leads;
DROP POLICY IF EXISTS "Users can insert leads in their institution" ON admission_leads;
