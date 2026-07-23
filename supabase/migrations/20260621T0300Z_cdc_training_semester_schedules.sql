-- ============================================================================
-- CDC TRAINING — PER-SEMESTER SCHEDULE / HOURS (BUG-004200)
-- ----------------------------------------------------------------------------
-- Date:   2026-06-21
-- Reason: A training programme (cdc_training_programmes) is a single flat row
--         with one total_hours / start_date / end_date. CDC needs to edit each
--         semester's own schedule separately (hours, dates, trainer, notes) for
--         programmes that run across multiple semesters.
--         This adds a child table: one row per (programme, semester).
--         Semester is a free-form label (e.g. 'Semester 1') rather than a FK to
--         public.semesters, because a training cohort is bound at department
--         level (target_department_id), not to a single program's semester
--         structure — so the right academic semesters can't be enumerated.
--         Easy to retrofit a semesters FK later if a stricter model is wanted.
-- Scope:  DB-only. New table + RLS mirroring cdc_training_programmes
--         (read: any authenticated user; write: is_cdc_staff()). No new RPC.
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP/CREATE POLICY.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cdc_training_semester_schedules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id   uuid NOT NULL REFERENCES public.cdc_training_programmes(id) ON DELETE CASCADE,
  semester_label text NOT NULL,
  total_hours    integer,
  start_date     date,
  end_date       date,
  trainer_name   text,
  notes          text,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.profiles(id),
  updated_by     uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.cdc_training_semester_schedules
  IS 'BUG-004200: per-semester schedule/hours for a training programme. One row per (programme, semester).';

CREATE INDEX IF NOT EXISTS idx_cdc_tss_programme
  ON public.cdc_training_semester_schedules(programme_id);

ALTER TABLE public.cdc_training_semester_schedules ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (mirrors cdc_training_programmes_read).
DROP POLICY IF EXISTS cdc_tss_read ON public.cdc_training_semester_schedules;
CREATE POLICY cdc_tss_read ON public.cdc_training_semester_schedules
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Write: CDC staff only (mirrors cdc_training_programmes_write).
DROP POLICY IF EXISTS cdc_tss_write ON public.cdc_training_semester_schedules;
CREATE POLICY cdc_tss_write ON public.cdc_training_semester_schedules
  FOR ALL USING (is_cdc_staff()) WITH CHECK (is_cdc_staff());

NOTIFY pgrst, 'reload schema';
