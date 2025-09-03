-- Fix the get_attendance_record_details function to properly retrieve student details
-- This will replace the students_data with proper student information including names, emails, and roll numbers

CREATE OR REPLACE FUNCTION public.get_attendance_record_details(
    p_attendance_id text, 
    p_period_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
    id text, 
    attendance_date date, 
    institution_name text, 
    department_name text, 
    program_name text, 
    semester_name text, 
    section_name text, 
    section_code text, 
    course_name text, 
    course_code text, 
    period_name text, 
    start_time text, 
    end_time text, 
    faculty_name text, 
    faculty_email text, 
    total_students integer, 
    present_count integer, 
    absent_count integer, 
    attendance_percentage numeric, 
    marked_by text, 
    marked_at timestamp with time zone, 
    students_data jsonb
)
LANGUAGE plpgsql
AS $function$
DECLARE
    attendance_record RECORD;
    period_data JSONB;
    student_data JSONB;
    enriched_students_data JSONB := '[]'::jsonb;
    present_count_val INTEGER := 0;
    total_count_val INTEGER := 0;
    faculty_info RECORD;
    course_uuid UUID;
    faculty_name_val TEXT;
    faculty_email_val TEXT;
    result_record RECORD;
    student_record RECORD;
    student_elem JSONB;
BEGIN
    -- Get the attendance record
    SELECT 
        sa.id,
        sa.attendance_date,
        sa.attendance_data,
        sa.marked_by,
        sa.created_at as marked_at,
        sa.institution_id,
        sa.section_id,
        i.name as institution_name,
        s.section_name,
        s.section_name as section_code
    INTO attendance_record
    FROM student_attendance sa
    JOIN institutions i ON sa.institution_id = i.id
    JOIN sections s ON sa.section_id = s.id
    WHERE sa.id::TEXT = p_attendance_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance record not found';
    END IF;

    -- Get period data from attendance_data JSONB
    IF p_period_id IS NOT NULL THEN
        period_data := attendance_record.attendance_data -> p_period_id::TEXT;
    ELSE
        -- Get the first period if no specific period ID provided
        SELECT value INTO period_data 
        FROM jsonb_each(attendance_record.attendance_data) 
        LIMIT 1;
    END IF;

    IF period_data IS NULL THEN
        RAISE EXCEPTION 'Period data not found in attendance record';
    END IF;

    -- Extract students data and enrich with student details
    student_data := period_data -> 'students';
    
    -- Loop through each student in the attendance data and enrich with details
    FOR student_elem IN SELECT * FROM jsonb_array_elements(student_data)
    LOOP
        -- Get student details from students table
        SELECT 
            st.id,
            COALESCE(st.first_name || ' ' || st.last_name, 'Unknown Student') as student_name,
            COALESCE(st.student_email, st.college_email, 'N/A') as student_email,
            COALESCE(st.roll_number, 'N/A') as roll_number
        INTO student_record
        FROM students st
        WHERE st.id::TEXT = student_elem->>'student_id';
        
        -- Create enriched student object
        IF FOUND THEN
            enriched_students_data := enriched_students_data || jsonb_build_object(
                'student_id', student_record.id,
                'student_name', student_record.student_name,
                'student_email', student_record.student_email,
                'roll_number', student_record.roll_number,
                'status', student_elem->>'status',
                'marked_at', student_elem->>'marked_at'
            );
        ELSE
            -- Fallback for students not found in students table
            enriched_students_data := enriched_students_data || jsonb_build_object(
                'student_id', student_elem->>'student_id',
                'student_name', 'Unknown Student',
                'student_email', 'N/A',
                'roll_number', 'N/A',
                'status', student_elem->>'status',
                'marked_at', student_elem->>'marked_at'
            );
        END IF;
    END LOOP;

    -- Count present/total from original data
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE (student->>'status') = 'Present') as present
    INTO total_count_val, present_count_val
    FROM jsonb_array_elements(student_data) as student;

    -- Try to get faculty information from attendance_data first, then fallback to profile lookup
    faculty_name_val := COALESCE(period_data->>'faculty_name', 'Unknown Faculty');
    faculty_email_val := COALESCE(period_data->>'faculty_email', 'N/A');

    -- If faculty info is not in attendance_data or is default, try to get from profiles
    IF faculty_name_val = 'Unknown Faculty' OR faculty_name_val IS NULL THEN
        SELECT 
            p.full_name,
            p.email
        INTO faculty_info
        FROM profiles p
        WHERE p.id = attendance_record.marked_by;
        
        IF FOUND THEN
            faculty_name_val := COALESCE(faculty_info.full_name, 'Unknown Faculty');
            faculty_email_val := COALESCE(faculty_info.email, 'N/A');
        END IF;
    END IF;

    -- Safely handle course_id conversion to UUID
    BEGIN
        course_uuid := NULL;
        IF period_data->>'course_id' IS NOT NULL AND period_data->>'course_id' != '' THEN
            course_uuid := (period_data->>'course_id')::UUID;
        END IF;
    EXCEPTION WHEN invalid_text_representation THEN
        course_uuid := NULL;
    END;

    -- Get additional details from related tables
    SELECT 
        d.department_name::TEXT,
        p.program_name::TEXT,
        sem.semester_name::TEXT,
        c.course_name::TEXT,
        c.course_code::TEXT
    INTO result_record
    FROM sections sec
    LEFT JOIN departments d ON sec.department_id = d.id
    LEFT JOIN programs p ON sec.program_id = p.id
    LEFT JOIN semesters sem ON sec.semester_id = sem.id
    LEFT JOIN courses c ON course_uuid = c.id
    WHERE sec.id = attendance_record.section_id;

    -- Return the result with enriched student data
    RETURN QUERY SELECT
        p_attendance_id,
        attendance_record.attendance_date,
        attendance_record.institution_name::TEXT,
        COALESCE(result_record.department_name, 'N/A')::TEXT,
        COALESCE(result_record.program_name, 'N/A')::TEXT,
        COALESCE(result_record.semester_name, 'N/A')::TEXT,
        attendance_record.section_name::TEXT,
        attendance_record.section_code::TEXT,
        COALESCE(result_record.course_name, period_data->>'course_name', 'N/A')::TEXT,
        COALESCE(result_record.course_code, 'N/A')::TEXT,
        COALESCE(period_data->>'period_name', 'N/A')::TEXT,
        COALESCE(period_data->>'start_time', 'N/A')::TEXT,
        COALESCE(period_data->>'end_time', 'N/A')::TEXT,
        faculty_name_val::TEXT,
        faculty_email_val::TEXT,
        total_count_val,
        present_count_val,
        total_count_val - present_count_val,
        CASE 
            WHEN total_count_val > 0 THEN 
                ROUND((present_count_val::NUMERIC / total_count_val::NUMERIC) * 100, 2)
            ELSE 0
        END,
        attendance_record.marked_by::TEXT,
        attendance_record.marked_at,
        enriched_students_data;  -- Return enriched student data instead of raw student_data
END;
$function$;