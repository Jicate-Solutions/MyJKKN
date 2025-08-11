Of course. After a deep analysis of your codebase, I've prepared a comprehensive implementation guide to build the Attendance Dashboard. The plan focuses on creating new, isolated components and services to avoid disrupting existing functionality while leveraging current patterns and types.

Here is the step-by-step guide:

---

# Implementation Guide: Attendance Analytics Dashboard

This guide outlines the steps to create a new attendance analytics dashboard within the existing academic management module. It includes creating new routes, services, components, and data visualizations while adhering to the project's current architecture and coding standards.

### Final Outcome

A new page at `/academic/attendance/dashboard` will display various attendance statistics with charts and tables, governed by role-based access control and a set of hierarchical filters.

---

## Step 1: Setup New Route and Sidebar Link

First, we need to create the new page for the dashboard and link it in the sidebar menu for discoverability.

1.  **Create New File Structure:**
    Create a new directory and file for the dashboard page:

    ```
    /app/(routes)/academic/attendance/dashboard/page.tsx
    ```

2.  **Update Sidebar Menu:**
    Add the new dashboard link to `lib/sidebarMenuLink.ts`. This involves adding a new permission key and a new menu item.

    - **Add Permission Key to `MENU_PERMISSIONS`** (around line 140):

      ```typescript
      // lib/sidebarMenuLink.ts

      // ...
      '/academic/periods': 'academic.periods.view',
      '/academic/attendance': 'academic.attendance.view',
      '/academic/attendance/dashboard': 'academic.attendance.dashboard.view', // Add this line

      // Notification Management
      // ...
      ```

    - **Add Menu Item to `GetPages` function** (in the 'Academic Management' group, around line 479):

      ```typescript
      // lib/sidebarMenuLink.ts

      // ...
      submenus: [
        {
          href: '/academic/attendance',
          label: 'Mark Attendance',
          active: pathname === '/academic/attendance'
        },
        { // Add this new submenu item
          href: '/academic/attendance/dashboard',
          label: 'Analytics Dashboard',
          active: pathname === '/academic/attendance/dashboard'
        }
      ]
      // ...
      ```

3.  **Update Permissions List:**
    Add the new permission `academic.attendance.dashboard.view` to the main permissions list in `lib/constants/permissions.ts` to make it assignable to roles.

## Step 2: Create Supabase RPC Functions for Analytics

Complex data aggregation can be slow and resource-intensive if performed on the client-side or via standard Supabase queries. The best approach is to create performant SQL functions (RPCs) in your Supabase database.

Create a new SQL migration file (e.g., `supabase/migrations/YYYYMMDDHHMMSS_attendance_analytics_functions.sql`) with the following functions. These functions encapsulate the complex joins and aggregations needed for the dashboard.

<details>
<summary>Click to view SQL for Supabase RPC Functions</summary>

```sql
--
-- Function to get Faculty Attendance Statistics
--
CREATE OR REPLACE FUNCTION get_faculty_attendance_stats(
    p_institution_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_degree_id UUID DEFAULT NULL,
    p_program_id UUID DEFAULT NULL,
    p_department_id UUID DEFAULT NULL,
    p_semester_id UUID DEFAULT NULL,
    p_section_id UUID DEFAULT NULL
)
RETURNS TABLE (
    staff_id UUID,
    staff_name TEXT,
    staff_designation TEXT,
    allocated_periods BIGINT,
    taken_periods BIGINT,
    not_taken_periods BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH timetable_base AS (
        -- Select relevant timetables based on filters
        SELECT id
        FROM timetables
        WHERE
            institution_id = p_institution_id
            AND is_active = TRUE
            AND (p_degree_id IS NULL OR degree_id = p_degree_id)
            AND (p_program_id IS NULL OR program_id = p_program_id)
            AND (p_department_id IS NULL OR department_id = p_department_id)
            AND (p_semester_id IS NULL OR semester::TEXT = p_semester_id::TEXT) -- Assuming semester can be number or text
    ),
    slots_in_range AS (
        -- Get all timetable slots within the date range, including staff assignments
        SELECT
            ts.id as slot_id,
            unnest(ts.staff_ids) as staff_id,
            generate_series(p_start_date, p_end_date, '1 day'::interval) as attendance_date
        FROM timetable_slots ts
        JOIN timetable_base tb ON ts.timetable_id = tb.id
        WHERE
            ts.is_break_slot = FALSE
            AND ts.day_of_week = UPPER(to_char(generate_series(p_start_date, p_end_date, '1 day'::interval), 'day'))::public.day_of_week
            AND (p_section_id IS NULL OR ts.section_ids @> ARRAY[p_section_id])
    ),
    allocated_periods AS (
        -- Calculate total allocated periods for each staff member
        SELECT
            s.staff_id,
            count(*) as total_allocated
        FROM slots_in_range s
        GROUP BY s.staff_id
    ),
    taken_periods AS (
        -- Calculate periods where attendance was marked
        SELECT
            sir.staff_id,
            count(DISTINCT sa.timetable_slot_id) as total_taken
        FROM student_attendance sa
        JOIN slots_in_range sir ON sa.timetable_slot_id = sir.slot_id AND sa.attendance_date = sir.attendance_date
        GROUP BY sir.staff_id
    )
    -- Final result joining staff info
    SELECT
        s.id as staff_id,
        s.first_name || ' ' || s.last_name as staff_name,
        s.designation,
        COALESCE(ap.total_allocated, 0) as allocated_periods,
        COALESCE(tp.total_taken, 0) as taken_periods,
        COALESCE(ap.total_allocated, 0) - COALESCE(tp.total_taken, 0) as not_taken_periods
    FROM staff s
    LEFT JOIN allocated_periods ap ON s.id = ap.staff_id
    LEFT JOIN taken_periods tp ON s.id = tp.staff_id
    WHERE s.institution_id = p_institution_id AND COALESCE(ap.total_allocated, 0) > 0;
END;
$$ LANGUAGE plpgsql;

--
-- Function to get Course Attendance Statistics
-- (Similar logic, grouped by course)
--
CREATE OR REPLACE FUNCTION get_course_attendance_stats(
    p_institution_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_degree_id UUID DEFAULT NULL,
    p_program_id UUID DEFAULT NULL,
    p_department_id UUID DEFAULT NULL,
    p_semester_id UUID DEFAULT NULL,
    p_section_id UUID DEFAULT NULL
)
RETURNS TABLE (
    course_id UUID,
    course_name TEXT,
    course_code TEXT,
    allocated_periods BIGINT,
    taken_periods BIGINT,
    not_taken_periods BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH timetable_base AS (
        SELECT id FROM timetables
        WHERE institution_id = p_institution_id AND is_active = TRUE
          AND (p_degree_id IS NULL OR degree_id = p_degree_id)
          AND (p_program_id IS NULL OR program_id = p_program_id)
          AND (p_department_id IS NULL OR department_id = p_department_id)
          AND (p_semester_id IS NULL OR semester::TEXT = p_semester_id::TEXT)
    ),
    slots_in_range AS (
        SELECT
            ts.id as slot_id,
            ts.course_id,
            generate_series(p_start_date, p_end_date, '1 day'::interval) as attendance_date
        FROM timetable_slots ts
        JOIN timetable_base tb ON ts.timetable_id = tb.id
        WHERE ts.is_break_slot = FALSE
          AND ts.day_of_week = UPPER(to_char(generate_series(p_start_date, p_end_date, '1 day'::interval), 'day'))::public.day_of_week
          AND (p_section_id IS NULL OR ts.section_ids @> ARRAY[p_section_id])
    ),
    allocated_periods AS (
        SELECT s.course_id, count(*) as total_allocated
        FROM slots_in_range s
        GROUP BY s.course_id
    ),
    taken_periods AS (
        SELECT sir.course_id, count(DISTINCT sa.timetable_slot_id) as total_taken
        FROM student_attendance sa
        JOIN slots_in_range sir ON sa.timetable_slot_id = sir.slot_id AND sa.attendance_date = sir.attendance_date
        GROUP BY sir.course_id
    )
    SELECT
        c.id as course_id,
        c.course_name,
        c.course_code,
        COALESCE(ap.total_allocated, 0) as allocated_periods,
        COALESCE(tp.total_taken, 0) as taken_periods,
        COALESCE(ap.total_allocated, 0) - COALESCE(tp.total_taken, 0) as not_taken_periods
    FROM courses c
    LEFT JOIN allocated_periods ap ON c.id = ap.course_id
    LEFT JOIN taken_periods tp ON c.id = tp.course_id
    WHERE c.institution_id = p_institution_id AND COALESCE(ap.total_allocated, 0) > 0;
END;
$$ LANGUAGE plpgsql;

--
-- Function to get Student Attendance Statistics
--
CREATE OR REPLACE FUNCTION get_student_attendance_stats(
    p_institution_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_degree_id UUID DEFAULT NULL,
    p_program_id UUID DEFAULT NULL,
    p_department_id UUID DEFAULT NULL,
    p_semester_id UUID DEFAULT NULL,
    p_section_id UUID DEFAULT NULL
)
RETURNS TABLE (
    student_id UUID,
    student_name TEXT,
    register_number TEXT,
    allocated_periods BIGINT,
    present_periods BIGINT,
    absent_periods BIGINT,
    attendance_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH student_base AS (
        SELECT id, first_name, last_name, register_number
        FROM students
        WHERE institution_id = p_institution_id
          AND (p_degree_id IS NULL OR degree_id = p_degree_id)
          AND (p_program_id IS NULL OR program_id = p_program_id)
          AND (p_department_id IS NULL OR department_id = p_department_id)
          AND (p_semester_id IS NULL OR semester_id = p_semester_id)
          AND (p_section_id IS NULL OR section_id = p_section_id)
    ),
    total_periods AS (
        SELECT
            count(*) as total_allocated
        FROM timetable_slots ts
        JOIN timetables t ON ts.timetable_id = t.id
        WHERE t.institution_id = p_institution_id AND t.is_active = TRUE
          AND (p_degree_id IS NULL OR t.degree_id = p_degree_id)
          AND (p_program_id IS NULL OR t.program_id = p_program_id)
          AND (p_department_id IS NULL OR t.department_id = p_department_id)
          AND (p_semester_id IS NULL OR t.semester::TEXT = p_semester_id::TEXT)
          AND (p_section_id IS NULL OR ts.section_ids @> ARRAY[p_section_id])
          AND ts.is_break_slot = FALSE
          AND ts.day_of_week = UPPER(to_char(generate_series(p_start_date, p_end_date, '1 day'::interval), 'day'))::public.day_of_week
    ),
    student_attendance_records AS (
        SELECT
            sa.student_id,
            SUM(CASE WHEN sa.status = 'Present' THEN 1 ELSE 0 END) as present_count,
            SUM(CASE WHEN sa.status = 'Absent' THEN 1 ELSE 0 END) as absent_count
        FROM student_attendance sa
        WHERE sa.institution_id = p_institution_id
          AND sa.attendance_date BETWEEN p_start_date AND p_end_date
        GROUP BY sa.student_id
    )
    SELECT
        sb.id as student_id,
        sb.first_name || ' ' || sb.last_name as student_name,
        sb.register_number,
        (SELECT total_allocated FROM total_periods) as allocated_periods,
        COALESCE(sar.present_count, 0) as present_periods,
        COALESCE(sar.absent_count, 0) as absent_periods,
        CASE
            WHEN (SELECT total_allocated FROM total_periods) > 0 THEN
                (COALESCE(sar.present_count, 0)::NUMERIC / (SELECT total_allocated FROM total_periods)) * 100
            ELSE 0
        END as attendance_percentage
    FROM student_base sb
    LEFT JOIN student_attendance_records sar ON sb.id = sar.student_id;
END;
$$ LANGUAGE plpgsql;

```

</details>

## Step 3: Update Attendance Service

Create a new service file `lib/services/academic/attendance-analytics-service.ts` to call these new RPC functions. This keeps the analytics logic separate from the operational attendance service.

```typescript
// lib/services/academic/attendance-analytics-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { handleRPCError } from '@/lib/utils/error-handler'; // Assuming a utility for this

export interface AnalyticsFilters {
  institution_id: string;
  start_date: string;
  end_date: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
}

export class AttendanceAnalyticsService {
  private static supabase = createClientSupabaseClient();

  static async getFacultyStats(filters: AnalyticsFilters) {
    const { data, error } = await this.supabase.rpc(
      'get_faculty_attendance_stats',
      {
        p_institution_id: filters.institution_id,
        p_start_date: filters.start_date,
        p_end_date: filters.end_date,
        p_degree_id: filters.degree_id,
        p_program_id: filters.program_id,
        p_department_id: filters.department_id,
        p_semester_id: filters.semester_id,
        p_section_id: filters.section_id,
      }
    );
    if (error) handleRPCError(error, 'get_faculty_attendance_stats');
    return data || [];
  }

  static async getCourseStats(filters: AnalyticsFilters) {
    const { data, error } = await this.supabase.rpc(
      'get_course_attendance_stats',
      {
        p_institution_id: filters.institution_id,
        p_start_date: filters.start_date,
        p_end_date: filters.end_date,
        p_degree_id: filters.degree_id,
        p_program_id: filters.program_id,
        p_department_id: filters.department_id,
        p_semester_id: filters.semester_id,
        p_section_id: filters.section_id,
      }
    );
    if (error) handleRPCError(error, 'get_course_attendance_stats');
    return data || [];
  }

  static async getStudentStats(filters: AnalyticsFilters) {
    const { data, error } = await this.supabase.rpc(
      'get_student_attendance_stats',
      {
        p_institution_id: filters.institution_id,
        p_start_date: filters.start_date,
        p_end_date: filters.end_date,
        p_degree_id: filters.degree_id,
        p_program_id: filters.program_id,
        p_department_id: filters.department_id,
        p_semester_id: filters.semester_id,
        p_section_id: filters.section_id,
      }
    );
    if (error) handleRPCError(error, 'get_student_attendance_stats');
    return data || [];
  }
}
```

## Step 4: Build the Filters Component

Create a reusable component for all the filters. This component will manage the state of the filters and the hierarchical dependency.

- **File:** `app/(routes)/academic/attendance/dashboard/_components/attendance-dashboard-filters.tsx`
- **Functionality:**
  - It will contain dropdowns for Institution (if super admin), Degree, Department, Program, Semester, and Section.
  - It will also include a `DateRangePicker` and buttons for "Today", "This Week", "This Month".
  - When a parent filter changes (e.g., Degree), it must reset the values of all child filters (Department, Program, etc.). This can be handled with `useEffect` hooks.
  - It will take an `onFilterChange` callback prop to lift the state up to the main dashboard page.

## Step 5: Build the Main Dashboard Page

This is the main container that will assemble all the pieces.

- **File:** `app/(routes)/academic/attendance/dashboard/page.tsx`
- **Functionality:**
  1.  **State Management:** Use `useState` to manage the `filters` object.
  2.  **Permissions:** Fetch the current user's role and institution ID. If the user is not a super admin, the institution filter should be disabled and pre-filled. This logic should be passed down to the filters component.
  3.  **Data Fetching:** Use TanStack Query (`useQuery`) to call the `AttendanceAnalyticsService` methods whenever the filters change. Each statistic (faculty, course, student) should have its own `useQuery` call.
      ```typescript
      const { data: facultyStats, isLoading: facultyLoading } = useQuery({
        queryKey: ['facultyAttendanceStats', filters],
        queryFn: () => AttendanceAnalyticsService.getFacultyStats(filters),
        enabled: !!filters.institution_id, // Only run when institution is selected
      });
      ```
  4.  **Layout:** Arrange the `AttendanceDashboardFilters` component at the top and then the individual chart/widget components below it, passing the fetched data and loading states as props.

## Step 6: Create Analytics Widget Components

Create a separate component for each statistical category. This will make the dashboard clean and modular. A good charting library like **Tremor** or **Recharts** is recommended for visualizations.

- **File:** `.../_components/faculty-attendance-widget.tsx`

  - **Props:** `data`, `isLoading`.
  - **Content:** A `Card` component containing a `BarChart` showing "Allocated", "Taken", and "Not Taken" periods per faculty. Below the chart, include a `DataTable` with the raw numbers.

- **File:** `.../_components/course-attendance-widget.tsx`

  - **Props:** `data`, `isLoading`.
  - **Content:** Similar to the faculty widget, but for courses.

- **File:** `.../_components/student-attendance-widget.tsx`
  - **Props:** `data`, `isLoading`.
  - **Content:** A chart showing the distribution of student attendance percentages (e.g., >90%, 75-90%, <75%). A data table will list individual students with their present/absent counts.

## Step 7: Advanced Features & Considerations

To make the dashboard even more powerful, consider these additions:

- **Overall Stat Cards:** At the top of the page, show key metrics like "Overall Attendance Percentage," "Total Periods Taken," and "Total Students Absent Today."
- **Trend Analysis:** A line chart showing attendance percentage over the selected date range to identify patterns or dips.
- **Export Data:** Add "Export as CSV" buttons to each data table.
- **Empty States:** Ensure each widget shows a helpful message when there is no data to display for the selected filters (you can reuse `AttendanceEmptyState`).
- **Loading Skeletons:** Use skeleton loaders for each widget to provide a smooth loading experience.

By following this guide, you can build a robust and feature-rich attendance analytics dashboard that integrates seamlessly with your existing application.
