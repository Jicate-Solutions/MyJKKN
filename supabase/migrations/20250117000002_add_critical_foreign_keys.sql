-- ================================================================================
-- MIGRATION: Add Critical Foreign Key Constraints
-- Date: 2025-01-17
-- Description: Adds the most critical foreign key constraints for data integrity
-- ================================================================================

BEGIN;

-- ================================================================================
-- CRITICAL FOREIGN KEYS FOR DATA INTEGRITY
-- (Using DO blocks for safe, idempotent execution)
-- ================================================================================

-- 1. STUDENTS -> INSTITUTIONS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_institution') THEN
    ALTER TABLE students ADD CONSTRAINT fk_students_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. STUDENTS -> PROGRAMS (only if column exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'program_id') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_program') THEN
      ALTER TABLE students ADD CONSTRAINT fk_students_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL;
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3-15: Safe constraint additions with existence checks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bills_student') THEN
    ALTER TABLE billing_student_bills ADD CONSTRAINT fk_bills_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bills_institution') THEN
    ALTER TABLE billing_student_bills ADD CONSTRAINT fk_bills_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_student') THEN
    ALTER TABLE billing_receipts ADD CONSTRAINT fk_receipts_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_institution') THEN
    ALTER TABLE billing_receipts ADD CONSTRAINT fk_receipts_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_student') THEN
    ALTER TABLE billing_invoices ADD CONSTRAINT fk_invoices_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_institution') THEN
    ALTER TABLE billing_invoices ADD CONSTRAINT fk_invoices_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_student_attendance_institution') THEN
    ALTER TABLE student_attendance ADD CONSTRAINT fk_student_attendance_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_student_attendance_section') THEN
    ALTER TABLE student_attendance ADD CONSTRAINT fk_student_attendance_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_staff_institution') THEN
    ALTER TABLE staff ADD CONSTRAINT fk_staff_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_departments_institution') THEN
    ALTER TABLE departments ADD CONSTRAINT fk_departments_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_programs_institution') THEN
    ALTER TABLE programs ADD CONSTRAINT fk_programs_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sections_institution') THEN
    ALTER TABLE sections ADD CONSTRAINT fk_sections_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_semesters_institution') THEN
    ALTER TABLE semesters ADD CONSTRAINT fk_semesters_institution FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

COMMIT;

-- ================================================================================
-- VERIFICATION QUERY
-- ================================================================================
/*
Run this after the migration to verify foreign keys were created:

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