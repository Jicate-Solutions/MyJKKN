-- Fix ambiguous column reference for faculty role users in get_attendance_report_list
-- The issue occurs because "id" is not qualified with table alias in the staff JOINs

-- Drop the existing function first
DROP FUNCTION IF EXISTS get_attendance_report_list CASCADE;

-- Recreate the function with proper column qualifications
CREATE OR REPLACE FUNCTION get_attendance_report_list(
    p_institution_id UUID DEFAULT NULL,
    p_degree_id UUID DEFAULT NULL,
    p_department_id UUID DEFAULT NULL,
    p_program_id UUID DEFAULT NULL,
    p_semester_id UUID DEFAULT NULL,
    p_section_id UUID DEFAULT NULL,
    p_academic_year_id UUID DEFAULT NULL,
    p_staff_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_page INTEGER DEFAULT 1,
    p_limit INTEGER DEFAULT 10,
    p_sort_by TEXT DEFAULT 'attendance_date',
    p_sort_order TEXT DEFAULT 'desc'
)
RETURNS TABLE(
    id TEXT,
    attendance_date DATE,
    institution_name TEXT,
    department_name TEXT,
    program_name TEXT,
    semester_name TEXT,
    section_name TEXT,
    course_name TEXT,
    course_code TEXT,
    period_name TEXT,
    start_time TEXT,
    end_time TEXT,
    faculty_name TEXT,
    total_students INTEGER,
    present_count INTEGER,
    absent_count INTEGER,
    attendance_percentage NUMERIC,
    marked_by TEXT,
    marked_at TIMESTAMPTZ,
    total_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    user_role TEXT;
    user_institution_id UUID;
    user_staff_id UUID;
    offset_value INTEGER;
    total_records INTEGER;
    sort_column TEXT;
    sort_direction TEXT;
    base_query TEXT;
    count_query TEXT;
    final_query TEXT;
BEGIN
    -- Get current user info from auth.users and profiles
    SELECT p.role, p.institution_id INTO user_role, user_institution_id
    FROM profiles p
    WHERE p.id = auth.uid();

    -- Get staff_id if user is faculty
    IF user_role = 'faculty' THEN
        SELECT st.id INTO user_staff_id
        FROM staff st
        WHERE st.email = (SELECT au.email FROM auth.users au WHERE au.id = auth.uid())
        OR st.institution_email = (SELECT au.email FROM auth.users au WHERE au.id = auth.uid());
    END IF;

    -- Validate sort parameters
    sort_column := CASE 
        WHEN p_sort_by IN ('attendance_date', 'course_name', 'faculty_name', 'attendance_percentage') 
        THEN p_sort_by 
        ELSE 'attendance_date' 
    END;
    
    sort_direction := CASE 
        WHEN LOWER(p_sort_order) IN ('asc', 'desc') 
        THEN UPPER(p_sort_order) 
        ELSE 'DESC' 
    END;

    -- Calculate offset
    offset_value := (p_page - 1) * p_limit;

    -- Simplified base query without complex staff JOINs - all columns properly qualified
    base_query := '
        SELECT DISTINCT
            sa.id::TEXT as id,
            sa.attendance_date,
            i.name::TEXT as institution_name,
            COALESCE(d.department_name::TEXT, '''') as department_name,
            COALESCE(pr.program_name::TEXT, '''') as program_name,
            COALESCE(s.semester_name::TEXT, '''') as semester_name,
            COALESCE(sec.section_name::TEXT, '''') as section_name,
            COALESCE(period_data.course_name::TEXT, '''') as course_name,
            COALESCE(c.course_code::TEXT, '''') as course_code,
            COALESCE(period_data.period_name::TEXT, '''') as period_name,
            COALESCE(period_data.start_time::TEXT, '''') as start_time,
            COALESCE(period_data.end_time::TEXT, '''') as end_time,
            COALESCE(period_data.faculty_name::TEXT, ''Unknown Faculty'') as faculty_name,
            period_data.total_students::INTEGER,
            period_data.present_count::INTEGER,
            period_data.absent_count::INTEGER,
            CASE 
                WHEN period_data.total_students > 0 
                THEN ROUND((period_data.present_count::DECIMAL / period_data.total_students * 100), 2)
                ELSE 0 
            END as attendance_percentage,
            COALESCE(p.full_name, ''System'')::TEXT as marked_by,
            sa.created_at as marked_at
        FROM student_attendance sa
        JOIN institutions i ON sa.institution_id = i.id
        JOIN sections sec ON sa.section_id = sec.id
        LEFT JOIN semesters s ON sec.semester_id = s.id
        LEFT JOIN programs pr ON sec.program_id = pr.id
        LEFT JOIN departments d ON sec.department_id = d.id
        LEFT JOIN degrees deg ON sec.degree_id = deg.id
        LEFT JOIN profiles p ON sa.marked_by = p.id
        CROSS JOIN LATERAL (
            SELECT 
                key as period_id,
                COALESCE((value->>''course_name'')::TEXT, '''') as course_name,
                COALESCE((value->>''period_name'')::TEXT, '''') as period_name,
                COALESCE((value->>''start_time'')::TEXT, '''') as start_time,
                COALESCE((value->>''end_time'')::TEXT, '''') as end_time,
                (value->>''course_id'')::UUID as course_id,
                COALESCE((value->>''faculty_name'')::TEXT, 
                    (SELECT COALESCE(st.first_name || '' '' || st.last_name, ''Unknown'')
                     FROM staff_plan_courses spc
                     JOIN staff_plans sp ON spc.staff_plan_id = sp.id
                     JOIN staff st ON spc.staff_id = st.id
                     WHERE spc.course_id = (value->>''course_id'')::UUID
                     LIMIT 1)
                ) as faculty_name,
                COALESCE(jsonb_array_length(value->''students''), 0)::INTEGER as total_students,
                (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(value->''students'') elem 
                 WHERE elem->>''status'' = ''Present'') as present_count,
                (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(value->''students'') elem 
                 WHERE elem->>''status'' = ''Absent'') as absent_count
            FROM jsonb_each(sa.attendance_data)
        ) period_data
        LEFT JOIN courses c ON period_data.course_id = c.id
        WHERE 1=1';

    -- Apply role-based filtering with properly qualified columns
    IF user_role = 'faculty' THEN
        base_query := base_query || ' AND sa.institution_id = ' || quote_literal(user_institution_id);
        IF user_staff_id IS NOT NULL THEN
            base_query := base_query || ' AND EXISTS (
                SELECT 1 FROM staff_plan_courses spc2 
                JOIN staff_plans sp2 ON spc2.staff_plan_id = sp2.id 
                WHERE spc2.staff_id = ' || quote_literal(user_staff_id) || 
                ' AND spc2.course_id = period_data.course_id
            )';
        END IF;
    ELSIF user_role NOT IN ('super_admin', 'administrator') THEN
        -- Regular users can only see their institution's data
        base_query := base_query || ' AND sa.institution_id = ' || quote_literal(user_institution_id);
    END IF;

    -- Apply filters with properly qualified columns
    IF p_institution_id IS NOT NULL THEN
        base_query := base_query || ' AND sa.institution_id = ' || quote_literal(p_institution_id);
    END IF;

    IF p_department_id IS NOT NULL THEN
        base_query := base_query || ' AND d.id = ' || quote_literal(p_department_id);
    END IF;

    IF p_program_id IS NOT NULL THEN
        base_query := base_query || ' AND pr.id = ' || quote_literal(p_program_id);
    END IF;

    IF p_semester_id IS NOT NULL THEN
        base_query := base_query || ' AND s.id = ' || quote_literal(p_semester_id);
    END IF;

    IF p_section_id IS NOT NULL THEN
        base_query := base_query || ' AND sec.id = ' || quote_literal(p_section_id);
    END IF;

    IF p_academic_year_id IS NOT NULL THEN
        base_query := base_query || ' AND EXISTS (
            SELECT 1 FROM academic_years ay 
            WHERE ay.id = ' || quote_literal(p_academic_year_id) || 
            ' AND sa.attendance_date BETWEEN ay.start_date AND ay.end_date
        )';
    END IF;

    IF p_staff_id IS NOT NULL THEN
        base_query := base_query || ' AND EXISTS (
            SELECT 1 FROM staff_plan_courses spc3 
            JOIN staff_plans sp3 ON spc3.staff_plan_id = sp3.id 
            WHERE spc3.staff_id = ' || quote_literal(p_staff_id) || 
            ' AND spc3.course_id = period_data.course_id
        )';
    END IF;

    IF p_start_date IS NOT NULL THEN
        base_query := base_query || ' AND sa.attendance_date >= ' || quote_literal(p_start_date);
    END IF;

    IF p_end_date IS NOT NULL THEN
        base_query := base_query || ' AND sa.attendance_date <= ' || quote_literal(p_end_date);
    END IF;

    -- Get total count
    count_query := 'SELECT COUNT(*) FROM (' || base_query || ') subquery';
    EXECUTE count_query INTO total_records;

    -- Build final query with sorting and pagination
    final_query := 'SELECT *, ' || total_records || '::INTEGER as total_count FROM (' || 
                   base_query || 
                   ' ORDER BY ' || sort_column || ' ' || sort_direction ||
                   ' LIMIT ' || p_limit || ' OFFSET ' || offset_value || 
                   ') AS final_result';

    -- Execute the final query and return results with total count
    RETURN QUERY EXECUTE final_query;

END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION get_attendance_report_list IS 
'Retrieves paginated attendance reports with filters. Fixed ambiguous column references for faculty role users.';