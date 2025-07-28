-- Migration: Add constraints to enforce semester-program hierarchy
-- Purpose: Prevent future data inconsistencies in semester assignments
-- Date: 2024-01-XX
-- NOTE: Run this AFTER fixing existing inconsistencies with migration 048

-- First, create a function to validate semester-program consistency
CREATE OR REPLACE FUNCTION validate_student_semester_consistency()
RETURNS TRIGGER AS $$
BEGIN
    -- Skip validation if semester_id is NULL (allowed)
    IF NEW.semester_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Check if the semester belongs to the same program as the student
    IF NOT EXISTS (
        SELECT 1 
        FROM semesters s 
        WHERE s.id = NEW.semester_id 
        AND s.program_id = NEW.program_id
        AND s.institution_id = NEW.institution_id
        AND s.department_id = NEW.department_id
    ) THEN
        RAISE EXCEPTION 'Student semester assignment violates hierarchy: semester (%) does not belong to student program (%), department (%), or institution (%)', 
            NEW.semester_id, NEW.program_id, NEW.department_id, NEW.institution_id
            USING ERRCODE = 'check_violation',
                  HINT = 'Ensure the semester belongs to the same program, department, and institution as the student';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce consistency on INSERT and UPDATE
DROP TRIGGER IF EXISTS enforce_student_semester_consistency ON students;
CREATE TRIGGER enforce_student_semester_consistency
    BEFORE INSERT OR UPDATE OF semester_id, program_id, department_id, institution_id
    ON students
    FOR EACH ROW
    EXECUTE FUNCTION validate_student_semester_consistency();

-- Create a function to validate semester hierarchy internally
CREATE OR REPLACE FUNCTION validate_semester_hierarchy_consistency()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the semester's program, department, and institution are consistent
    IF NOT EXISTS (
        SELECT 1 
        FROM programs p
        JOIN departments d ON p.department_id = d.id
        JOIN institutions i ON d.institution_id = i.id
        WHERE p.id = NEW.program_id 
        AND d.id = NEW.department_id
        AND i.id = NEW.institution_id
    ) THEN
        RAISE EXCEPTION 'Semester hierarchy inconsistency: program (%), department (%), and institution (%) do not form a valid hierarchy', 
            NEW.program_id, NEW.department_id, NEW.institution_id
            USING ERRCODE = 'check_violation',
                  HINT = 'Ensure the program belongs to the specified department and the department belongs to the specified institution';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce semester hierarchy consistency
DROP TRIGGER IF EXISTS enforce_semester_hierarchy_consistency ON semesters;
CREATE TRIGGER enforce_semester_hierarchy_consistency
    BEFORE INSERT OR UPDATE OF program_id, department_id, institution_id
    ON semesters
    FOR EACH ROW
    EXECUTE FUNCTION validate_semester_hierarchy_consistency();

-- Add check constraint for active semester validity (optional but recommended)
ALTER TABLE students 
DROP CONSTRAINT IF EXISTS check_active_semester;

ALTER TABLE students 
ADD CONSTRAINT check_active_semester 
CHECK (
    semester_id IS NULL OR 
    EXISTS (
        SELECT 1 FROM semesters 
        WHERE id = semester_id 
        AND is_active = true
    )
);

-- Create indexes to optimize constraint checking
CREATE INDEX IF NOT EXISTS idx_semesters_program_hierarchy 
ON semesters (program_id, department_id, institution_id, is_active);

CREATE INDEX IF NOT EXISTS idx_students_semester_program 
ON students (semester_id, program_id, department_id, institution_id) 
WHERE semester_id IS NOT NULL;

-- Create a view for easy monitoring of hierarchy compliance
CREATE OR REPLACE VIEW student_semester_hierarchy_status AS
SELECT 
    s.id as student_id,
    s.student_name,
    s.roll_number,
    s.institution_id,
    i.name as institution_name,
    s.department_id,
    d.department_name,
    s.program_id,
    p.program_name,
    s.semester_id,
    sem.semester_name,
    CASE 
        WHEN s.semester_id IS NULL THEN 'NO_SEMESTER_ASSIGNED'
        WHEN EXISTS (
            SELECT 1 FROM semesters sem_check
            WHERE sem_check.id = s.semester_id
            AND sem_check.program_id = s.program_id
            AND sem_check.department_id = s.department_id
            AND sem_check.institution_id = s.institution_id
            AND sem_check.is_active = true
        ) THEN 'VALID_HIERARCHY'
        ELSE 'INVALID_HIERARCHY'
    END as hierarchy_status
FROM students s
LEFT JOIN institutions i ON s.institution_id = i.id
LEFT JOIN departments d ON s.department_id = d.id
LEFT JOIN programs p ON s.program_id = p.id
LEFT JOIN semesters sem ON s.semester_id = sem.id;

-- Create a function to check overall system hierarchy health
CREATE OR REPLACE FUNCTION check_semester_hierarchy_health()
RETURNS TABLE (
    total_students BIGINT,
    students_with_semesters BIGINT,
    valid_hierarchies BIGINT,
    invalid_hierarchies BIGINT,
    no_semester_assigned BIGINT,
    health_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_students,
        COUNT(semester_id) as students_with_semesters,
        COUNT(CASE WHEN hierarchy_status = 'VALID_HIERARCHY' THEN 1 END) as valid_hierarchies,
        COUNT(CASE WHEN hierarchy_status = 'INVALID_HIERARCHY' THEN 1 END) as invalid_hierarchies,
        COUNT(CASE WHEN hierarchy_status = 'NO_SEMESTER_ASSIGNED' THEN 1 END) as no_semester_assigned,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                ROUND(
                    (COUNT(CASE WHEN hierarchy_status = 'VALID_HIERARCHY' THEN 1 END)::NUMERIC / 
                     COUNT(semester_id)::NUMERIC) * 100, 2
                )
            ELSE 100.00
        END as health_percentage
    FROM student_semester_hierarchy_status;
END;
$$ LANGUAGE plpgsql;

-- Test the constraints are working (this will be executed but should pass if data is clean)
DO $$
DECLARE
    health_record RECORD;
BEGIN
    -- Check current health status
    SELECT * INTO health_record FROM check_semester_hierarchy_health();
    
    RAISE NOTICE '=== SEMESTER HIERARCHY HEALTH CHECK ===';
    RAISE NOTICE 'Total students: %', health_record.total_students;
    RAISE NOTICE 'Students with semesters: %', health_record.students_with_semesters;
    RAISE NOTICE 'Valid hierarchies: %', health_record.valid_hierarchies;
    RAISE NOTICE 'Invalid hierarchies: %', health_record.invalid_hierarchies;
    RAISE NOTICE 'No semester assigned: %', health_record.no_semester_assigned;
    RAISE NOTICE 'Health percentage: %% (should be 100%% after data fix)', health_record.health_percentage;
    
    IF health_record.invalid_hierarchies > 0 THEN
        RAISE WARNING 'Found % invalid hierarchies. Run migration 048 first to fix data inconsistencies.', health_record.invalid_hierarchies;
    ELSE
        RAISE NOTICE 'All semester assignments follow proper hierarchy! ✓';
    END IF;
END $$;

-- Comments for documentation
COMMENT ON FUNCTION validate_student_semester_consistency() IS 
'Trigger function that validates student semester assignments follow organizational hierarchy (institution->department->program->semester)';

COMMENT ON FUNCTION validate_semester_hierarchy_consistency() IS 
'Trigger function that validates semester records maintain proper organizational hierarchy';

COMMENT ON FUNCTION check_semester_hierarchy_health() IS 
'Health check function that reports on the consistency of semester-program relationships across all students';

COMMENT ON VIEW student_semester_hierarchy_status IS 
'Monitoring view showing hierarchy compliance status for all students with semester assignments';

COMMENT ON CONSTRAINT check_active_semester ON students IS 
'Ensures students can only be assigned to active semesters';

-- Final success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== SEMESTER HIERARCHY CONSTRAINTS INSTALLED ===';
    RAISE NOTICE 'The following protections are now active:';
    RAISE NOTICE '1. Students can only be assigned to semesters in their program/department/institution';
    RAISE NOTICE '2. Students can only be assigned to active semesters';
    RAISE NOTICE '3. Semester records must maintain valid organizational hierarchy';
    RAISE NOTICE '4. Real-time monitoring available via student_semester_hierarchy_status view';
    RAISE NOTICE '5. Health checks available via check_semester_hierarchy_health() function';
    RAISE NOTICE '';
    RAISE NOTICE 'These constraints will prevent future data inconsistencies!';
END $$; 