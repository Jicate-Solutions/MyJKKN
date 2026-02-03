-- Fix faculty information retrieval in get_attendance_record_details function
-- Use faculty_name and faculty_email directly from attendance_data instead of complex lookups

DROP FUNCTION IF EXISTS get_attendance_record_details CASCADE;

CREATE OR REPLACE FUNCTION get_attendance_record_details(
    p_attendance_id TEXT,
    p_period_id UUID DEFAULT NULL
)
RETURNS TABLE(
    id TEXT,
    attendance_date DATE,
    institution_name TEXT,
    department_name TEXT,
    program_name TEXT,
    semester_name TEXT,
    section_name TEXT,
    section_code TEXT,
    course_name TEXT,
    course_code TEXT,
    period_name TEXT,
    start_time TEXT,
    end_time TEXT,
    faculty_name TEXT,
    faculty_email TEXT,
    total_students INTEGER,
    present_count INTEGER,
    absent_count INTEGER,
    attendance_percentage NUMERIC,
    marked_by TEXT,
    marked_at TIMESTAMPTZ,
    students_data JSONB,
    period_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    user_role TEXT;
    user_institution_id UUID;
    user_staff_id UUID;
    attendance_record RECORD;
    final_students_data JSONB DEFAULT '[]'::jsonb;
    final_period_data JSONB DEFAULT '{}'::jsonb;
BEGIN
    -- Get current user info
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

    -- Get the main attendance record with detailed information
    SELECT 
        sa.id::TEXT,
        sa.attendance_date,
        i.name::TEXT as institution_name,
        COALESCE(d.department_name::TEXT, '') as department_name,
        COALESCE(pr.program_name::TEXT, '') as program_name,
        COALESCE(s.semester_name::TEXT, '') as semester_name,
        COALESCE(sec.section_name::TEXT, '') as section_name,
        COALESCE(sec.section_name::TEXT, '') as section_code,  -- Use section_name as code
        COALESCE(p.full_name::TEXT, 'System') as marked_by,
        sa.created_at as marked_at,
        sa.attendance_data
    INTO attendance_record
    FROM student_attendance sa
    JOIN institutions i ON sa.institution_id = i.id
    JOIN sections sec ON sa.section_id = sec.id
    LEFT JOIN semesters s ON sec.semester_id = s.id
    LEFT JOIN programs pr ON sec.program_id = pr.id
    LEFT JOIN departments d ON sec.department_id = d.id
    LEFT JOIN profiles p ON sa.marked_by = p.id
    WHERE sa.id::TEXT = p_attendance_id;

    -- Check if record exists
    IF attendance_record.id IS NULL THEN
        RAISE EXCEPTION 'Attendance record not found';
    END IF;

    -- Apply role-based access control
    IF user_role = 'faculty' THEN
        -- Check if faculty has access to this record
        IF NOT EXISTS (
            SELECT 1 FROM student_attendance sa
            JOIN institutions i ON sa.institution_id = i.id
            WHERE sa.id::TEXT = p_attendance_id 
            AND sa.institution_id = user_institution_id
        ) THEN
            RAISE EXCEPTION 'Access denied: You can only view attendance records from your institution';
        END IF;
    ELSIF user_role NOT IN ('super_admin', 'administrator') THEN
        -- Regular users can only see their institution's data
        IF NOT EXISTS (
            SELECT 1 FROM student_attendance sa
            WHERE sa.id::TEXT = p_attendance_id 
            AND sa.institution_id = user_institution_id
        ) THEN
            RAISE EXCEPTION 'Access denied: You can only view attendance records from your institution';
        END IF;
    END IF;

    -- Return detailed data for each period or specific period
    RETURN QUERY
    SELECT 
        attendance_record.id::TEXT,
        attendance_record.attendance_date,
        attendance_record.institution_name::TEXT,
        attendance_record.department_name::TEXT,
        attendance_record.program_name::TEXT,
        attendance_record.semester_name::TEXT,
        attendance_record.section_name::TEXT,
        attendance_record.section_code::TEXT,
        period_info.course_name::TEXT,
        COALESCE(c.course_code::TEXT, 'N/A'),
        period_info.period_name::TEXT,
        period_info.start_time::TEXT,
        period_info.end_time::TEXT,
        -- Use faculty_name directly from attendance_data, with fallback to marked_by profile
        COALESCE(
            period_info.faculty_name::TEXT,
            attendance_record.marked_by::TEXT,
            'Unknown Faculty'::TEXT
        ),
        -- Use faculty_email directly from attendance_data, with fallback to marked_by profile email
        COALESCE(
            period_info.faculty_email::TEXT,
            (SELECT au.email FROM auth.users au WHERE au.id = (attendance_record.marked_by)::uuid),
            'N/A'::TEXT
        ),
        period_info.total_students,
        period_info.present_count,
        period_info.absent_count,
        CASE 
            WHEN period_info.total_students > 0 
            THEN ROUND((period_info.present_count::DECIMAL / period_info.total_students * 100), 2)
            ELSE 0 
        END,
        attendance_record.marked_by::TEXT,
        attendance_record.marked_at,
        -- Enhanced students data - Use student's first_name from students table
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'student_id', (student_info->>'student_id')::TEXT,
                    'student_name', COALESCE(
                        NULLIF(TRIM(COALESCE(stud.first_name, '') || ' ' || COALESCE(stud.last_name, '')), ''),
                        prof.full_name::TEXT,
                        'Unknown Student'
                    ),
                    'student_email', COALESCE(
                        stud.student_email::TEXT,
                        stud.college_email::TEXT,
                        usr.email::TEXT,
                        'N/A'
                    ),
                    'roll_number', COALESCE(stud.roll_number::TEXT, 'N/A'),
                    'status', (student_info->>'status')::TEXT,
                    'marked_at', (student_info->>'marked_at')::TEXT
                )
                ORDER BY COALESCE(stud.first_name, prof.full_name, 'ZZZ')
            )
            FROM jsonb_array_elements(period_info.students) as student_info
            LEFT JOIN students stud ON (student_info->>'student_id')::uuid = stud.id
            LEFT JOIN profiles prof ON (student_info->>'student_id')::uuid = prof.id
            LEFT JOIN auth.users usr ON (student_info->>'student_id')::uuid = usr.id
        ),
        -- Period metadata
        jsonb_build_object(
            'course_id', period_info.course_id::TEXT,
            'period_id', period_info.period_id::TEXT,
            'timetable_info', jsonb_build_object(
                'day', 'Unknown',
                'timing', period_info.start_time || ' - ' || period_info.end_time
            )
        )
    FROM (
        SELECT 
            key::uuid as period_id,
            COALESCE((value->>'course_name')::TEXT, 'Unknown Course') as course_name,
            COALESCE((value->>'period_name')::TEXT, 'Unknown Period') as period_name,
            COALESCE((value->>'start_time')::TEXT, '00:00') as start_time,
            COALESCE((value->>'end_time')::TEXT, '00:00') as end_time,
            (value->>'course_id')::UUID as course_id,
            -- Get faculty information directly from attendance_data
            COALESCE((value->>'faculty_name')::TEXT, NULL) as faculty_name,
            COALESCE((value->>'faculty_email')::TEXT, NULL) as faculty_email,
            value->'students' as students,
            COALESCE(jsonb_array_length(value->'students'), 0) as total_students,
            (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(value->'students') elem 
             WHERE elem->>'status' = 'Present') as present_count,
            (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(value->'students') elem 
             WHERE elem->>'status' = 'Absent') as absent_count
        FROM jsonb_each(attendance_record.attendance_data)
        WHERE p_period_id IS NULL OR key::uuid = p_period_id
    ) period_info
    LEFT JOIN courses c ON period_info.course_id = c.id;

END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION get_attendance_record_details IS 
'Retrieves detailed attendance information for a specific attendance record. Fixed to use faculty_name and faculty_email directly from attendance_data.';
