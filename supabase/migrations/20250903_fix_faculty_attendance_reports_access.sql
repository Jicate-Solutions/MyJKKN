-- Fix get_attendance_report_list function to properly handle faculty role users
-- Issue: Faculty users get 400 Bad Request error while super admins work fine
-- Root cause: Complex staff filtering and potential null user_staff_id issues

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
    user_email TEXT;
    offset_value INTEGER;
    total_records INTEGER;
    sort_column TEXT;
    sort_direction TEXT;
BEGIN
    -- Get current user info from auth.users and profiles
    SELECT p.role, p.institution_id, au.email 
    INTO user_role, user_institution_id, user_email
    FROM profiles p
    JOIN auth.users au ON p.id = au.id
    WHERE p.id = auth.uid();

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

    -- Get total count first
    WITH filtered_attendance AS (
        SELECT sa.id
        FROM student_attendance sa
        JOIN institutions i ON sa.institution_id = i.id
        JOIN sections sec ON sa.section_id = sec.id
        LEFT JOIN semesters s ON sec.semester_id = s.id
        LEFT JOIN programs pr ON sec.program_id = pr.id
        LEFT JOIN departments d ON sec.department_id = d.id
        LEFT JOIN degrees deg ON sec.degree_id = deg.id
        CROSS JOIN LATERAL (
            SELECT 
                key as period_id,
                COALESCE((value->>'course_name')::TEXT, '') as course_name,
                -- Safe UUID casting for course_id
                CASE 
                    WHEN (value->>'course_id') IS NOT NULL AND (value->>'course_id') != '' 
                    THEN (value->>'course_id')::UUID 
                    ELSE NULL 
                END as course_id
            FROM jsonb_each(sa.attendance_data)
        ) period_data
        WHERE 1=1
        -- SIMPLIFIED: Role-based filtering without complex staff plan queries
        AND (
            user_role IN ('super_admin', 'administrator') 
            OR (user_role = 'faculty' AND sa.institution_id = user_institution_id)
            OR sa.institution_id = user_institution_id
        )
        -- Apply parameter filters
        AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id)
        AND (p_department_id IS NULL OR d.id = p_department_id)
        AND (p_program_id IS NULL OR pr.id = p_program_id)
        AND (p_semester_id IS NULL OR s.id = p_semester_id)
        AND (p_section_id IS NULL OR sec.id = p_section_id)
        AND (p_start_date IS NULL OR sa.attendance_date >= p_start_date)
        AND (p_end_date IS NULL OR sa.attendance_date <= p_end_date)
        AND (p_academic_year_id IS NULL OR EXISTS (
            SELECT 1 FROM academic_years ay 
            WHERE ay.id = p_academic_year_id 
            AND sa.attendance_date BETWEEN ay.start_date AND ay.end_date
        ))
    )
    SELECT COUNT(*) INTO total_records FROM filtered_attendance;

    -- Return paginated results
    RETURN QUERY
    WITH main_results AS (
        SELECT 
            sa.id::TEXT as id,
            sa.attendance_date,
            i.name::TEXT as institution_name,
            COALESCE(d.department_name::TEXT, '') as department_name,
            COALESCE(pr.program_name::TEXT, '') as program_name,
            COALESCE(s.semester_name::TEXT, '') as semester_name,
            COALESCE(sec.section_name::TEXT, '') as section_name,
            COALESCE(period_data.course_name::TEXT, '') as course_name,
            COALESCE(c.course_code::TEXT, '') as course_code,
            COALESCE(period_data.period_name::TEXT, '') as period_name,
            COALESCE(period_data.start_time::TEXT, '') as start_time,
            COALESCE(period_data.end_time::TEXT, '') as end_time,
            COALESCE(period_data.faculty_name::TEXT, 'Unknown Faculty') as faculty_name,
            period_data.total_students::INTEGER,
            period_data.present_count::INTEGER,
            period_data.absent_count::INTEGER,
            CASE 
                WHEN period_data.total_students > 0 
                THEN ROUND((period_data.present_count::DECIMAL / period_data.total_students * 100), 2)
                ELSE 0 
            END as attendance_percentage,
            COALESCE(p.full_name, 'System')::TEXT as marked_by,
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
                COALESCE((value->>'course_name')::TEXT, '') as course_name,
                COALESCE((value->>'period_name')::TEXT, '') as period_name,
                COALESCE((value->>'start_time')::TEXT, '') as start_time,
                COALESCE((value->>'end_time')::TEXT, '') as end_time,
                -- Safe UUID casting
                CASE 
                    WHEN (value->>'course_id') IS NOT NULL AND (value->>'course_id') != '' 
                    THEN (value->>'course_id')::UUID 
                    ELSE NULL 
                END as course_id,
                COALESCE((value->>'faculty_name')::TEXT, 'Unknown Faculty') as faculty_name,
                COALESCE(jsonb_array_length(value->'students'), 0)::INTEGER as total_students,
                (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(value->'students') elem 
                 WHERE elem->>'status' = 'Present') as present_count,
                (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(value->'students') elem 
                 WHERE elem->>'status' = 'Absent') as absent_count
            FROM jsonb_each(sa.attendance_data)
        ) period_data
        LEFT JOIN courses c ON period_data.course_id = c.id
        WHERE 1=1
        -- Simplified role-based filtering
        AND (
            user_role IN ('super_admin', 'administrator') 
            OR (user_role = 'faculty' AND sa.institution_id = user_institution_id)
            OR sa.institution_id = user_institution_id
        )
        -- Apply parameter filters
        AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id)
        AND (p_department_id IS NULL OR d.id = p_department_id)
        AND (p_program_id IS NULL OR pr.id = p_program_id)
        AND (p_semester_id IS NULL OR s.id = p_semester_id)
        AND (p_section_id IS NULL OR sec.id = p_section_id)
        AND (p_start_date IS NULL OR sa.attendance_date >= p_start_date)
        AND (p_end_date IS NULL OR sa.attendance_date <= p_end_date)
        AND (p_academic_year_id IS NULL OR EXISTS (
            SELECT 1 FROM academic_years ay 
            WHERE ay.id = p_academic_year_id 
            AND sa.attendance_date BETWEEN ay.start_date AND ay.end_date
        ))
        ORDER BY 
            CASE 
                WHEN sort_column = 'attendance_date' AND sort_direction = 'ASC' THEN sa.attendance_date
                ELSE NULL
            END ASC,
            CASE 
                WHEN sort_column = 'attendance_date' AND sort_direction = 'DESC' THEN sa.attendance_date
                ELSE NULL
            END DESC,
            CASE 
                WHEN sort_column = 'course_name' AND sort_direction = 'ASC' THEN period_data.course_name
                ELSE NULL
            END ASC,
            CASE 
                WHEN sort_column = 'course_name' AND sort_direction = 'DESC' THEN period_data.course_name
                ELSE NULL
            END DESC,
            CASE 
                WHEN sort_column = 'faculty_name' AND sort_direction = 'ASC' THEN period_data.faculty_name
                ELSE NULL
            END ASC,
            CASE 
                WHEN sort_column = 'faculty_name' AND sort_direction = 'DESC' THEN period_data.faculty_name
                ELSE NULL
            END DESC,
            CASE 
                WHEN sort_column = 'attendance_percentage' AND sort_direction = 'ASC' AND period_data.total_students > 0 
                THEN (period_data.present_count::DECIMAL / period_data.total_students * 100)
                ELSE NULL
            END ASC,
            CASE 
                WHEN sort_column = 'attendance_percentage' AND sort_direction = 'DESC' AND period_data.total_students > 0 
                THEN (period_data.present_count::DECIMAL / period_data.total_students * 100)
                ELSE NULL
            END DESC,
            sa.attendance_date DESC -- Fallback default sort
        LIMIT p_limit OFFSET offset_value
    )
    SELECT 
        main_results.*,
        total_records::INTEGER as total_count
    FROM main_results;

END;
$$;