# Department Entity - Complete Context

> Academic department within a degree level

---

## Overview

The `departments` table stores academic departments that exist under a specific degree level within an institution.

### Purpose
- Group programs by academic discipline
- Assign staff to departments
- Support department-based access control

### Table Name
`public.departments`

---

## Data Model

### Primary Entity: departments

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | `gen_random_uuid()` | Primary key |
| `institution_id` | UUID | Yes | - | Parent institution |
| `degree_id` | UUID | Yes | - | Parent degree |
| `department_code` | VARCHAR(20) | Yes | - | Department code (e.g., "CSE") |
| `department_name` | VARCHAR(255) | Yes | - | Full name (e.g., "Computer Science") |
| `display_name` | VARCHAR(255) | No | - | Alternative display name |
| `department_order` | INTEGER | Yes | `0` | Sort order |
| `is_active` | BOOLEAN | No | `true` | Active status |
| `created_by` | UUID | No | - | Creator user ID |
| `created_at` | TIMESTAMPTZ | Yes | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Yes | `now()` | Last update timestamp |

---

## Relationships

### Parent Tables
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `institutions` | `institution_id` | Many-to-One |
| `degrees` | `degree_id` | Many-to-One |

### Child Tables
| Table | Foreign Key | Relationship |
|-------|-------------|--------------|
| `programs` | `department_id` | One-to-Many |
| `semesters` | `department_id` | One-to-Many |
| `sections` | `department_id` | One-to-Many |
| `staff` | `department_id` | One-to-Many |
| `students` | `department_id` | One-to-Many |

---

## Business Rules

1. **Unique Code**: `department_code` must be unique within institution+degree
2. **Hierarchy Chain**: Requires valid institution_id and degree_id
3. **Order Display**: Sorted by `department_order` then `department_name`
4. **Staff Assignment**: HOD role assigned per department

---

## Permissions Required

| Operation | Permission Key |
|-----------|----------------|
| View | `organizations.departments.view` |
| Create | `organizations.departments.create` |
| Edit | `organizations.departments.edit` |
| Delete | `organizations.departments.delete` |

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-management/organizations/departments` | List departments |
| GET | `/api/api-management/organizations/departments/:id` | Get department |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `institution_id` | UUID | Filter by institution |
| `degree_id` | UUID | Filter by degree |
| `isActive` | boolean | Filter by status |
| `page` | number | Page number |
| `limit` | number | Items per page |

### Response Example

```json
{
  "data": [
    {
      "id": "dept-uuid",
      "institution_id": "inst-uuid",
      "degree_id": "degree-uuid",
      "department_code": "CSE",
      "department_name": "Computer Science and Engineering",
      "display_name": "CSE",
      "department_order": 1,
      "is_active": true,
      "institution": {
        "id": "inst-uuid",
        "name": "JKKN College of Engineering"
      },
      "degree": {
        "id": "degree-uuid",
        "degree_id": "UG",
        "degree_name": "Undergraduate"
      }
    }
  ],
  "metadata": {
    "total": 15,
    "page": 1,
    "limit": 10,
    "totalPages": 2
  }
}
```

---

## TypeScript Types

```typescript
export interface Department {
  id: string;
  institution_id: string;
  degree_id: string;
  department_code: string;
  department_name: string;
  display_name?: string;
  department_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  institution?: {
    id: string;
    name: string;
    counselling_code: string;
  };
  degree?: {
    id: string;
    degree_id: string;
    degree_name: string;
  };
}

export interface CreateDepartmentDto {
  institution_id: string;
  degree_id: string;
  department_code: string;
  department_name: string;
  display_name?: string;
  department_order?: number;
  is_active?: boolean;
}

export interface DepartmentFilters {
  search?: string;
  institution_id?: string;
  degree_id?: string;
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
    "department_code": "CSE",
    "department_name": "Computer Science and Engineering"
  },
  {
    "department_code": "ECE",
    "department_name": "Electronics and Communication Engineering"
  },
  {
    "department_code": "MECH",
    "department_name": "Mechanical Engineering"
  },
  {
    "department_code": "CIVIL",
    "department_name": "Civil Engineering"
  },
  {
    "department_code": "EEE",
    "department_name": "Electrical and Electronics Engineering"
  }
]
```

---

## Service Location

- **Service**: `lib/services/organization/department-service.ts`
- **Hook**: `hooks/organization/use-departments.ts`
- **Types**: `types/organizations.ts`

---

*Last Updated: December 2024*
