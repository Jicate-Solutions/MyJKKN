-- Migration: a retired role assignment may keep only the holder's NAME
-- Created: 2026-07-29
-- Follow-up to 20260807120000. That migration retires an assignment when the holder's
-- staff record is deleted (snapshot the name, end-date the row) and switched the FK to
-- ON DELETE SET NULL so the row survives. But hr_additional_roles_subject_check demands
-- EVERY area row carry a subject (staff_id or notes), so the SET NULL made the row
-- invalid and the staff deletion failed outright — the row was preserved by blocking the
-- delete, which is not the intended behaviour.
-- Fix: a row that is no longer current may identify its holder by the name snapshot
-- alone. Current rows still require a real subject, so nothing is loosened for live data.
-- ============================================================================

ALTER TABLE public.hr_additional_roles
  DROP CONSTRAINT IF EXISTS hr_additional_roles_subject_check;

ALTER TABLE public.hr_additional_roles
  ADD CONSTRAINT hr_additional_roles_subject_check CHECK (
    CASE
      WHEN improvement_area_id IS NULL THEN
        ((staff_id IS NOT NULL AND hr_employee_id IS NULL)
         OR (staff_id IS NULL AND hr_employee_id IS NOT NULL))
      ELSE
        (hr_employee_id IS NULL
         AND (
           staff_id IS NOT NULL
           OR btrim(COALESCE(notes, '')) <> ''
           -- retired rows keep history by name alone
           OR (is_current = false AND btrim(COALESCE(holder_display_name, '')) <> '')
         ))
    END
  );
