-- =====================================================
-- Academic Module Database Schema for MyJKKN
-- Generated from Project: kvizhngldtiuufknvehv
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- HELPER FUNCTIONS (Required for RLS Policies)
-- =====================================================

-- Function: check_permission
CREATE OR REPLACE FUNCTION public.check_permission(permission_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_key text;
  v_perms jsonb;
BEGIN
  -- Attempt to get role from auth.users metadata
  SELECT raw_user_meta_data->>'role' INTO v_role_key
  FROM auth.users
  WHERE id = auth.uid();

  -- Fallback to profiles table if metadata missing
  IF v_role_key IS NULL THEN
    SELECT role INTO v_role_key FROM public.profiles WHERE id = auth.uid();
  END IF;

  -- If no role, no permission
  IF v_role_key IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Fetch permissions for role from custom_roles
  SELECT permissions INTO v_perms FROM public.custom_roles WHERE role_key = v_role_key;

  IF v_perms IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Super admin or role with all permissions
  IF (v_perms ->> 'all')::boolean IS TRUE THEN
    RETURN TRUE;
  END IF;

  -- Return specific permission value (default false if key absent)
  RETURN COALESCE( (v_perms ->> permission_key)::boolean, FALSE);
END;
$function$;

-- Function: get_my_institution_id
CREATE OR REPLACE FUNCTION public.get_my_institution_id()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    inst_id UUID;
BEGIN
    -- Try to get institution_id from auth.users metadata
    SELECT raw_user_meta_data->>'institution_id' INTO inst_id
    FROM auth.users
    WHERE id = auth.uid();

    -- Fallback: get from profiles table if metadata is null
    IF inst_id IS NULL THEN
        SELECT institution_id INTO inst_id
        FROM public.profiles
        WHERE id = auth.uid();
    END IF;

    RETURN inst_id;
END;
$function$;

-- Function: user_has_institution_access
CREATE OR REPLACE FUNCTION public.user_has_institution_access(user_id uuid, institution_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  user_profile RECORD;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE profiles.id = user_id;
  
  -- If user doesn't exist, deny access
  IF user_profile IS NULL THEN
    RETURN false;
  END IF;
  
  -- Super admin has access to all institutions
  IF user_profile.is_super_admin = true OR user_profile.role = 'super_admin' THEN
    RETURN true;
  END IF;
  
  -- Check if user's primary institution matches
  IF user_profile.institution_id = institution_id THEN
    RETURN true;
  END IF;
  
  -- Check explicit institution access (properly qualified column references)
  IF EXISTS (
    SELECT 1 FROM user_institution_access 
    WHERE user_institution_access.user_id = user_has_institution_access.user_id 
    AND user_institution_access.institution_id = user_has_institution_access.institution_id 
    AND user_institution_access.is_active = true
  ) THEN
    RETURN true;
  END IF;
  
  -- Default deny
  RETURN false;
END;
$function$;

-- =====================================================
-- TRIGGER FUNCTIONS
-- =====================================================

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- Function: update_modified_column
CREATE OR REPLACE FUNCTION public.update_modified_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$function$;

-- Function: update_timetable_slot_staff_updated_at
CREATE OR REPLACE FUNCTION public.update_timetable_slot_staff_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- Function: auto_populate_staff_plan_institution
CREATE OR REPLACE FUNCTION public.auto_populate_staff_plan_institution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- If institution_id is not set and user is faculty, auto-populate from profile
  IF NEW.institution_id IS NULL THEN
    SELECT profiles.institution_id INTO NEW.institution_id
    FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'faculty';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Function: auto_populate_timetable_institution
CREATE OR REPLACE FUNCTION public.auto_populate_timetable_institution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- If institution_id is not set and user is faculty, auto-populate from profile
  IF NEW.institution_id IS NULL THEN
    SELECT profiles.institution_id INTO NEW.institution_id
    FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'faculty';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- =====================================================
-- TABLE: periods
-- =====================================================

CREATE TABLE IF NOT EXISTS public.periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_name text NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_break boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    institution_id uuid,
    CONSTRAINT periods_pkey PRIMARY KEY (id),
    CONSTRAINT periods_institution_id_period_name_key UNIQUE (institution_id, period_name),
    CONSTRAINT period_start_before_end CHECK (start_time < end_time),
    CONSTRAINT periods_institution_id_fkey FOREIGN KEY (institution_id) 
        REFERENCES institutions(id) ON DELETE CASCADE
);

-- Indexes for periods
CREATE UNIQUE INDEX IF NOT EXISTS periods_institution_id_period_name_key ON public.periods USING btree (institution_id, period_name);
CREATE UNIQUE INDEX IF NOT EXISTS periods_pkey ON public.periods USING btree (id);

-- =====================================================
-- TABLE: staff_plans
-- =====================================================

CREATE TABLE IF NOT EXISTS public.staff_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    degree_id uuid NOT NULL,
    department_id uuid NOT NULL,
    program_id uuid NOT NULL,
    semester_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT staff_plans_pkey PRIMARY KEY (id),
    CONSTRAINT staff_plans_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    CONSTRAINT staff_plans_degree_id_fkey FOREIGN KEY (degree_id) REFERENCES degrees(id),
    CONSTRAINT staff_plans_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT staff_plans_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES institutions(id),
    CONSTRAINT staff_plans_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id),
    CONSTRAINT staff_plans_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES semesters(id)
);

-- Indexes for staff_plans
CREATE INDEX IF NOT EXISTS idx_staff_plans_academic_year ON public.staff_plans USING btree (academic_year_id);
CREATE INDEX IF NOT EXISTS idx_staff_plans_institution ON public.staff_plans USING btree (institution_id);
CREATE INDEX IF NOT EXISTS idx_staff_plans_program ON public.staff_plans USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_staff_plans_semester ON public.staff_plans USING btree (semester_id);
CREATE UNIQUE INDEX IF NOT EXISTS staff_plans_pkey ON public.staff_plans USING btree (id);

-- =====================================================
-- TABLE: staff_plan_courses
-- =====================================================

CREATE TABLE IF NOT EXISTS public.staff_plan_courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_plan_id uuid NOT NULL,
    course_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    staff_type character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    is_combined boolean DEFAULT false,
    CONSTRAINT staff_plan_courses_pkey PRIMARY KEY (id),
    CONSTRAINT unique_staff_course_plan UNIQUE (staff_id, course_id, staff_plan_id),
    CONSTRAINT staff_plan_courses_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id),
    CONSTRAINT staff_plan_courses_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id),
    CONSTRAINT staff_plan_courses_staff_plan_id_fkey FOREIGN KEY (staff_plan_id) 
        REFERENCES staff_plans(id) ON DELETE CASCADE
);

-- Indexes for staff_plan_courses
CREATE INDEX IF NOT EXISTS idx_staff_plan_courses_course ON public.staff_plan_courses USING btree (course_id);
CREATE INDEX IF NOT EXISTS idx_staff_plan_courses_staff ON public.staff_plan_courses USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_plan_courses_staff_plan ON public.staff_plan_courses USING btree (staff_plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS staff_plan_courses_pkey ON public.staff_plan_courses USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_staff_course_plan ON public.staff_plan_courses USING btree (staff_id, course_id, staff_plan_id);

-- =====================================================
-- TABLE: timetables
-- =====================================================

CREATE TABLE IF NOT EXISTS public.timetables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid,
    academic_year_id uuid,
    degree_id uuid,
    program_id uuid,
    department_id uuid,
    semester text NOT NULL,
    section text,
    timetable_name text NOT NULL,
    version integer DEFAULT 1,
    is_active boolean DEFAULT true,
    is_template boolean DEFAULT false,
    template_name text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    start_date date,
    end_date date,
    selected_days jsonb DEFAULT '["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]'::jsonb,
    CONSTRAINT timetables_pkey PRIMARY KEY (id),
    CONSTRAINT check_timetable_date_range CHECK ((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date)),
    CONSTRAINT timetables_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    CONSTRAINT timetables_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
    CONSTRAINT timetables_degree_id_fkey FOREIGN KEY (degree_id) REFERENCES degrees(id),
    CONSTRAINT timetables_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT timetables_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES institutions(id),
    CONSTRAINT timetables_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs(id)
);

-- Indexes for timetables
CREATE UNIQUE INDEX IF NOT EXISTS timetables_pkey ON public.timetables USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_timetable_per_semester_section 
    ON public.timetables USING btree (institution_id, academic_year_id, degree_id, program_id, department_id, semester, COALESCE(section, ''::text)) 
    WHERE (is_active = true);

-- =====================================================
-- TABLE: timetable_periods
-- =====================================================

CREATE TABLE IF NOT EXISTS public.timetable_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    timetable_id uuid,
    period_id uuid,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timetable_periods_pkey PRIMARY KEY (id),
    CONSTRAINT unique_timetable_period UNIQUE (timetable_id, period_id),
    CONSTRAINT timetable_periods_period_id_fkey FOREIGN KEY (period_id) 
        REFERENCES periods(id) ON DELETE CASCADE,
    CONSTRAINT timetable_periods_timetable_id_fkey FOREIGN KEY (timetable_id) 
        REFERENCES timetables(id) ON DELETE CASCADE
);

-- Indexes for timetable_periods
CREATE UNIQUE INDEX IF NOT EXISTS timetable_periods_pkey ON public.timetable_periods USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_timetable_period ON public.timetable_periods USING btree (timetable_id, period_id);

-- =====================================================
-- TABLE: timetable_slots
-- =====================================================

CREATE TABLE IF NOT EXISTS public.timetable_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    timetable_id uuid,
    day_of_week text NOT NULL,
    period_id uuid,
    course_id uuid,
    staff_id uuid,
    is_break_slot boolean DEFAULT false,
    break_description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_combined boolean DEFAULT false,
    CONSTRAINT timetable_slots_pkey PRIMARY KEY (id),
    CONSTRAINT unique_timetable_slot UNIQUE (timetable_id, day_of_week, period_id),
    CONSTRAINT course_or_break CHECK (
        ((course_id IS NOT NULL) AND (is_break_slot = false)) OR 
        ((course_id IS NULL) AND (is_break_slot = true)) OR 
        ((course_id IS NULL) AND (is_break_slot = false))
    ),
    CONSTRAINT valid_day_of_week CHECK (day_of_week = ANY (ARRAY['MONDAY'::text, 'TUESDAY'::text, 'WEDNESDAY'::text, 'THURSDAY'::text, 'FRIDAY'::text, 'SATURDAY'::text, 'SUNDAY'::text])),
    CONSTRAINT timetable_slots_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id),
    CONSTRAINT timetable_slots_period_id_fkey FOREIGN KEY (period_id) REFERENCES periods(id),
    CONSTRAINT timetable_slots_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id),
    CONSTRAINT timetable_slots_timetable_id_fkey FOREIGN KEY (timetable_id) 
        REFERENCES timetables(id) ON DELETE CASCADE
);

-- Indexes for timetable_slots
CREATE UNIQUE INDEX IF NOT EXISTS timetable_slots_pkey ON public.timetable_slots USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_timetable_slot ON public.timetable_slots USING btree (timetable_id, day_of_week, period_id);

-- =====================================================
-- TABLE: timetable_sub_slots
-- =====================================================

CREATE TABLE IF NOT EXISTS public.timetable_sub_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_slot_id uuid NOT NULL,
    sub_slot_order integer NOT NULL,
    course_id uuid,
    is_break_slot boolean DEFAULT false,
    break_description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timetable_sub_slots_pkey PRIMARY KEY (id),
    CONSTRAINT unique_parent_sub_order UNIQUE (parent_slot_id, sub_slot_order),
    CONSTRAINT timetable_sub_slots_order_check CHECK (sub_slot_order = ANY (ARRAY[1, 2])),
    CONSTRAINT timetable_sub_slots_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id),
    CONSTRAINT timetable_sub_slots_parent_slot_id_fkey FOREIGN KEY (parent_slot_id) 
        REFERENCES timetable_slots(id) ON DELETE CASCADE
);

-- Indexes for timetable_sub_slots
CREATE INDEX IF NOT EXISTS idx_timetable_sub_slots_parent ON public.timetable_sub_slots USING btree (parent_slot_id);
CREATE UNIQUE INDEX IF NOT EXISTS timetable_sub_slots_pkey ON public.timetable_sub_slots USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_parent_sub_order ON public.timetable_sub_slots USING btree (parent_slot_id, sub_slot_order);

-- =====================================================
-- TABLE: timetable_slot_sections
-- =====================================================

CREATE TABLE IF NOT EXISTS public.timetable_slot_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    timetable_slot_id uuid NOT NULL,
    section_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timetable_slot_sections_pkey PRIMARY KEY (id),
    CONSTRAINT unique_slot_section UNIQUE (timetable_slot_id, section_id),
    CONSTRAINT timetable_slot_sections_section_id_fkey FOREIGN KEY (section_id) 
        REFERENCES sections(id) ON DELETE CASCADE,
    CONSTRAINT timetable_slot_sections_timetable_slot_id_fkey FOREIGN KEY (timetable_slot_id) 
        REFERENCES timetable_slots(id) ON DELETE CASCADE
);

-- Indexes for timetable_slot_sections
CREATE INDEX IF NOT EXISTS idx_timetable_slot_sections_section ON public.timetable_slot_sections USING btree (section_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slot_sections_slot ON public.timetable_slot_sections USING btree (timetable_slot_id);
CREATE UNIQUE INDEX IF NOT EXISTS timetable_slot_sections_pkey ON public.timetable_slot_sections USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_slot_section ON public.timetable_slot_sections USING btree (timetable_slot_id, section_id);

-- =====================================================
-- TABLE: timetable_slot_staff
-- =====================================================

CREATE TABLE IF NOT EXISTS public.timetable_slot_staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    timetable_slot_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timetable_slot_staff_pkey PRIMARY KEY (id),
    CONSTRAINT timetable_slot_staff_timetable_slot_id_staff_id_key UNIQUE (timetable_slot_id, staff_id),
    CONSTRAINT timetable_slot_staff_staff_id_fkey FOREIGN KEY (staff_id) 
        REFERENCES staff(id) ON DELETE CASCADE,
    CONSTRAINT timetable_slot_staff_timetable_slot_id_fkey FOREIGN KEY (timetable_slot_id) 
        REFERENCES timetable_slots(id) ON DELETE CASCADE
);

-- Indexes for timetable_slot_staff
CREATE INDEX IF NOT EXISTS idx_timetable_slot_staff_slot_id ON public.timetable_slot_staff USING btree (timetable_slot_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slot_staff_staff_id ON public.timetable_slot_staff USING btree (staff_id);
CREATE UNIQUE INDEX IF NOT EXISTS timetable_slot_staff_pkey ON public.timetable_slot_staff USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS timetable_slot_staff_timetable_slot_id_staff_id_key ON public.timetable_slot_staff USING btree (timetable_slot_id, staff_id);

-- =====================================================
-- TABLE: timetable_sub_slot_sections
-- =====================================================

CREATE TABLE IF NOT EXISTS public.timetable_sub_slot_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sub_slot_id uuid NOT NULL,
    section_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timetable_sub_slot_sections_pkey PRIMARY KEY (id),
    CONSTRAINT unique_sub_slot_section UNIQUE (sub_slot_id, section_id),
    CONSTRAINT timetable_sub_slot_sections_section_id_fkey FOREIGN KEY (section_id) 
        REFERENCES sections(id) ON DELETE CASCADE,
    CONSTRAINT timetable_sub_slot_sections_sub_slot_id_fkey FOREIGN KEY (sub_slot_id) 
        REFERENCES timetable_sub_slots(id) ON DELETE CASCADE
);

-- Indexes for timetable_sub_slot_sections
CREATE INDEX IF NOT EXISTS idx_timetable_sub_slot_sections_section ON public.timetable_sub_slot_sections USING btree (section_id);
CREATE INDEX IF NOT EXISTS idx_timetable_sub_slot_sections_sub_slot ON public.timetable_sub_slot_sections USING btree (sub_slot_id);
CREATE UNIQUE INDEX IF NOT EXISTS timetable_sub_slot_sections_pkey ON public.timetable_sub_slot_sections USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_sub_slot_section ON public.timetable_sub_slot_sections USING btree (sub_slot_id, section_id);

-- =====================================================
-- TABLE: timetable_sub_slot_staff
-- =====================================================

CREATE TABLE IF NOT EXISTS public.timetable_sub_slot_staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sub_slot_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT timetable_sub_slot_staff_pkey PRIMARY KEY (id),
    CONSTRAINT unique_sub_slot_staff UNIQUE (sub_slot_id, staff_id),
    CONSTRAINT timetable_sub_slot_staff_staff_id_fkey FOREIGN KEY (staff_id) 
        REFERENCES staff(id) ON DELETE CASCADE,
    CONSTRAINT timetable_sub_slot_staff_sub_slot_id_fkey FOREIGN KEY (sub_slot_id) 
        REFERENCES timetable_sub_slots(id) ON DELETE CASCADE
);

-- Indexes for timetable_sub_slot_staff
CREATE INDEX IF NOT EXISTS idx_timetable_sub_slot_staff_staff ON public.timetable_sub_slot_staff USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_timetable_sub_slot_staff_sub_slot ON public.timetable_sub_slot_staff USING btree (sub_slot_id);
CREATE UNIQUE INDEX IF NOT EXISTS timetable_sub_slot_staff_pkey ON public.timetable_sub_slot_staff USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_sub_slot_staff ON public.timetable_sub_slot_staff USING btree (sub_slot_id, staff_id);

-- =====================================================
-- TABLE: student_attendance
-- =====================================================

-- Drop existing table if you need to recreate it (uncomment if needed)
-- DROP TABLE IF EXISTS public.student_attendance CASCADE;

CREATE TABLE IF NOT EXISTS public.student_attendance (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    attendance_date date NOT NULL,
    marked_by uuid NOT NULL,
    institution_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    timetable_id uuid NOT NULL,
    section_id uuid NOT NULL,
    attendance_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT student_attendance_pkey PRIMARY KEY (id)
);

-- Add foreign key constraints after table creation
ALTER TABLE public.student_attendance 
    ADD CONSTRAINT student_attendance_institution_id_fkey 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE public.student_attendance 
    ADD CONSTRAINT student_attendance_marked_by_fkey 
    FOREIGN KEY (marked_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.student_attendance 
    ADD CONSTRAINT student_attendance_section_id_fkey 
    FOREIGN KEY (section_id) REFERENCES sections(id);

ALTER TABLE public.student_attendance 
    ADD CONSTRAINT student_attendance_timetable_id_fkey 
    FOREIGN KEY (timetable_id) REFERENCES timetables(id);

-- Indexes for student_attendance
-- Create indexes after the table is fully defined
CREATE INDEX IF NOT EXISTS idx_student_attendance_date 
    ON public.student_attendance USING btree (attendance_date);

CREATE INDEX IF NOT EXISTS idx_student_attendance_institution_id 
    ON public.student_attendance USING btree (institution_id);

CREATE INDEX IF NOT EXISTS idx_student_attendance_marked_by 
    ON public.student_attendance USING btree (marked_by);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_consolidated_attendance_record 
    ON public.student_attendance USING btree (institution_id, timetable_id, section_id, attendance_date);

-- GIN index for jsonb column
CREATE INDEX IF NOT EXISTS idx_student_attendance_data 
    ON public.student_attendance USING gin (attendance_data);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Triggers for staff_plan_courses
CREATE TRIGGER update_staff_plan_courses_updated_at 
    BEFORE UPDATE ON public.staff_plan_courses 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Triggers for staff_plans
CREATE TRIGGER trigger_auto_populate_staff_plan_institution 
    BEFORE INSERT ON public.staff_plans 
    FOR EACH ROW EXECUTE FUNCTION auto_populate_staff_plan_institution();

CREATE TRIGGER update_staff_plans_updated_at 
    BEFORE UPDATE ON public.staff_plans 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Triggers for student_attendance
CREATE TRIGGER update_student_attendance_updated_at 
    BEFORE UPDATE ON public.student_attendance 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Triggers for timetables
CREATE TRIGGER trigger_auto_populate_timetable_institution 
    BEFORE INSERT ON public.timetables 
    FOR EACH ROW EXECUTE FUNCTION auto_populate_timetable_institution();

CREATE TRIGGER update_timetables_updated_at 
    BEFORE UPDATE ON public.timetables 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Triggers for timetable_slots
CREATE TRIGGER update_timetable_slots_updated_at 
    BEFORE UPDATE ON public.timetable_slots 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Triggers for timetable_slot_staff
CREATE TRIGGER update_timetable_slot_staff_updated_at 
    BEFORE UPDATE ON public.timetable_slot_staff 
    FOR EACH ROW EXECUTE FUNCTION update_timetable_slot_staff_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_plan_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slot_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slot_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_sub_slot_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_sub_slot_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES: periods
-- =====================================================

CREATE POLICY "Admins can manage periods in their institutions" ON public.periods
    FOR ALL TO authenticated
    USING (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR (((SELECT profiles.role FROM profiles WHERE (profiles.id = auth.uid())) = 'administrator'::text) 
        AND user_has_institution_access(auth.uid(), institution_id))
    )
    WITH CHECK (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR (((SELECT profiles.role FROM profiles WHERE (profiles.id = auth.uid())) = 'administrator'::text) 
        AND user_has_institution_access(auth.uid(), institution_id))
    );

CREATE POLICY "Users can create periods for their institution" ON public.periods
    FOR INSERT TO authenticated
    WITH CHECK (
        ((institution_id = get_my_institution_id()) AND check_permission('academic.periods.create'::text)) 
        OR (check_permission('super_admin'::text) AND (institution_id IS NOT NULL))
    );

CREATE POLICY "Users can delete periods for their institution" ON public.periods
    FOR DELETE TO authenticated
    USING (
        ((institution_id = get_my_institution_id()) AND check_permission('academic.periods.delete'::text)) 
        OR check_permission('super_admin'::text)
    );

CREATE POLICY "Users can update periods for their institution" ON public.periods
    FOR UPDATE TO authenticated
    USING (
        ((institution_id = get_my_institution_id()) AND check_permission('academic.periods.edit'::text)) 
        OR check_permission('super_admin'::text)
    );

CREATE POLICY "Users can view periods for their institution" ON public.periods
    FOR SELECT TO authenticated
    USING (
        (institution_id = get_my_institution_id()) 
        OR check_permission('super_admin'::text) 
        OR check_permission('academic.periods.view'::text)
    );

CREATE POLICY "Users can view periods from accessible institutions" ON public.periods
    FOR SELECT TO authenticated
    USING (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR user_has_institution_access(auth.uid(), institution_id)
    );

-- =====================================================
-- RLS POLICIES: staff_plans
-- =====================================================

CREATE POLICY "Admin users can delete staff plans" ON public.staff_plans
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can insert staff plans" ON public.staff_plans
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can update staff plans" ON public.staff_plans
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can view all staff plans" ON public.staff_plans
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admins can manage staff_plans in their institutions" ON public.staff_plans
    FOR ALL TO authenticated
    USING (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR (((SELECT profiles.role FROM profiles WHERE (profiles.id = auth.uid())) = 'administrator'::text) 
        AND user_has_institution_access(auth.uid(), institution_id))
    )
    WITH CHECK (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR (((SELECT profiles.role FROM profiles WHERE (profiles.id = auth.uid())) = 'administrator'::text) 
        AND user_has_institution_access(auth.uid(), institution_id))
    );

CREATE POLICY "Faculty users can delete institution staff plans" ON public.staff_plans
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = staff_plans.institution_id))
    ));

CREATE POLICY "Faculty users can insert institution staff plans" ON public.staff_plans
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = staff_plans.institution_id))
    ));

CREATE POLICY "Faculty users can update institution staff plans" ON public.staff_plans
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = staff_plans.institution_id))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = staff_plans.institution_id))
    ));

CREATE POLICY "Faculty users can view institution staff plans" ON public.staff_plans
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = staff_plans.institution_id))
    ));

CREATE POLICY "Users can view staff_plans from accessible institutions" ON public.staff_plans
    FOR SELECT TO authenticated
    USING (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR user_has_institution_access(auth.uid(), institution_id)
    );

-- =====================================================
-- RLS POLICIES: staff_plan_courses
-- =====================================================

CREATE POLICY "Admin users can delete staff plan courses" ON public.staff_plan_courses
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can insert staff plan courses" ON public.staff_plan_courses
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can update staff plan courses" ON public.staff_plan_courses
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can view all staff plan courses" ON public.staff_plan_courses
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Faculty users can delete institution staff plan courses" ON public.staff_plan_courses
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM (profiles
        JOIN staff_plans ON ((staff_plans.institution_id = profiles.institution_id)))
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (staff_plans.id = staff_plan_courses.staff_plan_id))
    ));

CREATE POLICY "Faculty users can insert institution staff plan courses" ON public.staff_plan_courses
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM (profiles
        JOIN staff_plans ON ((staff_plans.institution_id = profiles.institution_id)))
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (staff_plans.id = staff_plan_courses.staff_plan_id))
    ));

CREATE POLICY "Faculty users can update institution staff plan courses" ON public.staff_plan_courses
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM (profiles
        JOIN staff_plans ON ((staff_plans.institution_id = profiles.institution_id)))
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (staff_plans.id = staff_plan_courses.staff_plan_id))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM (profiles
        JOIN staff_plans ON ((staff_plans.institution_id = profiles.institution_id)))
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (staff_plans.id = staff_plan_courses.staff_plan_id))
    ));

CREATE POLICY "Faculty users can view institution staff plan courses" ON public.staff_plan_courses
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM (profiles
        JOIN staff_plans ON ((staff_plans.institution_id = profiles.institution_id)))
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (staff_plans.id = staff_plan_courses.staff_plan_id))
    ));

-- =====================================================
-- RLS POLICIES: timetables
-- =====================================================

CREATE POLICY "Admin users can delete timetables" ON public.timetables
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can insert timetables" ON public.timetables
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can update timetables" ON public.timetables
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can view all timetables" ON public.timetables
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admins can manage timetables in their institutions" ON public.timetables
    FOR ALL TO authenticated
    USING (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR (((SELECT profiles.role FROM profiles WHERE (profiles.id = auth.uid())) = 'administrator'::text) 
        AND user_has_institution_access(auth.uid(), institution_id))
    )
    WITH CHECK (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR (((SELECT profiles.role FROM profiles WHERE (profiles.id = auth.uid())) = 'administrator'::text) 
        AND user_has_institution_access(auth.uid(), institution_id))
    );

CREATE POLICY "Faculty users can delete institution timetables" ON public.timetables
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = timetables.institution_id))
    ));

CREATE POLICY "Faculty users can insert institution timetables" ON public.timetables
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = timetables.institution_id))
    ));

CREATE POLICY "Faculty users can update institution timetables" ON public.timetables
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = timetables.institution_id))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = timetables.institution_id))
    ));

CREATE POLICY "Faculty users can view institution timetables" ON public.timetables
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = timetables.institution_id))
    ));

CREATE POLICY "Users can create timetables" ON public.timetables
    FOR INSERT TO authenticated
    WITH CHECK (check_permission('academic.timetables.create'::text) OR check_permission('super_admin'::text));

CREATE POLICY "Users can delete timetables" ON public.timetables
    FOR DELETE TO authenticated
    USING (check_permission('academic.timetables.delete'::text) OR check_permission('super_admin'::text));

CREATE POLICY "Users can update timetables" ON public.timetables
    FOR UPDATE TO authenticated
    USING (check_permission('academic.timetables.edit'::text) OR check_permission('super_admin'::text));

CREATE POLICY "Users can view timetables from accessible institutions" ON public.timetables
    FOR SELECT TO authenticated
    USING (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR user_has_institution_access(auth.uid(), institution_id)
    );

-- =====================================================
-- RLS POLICIES: timetable_periods
-- =====================================================

CREATE POLICY "Users can create timetable periods for their institution" ON public.timetable_periods
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM timetables t
        WHERE ((t.id = timetable_periods.timetable_id) 
        AND ((t.institution_id = get_my_institution_id()) OR check_permission('super_admin'::text)))
    ));

CREATE POLICY "Users can delete timetable periods for their institution" ON public.timetable_periods
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM timetables t
        WHERE ((t.id = timetable_periods.timetable_id) 
        AND ((t.institution_id = get_my_institution_id()) OR check_permission('super_admin'::text)))
    ));

CREATE POLICY "Users can update timetable periods for their institution" ON public.timetable_periods
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM timetables t
        WHERE ((t.id = timetable_periods.timetable_id) 
        AND ((t.institution_id = get_my_institution_id()) OR check_permission('super_admin'::text)))
    ));

CREATE POLICY "Users can view timetable periods for their institution" ON public.timetable_periods
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM timetables t
        WHERE ((t.id = timetable_periods.timetable_id) 
        AND ((t.institution_id = get_my_institution_id()) OR check_permission('super_admin'::text)))
    ));

-- =====================================================
-- RLS POLICIES: timetable_slots
-- =====================================================

CREATE POLICY "Admin users can delete timetable slots" ON public.timetable_slots
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can insert timetable slots" ON public.timetable_slots
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can update timetable slots" ON public.timetable_slots
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admin users can view all timetable slots" ON public.timetable_slots
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Authenticated users can view any timetable_slot" ON public.timetable_slots
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Faculty users can delete institution timetable slots" ON public.timetable_slots
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM (profiles
        JOIN timetables ON ((timetables.institution_id = profiles.institution_id)))
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (timetables.id = timetable_slots.timetable_id))
    ));

CREATE POLICY "Faculty users can insert institution timetable slots" ON public.timetable_slots
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM (profiles
        JOIN timetables ON ((timetables.institution_id = profiles.institution_id)))
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (timetables.id = timetable_slots.timetable_id))
    ));

CREATE POLICY "Faculty users can update institution timetable slots" ON public.timetable_slots
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM (profiles
        JOIN timetables ON ((timetables.institution_id = profiles.institution_id)))
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (timetables.id = timetable_slots.timetable_id))
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM (profiles
        JOIN timetables ON ((timetables.institution_id = profiles.institution_id)))
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (timetables.id = timetable_slots.timetable_id))
    ));

CREATE POLICY "Faculty users can view institution timetable slots" ON public.timetable_slots
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM (profiles
        JOIN timetables ON ((timetables.institution_id = profiles.institution_id)))
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'faculty'::text) 
        AND (timetables.id = timetable_slots.timetable_id))
    ));

CREATE POLICY "Users can create timetable_slots" ON public.timetable_slots
    FOR INSERT TO authenticated
    WITH CHECK (check_permission('academic.timetables.create'::text) OR check_permission('super_admin'::text));

CREATE POLICY "Users can delete timetable_slots" ON public.timetable_slots
    FOR DELETE TO authenticated
    USING (check_permission('academic.timetables.delete'::text) OR check_permission('super_admin'::text));

CREATE POLICY "Users can update timetable_slots" ON public.timetable_slots
    FOR UPDATE TO authenticated
    USING (check_permission('academic.timetables.edit'::text) OR check_permission('super_admin'::text));

-- =====================================================
-- RLS POLICIES: timetable_slot_sections
-- =====================================================

CREATE POLICY "Users can add slot section assignments for their institution or" ON public.timetable_slot_sections
    FOR INSERT TO public
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM (timetable_slots ts
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((ts.id = timetable_slot_sections.timetable_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can delete slot section assignments for their institution" ON public.timetable_slot_sections
    FOR DELETE TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM (timetable_slots ts
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((ts.id = timetable_slot_sections.timetable_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can update slot section assignments for their institution" ON public.timetable_slot_sections
    FOR UPDATE TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM (timetable_slots ts
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((ts.id = timetable_slot_sections.timetable_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can view slot section assignments for their institution o" ON public.timetable_slot_sections
    FOR SELECT TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM (timetable_slots ts
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((ts.id = timetable_slot_sections.timetable_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

-- =====================================================
-- RLS POLICIES: timetable_slot_staff
-- =====================================================

CREATE POLICY "Users can add slot staff assignments for their institution or s" ON public.timetable_slot_staff
    FOR INSERT TO public
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM (timetable_slots ts
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((ts.id = timetable_slot_staff.timetable_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can delete slot staff assignments for their institution o" ON public.timetable_slot_staff
    FOR DELETE TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM (timetable_slots ts
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((ts.id = timetable_slot_staff.timetable_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can update slot staff assignments for their institution o" ON public.timetable_slot_staff
    FOR UPDATE TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM (timetable_slots ts
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((ts.id = timetable_slot_staff.timetable_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can view slot staff assignments for their institution or " ON public.timetable_slot_staff
    FOR SELECT TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM (timetable_slots ts
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((ts.id = timetable_slot_staff.timetable_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

-- =====================================================
-- RLS POLICIES: timetable_sub_slot_sections
-- =====================================================

CREATE POLICY "Users can add sub slot section assignments for their institutio" ON public.timetable_sub_slot_sections
    FOR INSERT TO public
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM ((timetable_sub_slots tss
            JOIN timetable_slots ts ON ((tss.parent_slot_id = ts.id)))
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((tss.id = timetable_sub_slot_sections.sub_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can delete sub slot section assignments for their institu" ON public.timetable_sub_slot_sections
    FOR DELETE TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM ((timetable_sub_slots tss
            JOIN timetable_slots ts ON ((tss.parent_slot_id = ts.id)))
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((tss.id = timetable_sub_slot_sections.sub_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can update sub slot section assignments for their institu" ON public.timetable_sub_slot_sections
    FOR UPDATE TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM ((timetable_sub_slots tss
            JOIN timetable_slots ts ON ((tss.parent_slot_id = ts.id)))
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((tss.id = timetable_sub_slot_sections.sub_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can view sub slot section assignments for their instituti" ON public.timetable_sub_slot_sections
    FOR SELECT TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM ((timetable_sub_slots tss
            JOIN timetable_slots ts ON ((tss.parent_slot_id = ts.id)))
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((tss.id = timetable_sub_slot_sections.sub_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

-- =====================================================
-- RLS POLICIES: timetable_sub_slot_staff
-- =====================================================

CREATE POLICY "Users can add sub slot staff assignments for their institution " ON public.timetable_sub_slot_staff
    FOR INSERT TO public
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM ((timetable_sub_slots tss
            JOIN timetable_slots ts ON ((tss.parent_slot_id = ts.id)))
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((tss.id = timetable_sub_slot_staff.sub_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can delete sub slot staff assignments for their instituti" ON public.timetable_sub_slot_staff
    FOR DELETE TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM ((timetable_sub_slots tss
            JOIN timetable_slots ts ON ((tss.parent_slot_id = ts.id)))
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((tss.id = timetable_sub_slot_staff.sub_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can update sub slot staff assignments for their instituti" ON public.timetable_sub_slot_staff
    FOR UPDATE TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM ((timetable_sub_slots tss
            JOIN timetable_slots ts ON ((tss.parent_slot_id = ts.id)))
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((tss.id = timetable_sub_slot_staff.sub_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

CREATE POLICY "Users can view sub slot staff assignments for their institution" ON public.timetable_sub_slot_staff
    FOR SELECT TO public
    USING (EXISTS (
        SELECT 1 FROM profiles p
        WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text) 
        OR (EXISTS (
            SELECT 1 FROM ((timetable_sub_slots tss
            JOIN timetable_slots ts ON ((tss.parent_slot_id = ts.id)))
            JOIN timetables t ON ((ts.timetable_id = t.id)))
            WHERE ((tss.id = timetable_sub_slot_staff.sub_slot_id) AND (t.institution_id = p.institution_id))
        ))))
    ));

-- =====================================================
-- RLS POLICIES: student_attendance
-- =====================================================

CREATE POLICY "Admin users can access all attendance data" ON public.student_attendance
    FOR ALL TO public
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text])))
    ));

CREATE POLICY "Admins and Faculty can manage student_attendance in their insti" ON public.student_attendance
    FOR ALL TO authenticated
    USING (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR (((SELECT profiles.role FROM profiles WHERE (profiles.id = auth.uid())) = ANY (ARRAY['administrator'::text, 'faculty'::text])) 
        AND user_has_institution_access(auth.uid(), institution_id))
    )
    WITH CHECK (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR (((SELECT profiles.role FROM profiles WHERE (profiles.id = auth.uid())) = ANY (ARRAY['administrator'::text, 'faculty'::text])) 
        AND user_has_institution_access(auth.uid(), institution_id))
    );

CREATE POLICY "Institution users can access their attendance data" ON public.student_attendance
    FOR ALL TO public
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.institution_id = student_attendance.institution_id) 
        AND (profiles.institution_id IS NOT NULL))
    ));

CREATE POLICY "Institution-based attendance access" ON public.student_attendance
    FOR ALL TO public
    USING (institution_id IN (
        SELECT uia.institution_id FROM user_institution_access uia
        WHERE ((uia.user_id = auth.uid()) AND (uia.is_active = true))
    ));

CREATE POLICY "Super admin users can access all attendance data" ON public.student_attendance
    FOR ALL TO public
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE ((profiles.id = auth.uid()) AND (profiles.is_super_admin = true))
    ));

CREATE POLICY "Users can view student_attendance from accessible institutions" ON public.student_attendance
    FOR SELECT TO authenticated
    USING (
        ((SELECT profiles.is_super_admin FROM profiles WHERE (profiles.id = auth.uid())) = true) 
        OR user_has_institution_access(auth.uid(), institution_id)
    );

-- =====================================================
-- END OF ACADEMIC MODULE DATABASE SCHEMA
-- =====================================================

-- Note: This SQL file contains all the necessary components to recreate
-- the academic module database structure including:
-- 1. Helper functions for RLS policies
-- 2. Trigger functions
-- 3. All tables with proper constraints and defaults
-- 4. All indexes for performance optimization
-- 5. All triggers for automatic updates
-- 6. Complete RLS policies for security
-- 
-- Dependencies: 
-- - institutions, profiles, auth.users tables must exist
-- - courses, staff, sections, academic_years, degrees, departments, programs, semesters tables must exist
-- - custom_roles, user_institution_access tables must exist for permissions