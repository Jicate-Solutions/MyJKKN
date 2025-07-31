-- Manual Staff Plan Consolidation Migration
-- This migration handles the consolidation of duplicate staff plans step by step

-- Step 1: Create a function to consolidate staff plans safely
CREATE OR REPLACE FUNCTION consolidate_duplicate_staff_plans()
RETURNS TABLE (
    consolidated_plans INTEGER,
    total_courses_moved INTEGER,
    duplicate_plans_removed INTEGER
) AS $$
DECLARE
    plan_record RECORD;
    courses_moved INTEGER := 0;
    plans_removed INTEGER := 0;
    plans_consolidated INTEGER := 0;
BEGIN
    -- Loop through each group of duplicate plans
    FOR plan_record IN 
        SELECT 
            institution_id, program_id, semester_id, academic_year_id,
            array_agg(id ORDER BY created_at) as plan_ids,
            COUNT(*) as plan_count
        FROM staff_plans
        GROUP BY institution_id, program_id, semester_id, academic_year_id
        HAVING COUNT(*) > 1
    LOOP
        -- Update primary plan with latest information
        UPDATE staff_plans 
        SET 
            end_date = (
                SELECT MAX(end_date) 
                FROM staff_plans 
                WHERE id = ANY(plan_record.plan_ids)
            ),
            is_active = (
                SELECT bool_or(is_active) 
                FROM staff_plans 
                WHERE id = ANY(plan_record.plan_ids)
            ),
            updated_at = NOW()
        WHERE id = plan_record.plan_ids[1];
        
        -- Move unique course assignments to primary plan
        -- Delete conflicting assignments from duplicate plans first
        DELETE FROM staff_plan_courses spc_dup
        WHERE spc_dup.staff_plan_id = ANY(plan_record.plan_ids[2:])
          AND EXISTS (
            SELECT 1 FROM staff_plan_courses spc_primary
            WHERE spc_primary.staff_plan_id = plan_record.plan_ids[1]
              AND spc_primary.staff_id = spc_dup.staff_id
              AND spc_primary.course_id = spc_dup.course_id
          );
        
        -- Move remaining assignments
        UPDATE staff_plan_courses 
        SET staff_plan_id = plan_record.plan_ids[1],
            updated_at = NOW()
        WHERE staff_plan_id = ANY(plan_record.plan_ids[2:]);
        
        GET DIAGNOSTICS courses_moved = courses_moved + ROW_COUNT;
        
        -- Delete duplicate plans
        DELETE FROM staff_plans 
        WHERE id = ANY(plan_record.plan_ids[2:]);
        
        GET DIAGNOSTICS plans_removed = plans_removed + ROW_COUNT;
        plans_consolidated := plans_consolidated + 1;
        
        -- Log progress
        RAISE NOTICE 'Consolidated plan group %: % duplicate plans removed', 
            plans_consolidated, array_length(plan_record.plan_ids, 1) - 1;
    END LOOP;
    
    RETURN QUERY SELECT plans_consolidated, courses_moved, plans_removed;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Run the consolidation
SELECT * FROM consolidate_duplicate_staff_plans();

-- Step 3: Add the unique constraint
ALTER TABLE staff_plans 
ADD CONSTRAINT unique_staff_plan_per_semester 
UNIQUE (institution_id, program_id, semester_id, academic_year_id);

-- Step 4: Add performance indexes
CREATE INDEX IF NOT EXISTS idx_staff_plans_unique_combo 
ON staff_plans(institution_id, program_id, semester_id, academic_year_id);

CREATE INDEX IF NOT EXISTS idx_staff_plan_courses_consolidated 
ON staff_plan_courses(staff_plan_id, course_id, staff_id);

-- Step 5: Add helpful comments
COMMENT ON CONSTRAINT unique_staff_plan_per_semester ON staff_plans IS 
'Ensures only one staff plan exists per semester hierarchy to prevent data fragmentation';

COMMENT ON TABLE staff_plans IS 
'Consolidated staff plans - one record per institution/program/semester/academic_year combination';

-- Step 6: Clean up the function
DROP FUNCTION consolidate_duplicate_staff_plans();

-- Step 7: Verify results
SELECT 
    'Consolidation Complete' as status,
    COUNT(*) as total_staff_plans,
    COUNT(DISTINCT (institution_id, program_id, semester_id, academic_year_id)) as unique_combinations
FROM staff_plans;