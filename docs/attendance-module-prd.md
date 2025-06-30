# Product Requirements Document: Attendance Management Module

## 1. Introduction

This document outlines the requirements for the new Attendance Management module within the MyJKKN application. This module will enable authorized staff members to record and manage student attendance for scheduled classes. It will be tightly integrated with the existing Academic Management, Timetable, and Student modules to ensure data consistency and a seamless user experience.

## 2. Goals and Objectives

- To provide an efficient and user-friendly interface for recording daily student attendance.
- To automate the process of generating attendance sheets based on the scheduled timetable.
- To ensure accurate attendance data by linking it to specific students, courses, and periods.
- To provide role-based access control, ensuring data security and integrity.
- To lay the foundation for future features like attendance reporting and analytics.

## 3. Target Audience

- **Super Admins:** Can access and manage attendance records for all institutions.
- **Administrative Staff / Teachers:** Can take and manage attendance for their assigned institution, department, and classes.

## 4. Features and Functionality

### 4.1. Attendance Page

A new page will be created at `/academic/attendance`. This page will be the central hub for all attendance-related activities.

### 4.2. Attendance Search and Filtering

The page will feature a comprehensive search and filter section to allow users to pinpoint the exact class for which they need to take attendance.

**Filter Fields:**

- **Institution:** Dropdown (pre-filled if user is not a super admin).
- **Academic Year:** Dropdown, filtered by the selected institution.
- **Degree:** Dropdown, filtered by the selected institution.
- **Program:** Dropdown, filtered by the selected degree.
- **Department:** Dropdown, filtered by the selected program.
- **Semester:** Dropdown, filtered by the selected program.
- **Section:** Dropdown, filtered by the selected semester.
- **Attendance Date:** A date picker, defaulting to the current date.

An "Apply Filters" button will trigger the data fetching.

### 4.3. Attendance Roster

Once the filters are applied, the system will fetch the relevant data and display the attendance roster.

**Logic:**

1.  Based on the selected `Attendance Date`, determine the day of the week (e.g., 'MONDAY').
2.  Using the filter criteria (Institution, Academic Year, etc.), find the active `Timetable`.
3.  Fetch the `Timetable Slots` for that timetable and the determined day of the week.
4.  The periods for that day will be displayed, probably as selectable tabs or a dropdown (`Period 1`, `Period 2`, etc.).

### 4.4. Student List and Attendance Marking

For the selected period, a list of students will be displayed in a table.

**Student Table Columns:**

- **Checkbox:** For multi-selecting students.
- **Roll Number:** Student's roll number.
- **Student Name:** Student's full name.
- **Status:** A badge indicating "Present" or "Absent".

**Functionality:**

- **Default Status:** All students will be marked as "Present" by default when the list is first loaded for a period that has no attendance recorded yet.
- **Marking Absentees:** The user can select one or more students using the checkboxes and click a "Mark as Absent" button.
- **Marking Presents:** Similarly, selected absent students can be marked as "Present".
- **Student Search:** An input field to search for a specific student within the current list by name or roll number.
- **Save Attendance:** A "Save" button to persist the attendance records for the selected period to the database.

### 4.5. Period Switching

The user can switch between the periods scheduled for the selected day without re-entering the main filters. When a new period is selected, the student list will refresh, showing the attendance status for that specific period.

## 5. User Roles and Permissions

- **Super Admin:** Full CRUD (Create, Read, Update, Delete) access to attendance records across all institutions. Can view and manage all data.
- **Institution Admin/Staff:** Can only access the institutions they are assigned to. Their view will be scoped to their institution in the "Institution" filter, which will be disabled.

## 6. Data Model / Database Schema

To support this module, new tables will be added to the Supabase database.

### 6.1. `student_attendance` Table

This table will store the attendance status for each student for a specific timetable slot on a given date.

| Column Name         | Data Type     | Constraints                                           | Description                                                         |
| ------------------- | ------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| `id`                | `uuid`        | `PRIMARY KEY`, `default: uuid_generate_v4()`          | Unique identifier for the attendance record.                        |
| `student_id`        | `uuid`        | `FOREIGN KEY` to `students.id`                        | The ID of the student.                                              |
| `timetable_slot_id` | `uuid`        | `FOREIGN KEY` to `timetable_slots.id`                 | The ID of the timetable slot (which links to period, course, etc.). |
| `attendance_date`   | `date`        | `NOT NULL`                                            | The date for which attendance is recorded.                          |
| `status`            | `text`        | `NOT NULL`, `CHECK (status IN ('Present', 'Absent'))` | The attendance status. Could be an `enum`.                          |
| `marked_by`         | `uuid`        | `FOREIGN KEY` to `users.id`                           | The user who recorded/last updated the attendance.                  |
| `institution_id`    | `uuid`        | `FOREIGN KEY` to `institutions.id`                    | Denormalized for easier policy creation and filtering.              |
| \* `created_at`     | `timestamptz` | `NOT NULL`, `default: now()`                          | Timestamp of creation.                                              |
| \* `updated_at`     | `timestamptz` | `NOT NULL`, `default: now()`                          | Timestamp of last update.                                           |

**Composite Unique Constraint:** A unique constraint on `(student_id, timetable_slot_id, attendance_date)` will be created to prevent duplicate attendance records.

## 7. Technical Requirements

### 7.1. Backend (Supabase / API)

A new service, `lib/services/academic/attendance-service.ts`, will be created.

**API Endpoints / Service Methods:**

1.  **`getStudentsForAttendance(filters)`:**

    - **Filters:** `institution_id`, `degree_id`, `program_id`, `department_id`, `semester_id`, `section_id`.
    - **Action:** Fetches the list of students matching the filter criteria.
    - **Returns:** `Student[]`.

2.  **`getTimetableSlotsForDate(timetable_id, date)`:**

    - **Action:** Fetches the timetable slots for a given timetable and date (determining the day of the week internally).
    - **Returns:** `TimetableSlot[]`.

3.  **`getAttendanceRecords(timetable_slot_id, attendance_date)`:**

    - **Action:** Fetches existing attendance records for a specific slot and date.
    - **Returns:** `StudentAttendance[]`.

4.  **`batchUpdateAttendance(records)`:**
    - **Records:** An array of `{ student_id, timetable_slot_id, attendance_date, status, marked_by, institution_id }`.
    - **Action:** Uses Supabase's `upsert` functionality to create or update a batch of attendance records.
    - **Returns:** Success/failure status.

### 7.2. Frontend

**New Components:**

- `app/(routes)/academic/attendance/page.tsx`: The main page component.
- `app/(routes)/academic/attendance/_components/attendance-filters.tsx`: The filtering UI.
- `app/(routes)/academic/attendance/_components/attendance-roster.tsx`: The component to display periods and the student attendance table.
- `app/(routes)/academic/attendance/_components/student-attendance-row.tsx`: Component for a single student row.

**Hooks:**

- `hooks/academic/use-attendance.ts`: A new hook to manage state and data fetching for the attendance module, interacting with the `AttendanceService`.

## 8. Non-Functional Requirements

- **Security:** Row-Level Security (RLS) policies must be implemented on the `student_attendance` table to ensure users can only access data for their own institution.
- **Performance:** The student list should load efficiently. Pagination will be implemented for the student roster if a class contains a very large number of students (>100). API calls should be optimized to fetch only necessary data.
- **Usability:** The interface should be intuitive, minimizing clicks required to take attendance. Error messages and loading states must be clearly communicated to the user.

## 9. Future Enhancements

- **Attendance Reports:** Generate and export attendance reports (PDF, CSV) for a given period (e.g., weekly, monthly).
- **Absentee Notifications:** System to notify parents/guardians via SMS or email about student absenteeism.
- **Attendance Analytics:** Dashboard widgets showing attendance trends, percentage, and chronically absent students.
- **Leave Integration:** Automatically mark students as "On Leave" if they have an approved leave request in a future Leave Management module.
