# Section Entity - Complete Context

> Class section within a semester

---

## Overview

The `sections` table defines class sections (e.g., "A", "B", "C") within a semester, grouping students for attendance, timetables, and academic activities.

### Purpose
- Group students into manageable class sizes
- Enable section-specific timetables
- Support section-wise attendance tracking

### Table Name
`public.sections`

---

## Data Model

### Primary Entity: sections

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `section_name` | TEXT | Yes | - | Section name (e.g., "A", "B") |
| `institution_id` | UUID | Yes | - | Parent institution |
| `degree_id` | UUID | No | - | Parent degree |
| `department_id` | UUID | No | - | Parent department |
| `program_id` | UUID | No | - | Parent program |
| `semester_id` | UUID | No | - | Parent semester |
| `is_active` | BOOLEAN | No | `true` | Active status |
| `created_at` | TIMESTAMPTZ | Yes | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Yes | `now()` | Last update timestamp |

---

## Relationships

### Parent Tables
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `institutions` | `institution_id` | Many-to-One |
| `degrees` | `degree_id` | Many-to-One |
| `departments` | `department_id` | Many-to-One |
| `programs` | `program_id` | Many-to-One |
| `semesters` | `semester_id` | Many-to-One |

### Child Tables
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `students` | `section_id` | One-to-Many |
| `timetables` | `section_id` | One-to-Many |
| `student_attendance` | `section_id` | One-to-Many |

---

## Business Rules

1. **Naming**: Typically single letters (A, B, C) or numbers
2. **Capacity**: Sections typically have 60-80 students
3. **Timetable**: Each section can have its own timetable
4. **Attendance**: Attendance marked per section
5. **Student Assignment**: Students assigned to one section per semester

---

## Permissions Required

| Operation | Permission Key |
|-----------|----------------|
| View | `organizations.sections.view` |
| Create | `organizations.sections.create` |
| Edit | `organizations.sections.edit` |
| Delete | `organizations.sections.delete` |

---

## API Reference

### Response Example

```json
{
  "data": [
    {
      "id": "sec-uuid",
      "section_name": "A",
      "institution_id": "inst-uuid",
      "degree_id": "degree-uuid",
      "department_id": "dept-uuid",
      "program_id": "prog-uuid",
      "semester_id": "sem-uuid",
      "is_active": true,
      "semester": {
        "id": "sem-uuid",
        "semester_name": "Semester 1",
        "semester_code": "S1"
      }
    },
    {
      "id": "sec-uuid-2",
      "section_name": "B",
      "institution_id": "inst-uuid",
      "semester_id": "sem-uuid",
      "is_active": true
    }
  ],
  "metadata": {
    "total": 2,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

## TypeScript Types

```typescript
export interface Section {
  id: string;
  section_name: string;
  institution_id: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institution?: { id: string; name: string; };
  degree?: { id: string; degree_name: string; };
  department?: { id: string; department_name: string; };
  program?: { id: string; program_name: string; };
  semester?: { id: string; semester_name: string; semester_code: string; };
}

export interface CreateSectionDto {
  section_name: string;
  institution_id: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  is_active?: boolean;
}

export interface SectionFilters {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

---

## Sample Data

```json
[
  { "section_name": "A" },
  { "section_name": "B" },
  { "section_name": "C" },
  { "section_name": "D" }
]
```

---

## Integration Notes

### For Timetable Creation
- Section is the most granular level for timetables
- Semester-level timetables apply to all sections in that semester

### For Attendance
- Attendance marked per section per period
- Uses `section_id` in `student_attendance` table

### For Student Assignment
- Students assigned to sections during enrollment/promotion
- `students.section_id` links student to their section

---

## Service Location

- **Service**: `lib/services/organization/section-service.ts`
- **Hook**: `hooks/organization/use-sections.ts`

---

*Last Updated: December 2024*
