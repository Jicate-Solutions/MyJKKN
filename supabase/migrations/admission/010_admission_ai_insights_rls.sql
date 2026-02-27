-- ============================================================================
-- ADMISSION MODULE: RLS Policies for admission_ai_insights
-- Created: 2026-02-27
-- Purpose: Table had RLS enabled but zero policies — all browser queries blocked.
-- ============================================================================

CREATE POLICY "admission_ai_insights_select"
  ON public.admission_ai_insights FOR SELECT
  TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );

CREATE POLICY "admission_ai_insights_insert"
  ON public.admission_ai_insights FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );

CREATE POLICY "admission_ai_insights_update"
  ON public.admission_ai_insights FOR UPDATE
  TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );

CREATE POLICY "admission_ai_insights_delete"
  ON public.admission_ai_insights FOR DELETE
  TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) IS TRUE
  );
