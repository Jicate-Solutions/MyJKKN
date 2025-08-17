-- ================================================================================
-- MIGRATION: Add Critical Foreign Key Constraints
-- Date: 2025-01-17
-- Description: Adds the most critical foreign key constraints for data integrity
-- ================================================================================

BEGIN;

-- ================================================================================
-- CRITICAL FOREIGN KEYS FOR DATA INTEGRITY
-- ================================================================================

-- 1. STUDENTS -> INSTITUTIONS
ALTER TABLE students 
ADD CONSTRAINT fk_students_institution 
FOREIGN KEY (institution_id) 
REFERENCES institutions(id) 
ON DELETE CASCADE;

-- 2. STUDENTS -> PROGRAMS
ALTER TABLE students 
ADD CONSTRAINT fk_students_program 
FOREIGN KEY (program_id) 
REFERENCES programs(id) 
ON DELETE SET NULL;

-- 3. BILLING_STUDENT_BILLS -> STUDENTS
ALTER TABLE billing_student_bills 
ADD CONSTRAINT fk_bills_student 
FOREIGN KEY (student_id) 
REFERENCES students(id) 
ON DELETE CASCADE;

-- 4. BILLING_STUDENT_BILLS -> INSTITUTIONS
ALTER TABLE billing_student_bills 
ADD CONSTRAINT fk_bills_institution 
FOREIGN KEY (institution_id) 
REFERENCES institutions(id) 
ON DELETE CASCADE;

-- 5. BILLING_RECEIPTS -> STUDENTS
ALTER TABLE billing_receipts 
ADD CONSTRAINT fk_receipts_student 
FOREIGN KEY (student_id) 
REFERENCES students(id) 
ON DELETE CASCADE;

-- 6. BILLING_RECEIPTS -> INSTITUTIONS
ALTER TABLE billing_receipts 
ADD CONSTRAINT fk_receipts_institution 
FOREIGN KEY (institution_id) 
REFERENCES institutions(id) 
ON DELETE CASCADE;

-- 7. BILLING_INVOICES -> STUDENTS
ALTER TABLE billing_invoices 
ADD CONSTRAINT fk_invoices_student 
FOREIGN KEY (student_id) 
REFERENCES students(id) 
ON DELETE CASCADE;

-- 8. BILLING_INVOICES -> INSTITUTIONS
ALTER TABLE billing_invoices 
ADD CONSTRAINT fk_invoices_institution 
FOREIGN KEY (institution_id) 
REFERENCES institutions(id) 
ON DELETE CASCADE;

-- 9. STUDENT_ATTENDANCE -> INSTITUTIONS
ALTER TABLE student_attendance 
ADD CONSTRAINT fk_student_attendance_institution 
FOREIGN KEY (institution_id) 
REFERENCES institutions(id) 
ON DELETE CASCADE;

-- 10. STUDENT_ATTENDANCE -> SECTIONS
ALTER TABLE student_attendance 
ADD CONSTRAINT fk_student_attendance_section 
FOREIGN KEY (section_id) 
REFERENCES sections(id) 
ON DELETE CASCADE;

-- 11. STAFF -> INSTITUTIONS
ALTER TABLE staff 
ADD CONSTRAINT fk_staff_institution 
FOREIGN KEY (institution_id) 
REFERENCES institutions(id) 
ON DELETE CASCADE;

-- 12. DEPARTMENTS -> INSTITUTIONS
ALTER TABLE departments 
ADD CONSTRAINT fk_departments_institution 
FOREIGN KEY (institution_id) 
REFERENCES institutions(id) 
ON DELETE CASCADE;

-- 13. PROGRAMS -> INSTITUTIONS
ALTER TABLE programs 
ADD CONSTRAINT fk_programs_institution 
FOREIGN KEY (institution_id) 
REFERENCES institutions(id) 
ON DELETE CASCADE;

-- 14. SECTIONS -> INSTITUTIONS
ALTER TABLE sections 
ADD CONSTRAINT fk_sections_institution 
FOREIGN KEY (institution_id) 
REFERENCES institutions(id) 
ON DELETE CASCADE;

-- 15. SEMESTERS -> INSTITUTIONS
ALTER TABLE semesters 
ADD CONSTRAINT fk_semesters_institution 
FOREIGN KEY (institution_id) 
REFERENCES institutions(id) 
ON DELETE CASCADE;

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