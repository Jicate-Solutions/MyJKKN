-- Fix duplicate records in get_attendance_report_list function
-- The issue was with the staff JOIN creating duplicate rows when multiple staff are assigned to the same course

-- Drop the existing function first
DROP FUNCTION IF EXISTS get_attendance_report_list CASCADE;

-- Recreate the function with the fix
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
        SELECT s.id INTO user_staff_id
        FROM staff s
        WHERE s.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        OR s.institution_email = (SELECT email FROM auth.users WHERE id = auth.uid());
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

    -- Base query with joins to get all required information
    base_query := '
        SELECT DISTINCT
            sa.id::TEXT as id,
            sa.attendance_date,
            i.name::TEXT as institution_name,
            d.department_name::TEXT,
            pr.program_name::TEXT,
            s.semester_name::TEXT,
            sec.section_name::TEXT,
            period_data.course_name::TEXT,
            c.course_code::TEXT,
            period_data.period_name::TEXT,
            period_data.start_time::TEXT,
            period_data.end_time::TEXT,
            COALESCE(st.first_name || '' '' || st.last_name, ''Unknown Faculty'')::TEXT as faculty_name,
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
                COALESCE(jsonb_array_length(value->''students''), 0)::INTEGER as total_students,
                (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(value->''students'') elem 
                 WHERE elem->>''status'' = ''Present'') as present_count,
                (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(value->''students'') elem 
                 WHERE elem->>''status'' = ''Absent'') as absent_count
            FROM jsonb_each(sa.attendance_data)
        ) period_data
        LEFT JOIN courses c ON period_data.course_id = c.id
        LEFT JOIN LATERAL (
            SELECT DISTINCT ON (spc.course_id)
                st.id as staff_id,
                st.first_name,
                st.last_name
            FROM staff_plan_courses spc
            JOIN staff_plans sp ON spc.staff_plan_id = sp.id
            JOIN staff st ON spc.staff_id = st.id
            WHERE spc.course_id = c.id
            AND sp.semester_id = sec.semester_id
            ORDER BY spc.course_id, sp.created_at DESC
            LIMIT 1
        ) st ON TRUE
        WHERE 1=1';

    -- Apply role-based filtering
    IF user_role = 'faculty' THEN
        base_query := base_query || ' AND sa.institution_id = ' || quote_literal(user_institution_id);
        IF user_staff_id IS NOT NULL THEN
            base_query := base_query || ' AND EXISTS (
                SELECT 1 FROM staff_plan_courses spc 
                JOIN staff_plans sp ON spc.staff_plan_id = sp.id 
                WHERE spc.staff_id = ' || quote_literal(user_staff_id) || 
                ' AND spc.course_id = period_data.course_id
            )';
        END IF;
    ELSIF user_role NOT IN ('super_admin', 'administrator') THEN
        -- Regular users can only see their institution's data
        base_query := base_query || ' AND sa.institution_id = ' || quote_literal(user_institution_id);
    END IF;

    -- Apply filters
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
        base_query := base_query || ' AND st.staff_id = ' || quote_literal(p_staff_id);
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