-- ============================================================================
-- ADMISSION MODULE: RLS Policies for admission_daily_briefings
-- Created: 2026-02-27
-- Purpose: Table had RLS enabled but zero policies — all browser-client queries
--          were silently blocked. This migration adds standard institution-scoped
--          policies matching the rest of the admission module.
-- ============================================================================

-- SELECT: users see their institution's briefings; super admins see all
CREATE POLICY "admission_daily_briefings_select"
  ON public.admission_daily_briefings FOR SELECT
  TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );

-- INSERT: users can insert for their own institution
CREATE POLICY "admission_daily_briefings_insert"
  ON public.admission_daily_briefings FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );

-- UPDATE: users can update (mark as read) within their institution
CREATE POLICY "admission_daily_briefings_update"
  ON public.admission_daily_briefings FOR UPDATE
  TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );
