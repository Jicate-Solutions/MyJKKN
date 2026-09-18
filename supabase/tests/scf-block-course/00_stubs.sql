-- Rehearsal stubs: the minimum of production MyJKKN that
-- 20261226000000_scf_confirmation_status_block_course_siblings.sql touches.
-- Shapes taken from the live database (information_schema) on 2026-09-17.
-- Nothing here is production logic; the migration under test supplies that.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.institutions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), name text NOT NULL);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, email text, is_super_admin boolean DEFAULT false, is_active boolean DEFAULT true);

CREATE TABLE public.learners_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid, institution_id uuid);

CREATE TABLE public.student_attendance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  attendance_date date NOT NULL,
  timetable_id uuid,
  institution_id uuid, program_id uuid, department_id uuid, section_id uuid,
  attendance_data jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE public.session_feedback (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid, student_id uuid NOT NULL, attendance_date date NOT NULL,
  timetable_id uuid NOT NULL, period_id text NOT NULL, section_id uuid,
  course_id uuid, course_code text, course_name text,
  created_at timestamptz NOT NULL DEFAULT now());
-- The real table's UNIQUE key, which fn_scf_confirmation_rollup's period join
-- relies on to be multiplication-free.
CREATE UNIQUE INDEX session_feedback_identity
  ON public.session_feedback (student_id, attendance_date, period_id);

CREATE TABLE public.scf_outage_days (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  outage_date date NOT NULL, institution_id uuid, period_id text);

CREATE TABLE public.leave_onduty_attendance_updates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  attendance_record_id uuid, student_id uuid, period_slot_id text);

-- Policy levers. The real fn_get_policy_* resolve institution over global over
-- default; the tests only need the default path, so these return the default.
CREATE OR REPLACE FUNCTION public.fn_get_policy_int(p_key text, p_default integer, p_institution_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE AS $$ SELECT p_default $$;
CREATE OR REPLACE FUNCTION public.fn_get_policy_text(p_key text, p_default text, p_institution_id uuid DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE AS $$ SELECT p_default $$;
CREATE OR REPLACE FUNCTION public.fn_get_policy_bool(p_key text, p_default boolean, p_institution_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p_default $$;

-- Roster readers, copied in behaviour from the live definitions: a non-empty
-- top-level students[] IS the roster, otherwise every groups[].students[].
CREATE OR REPLACE FUNCTION public.fn_attendance_slot_students(p_period jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_period -> 'students') = 'array'
     AND jsonb_array_length(p_period -> 'students') > 0 THEN p_period -> 'students'
    WHEN jsonb_typeof(p_period -> 'groups') = 'array' THEN (
      SELECT COALESCE(jsonb_agg(s), '[]'::jsonb)
      FROM jsonb_array_elements(p_period -> 'groups') g,
           jsonb_array_elements(CASE WHEN jsonb_typeof(g -> 'students')='array' THEN g -> 'students' ELSE '[]'::jsonb END) s)
    ELSE '[]'::jsonb END $$;

CREATE OR REPLACE FUNCTION public.fn_attendance_student_ids(p_data jsonb)
RETURNS uuid[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(DISTINCT (st ->> 'student_id')::uuid), '{}'::uuid[])
  FROM jsonb_each(CASE WHEN jsonb_typeof(p_data)='object' THEN p_data ELSE '{}'::jsonb END) period,
       jsonb_array_elements(public.fn_attendance_slot_students(period.value)) st
  WHERE (st ->> 'student_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' $$;

CREATE OR REPLACE FUNCTION public.fn_attendance_slot_faculty(p_period jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p_period -> 'assigned_faculty') = 'array'
              THEN COALESCE(p_period -> 'assigned_faculty' -> 0, '{}'::jsonb)
              ELSE COALESCE(p_period -> 'assigned_faculty', '{}'::jsonb) END $$;

CREATE OR REPLACE FUNCTION public.fn_scf_safe_time(p_text text, p_default time)
RETURNS time LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((SELECT p_text::time WHERE p_text ~ '^[0-9]{1,2}:[0-9]{2}'), p_default) $$;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false) $$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.user_has_permission(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.role_has_institution_access(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
