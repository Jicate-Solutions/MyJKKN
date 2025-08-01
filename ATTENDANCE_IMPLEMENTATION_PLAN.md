# Alternative Implementation Plan for Attendance Module

## 1. Executive Summary

The current attendance system stores one record per student, per period, per day in the `student_attendance` table. With 7 institutions and over 10,000 daily records, this relational approach will lead to significant performance degradation, increased storage costs, and difficulties in data management and reporting.

This document proposes a new approach that consolidates daily attendance records into a single JSONB column within the `student_attendance` table. This will drastically reduce the number of rows, improve query performance, and simplify data handling.

**Key Benefits:**

- **Performance:** Significantly faster reads and writes due to fewer rows and indexes.
- **Scalability:** The system will be able to handle millions of records without a significant performance drop.
- **Cost-Effectiveness:** Reduced storage and compute costs on the database.
- **Simplicity:** Easier to manage and query attendance data for a whole day/class.

## 2. Proposed Database Schema

We will modify the `student_attendance` table to store the consolidated attendance data.

### Updated Table: `student_attendance`

This table will store one record per class (defined by a timetable and section) per day.

| Column Name       | Data Type     | Constraints                        | Description                                            |
| :---------------- | :------------ | :--------------------------------- | :----------------------------------------------------- |
| `id`              | `uuid`        | `PRIMARY KEY`                      | Unique identifier for the daily attendance record.     |
| `institution_id`  | `uuid`        | `FOREIGN KEY` to `institutions.id` | The institution ID.                                    |
| `timetable_id`    | `uuid`        | `FOREIGN KEY` to `timetables.id`   | The timetable associated with this attendance.         |
| `section_id`      | `uuid`        | `FOREIGN KEY` to `sections.id`     | The section for which attendance is recorded.          |
| `attendance_date` | `date`        | `NOT NULL`                         | The date of attendance.                                |
| `attendance_data` | `jsonb`       | `NOT NULL`                         | JSONB object storing student statuses for each period. |
| `marked_by`       | `uuid`        | `FOREIGN KEY` to `profiles.id`     | The user who last updated the record.                  |
| `created_at`      | `timestamptz` | `default: now()`                   | Timestamp of creation.                                 |
| `updated_at`      | `timestamptz` | `default: now()`                   | Timestamp of last update.                              |

**Composite Unique Constraint:** A unique constraint on `(institution_id, timetable_id, section_id, attendance_date)` will ensure only one attendance record per class per day.

### JSONB Structure for `attendance_data`

The `attendance_data` column will store an object where keys are `period_id`s and values are objects containing student attendance statuses.

```json
{
  "periods": {
    "period_id_1": {
      "timetable_slot_id": "slot_id_1",
      "students": {
        "student_id_1": "Present",
        "student_id_2": "Absent",
        "student_id_3": "Present"
      }
    },
    "period_id_2": {
      "timetable_slot_id": "slot_id_2",
      "students": {
        "student_id_1": "Present",
        "student_id_2": "Present",
        "student_id_3": "Present"
      }
    }
  },
  "metadata": {
    "marked_at": "2023-10-27T10:00:00Z",
    "marked_by": "user_id"
  }
}
```

## 3. Data Migration Strategy

To maintain the table name `student_attendance` while changing its structure, we will perform a migration that involves creating a temporary table.

**Steps:**

1.  **Create a new table `student_attendance_new` with the proposed schema.**
2.  **Create a migration script (e.g., a Supabase Edge Function or a local script).**
3.  **The script will:**
    - Read records from the old `student_attendance` table.
    - Group records by `institution_id`, `timetable_id`, `section_id`, and `attendance_date`.
    - For each group, construct the `attendance_data` JSONB object.
    - Insert the new consolidated record into `student_attendance_new`.
4.  **After successful migration and verification:**
    - **Drop the old `student_attendance` table.**
    - **Rename `student_attendance_new` to `student_attendance`.**

## 4. Backend Implementation Plan

### `lib/services/academic/attendance-service.ts`

The `AttendanceService` will be refactored to use the new `student_attendance` table structure.

1.  **`getStudentAttendance` (New Method):**

    - Fetches a single `student_attendance` record for a given class and date.
    - If no record exists, it will return a structure with all students marked as "Present" by default.

2.  **`upsertStudentAttendance` (New Method):**

    - This will be the primary method for saving attendance.
    - It will take the `attendance_data` JSONB object and perform an `upsert` operation on the `student_attendance` table based on the unique constraint.
    - This method will replace the current `batchUpdateAttendance`.

3.  **Refactor Existing Methods:**
    - `getAttendanceRoster`: Will be modified to call `getStudentAttendance` and format the data for the frontend.
    - `getAttendanceRecords`: Will be updated to query and parse the `student_attendance` table if needed for reporting, or it may be deprecated in favor of more specific reporting functions.

### `types/attendance.ts`

The TypeScript types will be updated to reflect the new JSONB structure.

```typescript
// types/attendance.ts

export interface DailyAttendanceData {
  periods: {
    [periodId: string]: {
      timetable_slot_id: string;
      students: {
        [studentId: string]: 'Present' | 'Absent';
      };
    };
  };
  metadata: {
    marked_at: string;
    marked_by: string;
  };
}

export interface StudentAttendanceRecord {
  id: string;
  institution_id: string;
  timetable_id: string;
  section_id: string;
  attendance_date: string;
  attendance_data: DailyAttendanceData;
  marked_by: string;
  created_at: string;
  updated_at: string;
}
```

## 5. Frontend Implementation Plan

### `app/(routes)/academic/attendance/page.tsx`

The main attendance page will be updated to work with the new JSONB data structure.

1.  **State Management:**

    - Instead of a list of student records, the component will manage a single state object representing the `attendance_data` for the day.
    - When a student's status is toggled for a period, it will update this local JSON state.

2.  **Data Fetching:**

    - The `useAttendanceRoster` hook will be modified to call the new `getStudentAttendance` service method.
    - It will then parse the returned JSONB object to populate the UI.

3.  **Saving Data:**
    - The `handleSaveAttendance` function will now call the `upsertStudentAttendance` service method, passing the entire modified `attendance_data` object.

### `hooks/academic/use-attendance.ts`

The `useAttendanceRoster` hook will be updated to reflect the new service methods and data structures.

- It will no longer manage individual student records but will handle the daily attendance JSONB object.
- The `saveAttendance` function within the hook will be adapted to the new `upsertStudentAttendance` method.

## 6. Implementation Steps

1.  **Database:**

    - [ ] Create the new `student_attendance_new` table with the schema defined above.
    - [ ] Add the composite unique constraint.

2.  **Backend (`attendance-service.ts`):**

    - [ ] Implement the `getStudentAttendance` method.
    - [ ] Implement the `upsertStudentAttendance` method.
    - [ ] Refactor `getAttendanceRoster` and other relevant methods.

3.  **Types (`types/attendance.ts`):**

    - [ ] Add the new `DailyAttendanceData` and `StudentAttendanceRecord` types.

4.  **Frontend (`use-attendance.ts` and `page.tsx`):**

    - [ ] Update the `useAttendanceRoster` hook to use the new service methods and state management.
    - [ ] Modify the `AttendancePage` component to work with the new JSONB state.

5.  **Data Migration:**

    - [ ] Develop and test the migration script in a staging environment.
    - [ ] Run the migration script on the production database during a maintenance window.

6.  **Cleanup:**
    - [ ] After successful migration and testing, archive and/or delete the old `student_attendance` table.

This phased approach will ensure a smooth transition to the new, more performant attendance system with minimal disruption.
