-- ================================================================================
-- MIGRATION: Add Foreign Key Constraints (FIXED VERSION)
-- Date: 2025-01-17
-- Description: Adds all missing foreign key constraints for data integrity
-- ================================================================================

BEGIN;

-- ================================================================================
-- STEP 1: Add missing tables if they don't exist
-- ================================================================================

-- Activity stats table
CREATE TABLE IF NOT EXISTS public.activity_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_date DATE NOT NULL,
    activity_hour INTEGER,
    action_type VARCHAR(100),
    resource_type VARCHAR(100),
    count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraint separately for activity_stats
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_stats_unique 
    ON public.activity_stats(activity_date, activity_hour, action_type, COALESCE(resource_type, ''));

-- Timetable slot continuity table
CREATE TABLE IF NOT EXISTS public.timetable_slot_continuity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_slot_id UUID NOT NULL,
    continuity_group_id UUID NOT NULL,
    version_number INTEGER NOT NULL,
    valid_from DATE NOT NULL,
    valid_until DATE,
    is_current BOOLEAN DEFAULT false,
    slot_data JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Migration log table (skip if exists - has different structure)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_log') THEN
        CREATE TABLE public.migration_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            migration_name VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            applied_by UUID,
            rollback_at TIMESTAMPTZ,
            rollback_by UUID,
            status VARCHAR(50) DEFAULT 'applied',
            metadata JSONB
        );
    END IF;
END $$;

-- ================================================================================
-- STEP 2: Add Foreign Key Constraints (only those that don't exist)
-- ================================================================================

-- PROFILES TABLE
DO $$ BEGIN
    ALTER TABLE profiles 
        ADD CONSTRAINT fk_profiles_institution 
        FOREIGN KEY (institution_id) 
        REFERENCES institutions(id) 
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL; END $$;

-- USER_INSTITUTION_ACCESS TABLE
DO $$ BEGIN
    ALTER TABLE user_institution_access
        ADD CONSTRAINT fk_user_institution_access_user
        FOREIGN KEY (user_id)
        REFERENCES profiles(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE user_institution_access
        ADD CONSTRAINT fk_user_institution_access_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- STUDENTS TABLE
DO $$ BEGIN
    ALTER TABLE students
        ADD CONSTRAINT fk_students_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE students
        ADD CONSTRAINT fk_students_program
        FOREIGN KEY (program_id)
        REFERENCES programs(id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE students
        ADD CONSTRAINT fk_students_semester
        FOREIGN KEY (semester_id)
        REFERENCES semesters(id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE students
        ADD CONSTRAINT fk_students_section
        FOREIGN KEY (section_id)
        REFERENCES sections(id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL; END $$;

-- STAFF TABLE
DO $$ BEGIN
    ALTER TABLE staff
        ADD CONSTRAINT fk_staff_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE staff
        ADD CONSTRAINT fk_staff_department
        FOREIGN KEY (department_id)
        REFERENCES departments(id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL; END $$;

-- DEPARTMENTS TABLE
DO $$ BEGIN
    ALTER TABLE departments
        ADD CONSTRAINT fk_departments_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE departments
        ADD CONSTRAINT fk_departments_degree
        FOREIGN KEY (degree_id)
        REFERENCES degrees(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL; END $$;

-- PROGRAMS TABLE
DO $$ BEGIN
    ALTER TABLE programs
        ADD CONSTRAINT fk_programs_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE programs
        ADD CONSTRAINT fk_programs_degree
        FOREIGN KEY (degree_id)
        REFERENCES degrees(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE programs
        ADD CONSTRAINT fk_programs_department
        FOREIGN KEY (department_id)
        REFERENCES departments(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL; END $$;

-- SEMESTERS TABLE
DO $$ BEGIN
    ALTER TABLE semesters
        ADD CONSTRAINT fk_semesters_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE semesters
        ADD CONSTRAINT fk_semesters_program
        FOREIGN KEY (program_id)
        REFERENCES programs(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

-- SECTIONS TABLE
DO $$ BEGIN
    ALTER TABLE sections
        ADD CONSTRAINT fk_sections_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE sections
        ADD CONSTRAINT fk_sections_semester
        FOREIGN KEY (semester_id)
        REFERENCES semesters(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL; END $$;

-- BILLING_STUDENT_BILLS TABLE
DO $$ BEGIN
    ALTER TABLE billing_student_bills
        ADD CONSTRAINT fk_bills_student
        FOREIGN KEY (student_id)
        REFERENCES students(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE billing_student_bills
        ADD CONSTRAINT fk_bills_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

-- BILLING_RECEIPTS TABLE
DO $$ BEGIN
    ALTER TABLE billing_receipts
        ADD CONSTRAINT fk_receipts_student
        FOREIGN KEY (student_id)
        REFERENCES students(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE billing_receipts
        ADD CONSTRAINT fk_receipts_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

-- BILLING_INVOICES TABLE
DO $$ BEGIN
    ALTER TABLE billing_invoices
        ADD CONSTRAINT fk_invoices_student
        FOREIGN KEY (student_id)
        REFERENCES students(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE billing_invoices
        ADD CONSTRAINT fk_invoices_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

-- TIMETABLES TABLE
DO $$ BEGIN
    ALTER TABLE timetables
        ADD CONSTRAINT fk_timetables_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE timetables
        ADD CONSTRAINT fk_timetables_academic_year
        FOREIGN KEY (academic_year_id)
        REFERENCES academic_years(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE timetables
        ADD CONSTRAINT fk_timetables_department
        FOREIGN KEY (department_id)
        REFERENCES departments(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_column THEN NULL; END $$;

-- INSTITUTION_DEPARTMENTS TABLE (existing table with different structure)
DO $$ BEGIN
    ALTER TABLE institution_departments
        ADD CONSTRAINT fk_inst_dept_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- STUDENT_ATTENDANCE TABLE (actual attendance table)
DO $$ BEGIN
    ALTER TABLE student_attendance
        ADD CONSTRAINT fk_student_attendance_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE student_attendance
        ADD CONSTRAINT fk_student_attendance_timetable
        FOREIGN KEY (timetable_id)
        REFERENCES timetables(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE student_attendance
        ADD CONSTRAINT fk_student_attendance_section
        FOREIGN KEY (section_id)
        REFERENCES sections(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE student_attendance
        ADD CONSTRAINT fk_student_attendance_marked_by
        FOREIGN KEY (marked_by)
        REFERENCES profiles(id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

-- ================================================================================
-- STEP 3: Add missing indexes for foreign keys (wrapped in DO blocks for safety)
-- ================================================================================

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_students_institution_id ON students(institution_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_students_program_id ON students(program_id) WHERE program_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_students_semester_id ON students(semester_id) WHERE semester_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_students_section_id ON students(section_id) WHERE section_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_staff_institution_id ON staff(institution_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_staff_department_id ON staff(department_id) WHERE department_id IS NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_billing_bills_student_id ON billing_student_bills(student_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_billing_receipts_student_id ON billing_receipts(student_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_billing_invoices_student_id ON billing_invoices(student_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Create student_attendance indexes (wrapped for safety)
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_student_attendance_institution_id ON student_attendance(institution_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_student_attendance_section_id ON student_attendance(section_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_student_attendance_timetable_id ON student_attendance(timetable_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_student_attendance_date ON student_attendance(attendance_date); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_student_attendance_marked_by ON student_attendance(marked_by); EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMIT;

-- ================================================================================
-- Verification Queries (run after migration)
-- ================================================================================
/*
-- Check foreign key constraints count
SELECT COUNT(*) as foreign_key_count
FROM information_schema.table_constraints 
WHERE constraint_type = 'FOREIGN KEY'
AND constraint_schema = 'public';

-- Check specific foreign keys were added
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
ORDER BY tc.table_name;
*/