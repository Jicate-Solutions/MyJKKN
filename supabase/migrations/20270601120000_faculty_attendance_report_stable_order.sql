-- Attendance reports — a stable page order (rescue of #3098's review-round edit)
--
-- WHY. get_faculty_attendance_reports pages with OFFSET/LIMIT but sorts only by
-- sa.attendance_date. Many sessions share a date, and PostgreSQL does not keep
-- ties in the same order between two queries, so page 2 can repeat rows from
-- page 1 and skip others. #3098 merged without the review-round tie-break; the
-- W12 desk's 30 Sep rescue sweep found it in worktree lane-attn-enum.
--
-- WHAT CHANGES. One line: ORDER BY sa.attendance_date DESC, sa.id DESC.
-- The body below is the LIVE body read from production on 30 Sep 2026
-- (pg_get_functiondef), unchanged apart from that line, so no live-only fix is
-- reverted. CREATE OR REPLACE keeps the existing grants (authenticated,
-- service_role) and SECURITY INVOKER.
--
-- A new migration on purpose: the merged 20260815110000 file is not edited.

CREATE OR REPLACE FUNCTION public.get_faculty_attendance_reports(faculty_staff_id text, filter_institution_id uuid DEFAULT NULL::uuid, filter_academic_year_id uuid DEFAULT NULL::uuid, filter_degree_id uuid DEFAULT NULL::uuid, filter_department_id uuid DEFAULT NULL::uuid, filter_program_id uuid DEFAULT NULL::uuid, filter_semester_id uuid DEFAULT NULL::uuid, filter_section_id uuid DEFAULT NULL::uuid, filter_date_from date DEFAULT NULL::date, filter_date_to date DEFAULT NULL::date, page_offset integer DEFAULT 0, page_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, attendance_date date, institution_id uuid, academic_year_id uuid, degree_id uuid, department_id uuid, program_id uuid, semester_id uuid, section_id uuid, timetable_id uuid, attendance_data jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  total_records BIGINT;
  faculty_profile_id TEXT;
BEGIN
  -- Get the profile_id for the faculty staff
  SELECT s.profile_id::text INTO faculty_profile_id 
  FROM staff s 
  WHERE s.id = faculty_staff_id::uuid;

  -- First get the total count for pagination
  SELECT COUNT(*) INTO total_records
  FROM student_attendance sa
  WHERE EXISTS (
    SELECT 1 
    FROM jsonb_each(sa.attendance_data) AS period_data
    WHERE (period_data.value -> 'assigned_faculty' ->> 'faculty_id' = faculty_staff_id)
       OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(period_data.value -> 'assigned_faculty') = 'array'
                        THEN period_data.value -> 'assigned_faculty'
                        ELSE '[]'::jsonb
                   END
                 ) AS co_assignee
            WHERE co_assignee ->> 'faculty_id' = faculty_staff_id
          )
       OR (period_data.value -> 'marked_by_details' ->> 'marker_id' = faculty_profile_id)
  )
  AND (filter_institution_id IS NULL OR sa.institution_id = filter_institution_id)
  AND (filter_academic_year_id IS NULL OR sa.academic_year_id = filter_academic_year_id)
  AND (filter_degree_id IS NULL OR sa.degree_id = filter_degree_id)
  AND (filter_department_id IS NULL OR sa.department_id = filter_department_id)
  AND (filter_program_id IS NULL OR sa.program_id = filter_program_id)
  AND (filter_semester_id IS NULL OR sa.semester_id = filter_semester_id)
  AND (filter_section_id IS NULL OR sa.section_id = filter_section_id)
  AND (filter_date_from IS NULL OR sa.attendance_date >= filter_date_from)
  AND (filter_date_to IS NULL OR sa.attendance_date <= filter_date_to);

  -- Return the paginated results with total count
  RETURN QUERY
  SELECT 
    sa.id,
    sa.attendance_date,
    sa.institution_id,
    sa.academic_year_id,
    sa.degree_id,
    sa.department_id,
    sa.program_id,
    sa.semester_id,
    sa.section_id,
    sa.timetable_id,
    sa.attendance_data,
    sa.created_at,
    sa.updated_at,
    total_records as total_count
  FROM student_attendance sa
  WHERE EXISTS (
    SELECT 1 
    FROM jsonb_each(sa.attendance_data) AS period_data
    WHERE (period_data.value -> 'assigned_faculty' ->> 'faculty_id' = faculty_staff_id)
       OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(period_data.value -> 'assigned_faculty') = 'array'
                        THEN period_data.value -> 'assigned_faculty'
                        ELSE '[]'::jsonb
                   END
                 ) AS co_assignee
            WHERE co_assignee ->> 'faculty_id' = faculty_staff_id
          )
       OR (period_data.value -> 'marked_by_details' ->> 'marker_id' = faculty_profile_id)
  )
  AND (filter_institution_id IS NULL OR sa.institution_id = filter_institution_id)
  AND (filter_academic_year_id IS NULL OR sa.academic_year_id = filter_academic_year_id)
  AND (filter_degree_id IS NULL OR sa.degree_id = filter_degree_id)
  AND (filter_department_id IS NULL OR sa.department_id = filter_department_id)
  AND (filter_program_id IS NULL OR sa.program_id = filter_program_id)
  AND (filter_semester_id IS NULL OR sa.semester_id = filter_semester_id)
  AND (filter_section_id IS NULL OR sa.section_id = filter_section_id)
  AND (filter_date_from IS NULL OR sa.attendance_date >= filter_date_from)
  AND (filter_date_to IS NULL OR sa.attendance_date <= filter_date_to)
  ORDER BY sa.attendance_date DESC, sa.id DESC
  OFFSET page_offset
  LIMIT page_limit;
END;
$function$

;
