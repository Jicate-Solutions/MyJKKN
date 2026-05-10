-- 20260503100003_staff_import_unmatched_table.sql
-- Holds website faculty rows the import script could not auto-match
-- to a MyJKKN staff record. Reviewed manually after each import run.

CREATE TABLE IF NOT EXISTS public.staff_import_unmatched (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_row  jsonb NOT NULL,
  reason      text NOT NULL,
  resolved    boolean NOT NULL DEFAULT false,
  resolved_by uuid NULL REFERENCES auth.users(id),
  resolved_at timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_import_unmatched_unresolved
  ON public.staff_import_unmatched (created_at DESC)
  WHERE resolved = false;

ALTER TABLE public.staff_import_unmatched ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_full_access" ON public.staff_import_unmatched;
CREATE POLICY "super_admin_full_access"
  ON public.staff_import_unmatched
  FOR ALL
  TO authenticated
  USING (user_has_permission('staff.manage_imports'))
  WITH CHECK (user_has_permission('staff.manage_imports'));

DROP POLICY IF EXISTS "service_role_bypass" ON public.staff_import_unmatched;
CREATE POLICY "service_role_bypass"
  ON public.staff_import_unmatched
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
