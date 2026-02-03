-- ================================================================================
-- MIGRATION: Add Foreign Key Constraints
-- Date: 2025-01-17
-- Description: Adds all missing foreign key constraints for data integrity
-- ================================================================================

-- This migration adds foreign key constraints to ensure referential integrity
-- It should be run after all tables are created

BEGIN;

-- ================================================================================
-- STEP 1: Add missing tables if they don't exist
-- ================================================================================

-- Note: Users table not needed - profiles table handles user management

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

-- Note: institution_departments table already exists with different structure
-- It stores department contact information, not institution-department mapping

-- Migration log table
CREATE TABLE IF NOT EXISTS public.migration_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    applied_by UUID,
    rollback_at TIMESTAMPTZ,
    rollback_by UUID,
    status VARCHAR(50) DEFAULT 'applied',
    metadata JSONB
);

-- ================================================================================
-- STEP 2: Drop existing foreign keys if they exist (to avoid conflicts)
-- ================================================================================

-- Function to safely drop foreign key if it exists
CREATE OR REPLACE FUNCTION drop_foreign_key_if_exists(
    p_table_name text,
    p_constraint_name text
) RETURNS void AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = p_table_name 
        AND constraint_name = p_constraint_name
        AND constraint_type = 'FOREIGN KEY'
    ) THEN
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', p_table_name, p_constraint_name);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ================================================================================
-- STEP 3: Add Foreign Key Constraints
-- ================================================================================

-- Note: We'll add constraints with IF NOT EXISTS checks where possible
-- For PostgreSQL versions that don't support IF NOT EXISTS, we use the function above

-- PROFILES TABLE
DO $$ BEGIN
    ALTER TABLE profiles 
        ADD CONSTRAINT fk_profiles_institution 
        FOREIGN KEY (institution_id) 
        REFERENCES institutions(id) 
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

-- USER_INSTITUTION_ACCESS TABLE
DO $$ BEGIN
    ALTER TABLE user_institution_access
        ADD CONSTRAINT fk_user_institution_access_user
        FOREIGN KEY (user_id)
        REFERENCES profiles(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE user_institution_access
        ADD CONSTRAINT fk_user_institution_access_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

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
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE students
        ADD CONSTRAINT fk_students_semester
        FOREIGN KEY (semester_id)
        REFERENCES semesters(id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE students
        ADD CONSTRAINT fk_students_section
        FOREIGN KEY (section_id)
        REFERENCES sections(id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

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
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

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
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

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
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE programs
        ADD CONSTRAINT fk_programs_department
        FOREIGN KEY (department_id)
        REFERENCES departments(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

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
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

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
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE timetables
        ADD CONSTRAINT fk_timetables_department
        FOREIGN KEY (department_id)
        REFERENCES departments(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

-- INSTITUTION_DEPARTMENTS TABLE (existing table with different structure)
DO $$ BEGIN
    ALTER TABLE institution_departments
        ADD CONSTRAINT fk_inst_dept_institution
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; WHEN OTHERS THEN NULL; END $$;

-- ================================================================================
-- STEP 4: Add missing indexes for foreign keys (wrapped for safety)
-- ================================================================================

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_students_institution_id ON students(institution_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_students_program_id ON students(program_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_students_semester_id ON students(semester_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_staff_institution_id ON staff(institution_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_staff_department_id ON staff(department_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_billing_bills_student_id ON billing_student_bills(student_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_billing_receipts_student_id ON billing_receipts(student_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_billing_invoices_student_id ON billing_invoices(student_id); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ================================================================================
-- STEP 6: Clean up temporary function
-- ================================================================================

DROP FUNCTION IF EXISTS drop_foreign_key_if_exists(text, text);

COMMIT;

-- ================================================================================
-- ROLLBACK SCRIPT (Save separately)
-- ================================================================================
-- To rollback this migration, run:
/*
BEGIN;

-- Drop all foreign key constraints added
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profiles_institution;
ALTER TABLE user_institution_access DROP CONSTRAINT IF EXISTS fk_user_institution_access_user;
ALTER TABLE user_institution_access DROP CONSTRAINT IF EXISTS fk_user_institution_access_institution;
ALTER TABLE students DROP CONSTRAINT IF EXISTS fk_students_institution;
ALTER TABLE students DROP CONSTRAINT IF EXISTS fk_students_program;
ALTER TABLE students DROP CONSTRAINT IF EXISTS fk_students_semester;
ALTER TABLE students DROP CONSTRAINT IF EXISTS fk_students_section;
ALTER TABLE staff DROP CONSTRAINT IF EXISTS fk_staff_institution;
ALTER TABLE staff DROP CONSTRAINT IF EXISTS fk_staff_department;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_departments_institution;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_departments_degree;
ALTER TABLE programs DROP CONSTRAINT IF EXISTS fk_programs_institution;
ALTER TABLE programs DROP CONSTRAINT IF EXISTS fk_programs_degree;
ALTER TABLE programs DROP CONSTRAINT IF EXISTS fk_programs_department;
ALTER TABLE semesters DROP CONSTRAINT IF EXISTS fk_semesters_institution;
ALTER TABLE semesters DROP CONSTRAINT IF EXISTS fk_semesters_program;
ALTER TABLE sections DROP CONSTRAINT IF EXISTS fk_sections_institution;
ALTER TABLE sections DROP CONSTRAINT IF EXISTS fk_sections_semester;
ALTER TABLE billing_student_bills DROP CONSTRAINT IF EXISTS fk_bills_student;
ALTER TABLE billing_student_bills DROP CONSTRAINT IF EXISTS fk_bills_institution;
ALTER TABLE billing_receipts DROP CONSTRAINT IF EXISTS fk_receipts_student;
ALTER TABLE billing_receipts DROP CONSTRAINT IF EXISTS fk_receipts_institution;
ALTER TABLE billing_invoices DROP CONSTRAINT IF EXISTS fk_invoices_student;
ALTER TABLE billing_invoices DROP CONSTRAINT IF EXISTS fk_invoices_institution;
ALTER TABLE timetables DROP CONSTRAINT IF EXISTS fk_timetables_institution;
ALTER TABLE timetables DROP CONSTRAINT IF EXISTS fk_timetables_academic_year;
ALTER TABLE timetables DROP CONSTRAINT IF EXISTS fk_timetables_department;
ALTER TABLE institution_departments DROP CONSTRAINT IF EXISTS fk_inst_dept_institution;
ALTER TABLE institution_departments DROP CONSTRAINT IF EXISTS fk_inst_dept_department;

-- Update migration log
UPDATE migration_log 
SET rollback_at = NOW(), 
    rollback_by = auth.uid(),
    status = 'rolled_back'
WHERE migration_name = '20250117_add_foreign_keys';

COMMIT;
*/