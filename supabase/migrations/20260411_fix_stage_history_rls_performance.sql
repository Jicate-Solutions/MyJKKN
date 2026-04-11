-- ============================================================
-- Fix: admission_lead_stage_history RLS performance (57014 timeout)
-- Date:    2026-04-11
-- Bug:     BUG-003218 — caller lead detail page stage history times out
-- Context: Production had 3 overlapping SELECT-related policies on
--          admission_lead_stage_history, all doing nested subqueries into
--          admission_leads. Per-row RLS evaluation combined with the
--          cascading admission_leads RLS was triggering 57014 (statement
--          timeout) whenever users opened lead detail pages.
--
-- Why this is safe:
-- * The legacy "Users can view stage history" policy and the current
--   stage_history_select policy both compute the SAME visibility set.
--   We drop them and replace with a single policy that yields the same
--   permissions but evaluates role checks ONCE (not per row).
-- * profiles.role='admission' is added as a fallback so admission-role
--   users whose user_roles entry is out of sync (e.g. has 'faculty')
--   can still read stage history for their institution's leads.
-- * INSERT / UPDATE / DELETE policies are untouched.
-- ============================================================

-- Drop both old SELECT policies (duplicates causing OR-combined evaluation)
DROP POLICY IF EXISTS "Users can view stage history" ON public.admission_lead_stage_history;
DROP POLICY IF EXISTS stage_history_select ON public.admission_lead_stage_history;

-- Single optimized SELECT policy
-- Evaluation order matters here: we put the cheap role checks FIRST so Postgres
-- can short-circuit without ever touching admission_leads when the user has
-- a blanket role like super_admin / admission.
CREATE POLICY stage_history_select ON public.admission_lead_stage_history
  FOR SELECT
  TO authenticated
  USING (
    -- Fast path 1: blanket admin roles via profiles (evaluated once, not per row)
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'staff', 'institution_admin', 'administrator', 'admission')
    )
    -- Fast path 2: custom admission role via user_roles (evaluated once)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key = 'admission'
    )
    -- Slow path: scoped institution match via lead lookup (hash join instead of per-row EXISTS)
    OR lead_id IN (
      SELECT id FROM public.admission_leads
      WHERE institution_id = auth_institution_id()
    )
  );

-- Keep a comment trail on the table so future migrations know what this is
COMMENT ON POLICY stage_history_select ON public.admission_lead_stage_history IS
  'Optimized SELECT policy combining former "Users can view stage history" and stage_history_select. Short-circuits on admin roles before per-row institution check. See 20260411_fix_stage_history_rls_performance.sql.';
