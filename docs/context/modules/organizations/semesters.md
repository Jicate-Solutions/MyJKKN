# Semester Entity - Complete Context

> Academic semester within a program

---

## Overview

The `semesters` table defines academic semesters (e.g., "Semester 1", "Semester 2") within a program.

### Purpose
- Define semester structure for programs
- Group sections under semesters
- Enable semester-based course mapping and timetables

### Table Name
`public.semesters`

---

## Data Model

### Primary Entity: semesters

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `degree_id` | UUID | Yes | - | Parent degree |
| `department_id` | UUID | Yes | - | Parent department |
| `program_id` | UUID | Yes | - | Parent program |
| `semester_code` | VARCHAR(20) | Yes | - | Code (e.g., "S1", "SEM1") |
| `semester_name` | VARCHAR(255) | Yes | - | Full name (e.g., "Semester 1") |
| `semester_type` | VARCHAR(50) | Yes | - | Type: even/odd |
| `is_active` | BOOLEAN | No | `true` | Active status |
| `created_at` | TIMESTAMPTZ | Yes | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Yes | `now()` | Last update timestamp |

### Enum Values

**Semester Type (`semester_type`):**
| Value | Description |
|-------|-------------|
| `odd` | Odd semester (1, 3, 5, 7) |
| `even` | Even semester (2, 4, 6, 8) |

---

## Relationships

### Parent Tables
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `institutions` | `institution_id` | Many-to-One |
| `degrees` | `degree_id` | Many-to-One |
| `departments` | `department_id` | Many-to-One |
| `programs` | `program_id` | Many-to-One |

### Child Tables
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `sections` | `semester_id` | One-to-Many |
| `course_mappings` | `semester_id` | One-to-Many |
| `timetables` | `semester_id` | One-to-Many |
| `students` | `semester_id` | One-to-Many |

---

## Business Rules

1. **Full Hierarchy**: Requires institution → degree → department → program
2. **Course Mapping**: Courses mapped to semesters, not directly to programs
3. **Timetable Scope**: Timetables created at semester or section level
4. **Student Promotion**: Students move between semesters during promotion

---

## Permissions Required

| Operation | Permission Key |
|-----------|----------------|
| View | `organizations.semesters.view` |
| Create | `organizations.semesters.create` |
| Edit | `organizations.semesters.edit` |
| Delete | `organizations.semesters.delete` |

---

## API Reference

### Response Example

```json
{
  "data": [
    {
      "id": "sem-uuid",
      "institution_id": "inst-uuid",
      "degree_id": "degree-uuid",
      "department_id": "dept-uuid",
      "program_id": "prog-uuid",
      "semester_code": "S1",
      "semester_name": "Semester 1",
      "semester_type": "odd",
      "is_active": true,
      "program": {
        "id": "prog-uuid",
        "program_name": "B.Tech CSE"
      }
    }
  ],
  "metadata": {
    "total": 8,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

## TypeScript Types

```typescript
export interface Semester {
  id: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_code: string;
  semester_name: string;
  semester_type: 'even' | 'odd';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institution?: { id: string; name: string; };
  degree?: { id: string; degree_name: string; };
  department?: { id: string; department_name: string; };
  program?: { id: string; program_name: string; };
}

export interface CreateSemesterDto {
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_code: string;
  semester_name: string;
  semester_type: 'even' | 'odd';
  is_active?: boolean;
}

export interface SemesterFilters {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_type?: 'even' | 'odd';
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

---

## Sample Data

```json
[
  { "semester_code": "S1", "semester_name": "Semester 1", "semester_type": "odd" },
  { "semester_code": "S2", "semester_name": "Semester 2", "semester_type": "even" },
  { "semester_code": "S3", "semester_name": "Semester 3", "semester_type": "odd" },
  { "semester_code": "S4", "semester_name": "Semester 4", "semester_type": "even" },
  { "semester_code": "S5", "semester_name": "Semester 5", "semester_type": "odd" },
  { "semester_code": "S6", "semester_name": "Semester 6", "semester_type": "even" },
  { "semester_code": "S7", "semester_name": "Semester 7", "semester_type": "odd" },
  { "semester_code": "S8", "semester_name": "Semester 8", "semester_type": "even" }
]
```

---

## Service Location

- **Service**: `lib/services/organization/semester-service.ts`
- **Hook**: `hooks/organization/use-semesters.ts`

---

*Last Updated: December 2024*
