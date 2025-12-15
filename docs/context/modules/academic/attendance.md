# Attendance Entity - Complete Context

> Consolidated period-wise attendance tracking

---

## Overview

The `student_attendance` table stores attendance records using a **consolidated JSONB structure** that groups all period attendance for a date into a single record.

### Table Name
`public.student_attendance`

### Key Features
- Consolidated JSONB storage (efficient)
- Period-wise granularity
- Multi-section support
- Faculty assignment tracking
- Marker audit trail

---

## Data Model

### Primary Entity: student_attendance

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `timetable_id` | UUID | Yes | - | FK to timetables |
| `section_id` | UUID | No | - | Primary section FK |
| `section_ids` | UUID[] | No | - | Multi-section support |
| `attendance_date` | DATE | Yes | - | Date (YYYY-MM-DD) |
| `attendance_data` | JSONB | Yes | - | Period-wise data |
| `marked_by` | UUID | Yes | - | Marker user ID |
| `institution_id` | UUID | Yes | - | Institution FK |
| `academic_year_id` | UUID | No | - | Academic year FK |
| `degree_id` | UUID | No | - | Degree FK |
| `program_id` | UUID | No | - | Program FK |
| `department_id` | UUID | No | - | Department FK |
| `semester_id` | UUID | No | - | Semester FK |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

### Unique Constraint
```sql
(timetable_id, attendance_date) -- One record per timetable per date
```

---

## JSONB Structure: attendance_data

### Complete Structure

```json
{
  "[timetable_slot_id]": {
    "period_id": "period-uuid",
    "period_name": "Period 1",
    "start_time": "09:00:00",
    "end_time": "09:50:00",
    "course_id": "course-uuid",
    "course_name": "Data Structures",

    "students": [
      {
        "student_id": "student-uuid-1",
        "section_id": "section-uuid",
        "status": "Present",
        "marked_at": "2024-12-15T09:30:00Z"
      },
      {
        "student_id": "student-uuid-2",
        "section_id": "section-uuid",
        "status": "Absent",
        "marked_at": "2024-12-15T09:30:00Z"
      }
    ],

    "assigned_faculty": {
      "faculty_id": "faculty-uuid",
      "faculty_name": "Dr. Smith",
      "faculty_email": "smith@jkkn.ac.in"
    },

    "marked_by_details": {
      "marker_id": "marker-uuid",
      "marker_name": "John Doe",
      "marker_role": "faculty",
      "marker_email": "john@jkkn.ac.in",
      "marked_at": "2024-12-15T09:35:00Z"
    }
  },

  "[another_slot_id]": {
    // ... similar structure for Period 2
  }
}
```

### Multi-Faculty Support

When multiple faculty are assigned:

```json
{
  "assigned_faculty": [
    {
      "faculty_id": "faculty-uuid-1",
      "faculty_name": "Dr. Smith",
      "faculty_email": "smith@jkkn.ac.in",
      "is_primary": true
    },
    {
      "faculty_id": "faculty-uuid-2",
      "faculty_name": "Prof. Johnson",
      "faculty_email": "johnson@jkkn.ac.in",
      "is_primary": false
    }
  ]
}
```

### Practical Period Attendance

For `period_mode: 'practical'`:

```json
{
  "[slot_id]": {
    "period_mode": "practical",
    "batch_selected": {
      "batch_id": "batch-1",
      "batch_name": "Batch A"
    },
    "course_selected": "course-uuid",
    "students": [
      {
        "student_id": "student-uuid",
        "section_id": "section-uuid",
        "status": "Present",
        "marked_at": "2024-12-15T09:30:00Z"
      }
    ],
    "marked_by": "faculty-uuid",
    "marked_at": "2024-12-15T09:35:00Z"
  }
}
```

---

## TypeScript Types

```typescript
// Student entry in attendance data
export interface ConsolidatedAttendanceStudent {
  student_id: string;
  section_id: string;
  status: 'Present' | 'Absent';
  marked_at: string;
}

// Period entry in attendance data
export interface ConsolidatedAttendancePeriod {
  period_id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  course_id: string;
  course_name: string;
  students: ConsolidatedAttendanceStudent[];
  assigned_faculty?: {
    faculty_id: string;
    faculty_name: string;
    faculty_email: string;
  } | Array<{
    faculty_id: string;
    faculty_name: string;
    faculty_email: string;
    is_primary?: boolean;
  }>;
  marked_by_details?: {
    marker_id: string;
    marker_name: string;
    marker_role: string;
    marker_email: string;
    marked_at: string;
  };
}

// Complete attendance data structure
export interface ConsolidatedAttendanceData {
  [timetable_slot_id: string]: ConsolidatedAttendancePeriod;
}

// Full attendance record
export interface ConsolidatedStudentAttendance {
  id: string;
  timetable_id: string;
  section_id: string;
  section_ids?: string[];
  attendance_date: string;
  attendance_data: ConsolidatedAttendanceData;
  marked_by: string;
  institution_id: string;
  academic_year_id?: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester_id?: string;
  created_at: string;
  updated_at: string;

  // Relations
  timetable?: { id: string; timetable_name: string; };
  section?: { id: string; section_name: string; };
  marked_by_profile?: { id: string; email: string; full_name?: string; };
  institution?: { id: string; name: string; };
}
```

---

## Attendance Flow

### Standard Attendance Marking

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SELECT CONTEXT                                               │
│     - Institution, Academic Year, Semester, Section             │
│     - Attendance Date                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. FETCH TIMETABLE                                              │
│     - Get timetable for section + date                          │
│     - Extract periods for that day                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. SELECT PERIOD                                                │
│     - Display available periods                                  │
│     - Faculty selects period to mark                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  4. LOAD STUDENT ROSTER                                          │
│     - Fetch students for section(s)                             │
│     - Load existing attendance if any                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  5. MARK ATTENDANCE                                              │
│     - Default all to Present                                     │
│     - Faculty marks Absent students                             │
│     - Quick actions (Mark All Present/Absent)                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  6. SAVE (UPSERT)                                                │
│     - Merge with existing record if any                         │
│     - Update attendance_data JSONB                              │
│     - Track marker details                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Practical Period Flow

Additional steps for `period_mode: 'practical'`:

```
After Step 3 (Select Period):
┌─────────────────────────────────────────────────────────────────┐
│  3.5 SELECT BATCH/COURSE (Practical Mode)                        │
│     - Display available batches                                  │
│     - Display available courses                                  │
│     - Faculty selects batch + course                            │
│     - Check for conflicts (same batch marked already)           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
Then continue with Step 4 (roster shows batch students only)
```

---

## Relationships

### Foreign Keys

| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `timetables` | `timetable_id` | Many-to-One |
| `sections` | `section_id` | Many-to-One |
| `institutions` | `institution_id` | Many-to-One |
| `profiles` | `marked_by` | Many-to-One |
| `academic_years` | `academic_year_id` | Many-to-One |
| `degrees` | `degree_id` | Many-to-One |
| `programs` | `program_id` | Many-to-One |
| `departments` | `department_id` | Many-to-One |
| `semesters` | `semester_id` | Many-to-One |

---

## Business Rules

### Marking Rules
1. **One record per timetable per date**: Upsert pattern
2. **Section preservation**: section_id stored per student for history
3. **Marker tracking**: Always records who marked and when
4. **Status values**: Only 'Present' or 'Absent' allowed

### Access Rules
1. **Faculty can mark**: Only assigned faculty or admin
2. **Edit window**: Typically 24-48 hours to modify
3. **Institution scope**: RLS enforces institution isolation

### Validation Rules
1. **Valid date**: attendance_date must be valid
2. **Valid students**: student_ids must be in section
3. **Valid periods**: slot_ids must match timetable

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/attendance` | List attendance records |
| GET | `/api/api-management/academic/attendance/:id` | Get attendance by ID |
| GET | `/api/academic/attendance/by-date` | Get by timetable + date |
| POST | `/api/academic/attendance` | Create/upsert attendance |
| PUT | `/api/academic/attendance/:id` | Update attendance |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `institution_id` | UUID | Filter by institution |
| `academic_year_id` | UUID | Filter by academic year |
| `degree_id` | UUID | Filter by degree |
| `program_id` | UUID | Filter by program |
| `department_id` | UUID | Filter by department |
| `semester_id` | UUID | Filter by semester |
| `section_id` | UUID | Filter by section |
| `attendance_date` | string | Filter by date |
| `timetable_slot_id` | UUID | Filter by specific slot |
| `status` | string | Filter by status |
| `page` | number | Page number |
| `limit` | number | Items per page |

### Upsert Request Body

```typescript
interface UpsertConsolidatedAttendanceDto {
  timetable_id: string;
  section_id: string;
  section_ids?: string[];
  attendance_date: string;
  attendance_data: ConsolidatedAttendanceData;
  marked_by: string;
  institution_id: string;
  academic_year_id?: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester_id?: string;
}
```

---

## Sample Data

### Complete Attendance Record

```json
{
  "id": "attendance-uuid",
  "timetable_id": "timetable-uuid",
  "section_id": "section-uuid",
  "section_ids": ["section-uuid"],
  "attendance_date": "2024-12-15",
  "institution_id": "inst-uuid",
  "academic_year_id": "ay-uuid",
  "degree_id": "degree-uuid",
  "program_id": "prog-uuid",
  "department_id": "dept-uuid",
  "semester_id": "sem-uuid",
  "marked_by": "faculty-uuid",
  "attendance_data": {
    "slot-p1": {
      "period_id": "period-1",
      "period_name": "Period 1",
      "start_time": "09:00:00",
      "end_time": "09:50:00",
      "course_id": "cs101-uuid",
      "course_name": "Data Structures",
      "students": [
        {
          "student_id": "student-1",
          "section_id": "section-uuid",
          "status": "Present",
          "marked_at": "2024-12-15T09:30:00Z"
        },
        {
          "student_id": "student-2",
          "section_id": "section-uuid",
          "status": "Absent",
          "marked_at": "2024-12-15T09:30:00Z"
        }
      ],
      "assigned_faculty": {
        "faculty_id": "faculty-uuid",
        "faculty_name": "Dr. Smith",
        "faculty_email": "smith@jkkn.ac.in"
      },
      "marked_by_details": {
        "marker_id": "faculty-uuid",
        "marker_name": "Dr. Smith",
        "marker_role": "faculty",
        "marker_email": "smith@jkkn.ac.in",
        "marked_at": "2024-12-15T09:35:00Z"
      }
    },
    "slot-p2": {
      "period_id": "period-2",
      "period_name": "Period 2",
      "start_time": "10:00:00",
      "end_time": "10:50:00",
      "course_id": "cs102-uuid",
      "course_name": "DBMS",
      "students": [
        {
          "student_id": "student-1",
          "section_id": "section-uuid",
          "status": "Present",
          "marked_at": "2024-12-15T10:30:00Z"
        }
      ]
    }
  },
  "created_at": "2024-12-15T09:35:00Z",
  "updated_at": "2024-12-15T10:35:00Z"
}
```

---

## Dashboard & Reports

### Available Analytics

| Metric | Description |
|--------|-------------|
| Overall Attendance % | Total present / total marked |
| Daily Attendance | Attendance by date |
| Period-wise | Attendance per period |
| Course-wise | Attendance by course |
| Student-wise | Individual student attendance |
| Faculty-wise | Attendance marked by faculty |
| Absentee Report | Students with low attendance |

---

## Service Location

- **Service**: `lib/services/academic/attendance-service.ts` (1,500+ lines)
- **Dashboard Service**: `lib/services/academic/attendance-dashboard-service.ts`
- **Export Service**: `lib/services/academic/attendance-export-service.ts`
- **Report Service**: `lib/services/academic/attendance-report-service.ts`
- **Hook**: `hooks/academic/use-attendance.ts`
- **Types**: `types/attendance.ts`

---

*Last Updated: December 2024*
