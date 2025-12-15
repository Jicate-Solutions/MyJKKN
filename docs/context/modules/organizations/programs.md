# Program Entity - Complete Context

> Academic program/degree course within a department

---

## Overview

The `programs` table defines specific academic programs (e.g., "B.Tech Computer Science") offered within a department.

### Purpose
- Define specific degree programs
- Group semesters under programs
- Support program-based enrollment

### Table Name
`public.programs`

---

## Data Model

### Primary Entity: programs

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `uuid_generate_v4()` | Primary key |
| `institution_id` | UUID | No | - | Parent institution |
| `degree_id` | UUID | No | - | Parent degree |
| `department_id` | UUID | No | - | Parent department |
| `program_id` | TEXT | Yes | - | Program code |
| `program_name` | TEXT | Yes | - | Full program name |
| `is_active` | BOOLEAN | No | `true` | Active status |
| `created_by` | UUID | No | - | Creator user ID |
| `created_at` | TIMESTAMPTZ | No | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | No | `now()` | Last update timestamp |

---

## Relationships

### Parent Tables
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `institutions` | `institution_id` | Many-to-One |
| `degrees` | `degree_id` | Many-to-One |
| `departments` | `department_id` | Many-to-One |

### Child Tables
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `semesters` | `program_id` | One-to-Many |
| `sections` | `program_id` | One-to-Many |
| `students` | `program_id` | One-to-Many |
| `timetables` | `program_id` | One-to-Many |

---

## Business Rules

1. **Unique Code**: `program_id` must be unique within department
2. **Full Chain**: Requires institution → degree → department
3. **Student Enrollment**: Students enroll in specific programs

---

## Permissions Required

| Operation | Permission Key |
|-----------|----------------|
| View | `organizations.programs.view` |
| Create | `organizations.programs.create` |
| Edit | `organizations.programs.edit` |
| Delete | `organizations.programs.delete` |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organizations/programs` | List programs |
| GET | `/api/api-management/organizations/programs/:id` | Get program |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `institution_id` | UUID | Filter by institution |
| `degree_id` | UUID | Filter by degree |
| `department_id` | UUID | Filter by department |
| `isActive` | boolean | Filter by status |

### Response Example

```json
{
  "data": [
    {
      "id": "prog-uuid",
      "institution_id": "inst-uuid",
      "degree_id": "degree-uuid",
      "department_id": "dept-uuid",
      "program_id": "BTECH-CSE",
      "program_name": "B.Tech Computer Science and Engineering",
      "is_active": true,
      "institution": {
        "id": "inst-uuid",
        "name": "JKKN College of Engineering"
      },
      "degree": {
        "id": "degree-uuid",
        "degree_name": "Undergraduate"
      },
      "department": {
        "id": "dept-uuid",
        "department_name": "Computer Science and Engineering"
      }
    }
  ],
  "metadata": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  }
}
```

---

## TypeScript Types

```typescript
export interface Program {
  id: string;
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  program_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institution?: { id: string; name: string; };
  degree?: { id: string; degree_name: string; };
  department?: { id: string; department_name: string; };
}

export interface CreateProgramDto {
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  program_name: string;
  is_active?: boolean;
}

export interface ProgramFilters {
  search?: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
```

---

## Sample Data

```json
[
  {
    "program_id": "BTECH-CSE",
    "program_name": "B.Tech Computer Science and Engineering"
  },
  {
    "program_id": "BTECH-ECE",
    "program_name": "B.Tech Electronics and Communication Engineering"
  },
  {
    "program_id": "MTECH-CSE",
    "program_name": "M.Tech Computer Science and Engineering"
  },
  {
    "program_id": "BDS",
    "program_name": "Bachelor of Dental Surgery"
  },
  {
    "program_id": "BPHARM",
    "program_name": "Bachelor of Pharmacy"
  }
]
```

---

## Service Location

- **Service**: `lib/services/organization/program-service.ts`
- **Hook**: `hooks/organization/use-programs.ts`

---

*Last Updated: December 2024*
