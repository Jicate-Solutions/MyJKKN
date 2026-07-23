-- ============================================================================
-- 20260610 — School-mode attendance: attendance_mode + class_incharge on
--            timetables, and FN/AN session tag on periods
-- ============================================================================
-- Adds the columns that let attendance behaviour be driven explicitly by the
-- timetable row (the "convention with override" model) instead of being
-- re-derived from institutions.entity_type on every mark.
--
--   timetables.attendance_mode  — 'period_wise' (default, existing behaviour)
--                                  or 'session_wise' (school day-wise: only the
--                                  morning-first + afternoon-first periods are
--                                  collected, and FN+AN derive a full/half/absent
--                                  daily status).
--   timetables.class_incharge_id — the staff who marks a session_wise timetable.
--                                  Nullable: colleges and all existing rows stay
--                                  NULL, no backfill required.
--   periods.session              — optional explicit 'FN'/'AN' tag so morning vs
--                                  afternoon classification does not depend solely
--                                  on hardcoded time windows. NULL => fall back to
--                                  start_time vs forenoon/afternoon boundaries.
--
-- All changes are additive and nullable / defaulted, so existing data and the
-- period-wise (college) flow are completely unaffected.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. timetables.attendance_mode
-- ---------------------------------------------------------------------------
ALTER TABLE public.timetables
  ADD COLUMN IF NOT EXISTS attendance_mode TEXT NOT NULL DEFAULT 'period_wise';

ALTER TABLE public.timetables
  DROP CONSTRAINT IF EXISTS chk_timetables_attendance_mode;

ALTER TABLE public.timetables
  ADD CONSTRAINT chk_timetables_attendance_mode CHECK (
    attendance_mode = ANY (ARRAY['period_wise'::text, 'session_wise'::text])
  );

COMMENT ON COLUMN public.timetables.attendance_mode IS
  'How attendance is collected for this timetable: period_wise (every period; default/college) or session_wise (school day-wise: morning-first + afternoon-first only, deriving full/half/absent).';

-- ---------------------------------------------------------------------------
-- 2. timetables.class_incharge_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.timetables
  ADD COLUMN IF NOT EXISTS class_incharge_id UUID NULL REFERENCES public.staff(id);

CREATE INDEX IF NOT EXISTS idx_timetables_class_incharge_id
  ON public.timetables(class_incharge_id);

COMMENT ON COLUMN public.timetables.class_incharge_id IS
  'Staff designated to mark attendance for a session_wise (school) timetable. NULL for period_wise timetables; section-level public.class_incharges acts as a fallback authority.';

-- ---------------------------------------------------------------------------
-- 3. periods.session
-- ---------------------------------------------------------------------------
ALTER TABLE public.periods
  ADD COLUMN IF NOT EXISTS session TEXT NULL;

ALTER TABLE public.periods
  DROP CONSTRAINT IF EXISTS chk_periods_session;

ALTER TABLE public.periods
  ADD CONSTRAINT chk_periods_session CHECK (
    session IS NULL OR session = ANY (ARRAY['FN'::text, 'AN'::text])
  );

COMMENT ON COLUMN public.periods.session IS
  'Optional explicit half-day tag: FN (forenoon/morning) or AN (afternoon). NULL => morning/afternoon is derived from start_time vs the institution forenoon/afternoon boundaries.';
