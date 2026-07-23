-- 2026-06-29 — Data-driven Trainer field for CDC training (replaces free text).
--
-- WHY: the Trainer field on the training programme + per-semester schedule was a
-- raw text input. A trainer who IS internal MyJKKN staff should link to their real
-- staff record (no typos, joinable, survives renames) instead of a re-typed name.
-- External / vendor trainers (not in `staff`) keep using the existing nullable
-- `trainer_name` text column.
--
-- MODEL: internal trainer -> trainer_staff_id = staff.id AND trainer_name = a
-- denormalised name snapshot (so list views render with zero joins). External
-- trainer -> trainer_staff_id = NULL, trainer_name = the typed vendor name.
--
-- Both columns are nullable and additive: every existing programme / schedule row
-- stays valid (cdc_training_semester_schedules is empty in prod; cdc_training_programmes
-- rows simply get a NULL trainer_staff_id). No RLS change — these are columns on
-- tables that already carry CDC-staff RLS, not new functions, so no anon grant to revoke.

ALTER TABLE public.cdc_training_programmes
  ADD COLUMN IF NOT EXISTS trainer_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE public.cdc_training_semester_schedules
  ADD COLUMN IF NOT EXISTS trainer_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cdc_training_programmes_trainer_staff
  ON public.cdc_training_programmes(trainer_staff_id);

CREATE INDEX IF NOT EXISTS idx_cdc_training_semester_schedules_trainer_staff
  ON public.cdc_training_semester_schedules(trainer_staff_id);

COMMENT ON COLUMN public.cdc_training_programmes.trainer_staff_id IS
  'FK to staff(id) when the trainer is internal MyJKKN staff; NULL for external/vendor trainers (name kept in trainer_name). Added 2026-06-29.';
COMMENT ON COLUMN public.cdc_training_semester_schedules.trainer_staff_id IS
  'FK to staff(id) when the trainer is internal MyJKKN staff; NULL for external/vendor trainers (name kept in trainer_name). Added 2026-06-29.';
