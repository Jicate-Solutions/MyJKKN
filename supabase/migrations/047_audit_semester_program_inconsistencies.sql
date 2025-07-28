-- Migration: Audit semester-program data inconsistencies
-- Purpose: Identify students assigned to semesters that don't belong to their program
-- Date: 2024-01-XX

-- Create a temporary function to audit data inconsistencies
CREATE OR REPLACE FUNCTION audit_semester_program_inconsistencies()
RETURNS TABLE (
    student_id UUID,
    student_name TEXT,
    roll_number TEXT,
    student_program_id UUID,
    student_program_name TEXT,
    semester_id UUID,
    semester_name TEXT,
    semester_program_id UUID,
    semester_program_name TEXT,
    institution_name TEXT,
    inconsistency_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as student_id,
        s.student_name,
        s.roll_number,
        s.program_id as student_program_id,
        sp.program_name as student_program_name,
        s.semester_id,
        sem.semester_name,
        sem.program_id as semester_program_id,
        semp.program_name as semester_program_name,
        i.name as institution_name,
        CASE 
            WHEN s.program_id != sem.program_id THEN 'PROGRAM_MISMATCH'
            WHEN s.institution_id != sem.institution_id THEN 'INSTITUTION_MISMATCH'
            WHEN s.department_id != sem.department_id THEN 'DEPARTMENT_MISMATCH'
            ELSE 'OTHER'
        END as inconsistency_type
    FROM students s
    JOIN semesters sem ON s.semester_id = sem.id
    JOIN programs sp ON s.program_id = sp.id
    JOIN programs semp ON sem.program_id = semp.id
    JOIN institutions i ON s.institution_id = i.id
    WHERE s.semester_id IS NOT NULL
    AND (
        s.program_id != sem.program_id OR
        s.institution_id != sem.institution_id OR
        s.department_id != sem.department_id
    );
END;
$$ LANGUAGE plpgsql;

-- Create summary view for inconsistencies
CREATE OR REPLACE VIEW semester_program_inconsistency_summary AS
SELECT 
    inconsistency_type,
    COUNT(*) as total_students,
    COUNT(DISTINCT student_program_id) as affected_programs,
    COUNT(DISTINCT institution_name) as affected_institutions
FROM audit_semester_program_inconsistencies()
GROUP BY inconsistency_type
ORDER BY total_students DESC;

-- Execute audit and display results
DO $$
DECLARE
    total_students INTEGER;
    inconsistent_students INTEGER;
    consistency_percentage NUMERIC;
BEGIN
    -- Get total students with semester assignments
    SELECT COUNT(*) INTO total_students 
    FROM students 
    WHERE semester_id IS NOT NULL;
    
    -- Get inconsistent students count
    SELECT COUNT(*) INTO inconsistent_students 
    FROM audit_semester_program_inconsistencies();
    
    -- Calculate consistency percentage
    IF total_students > 0 THEN
        consistency_percentage := ((total_students - inconsistent_students)::NUMERIC / total_students::NUMERIC) * 100;
    ELSE
        consistency_percentage := 100;
    END IF;
    
    -- Output summary
    RAISE NOTICE '=== SEMESTER-PROGRAM CONSISTENCY AUDIT ===';
    RAISE NOTICE 'Total students with semester assignments: %', total_students;
    RAISE NOTICE 'Students with inconsistent data: %', inconsistent_students;
    RAISE NOTICE 'Data consistency percentage: %.2f%%', consistency_percentage;
    RAISE NOTICE '';
    
    IF inconsistent_students > 0 THEN
        RAISE NOTICE 'Found % inconsistent records. Run the following query to see details:', inconsistent_students;
        RAISE NOTICE 'SELECT * FROM audit_semester_program_inconsistencies() ORDER BY inconsistency_type, institution_name;';
        RAISE NOTICE '';
        RAISE NOTICE 'Summary by inconsistency type:';
        RAISE NOTICE 'SELECT * FROM semester_program_inconsistency_summary;';
    ELSE
        RAISE NOTICE 'No inconsistencies found! Data is clean.';
    END IF;
END $$;

-- Comment for future reference
COMMENT ON FUNCTION audit_semester_program_inconsistencies() IS 
'Identifies students assigned to semesters that dont belong to their program/department/institution. Used to audit data consistency before implementing proper hierarchy constraints.';

COMMENT ON VIEW semester_program_inconsistency_summary IS 
'Summary view showing types and counts of semester-program inconsistencies in the students table.'; 