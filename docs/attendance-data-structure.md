# Student Attendance Data Structure and Query Guide

## Table Structure Overview

### 1. Primary Table: `student_attendance`
The main attendance table stores consolidated attendance data with the following key fields:
- `id` (UUID): Primary key
- `attendance_date` (Date): Date of attendance
- `timetable_id` (UUID): Links to timetables table
- `section_id` (UUID): Links to sections table  
- `institution_id` (UUID): Links to institutions table
- `attendance_data` (JSONB): Stores period-wise attendance details
- `marked_by` (UUID): User who marked attendance
- `created_at`, `updated_at`: Timestamps

### 2. Related Tables

#### `timetables` Table
Contains academic context information:
- `degree_id`: Links to degree (UG/PG)
- `program_id`: Links to program (B.Tech IT, etc.)
- `department_id`: Links to department
- `semester`: Semester name (text)
- `section`: Section name (text) 
- `academic_year_id`: Academic year reference

#### `sections` Table  
Contains section details:
- `section_name`: Section identifier (A, B, C, etc.)
- `degree_id`, `program_id`, `department_id`: Academic hierarchy
- `semester_id`: Links to semester

## How Attendance Data is Organized

### Period-wise Storage in JSONB
The `attendance_data` field stores period information as a JSONB object where:
- **Keys**: Period/slot IDs (UUID)
- **Values**: Objects containing:
  - `period_id`, `period_name` (e.g., "CET P4")
  - `start_time`, `end_time`
  - `course_id`, `course_name`
  - `students`: Array of student attendance records
    - `student_id`
    - `status` ("Present" or "Absent")
    - `marked_at` (timestamp)

Example structure:
```json
{
  "e2eaf2d6-f4de-4329-b413-ee560d12a05b": {
    "period_id": "ed44d85f-26f5-4fab-87c4-67477751fcd6",
    "period_name": "CET P4",
    "start_time": "11:45:00",
    "end_time": "12:30:00",
    "course_name": "Computer Networks",
    "students": [
      {
        "student_id": "bff47024-2695-433c-ba16-d969e9eb6933",
        "status": "Present",
        "marked_at": "2025-08-08T04:53:17.897Z"
      }
    ]
  }
}
```

## Query Examples

### 1. Get Attendance by Department, Program, Semester
```sql
SELECT 
    sa.*,
    dept.department_name,
    prog.program_name,
    t.semester
FROM student_attendance sa
JOIN timetables t ON sa.timetable_id = t.id
JOIN departments dept ON t.department_id = dept.id
JOIN programs prog ON t.program_id = prog.id
WHERE dept.department_name = 'Information Technology'
AND prog.program_name = '(BTECH) IT'
AND t.semester = 'Semester 5';
```

### 2. Get Attendance by Section
```sql
SELECT 
    sa.*,
    s.section_name
FROM student_attendance sa
JOIN sections s ON sa.section_id = s.id
WHERE s.section_name = 'A'
AND sa.attendance_date = '2025-08-07';
```

### 3. Get Period-wise Attendance Details
```sql
-- Extract period information from JSONB
SELECT 
    sa.attendance_date,
    jsonb_object_keys(sa.attendance_data) as period_slot_id,
    sa.attendance_data->jsonb_object_keys(sa.attendance_data)->>'period_name' as period_name,
    sa.attendance_data->jsonb_object_keys(sa.attendance_data)->>'course_name' as course_name,
    jsonb_array_length(
        (sa.attendance_data->jsonb_object_keys(sa.attendance_data)->>'students')::jsonb
    ) as total_students
FROM student_attendance sa
WHERE sa.id = 'specific-attendance-id';
```

### 4. Complete Query with All Filters
```sql
SELECT 
    sa.id as attendance_id,
    sa.attendance_date,
    -- Academic hierarchy
    inst.name as institution_name,
    dept.department_name,
    prog.program_name,
    deg.degree_name,
    t.semester as semester_name,
    s.section_name,
    -- Period details from JSONB
    period_data.key as period_slot_id,
    period_data.value->>'period_name' as period_name,
    period_data.value->>'start_time' as start_time,
    period_data.value->>'end_time' as end_time,
    period_data.value->>'course_name' as course_name,
    jsonb_array_length((period_data.value->>'students')::jsonb) as student_count
FROM student_attendance sa
JOIN timetables t ON sa.timetable_id = t.id
JOIN sections s ON sa.section_id = s.id
JOIN institutions inst ON sa.institution_id = inst.id
JOIN departments dept ON t.department_id = dept.id
JOIN programs prog ON t.program_id = prog.id
JOIN degrees deg ON t.degree_id = deg.id
CROSS JOIN LATERAL jsonb_each(sa.attendance_data) as period_data
WHERE 
    dept.department_name = 'Information Technology'
    AND prog.program_name = '(BTECH) IT'
    AND t.semester = 'Semester 5'
    AND s.section_name = 'A'
    AND sa.attendance_date BETWEEN '2025-08-01' AND '2025-08-31';
```

### 5. Get Student-specific Attendance
```sql
-- Find attendance for a specific student across all periods
SELECT 
    sa.attendance_date,
    period_key as period_id,
    sa.attendance_data->period_key->>'period_name' as period_name,
    student_record->>'status' as attendance_status
FROM student_attendance sa,
    jsonb_object_keys(sa.attendance_data) as period_key,
    jsonb_array_elements((sa.attendance_data->period_key->>'students')::jsonb) as student_record
WHERE student_record->>'student_id' = 'specific-student-uuid';
```

## Key Relationships

1. **Institution → Department → Program → Degree → Semester → Section**
   - Hierarchical academic structure
   - Both timetables and sections tables maintain these relationships

2. **Timetable ↔ Attendance**
   - Each attendance record is linked to a specific timetable
   - Timetable contains the academic context (department, program, semester)

3. **Section ↔ Attendance**
   - Direct link via section_id
   - Section also contains academic hierarchy information

4. **Periods (in JSONB)**
   - Stored as nested objects within attendance_data
   - Each period contains its own student list with individual statuses

## Important Notes

1. **Data Redundancy**: Both `timetables` and `sections` tables contain department, program, and degree information. This allows for flexibility but requires consistency.

2. **Period Storage**: Periods are not stored in a separate table but within the JSONB field, making queries more complex but allowing flexible period structures.

3. **Date-based Queries**: Always include attendance_date in queries for better performance.

4. **JSONB Queries**: Use PostgreSQL's JSONB operators for efficient period and student data extraction:
   - `->` for object field access
   - `->>` for text extraction
   - `jsonb_each()` for iterating over objects
   - `jsonb_array_elements()` for array iteration