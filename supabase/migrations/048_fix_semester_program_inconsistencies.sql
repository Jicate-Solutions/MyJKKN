-- Migration: Fix semester-program data inconsistencies
-- Purpose: Correct students assigned to semesters that don't belong to their program
-- Date: 2024-01-XX
-- WARNING: This migration modifies existing data. Always backup before running.

-- Create function to find the correct semester for a student
CREATE OR REPLACE FUNCTION find_correct_semester_for_student(
    p_student_id UUID,
    p_program_id UUID,
    p_current_semester_name TEXT
) RETURNS UUID AS $$
DECLARE
    correct_semester_id UUID;
    fallback_semester_id UUID;
BEGIN
    -- Try to find semester with same name in the correct program
    SELECT id INTO correct_semester_id
    FROM semesters 
    WHERE program_id = p_program_id 
    AND semester_name = p_current_semester_name
    AND is_active = true
    LIMIT 1;
    
    IF correct_semester_id IS NOT NULL THEN
        RETURN correct_semester_id;
    END IF;
    
    -- If no exact match, try to find a similar semester (case insensitive)
    SELECT id INTO correct_semester_id
    FROM semesters 
    WHERE program_id = p_program_id 
    AND LOWER(semester_name) = LOWER(p_current_semester_name)
    AND is_active = true
    LIMIT 1;
    
    IF correct_semester_id IS NOT NULL THEN
        RETURN correct_semester_id;
    END IF;
    
    -- If still no match, try to find any active semester in the program (fallback)
    SELECT id INTO fallback_semester_id
    FROM semesters 
    WHERE program_id = p_program_id 
    AND is_active = true
    ORDER BY semester_name
    LIMIT 1;
    
    RETURN fallback_semester_id; -- May be NULL if no semesters exist for program
END;
$$ LANGUAGE plpgsql;

-- Create backup table for tracking changes
CREATE TABLE IF NOT EXISTS semester_fix_backup (
    id SERIAL PRIMARY KEY,
    student_id UUID,
    student_name TEXT,
    roll_number TEXT,
    old_semester_id UUID,
    old_semester_name TEXT,
    new_semester_id UUID,
    new_semester_name TEXT,
    program_id UUID,
    program_name TEXT,
    institution_name TEXT,
    fix_type TEXT,
    fixed_at TIMESTAMP DEFAULT NOW()
);

-- Function to fix semester inconsistencies
CREATE OR REPLACE FUNCTION fix_semester_program_inconsistencies()
RETURNS TABLE (
    fixed_count INTEGER,
    failed_count INTEGER,
    summary_message TEXT
) AS $$
DECLARE
    student_record RECORD;
    correct_semester_id UUID;
    fixed_students INTEGER := 0;
    failed_students INTEGER := 0;
    total_inconsistent INTEGER;
BEGIN
    -- Get count of inconsistent students
    SELECT COUNT(*) INTO total_inconsistent
    FROM audit_semester_program_inconsistencies();
    
    RAISE NOTICE 'Starting fix for % inconsistent student records...', total_inconsistent;
    
    -- Process each inconsistent student
    FOR student_record IN 
        SELECT * FROM audit_semester_program_inconsistencies()
        ORDER BY institution_name, student_program_name, student_name
    LOOP
        -- Find correct semester
        SELECT find_correct_semester_for_student(
            student_record.student_id,
            student_record.student_program_id,
            student_record.semester_name
        ) INTO correct_semester_id;
        
        IF correct_semester_id IS NOT NULL THEN
            -- Backup original data
            INSERT INTO semester_fix_backup (
                student_id, student_name, roll_number,
                old_semester_id, old_semester_name,
                new_semester_id, new_semester_name,
                program_id, program_name, institution_name,
                fix_type
            )
            SELECT 
                student_record.student_id,
                student_record.student_name,
                student_record.roll_number,
                student_record.semester_id,
                student_record.semester_name,
                correct_semester_id,
                s.semester_name,
                student_record.student_program_id,
                student_record.student_program_name,
                student_record.institution_name,
                CASE 
                    WHEN s.semester_name = student_record.semester_name THEN 'EXACT_MATCH'
                    WHEN LOWER(s.semester_name) = LOWER(student_record.semester_name) THEN 'CASE_INSENSITIVE_MATCH'
                    ELSE 'FALLBACK_SEMESTER'
                END
            FROM semesters s 
            WHERE s.id = correct_semester_id;
            
            -- Update student record
            UPDATE students 
            SET 
                semester_id = correct_semester_id,
                updated_at = NOW()
            WHERE id = student_record.student_id;
            
            fixed_students := fixed_students + 1;
            
            RAISE NOTICE 'Fixed student %: % (%) - moved to correct semester',
                fixed_students, 
                student_record.student_name,
                student_record.roll_number;
                
        ELSE
            -- Log failed cases where no suitable semester found
            INSERT INTO semester_fix_backup (
                student_id, student_name, roll_number,
                old_semester_id, old_semester_name,
                program_id, program_name, institution_name,
                fix_type
            ) VALUES (
                student_record.student_id,
                student_record.student_name,
                student_record.roll_number,
                student_record.semester_id,
                student_record.semester_name,
                student_record.student_program_id,
                student_record.student_program_name,
                student_record.institution_name,
                'FAILED_NO_SUITABLE_SEMESTER'
            );
            
            failed_students := failed_students + 1;
            
            RAISE WARNING 'Could not fix student %: % (%) - no suitable semester found in program %',
                student_record.student_name,
                student_record.roll_number,
                student_record.student_program_name;
        END IF;
    END LOOP;
    
    -- Return results
    RETURN QUERY VALUES (
        fixed_students,
        failed_students,
        format('Fixed %s students, %s failed out of %s total inconsistent records', 
               fixed_students, failed_students, total_inconsistent)
    );
    
    RAISE NOTICE 'Fix completed: % students fixed, % failed', fixed_students, failed_students;
END;
$$ LANGUAGE plpgsql;

-- Dry run function to preview changes without making them
CREATE OR REPLACE FUNCTION preview_semester_fixes()
RETURNS TABLE (
    student_name TEXT,
    roll_number TEXT,
    institution_name TEXT,
    program_name TEXT,
    current_semester TEXT,
    proposed_semester TEXT,
    fix_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        inc.student_name,
        inc.roll_number,
        inc.institution_name,
        inc.student_program_name as program_name,
        inc.semester_name as current_semester,
        COALESCE(correct_sem.semester_name, 'NO_SUITABLE_SEMESTER') as proposed_semester,
        CASE 
            WHEN correct_sem.id IS NULL THEN 'FAILED_NO_SUITABLE_SEMESTER'
            WHEN correct_sem.semester_name = inc.semester_name THEN 'EXACT_MATCH'
            WHEN LOWER(correct_sem.semester_name) = LOWER(inc.semester_name) THEN 'CASE_INSENSITIVE_MATCH'
            ELSE 'FALLBACK_SEMESTER'
        END as fix_type
    FROM audit_semester_program_inconsistencies() inc
    LEFT JOIN semesters correct_sem ON correct_sem.id = find_correct_semester_for_student(
        inc.student_id,
        inc.student_program_id,
        inc.semester_name
    )
    ORDER BY inc.institution_name, inc.student_program_name, inc.student_name;
END;
$$ LANGUAGE plpgsql;

-- Execute preview by default (safe)
DO $$
DECLARE
    preview_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO preview_count FROM preview_semester_fixes();
    
    RAISE NOTICE '=== SEMESTER FIX PREVIEW ===';
    RAISE NOTICE 'Found % records that would be modified', preview_count;
    RAISE NOTICE '';
    RAISE NOTICE 'To see the preview: SELECT * FROM preview_semester_fixes();';
    RAISE NOTICE 'To execute the fix: SELECT * FROM fix_semester_program_inconsistencies();';
    RAISE NOTICE '';
    RAISE NOTICE 'WARNING: The fix function will modify data. Always backup first!';
END $$;

-- Comments for documentation
COMMENT ON FUNCTION find_correct_semester_for_student(UUID, UUID, TEXT) IS 
'Finds the correct semester for a student based on their program and current semester name. Used to fix hierarchy inconsistencies.';

COMMENT ON FUNCTION fix_semester_program_inconsistencies() IS 
'Fixes semester-program inconsistencies by moving students to correct semesters within their programs. Creates backup records.';

COMMENT ON FUNCTION preview_semester_fixes() IS 
'Preview function to see what changes would be made without executing them. Safe to run for analysis.';

COMMENT ON TABLE semester_fix_backup IS 
'Backup table tracking all semester fixes applied to students. Used for audit trail and potential rollback.'; 