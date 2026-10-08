-- The tables the raise-targets measurement reads (20271007180207), loaded by
-- run-targets.sh BEFORE the migration (a LANGUAGE sql function body is checked
-- against its tables when it is created). Columns as production defines them:
-- timetables, student_attendance and institution_off_days from
-- setup/01_tables.sql; institution_leaves (+ leave_types) from
-- 20251216_create_leave_management_tables; curriculum_lesson and
-- class_session_lesson from 20260731040000; session_resource from
-- 20260801100000; scf_live_pulse from 20260625192500; induction_session_poll
-- (the live-poll engine's poll, context_type 'class_session' keyed by the pulse
-- id) from 20260630210000 + 20260704090000/20260704110000. Only the columns the
-- measurement and the fixtures touch; no foreign keys to tables the rehearsal
-- does not have.
CREATE TABLE public.timetables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid,
  timetable_name text NOT NULL,
  is_active boolean DEFAULT true,
  is_template boolean DEFAULT false,
  start_date date,
  end_date date,
  selected_days jsonb DEFAULT '["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]'::jsonb,
  timetable_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  -- 8 Oct 2026 (20271008093015): the columns the app's resolver reads
  -- (getFacultyTodayPeriods) and the rehearsal's stand-in for it uses.
  timetable_format text DEFAULT 'regular',
  selected_dates jsonb,
  department_id uuid,
  semester_id uuid,
  section_id uuid,
  section_ids uuid[]);

-- Staff leave (the columns the measurement reads: employee_id is the staff id).
CREATE TABLE public.hr_leave_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  duration_type text,
  status text NOT NULL DEFAULT 'pending');

CREATE TABLE public.student_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_date date NOT NULL,
  marked_by uuid NOT NULL,
  institution_id uuid NOT NULL,
  timetable_id uuid NOT NULL,
  section_id uuid NOT NULL,
  attendance_data jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE public.institution_off_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  off_date date NOT NULL,
  reason text,
  UNIQUE (institution_id, off_date));

CREATE TABLE public.leave_types (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.institution_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  leave_name varchar(200) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  scope_level varchar(20) NOT NULL DEFAULT 'institution',
  status varchar(20) NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL,
  -- 8 Oct 2026 (20271008093015): the holiday's scope, as production has it.
  department_ids uuid[] DEFAULT '{}',
  semester_ids uuid[] DEFAULT '{}',
  section_ids uuid[] DEFAULT '{}');

-- 8 Oct 2026 (20271008093015): the staff plans that make a college one a team
-- member teaches in (20260706_cross_institution_teaching), the columns read.
CREATE TABLE public.staff_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), institution_id uuid);
CREATE TABLE public.staff_plan_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_plan_id uuid NOT NULL REFERENCES public.staff_plans(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL);

CREATE TABLE public.curriculum_lesson (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  course_id uuid NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  source text NOT NULL DEFAULT 'faculty' CHECK (source IN ('bos_ai', 'faculty', 'title_ai')),
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz);

CREATE TABLE public.class_session_lesson (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id uuid NOT NULL,
  attendance_date date NOT NULL,
  period_id text NOT NULL,
  course_id uuid,
  lesson_id uuid NOT NULL REFERENCES public.curriculum_lesson(id) ON DELETE CASCADE,
  linked_by uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (timetable_id, attendance_date, period_id));

CREATE TABLE public.session_resource (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid,
  timetable_id uuid NOT NULL,
  attendance_date date NOT NULL,
  period_id text NOT NULL,
  course_id uuid,
  kind text NOT NULL DEFAULT 'notebooklm',
  title text NOT NULL,
  url text NOT NULL,
  posted_by uuid NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true);

CREATE TABLE public.scf_live_pulse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid,
  timetable_id uuid NOT NULL,
  attendance_date date NOT NULL,
  period_id text NOT NULL,
  course_code text,
  course_name text,
  faculty_email text,
  is_open boolean NOT NULL DEFAULT true,
  issued_at timestamptz NOT NULL DEFAULT now(),
  auto_close_at timestamptz NOT NULL DEFAULT now() + interval '4 hours',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.induction_session_poll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type text NOT NULL,
  context_id uuid NOT NULL,
  institution_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  issued_at timestamptz,
  auto_close_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
