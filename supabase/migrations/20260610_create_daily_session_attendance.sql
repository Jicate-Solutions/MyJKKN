-- ============================================================================
-- 20260610 — Day-wise (FN & AN) session attendance
-- ============================================================================
-- Day-wise attendance for school (session_wise) classes is recorded per
-- (section, date, session) — NOT per course/period. It is therefore stored in
-- its own table rather than the course/period-keyed public.student_attendance,
-- which decouples it from the timetable-slot / subject-staff machinery entirely.
--
-- One row per section per date per half-day session (FN/AN). The per-student
-- statuses live in attendance_data JSONB using the SAME shape as
-- student_attendance period slots ({ students: [{ student_id, status }] }) so
-- consolidation/reporting can iterate them uniformly.
--
-- A student's daily status is derived (in app code) from the two session rows:
--   both Present => full day, one Present => half day (0.5), none => absent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.daily_session_attendance (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id  UUID        NOT NULL,
    section_id      UUID        NOT NULL,
    -- Optional link back to the session_wise timetable this class belongs to,
    -- for traceability; attendance itself does not depend on it.
    timetable_id    UUID,
    attendance_date DATE        NOT NULL,
    session         TEXT        NOT NULL CHECK (session = ANY (ARRAY['FN'::text, 'AN'::text])),
    attendance_data JSONB       NOT NULL DEFAULT '{"students": []}'::jsonb,
    marked_by       UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One record per section/date/session — upserts target this constraint.
    CONSTRAINT daily_session_attendance_unique UNIQUE (section_id, attendance_date, session)
);

CREATE INDEX IF NOT EXISTS idx_daily_session_attendance_institution
    ON public.daily_session_attendance(institution_id);
CREATE INDEX IF NOT EXISTS idx_daily_session_attendance_section
    ON public.daily_session_attendance(section_id);
CREATE INDEX IF NOT EXISTS idx_daily_session_attendance_date
    ON public.daily_session_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_daily_session_attendance_section_date
    ON public.daily_session_attendance(section_id, attendance_date);

ALTER TABLE public.daily_session_attendance ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read/write; the application service layer enforces
-- the incharge/admin authorization (mirrors how class_incharges-based marking
-- is gated in code). Tighten with institution-scoped policies if required.
DROP POLICY IF EXISTS daily_session_attendance_select ON public.daily_session_attendance;
CREATE POLICY daily_session_attendance_select ON public.daily_session_attendance
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS daily_session_attendance_insert ON public.daily_session_attendance;
CREATE POLICY daily_session_attendance_insert ON public.daily_session_attendance
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS daily_session_attendance_update ON public.daily_session_attendance;
CREATE POLICY daily_session_attendance_update ON public.daily_session_attendance
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS daily_session_attendance_delete ON public.daily_session_attendance;
CREATE POLICY daily_session_attendance_delete ON public.daily_session_attendance
  FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE public.daily_session_attendance IS
  'Day-wise (FN/AN) attendance for session_wise (school) classes. One row per section/date/session; per-student statuses in attendance_data JSONB. Decoupled from course/period attendance (student_attendance).';
