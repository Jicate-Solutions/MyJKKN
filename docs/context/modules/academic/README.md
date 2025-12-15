# Academic Module - Complete Context

> Timetable management, attendance tracking, and academic planning

---

## Overview

The Academic module handles **timetable creation, attendance management, and staff-course planning** across all JKKN institutions.

### Purpose
- Create and manage timetables (section/semester level)
- Track daily attendance with period-wise granularity
- Plan staff assignments to courses and sections
- Manage academic years, periods, regulations, and batches

### Key Capabilities
- **Dual timetable formats**: Regular (day-based) and Batch (date-based)
- **Practical period support**: Runtime batch/course selection for rotating labs
- **Multi-staff support**: Multiple faculty per period
- **Section subdivision**: Split students into groups for practicals
- **Consolidated attendance**: JSONB-based efficient attendance storage

---

## Module Features

| Feature | Route | Description |
|---------|-------|-------------|
| Timetables | `/academic/timetables` | Create and manage timetables |
| Attendance | `/academic/attendance` | Mark and view attendance |
| Periods | `/academic/periods` | Define period timings |
| Staff Planning | `/academic/staff-planning` | Assign staff to courses |
| Academic Years | `/academic/academic-years` | Manage academic year cycles |
| Regulations | `/academic/regulations` | Academic regulations |
| Batches | `/academic/batches` | Student batch management |

---

## Entity Summary

| Entity | Table | Fields | Description |
|--------|-------|--------|-------------|
| [Timetable](./timetables.md) | `timetables` | 25+ | Timetable definitions with JSONB slots |
| [Attendance](./attendance.md) | `student_attendance` | 15+ | Consolidated attendance records |
| [Period](./periods.md) | `periods` | 8 | Period timing definitions |
| [Staff Plan](./staff-planning.md) | `staff_plans` | 10+ | Staff-course assignments |
| [Academic Year](./academic-years.md) | `academic_years` | 8 | Academic year cycles |
| Regulation | `regulations` | 7 | Academic regulations |
| Batch | `batches` | 10 | Student batch/cohort groups |

---

## Quick Reference

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/academic/timetables` | List timetables |
| GET | `/api/api-management/academic/timetables/:id` | Get timetable |
| POST | `/api/academic/timetables` | Create timetable |
| PUT | `/api/academic/timetables/:id` | Update timetable |
| DELETE | `/api/academic/timetables/:id` | Delete timetable |
| GET | `/api/api-management/academic/attendance` | Get attendance records |
| POST | `/api/academic/attendance` | Save attendance |
| GET | `/api/api-management/academic/periods` | List periods |
| GET | `/api/api-management/academic/academic-years` | List academic years |

### Permission Keys

| Operation | Permission Key |
|-----------|----------------|
| View Timetables | `academic.timetables.view` |
| Create Timetable | `academic.timetables.create` |
| Edit Timetable | `academic.timetables.edit` |
| Delete Timetable | `academic.timetables.delete` |
| View Attendance | `academic.attendance.view` |
| Mark Attendance | `academic.attendance.create` |
| Edit Attendance | `academic.attendance.edit` |
| View Periods | `academic.periods.view` |
| Manage Periods | `academic.periods.edit` |
| View Staff Plans | `academic.staff_plans.view` |
| Create Staff Plan | `academic.staff_plans.create` |

---

## Timetable System Overview

### Timetable Formats

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIMETABLE FORMATS                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────┐  ┌─────────────────────────────┐
│       REGULAR FORMAT            │  │       BATCH FORMAT          │
├─────────────────────────────────┤  ├─────────────────────────────┤
│ • Day-based (Mon-Sat)           │  │ • Date-based scheduling     │
│ • Fixed weekly schedule         │  │ • Variable dates            │
│ • slot_date = "MONDAY"          │  │ • slot_date = "2024-12-15"  │
│ • Repeats every week            │  │ • Specific date assignments │
│ • Standard classes              │  │ • Practicals/workshops      │
└─────────────────────────────────┘  └─────────────────────────────┘
```

### Timetable Types

| Type | Level | Use Case |
|------|-------|----------|
| `section` | Section-specific | Traditional section-based timetable |
| `semester` | Semester-wide | Shared timetable for multiple sections |

### Period Modes

| Mode | Description | Selection |
|------|-------------|-----------|
| `standard` | Fixed course/staff | Pre-assigned in timetable |
| `practical` | Runtime selection | Faculty selects batch/course when marking |

---

## Attendance System Overview

### Consolidated Attendance Structure

Attendance is stored in JSONB format for efficiency:

```json
{
  "attendance_data": {
    "[timetable_slot_id]": {
      "period_id": "period-uuid",
      "period_name": "Period 1",
      "start_time": "09:00:00",
      "end_time": "09:50:00",
      "course_id": "course-uuid",
      "course_name": "Data Structures",
      "students": [
        {
          "student_id": "student-uuid",
          "section_id": "section-uuid",
          "status": "Present",
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
        "marked_at": "2024-12-15T09:35:00Z"
      }
    }
  }
}
```

### Attendance Flow

```
1. Faculty selects date and section
           ↓
2. System fetches timetable for that day
           ↓
3. Faculty selects period to mark
           ↓
4. System displays student roster
           ↓
5. Faculty marks Present/Absent
           ↓
6. Consolidated record saved (upsert)
           ↓
7. Analytics/reports updated
```

---

## Staff Planning Overview

### Staff Plan Structure

```
Staff Plan (staff_plans)
├── Institution + Academic Year
├── Semester + Section
└── Course Assignments (staff_plan_courses)
    ├── Course 1 → Staff A, Staff B
    ├── Course 2 → Staff C
    └── Course 3 → Staff A, Staff D
```

### Planning Workflow

1. Select academic hierarchy (institution → semester → section)
2. View available courses (from course_mappings)
3. Assign staff to each course
4. Staff assignments sync to timetable slots

---

## Key Data Types

### DayOfWeek Enum
```typescript
type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';
```

### Period Mode
```typescript
type PeriodMode = 'standard' | 'practical';
```

### Subdivision Type
```typescript
type SubdivisionType = 'practical' | 'lab' | 'tutorial' | 'workshop';
```

---

## Files in This Module

| File | Description |
|------|-------------|
| [timetables.md](./timetables.md) | Timetable entity and slot structure |
| [attendance.md](./attendance.md) | Attendance tracking system |
| [periods.md](./periods.md) | Period timing definitions |
| [staff-planning.md](./staff-planning.md) | Staff-course assignments |
| [academic-years.md](./academic-years.md) | Academic year management |

---

## Related Documentation

- **[Organizations Module](../organizations/README.md)** - Academic hierarchy (semesters, sections)
- **[Students Module](../students/README.md)** - Student enrollment data
- **[Staff Module](../staff/README.md)** - Staff profile data

---

## Service Locations

| Service | Path | Lines |
|---------|------|-------|
| Timetable Service | `lib/services/academic/timetable-service.ts` | 2,580+ |
| Attendance Service | `lib/services/academic/attendance-service.ts` | 1,500+ |
| Period Service | `lib/services/academic/period-service.ts` | 300+ |
| Staff Plan Service | `lib/services/academic/staff-plan-service.ts` | 600+ |
| Academic Year Service | `lib/services/academic/academic-year-service.ts` | 200+ |
| Regulation Service | `lib/services/academic/regulation-service.ts` | 200+ |
| Batch Service | `lib/services/academic/batch-service.ts` | 200+ |

---

*Last Updated: December 2024*
