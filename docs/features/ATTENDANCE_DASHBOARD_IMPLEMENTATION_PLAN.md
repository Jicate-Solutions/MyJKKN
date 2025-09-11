# Attendance Dashboard Implementation Plan

## 1. Overview

This document outlines the implementation plan for the new Attendance Dashboard. The dashboard will provide a real-time overview of daily attendance statistics and highlight any pending (unmarked) attendance periods. The entire module will be protected by role-based access control, providing different views for Super Admins versus institution-level users like Principals and Digital Coordinators.

## 2. File Structure Changes

### New Files

1.  **`app/(routes)/academic/attendance/dashboard/page.tsx`**
    - The main page component for the attendance dashboard. It will handle data fetching, permission checks, and layout structure.
2.  **`app/(routes)/academic/attendance/dashboard/_components/statistics-cards.tsx`**
    - A component to display the colorful, hierarchical attendance statistics for the current day. Will include filters for Super Admins.
3.  **`app/(routes)/academic/attendance/dashboard/_components/pending-attendance-data-table.tsx`**
    - The main component for the advanced data table, handling state for filters, pagination, and sorting, similar to the implementation in the `/periods` module.
4.  **`app/(routes)/academic/attendance/dashboard/_components/pending-attendance-columns.tsx`**
    - Defines the columns, headers, and cell rendering for the pending attendance data table.
5.  **`app/(routes)/academic/attendance/dashboard/_components/pending-attendance-filters.tsx`**
    - A dedicated component for all filter controls (e.g., by institution, department) above the data table.
6.  **`app/(routes)/academic/attendance/dashboard/_components/pending-attendance-row-actions.tsx`**
    - Handles actions for individual rows, such as sending a reminder to a faculty member.
7.  **`lib/services/academic/attendance-dashboard-service.ts`**
    - A new service dedicated to fetching data specifically for the attendance dashboard to keep logic separated from the main `attendance-service.ts`.
8.  **`hooks/academic/use-attendance-dashboard.ts`**
    - A new React Query hook to encapsulate data fetching logic for the dashboard components.

### Modified Files

1.  **`lib/sidebarMenuLink.ts`**
    - Add a new link for the "Attendance Dashboard" under the "Academic Management" group.
2.  **`lib/constants/permissions.ts`**
    - Add new permission keys for viewing the attendance dashboard.

## 3. Permissions & Routing

### New Permission Keys

In `lib/constants/permissions.ts`, we will add the following permissions to the `PERMISSION_CATEGORIES` array under the `academic` key:

```typescript
// ... inside 'Academic' permissions array
{
  key: 'academic.attendance.dashboard.view',
  label: 'View Attendance Dashboard'
},
{
  key: 'academic.attendance.dashboard.view_all_institutions',
  label: 'View Dashboard for All Institutions'
}
```

- `academic.attendance.dashboard.view`: Grants access to the dashboard page itself.
- `academic.attendance.dashboard.view_all_institutions`: Allows a user (Super Admin) to see data for all institutions and use the institution filter. Without this, users will be restricted to their own institution.

### Sidebar Menu Link

In `lib/sidebarMenuLink.ts`, we will add the new route to the `MENU_PERMISSIONS` object and the menu structure within the `GetPages` function.

```typescript
// Add to MENU_PERMISSIONS
'/academic/attendance/dashboard': 'academic.attendance.dashboard.view',

// Add to 'Academic Management' submenus for 'Attendance' in GetPages
{
  href: '/academic/attendance/dashboard',
  label: 'Attendance Dashboard',
  active: pathname.startsWith('/academic/attendance/dashboard')
}
```

## 4. Backend Implementation (Service Layer)

The new file `lib/services/academic/attendance-dashboard-service.ts` will contain two primary functions.

### `getTodayAttendanceStats`

This function will aggregate and return the statistics needed for the cards.

- **Parameters**: `userInstitutionId?: string` (If provided, scopes the query to that institution).
- **Logic**:

  1.  Get the current date in 'YYYY-MM-DD' format.
  2.  Query the `student_attendance` table where `attendance_date` is today.
  3.  The core of the function will be a complex SQL query (or a Supabase RPC function) that:
      - Joins with `institutions`, `degrees`, `departments`, `programs`, `semesters`, and `sections` to get their names.
      - Joins with `students` to get a total student count per section.
      - Unnests the `attendance_data` JSONB field to count "Present" and "Absent" statuses for each period.
      - Groups the results by the full hierarchy (institution, degree, department, etc.) to create a nested JSON structure.
      - Calculates the total present, absent, and percentage for each grouping level.
  4.  If `userInstitutionId` is provided, a `WHERE` clause will restrict the query to that institution.

- **Return Structure**:
  ```json
  [
    {
      "institution_id": "uuid",
      "institution_name": "JKKN Engineering College",
      "total_students": 500,
      "total_present": 450,
      "total_absent": 50,
      "attendance_percentage": 90,
      "departments": [
        {
          "department_id": "uuid",
          "department_name": "Information Technology",
          "total_students": 100,
          // ...totals for department
          "semesters": [
            {
              "semester_id": "uuid",
              "semester_name": "5",
              // ...totals for semester
              "sections": [
                {
                  "section_id": "uuid",
                  "section_name": "A",
                  "total_students": 50,
                  "present": 45,
                  "absent": 5,
                  "percentage": 90
                }
              ]
            }
          ]
        }
      ]
    }
  ]
  ```

### `getTodayPendingAttendance`

This function will identify and return a paginated, filtered, and sorted list of scheduled periods for which attendance has not yet been marked.

- **Parameters**: An object containing filters, pagination, and sorting options (e.g., `{ userInstitutionId?: string, page: 1, limit: 10, sortBy: 'period_name', sortDirection: 'asc', departmentId?: 'uuid' }`).
- **Logic**:

  1.  Get today's date and day of the week (e.g., 'MONDAY').
  2.  **Step A: Find all scheduled periods for today.**
      - Query the `timetables` table to find all active timetables for today's date.
      - From the `timetable_data` of those timetables, extract all `period_id`s scheduled for today's day of the week. This gives a list of all { `timetable_id`, `section_id`, `period_id` } that should have attendance marked.
  3.  **Step B: Find all marked periods for today.**
      - Query the `student_attendance` table for records where `attendance_date` is today.
      - For each record, extract the `period_id` keys from the `attendance_data` JSONB field. This gives a list of all { `timetable_id`, `section_id`, `period_id` } that have been marked.
  4.  **Step C: Find the difference.**
      - Compare the list from Step A with the list from Step B to find the pending periods.
  5.  For each pending period, enrich the data by joining with `institutions`, `departments`, `semesters`, `sections`, `courses`, and `staff` to get the required display names.
  6.  Apply all filtering, sorting (`ORDER BY`), and pagination (`LIMIT`, `OFFSET`) clauses to the final query.

- **Return Structure**: A paginated object.
  ```json
  {
    "data": [
      {
        "institution_name": "JKKN Engineering College",
        "department_name": "Information Technology",
        "semester_name": "5",
        "section_name": "A",
        "period_name": "Period 1 (09:00 - 10:00)",
        "course_name": "Data Structures",
        "faculty_name": "Dr. Smith"
      }
    ],
    "metadata": {
      "total": 50,
      "page": 1,
      "limit": 10,
      "totalPages": 5
    }
  }
  ```

## 5. Frontend Implementation

### `dashboard/page.tsx`

- This server component will handle the primary permission check.
- It will fetch the user's role and institution ID.
- It will pass the user's permissions and institution context down to the client components.
- It will render the `StatisticsCards` and `PendingAttendanceTable` components, wrapped in `<Suspense>` for better loading states.

### `_components/statistics-cards.tsx`

- A client component that uses the new `use-attendance-dashboard` hook to fetch stats.
- Will display a loading skeleton while data is being fetched.
- Renders the hierarchical data in a visually appealing card-based layout.
- For Super Admins, it will include a dropdown to filter the statistics by institution.

### `_components/pending-attendance-data-table.tsx`

- A client component that uses the `use-attendance-dashboard` hook to fetch the pending periods list.
- It will orchestrate the `DataTable`, `PendingAttendanceFilters`, and `Pagination` components.
- Manages the state for search parameters (filters, sorting, pagination) and passes them to the data-fetching hook.
- Follows the advanced pattern established in modules like `app/(routes)/academic/periods`.

## 6. Advanced Feature Suggestions

The following advanced features can be included to enhance the dashboard:

1.  **Real-Time Updates**: Utilize Supabase Realtime to listen for changes in the `student_attendance` table. New attendance submissions can trigger a toast notification and a refresh of the relevant statistics card or remove an item from the pending table automatically.
2.  **Attendance Heatmap**: A visual grid showing Departments/Sections on the Y-axis and Periods on the X-axis. The color intensity of each cell would represent the attendance percentage, providing an at-a-glance view of daily performance.
3.  **Low Attendance Alerts**: A dedicated section that lists sections where the attendance for any period today has dropped below a configurable threshold (e.g., 75%). This allows for immediate follow-up.
4.  **Quick Actions for Pending Periods**: Add a "Send Reminder" button next to each pending period in the table. This would trigger a notification (via the existing Notifications system) to the assigned faculty member. This can be extended to support **bulk reminders** for all selected rows in the data table.
5.  **Trend Analysis Chart**: A small line chart comparing today's overall attendance percentage with the previous 7 days to provide context on daily performance.

## 7. Step-by-Step Implementation Guide

1.  **Backend Setup**:

    - [ ] Create `lib/services/academic/attendance-dashboard-service.ts`.
    - [ ] Implement the `getTodayAttendanceStats` function with the required aggregation logic.
    - [ ] Implement the `getTodayPendingAttendance` function with the required logic to find unmarked periods.
    - [ ] Create `hooks/academic/use-attendance-dashboard.ts` to wrap the service calls in `useQuery`.

2.  **Permissions & Routing**:

    - [ ] Add the new permission keys to `lib/constants/permissions.ts`.
    - [ ] Add the new route and permission mapping to `lib/sidebarMenuLink.ts`.
    - [ ] Update roles in the Supabase dashboard to grant these new permissions.

3.  **Frontend Development**:

    - [ ] Create the new page file at `app/(routes)/academic/attendance/dashboard/page.tsx`.
    - [ ] Implement the main layout and permission checks in the page component.
    - [ ] Create and implement the `StatisticsCards` component.
    - [ ] Create and implement the `PendingAttendanceDataTable` and its related components (`columns`, `filters`, `row-actions`).

4.  **Testing**:
    - [ ] Test the dashboard with a Super Admin account to verify the institution filter.
    - [ ] Test with a Principal/Coordinator account to verify the data is correctly scoped to their institution.
    - [ ] Verify that the statistics are accurate and update correctly.
    - [ ] Verify that the pending table correctly identifies unmarked periods and that pagination, sorting, and filtering function as expected.
